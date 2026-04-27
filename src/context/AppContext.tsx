import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { deleteField, getDoc, getDocFromServer, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db, hasFirebaseConfig } from '../lib/firebase';
import { deleteThread as deleteThreadRemote, meGet } from '../lib/plutoApi';
import {
  DEFAULT_PLAN,
  FREE_PREMIUM_MODE_DAILY_LIMIT,
  PLAN_CONFIGS,
  type PlanFeatureKey,
  type SubscriptionPlan,
} from '../config/subscription';
import {
  getMessageText,
  normalizeMessage,
  normalizeThreadContextSummary,
  type Message,
  type Project,
  type Thread,
  type ThreadMetadata,
  type UserSession,
} from '../types';
import type { AppContextType, ChatMode, EducationLevel } from './appContextTypes';
import { AppContext } from './appContextValue';
import {
  appStateDocRef,
  contextSummaryFromThreadMetadata,
  deserializeLegacyAppState,
  estimateSerializedBytes,
  migrationDocRef,
  projectDocRef,
  serializeLightweightAppState,
  serializeMessage,
  serializeProject,
  serializeThreadMetadata,
  threadDocRef,
  threadMessageDocRef,
} from '../lib/chatStore';
import { runtimeLogger } from '../lib/runtimeLogger';
import { useMessages } from '../hooks/useMessages';
import { useProjects } from '../hooks/useProjects';
import { useThreads } from '../hooks/useThreads';

const STORAGE_KEY = 'pluto_v3';
const START_NEW_CHAT_KEY = `${STORAGE_KEY}_start_new_chat`;
const estimatePromptTokens = (value: string) => Math.max(1, Math.ceil(value.trim().length / 4));
const APP_STATE_SIZE_GUARD_BYTES = 900 * 1024;

const getNextIstMidnightMs = (from = new Date()) => {
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from);
  const year = Number(istParts.find((part) => part.type === 'year')?.value);
  const month = Number(istParts.find((part) => part.type === 'month')?.value);
  const day = Number(istParts.find((part) => part.type === 'day')?.value);

  return Date.UTC(year, month - 1, day + 1, -5, -30);
};

const normalizeEducationLevel = (value: string | undefined): EducationLevel => {
  switch (value) {
    case 'Elementary':
    case 'Middle School':
    case 'High School':
    case 'College/University':
    case 'Professional':
      return value;
    default:
      return 'High School';
  }
};

const normalizeUser = (user: UserSession | null): UserSession | null => {
  if (!user) return null;
  return {
    ...user,
    educationLevel: normalizeEducationLevel(user.educationLevel),
    objective: user.objective || 'General Learning',
    emailVerified: user.emailVerified ?? false,
    plan: user.plan ?? DEFAULT_PLAN,
  };
};

const stripUndefined = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (value && typeof value === 'object') {
    if ((value as { constructor?: unknown }).constructor !== Object) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
    ) as T;
  }

  return value;
};

const getLocalStateUpdatedAt = (threads: Thread[], projects: Project[]) =>
  Math.max(0, ...threads.map((thread) => thread.updatedAt || thread.createdAt || 0), ...projects.map((project) => project.createdAt || 0));

const isThreadPersistable = (thread: Thread) => Array.isArray(thread.messages) && thread.messages.length > 0;

const removeEmptyThreads = (threads: Thread[]) =>
  threads.filter((thread) => isThreadPersistable(thread));

const normalizeThread = (thread: Thread): Thread => ({
  ...thread,
  messages: Array.isArray(thread.messages)
    ? thread.messages.map((message) => normalizeMessage(message))
    : [],
  contextSummary: normalizeThreadContextSummary(thread.contextSummary),
});

const normalizeThreads = (threads: Thread[]) => threads.map((thread) => normalizeThread(thread));

const mergeMessages = (...collections: Array<Message[] | undefined>) =>
  Array.from(
    [...collections.flatMap((messages) => messages ?? [])].reduce<Map<string, Message>>((acc, message) => {
      acc.set(message.id, normalizeMessage(message as never));
      return acc;
    }, new Map()).values()
  ).sort((left, right) => left.timestamp - right.timestamp);

const filterPendingMessages = (
  messages: Message[] | undefined,
  pendingMessageIds: Set<string> | undefined
) => {
  if (!messages?.length || !pendingMessageIds?.size) {
    return [] as Message[];
  }

  return messages.filter((message) => pendingMessageIds.has(message.id));
};

const buildThreadFromMetadata = ({
  metadata,
  previousThread,
  activeMessages,
  isActive,
  isActiveMessagesLoading,
  pendingLocalMessages,
}: {
  metadata: ThreadMetadata;
  previousThread?: Thread;
  activeMessages?: Message[];
  isActive: boolean;
  isActiveMessagesLoading: boolean;
  pendingLocalMessages?: Message[];
}): Thread => ({
  ...metadata,
  contextSummary: contextSummaryFromThreadMetadata(metadata),
  messages: isActive
    ? isActiveMessagesLoading
      ? previousThread?.messages ?? pendingLocalMessages ?? []
      : mergeMessages(activeMessages, pendingLocalMessages)
    : previousThread?.messages ?? [],
});

const getSafeActiveThreadId = (activeThreadId: string | null | undefined, threads: Thread[]) => {
  if (!activeThreadId) return null;
  return threads.some((thread) => thread.id === activeThreadId) ? activeThreadId : null;
};

const userFromFirebase = (firebaseUser: FirebaseUser): UserSession => ({
  id: firebaseUser.uid,
  name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
  email: firebaseUser.email || '',
  emailVerified: firebaseUser.emailVerified,
  avatar: firebaseUser.photoURL || undefined,
  educationLevel: 'High School',
  objective: 'General Learning',
});

const requestFreshChatView = () => {
  sessionStorage.setItem(START_NEW_CHAT_KEY, '1');
};

const consumeFreshChatViewRequest = () => {
  const shouldStartNew = sessionStorage.getItem(START_NEW_CHAT_KEY) === '1';
  if (shouldStartNew) {
    sessionStorage.removeItem(START_NEW_CHAT_KEY);
  }
  return shouldStartNew;
};

const safeNumber = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const normalizeUsageSnapshot = (
  plan: SubscriptionPlan,
  snapshot: {
    usageTodayTokens?: number;
    dailyTokenLimit?: number;
    remainingTodayTokens?: number;
    estimatedMessagesLeft?: number;
    premiumModeCount?: number;
    freePremiumModesRemainingToday?: number | null;
  }
) => {
  const planConfig = PLAN_CONFIGS[plan];
  const dailyTokenLimit = Math.max(
    0,
    Math.floor(safeNumber(snapshot.dailyTokenLimit) ?? planConfig.dailyTokenLimit)
  );
  const usageTodayTokens = Math.max(
    0,
    Math.floor(safeNumber(snapshot.usageTodayTokens) ?? 0)
  );
  const derivedRemaining = Math.max(0, dailyTokenLimit - usageTodayTokens);
  const remainingTodayTokens = Math.max(
    0,
    Math.floor(safeNumber(snapshot.remainingTodayTokens) ?? derivedRemaining)
  );
  const estimatedMessagesLeft = Math.max(
    0,
    Math.floor(
      safeNumber(snapshot.estimatedMessagesLeft) ??
        remainingTodayTokens / planConfig.averageTokensPerMessage
    )
  );
  const premiumModeCount = Math.max(
    0,
    Math.floor(safeNumber(snapshot.premiumModeCount) ?? 0)
  );
  const freePremiumModesRemainingToday =
    plan === 'Free'
      ? Math.max(
          0,
          Math.floor(
            safeNumber(snapshot.freePremiumModesRemainingToday) ??
              (FREE_PREMIUM_MODE_DAILY_LIMIT - premiumModeCount)
          )
        )
      : null;

  return {
    usageTodayTokens,
    dailyTokenLimit,
    remainingTodayTokens,
    estimatedMessagesLeft,
    premiumModeCount,
    freePremiumModesRemainingToday,
  };
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_user`);
    return saved ? normalizeUser(JSON.parse(saved)) : null;
  });
  const [threads, setThreads] = useState<Thread[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_threads`);
    return saved ? removeEmptyThreads(normalizeThreads(JSON.parse(saved))) : [];
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const savedThreads = localStorage.getItem(`${STORAGE_KEY}_threads`);
    const savedActiveThreadId = localStorage.getItem(`${STORAGE_KEY}_active_thread_id`);
    const cleanedThreads = savedThreads
      ? removeEmptyThreads(normalizeThreads(JSON.parse(savedThreads)))
      : [];
    return getSafeActiveThreadId(savedActiveThreadId, cleanedThreads);
  });
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_projects`);
    return saved ? JSON.parse(saved) : [];
  });
  const [mode, setMode] = useState<ChatMode>('Conversational');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isCloudHydrated, setIsCloudHydrated] = useState(false);
  const [isSubscriptionHydrated, setIsSubscriptionHydrated] = useState(false);
  const [usageTodayTokens, setUsageTodayTokens] = useState(0);
  const [dailyTokenLimit, setDailyTokenLimit] = useState<number>(PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit);
  const [remainingTodayTokens, setRemainingTodayTokens] = useState<number>(PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit);
  const [estimatedMessagesLeft, setEstimatedMessagesLeft] = useState(
    Math.floor(PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit / PLAN_CONFIGS[DEFAULT_PLAN].averageTokensPerMessage)
  );
  const [premiumModeCount, setPremiumModeCount] = useState(0);
  const [freePremiumModesRemainingToday, setFreePremiumModesRemainingToday] = useState<number | null>(
    FREE_PREMIUM_MODE_DAILY_LIMIT
  );
  const threadsRef = useRef(threads);
  const projectsRef = useRef(projects);
  const pendingMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const emptyThreadCleanupRef = useRef<Set<string>>(new Set());
  const [migrationState, setMigrationState] = useState<string | null>(null);
  const [migrationVersion, setMigrationVersion] = useState<number | undefined>(undefined);

  const currentPlan: SubscriptionPlan = user?.plan ?? DEFAULT_PLAN;
  const planConfig = PLAN_CONFIGS[currentPlan];
  const firebaseUid = auth?.currentUser?.uid ?? user?.id ?? null;
  const { threads: cloudThreadMetadata, isLoading: isThreadsLoading } = useThreads(firebaseUid);
  const { projects: cloudProjects, isLoading: isProjectsLoading } = useProjects(firebaseUid);
  const {
    messages: activeThreadMessages,
    isLoading: isActiveThreadMessagesLoading,
    hasMore: hasOlderActiveThreadMessages,
    loadOlderMessages: loadOlderActiveThreadMessages,
  } = useMessages(firebaseUid, activeThreadId);

  const applyServerSnapshot = useCallback(
    (snapshot: {
      plan: SubscriptionPlan;
      usageTodayTokens: number;
      dailyTokenLimit: number;
      remainingTodayTokens: number;
      estimatedMessagesLeft: number;
      premiumModeCount?: number;
      freePremiumModesRemainingToday?: number | null;
      educationLevel?: string;
      objective?: string;
      name?: string;
      email?: string;
      avatar?: string;
    }) => {
      const usageSnapshot = normalizeUsageSnapshot(snapshot.plan, snapshot);
      setIsSubscriptionHydrated(true);
      setUsageTodayTokens(usageSnapshot.usageTodayTokens);
      setDailyTokenLimit(usageSnapshot.dailyTokenLimit);
      setRemainingTodayTokens(usageSnapshot.remainingTodayTokens);
      setEstimatedMessagesLeft(usageSnapshot.estimatedMessagesLeft);
      setPremiumModeCount(usageSnapshot.premiumModeCount);
      setFreePremiumModesRemainingToday(usageSnapshot.freePremiumModesRemainingToday);
      setUserState((prev) =>
        prev
          ? normalizeUser({
              ...prev,
              name: snapshot.name ?? prev.name,
              email: snapshot.email ?? prev.email,
              avatar: snapshot.avatar ?? prev.avatar,
              emailVerified: prev.emailVerified,
              objective: snapshot.objective ?? prev.objective,
              educationLevel: normalizeEducationLevel(snapshot.educationLevel ?? prev.educationLevel),
              plan: snapshot.plan,
            })
          : prev
      );
    },
    []
  );

  const refreshServerState = useCallback(async () => {
    if (!auth?.currentUser) return;
    setIsSubscriptionHydrated(false);
    try {
      const response = await meGet();
      const usageSnapshot = normalizeUsageSnapshot(response.subscription.plan, response);
      setUserState(
        normalizeUser({
          id: response.user.id,
          name: response.user.name,
          email: response.user.email,
          emailVerified: auth.currentUser?.emailVerified ?? false,
          avatar: response.user.avatar,
          educationLevel: normalizeEducationLevel(response.user.educationLevel),
          objective: response.user.objective,
          plan: response.subscription.plan,
        })
      );
      setUsageTodayTokens(usageSnapshot.usageTodayTokens);
      setDailyTokenLimit(usageSnapshot.dailyTokenLimit);
      setRemainingTodayTokens(usageSnapshot.remainingTodayTokens);
      setEstimatedMessagesLeft(usageSnapshot.estimatedMessagesLeft);
      setPremiumModeCount(usageSnapshot.premiumModeCount);
      setFreePremiumModesRemainingToday(usageSnapshot.freePremiumModesRemainingToday);
    } finally {
      setIsSubscriptionHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let nextResetMs = getNextIstMidnightMs();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextResetRefresh = () => {
      nextResetMs = getNextIstMidnightMs();
      const delayMs = Math.max(nextResetMs - Date.now() + 1500, 1000);
      timeoutId = setTimeout(() => {
        void refreshServerState().finally(scheduleNextResetRefresh);
      }, delayMs);
    };

    const refreshIfResetPassed = () => {
      if (Date.now() >= nextResetMs + 1000) {
        void refreshServerState();
        nextResetMs = getNextIstMidnightMs();
      }
    };

    scheduleNextResetRefresh();
    window.addEventListener('focus', refreshIfResetPassed);
    document.addEventListener('visibilitychange', refreshIfResetPassed);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener('focus', refreshIfResetPassed);
      document.removeEventListener('visibilitychange', refreshIfResetPassed);
    };
  }, [refreshServerState, user]);

  const setUser = useCallback((nextUser: UserSession | null) => {
    setUserState(normalizeUser(nextUser));
  }, []);

  const startNewChat = useCallback(() => {
    requestFreshChatView();
    setActiveThreadId(null);
    setActiveProjectId(null);
  }, []);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    setThreads((previousThreads) => {
      const nextThreads = previousThreads.filter(
        (thread) => thread.id === activeThreadId || isThreadPersistable(thread)
      );
      return nextThreads.length === previousThreads.length ? previousThreads : nextThreads;
    });
  }, [activeThreadId]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    if (!activeThreadId || activeThreadMessages.length === 0) {
      return;
    }

    const pendingMessageIds = pendingMessageIdsRef.current.get(activeThreadId);
    if (!pendingMessageIds?.size) {
      return;
    }

    for (const message of activeThreadMessages) {
      pendingMessageIds.delete(message.id);
    }

    if (pendingMessageIds.size === 0) {
      pendingMessageIdsRef.current.delete(activeThreadId);
    }
  }, [activeThreadId, activeThreadMessages]);

  useEffect(() => {
    if (!firebaseUid) {
      emptyThreadCleanupRef.current.clear();
      return;
    }

    const staleEmptyThreadIds = cloudThreadMetadata
      .filter((metadata) => metadata.messageCount === 0 && metadata.id !== activeThreadId)
      .map((metadata) => metadata.id)
      .filter((threadId) => !emptyThreadCleanupRef.current.has(threadId));

    if (staleEmptyThreadIds.length === 0) {
      return;
    }

    staleEmptyThreadIds.forEach((threadId) => {
      emptyThreadCleanupRef.current.add(threadId);
      void deleteThreadRemote({ threadId }).catch((error) => {
        runtimeLogger.warn('Unable to clean up stale empty thread.', error);
        emptyThreadCleanupRef.current.delete(threadId);
      });
    });
  }, [activeThreadId, cloudThreadMetadata, firebaseUid]);

  useEffect(() => {
    if (!auth || !hasFirebaseConfig) return;
    const firebaseAuth = auth;

    return onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      void (async () => {
        if (!firebaseUser) {
          setUserState(null);
          setThreads([]);
          setProjects([]);
          setActiveThreadId(null);
          setIsSubscriptionHydrated(true);
          setUsageTodayTokens(0);
          setDailyTokenLimit(PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit);
          setRemainingTodayTokens(PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit);
          setEstimatedMessagesLeft(
            Math.floor(
              PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit /
                PLAN_CONFIGS[DEFAULT_PLAN].averageTokensPerMessage
            )
          );
          setPremiumModeCount(0);
          setFreePremiumModesRemainingToday(FREE_PREMIUM_MODE_DAILY_LIMIT);
          setIsCloudHydrated(true);
          return;
        }

        try {
          await firebaseUser.reload();
        } catch (error) {
          runtimeLogger.warn('Unable to refresh Firebase auth user.', error);
        }

        const freshUser = firebaseAuth.currentUser ?? firebaseUser;
        setIsSubscriptionHydrated(false);

        setUserState((prev) => {
          const firebaseSession = userFromFirebase(freshUser);
          if (prev?.id === freshUser.uid) {
            return normalizeUser({
              ...firebaseSession,
              ...prev,
              id: freshUser.uid,
              email: firebaseSession.email,
              emailVerified: firebaseSession.emailVerified,
              avatar: prev.avatar || firebaseSession.avatar,
            });
          }
          return firebaseSession;
        });

        void refreshServerState().catch((error) => {
          runtimeLogger.warn('Unable to refresh Pluto server state.', error);
        });
      })();
    });
  }, [refreshServerState]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(user));
    } else {
      localStorage.removeItem(`${STORAGE_KEY}_user`);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_threads`, JSON.stringify(removeEmptyThreads(threads)));
  }, [threads]);

  useEffect(() => {
    const safeActive = getSafeActiveThreadId(activeThreadId, removeEmptyThreads(threads));
    if (safeActive) {
      localStorage.setItem(`${STORAGE_KEY}_active_thread_id`, safeActive);
    } else {
      localStorage.removeItem(`${STORAGE_KEY}_active_thread_id`);
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_projects`, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    let isCancelled = false;

    const loadCloudState = async () => {
      if (!user || !db || !hasFirebaseConfig) {
        setIsCloudHydrated(true);
        setMigrationState(null);
        setMigrationVersion(undefined);
        return;
      }

      setIsCloudHydrated(false);
      try {
        const resolvedUid = auth?.currentUser?.uid ?? user.id;
        const stateRef = appStateDocRef(db, resolvedUid);
        const migrationRef = migrationDocRef(db, resolvedUid);
        const [snapshot, migrationSnapshot] = await Promise.all([
          getDoc(stateRef),
          getDoc(migrationRef),
        ]);
        const shouldStartNewChat = consumeFreshChatViewRequest();

        if (isCancelled) {
          return;
        }

        const migrationData =
          migrationSnapshot.exists() && typeof migrationSnapshot.data()?.state === 'string'
            ? migrationSnapshot.data()
            : null;
        setMigrationState(
          migrationData && typeof migrationData.state === 'string' ? String(migrationData.state) : null
        );
        setMigrationVersion(
          migrationData && Number.isFinite(Number(migrationData.version))
            ? Math.floor(Number(migrationData.version))
            : undefined
        );

        const appState = snapshot.exists() ? deserializeLegacyAppState(snapshot.data()) : null;
        const cloudUpdatedAt = appState?.updatedAt ?? 0;
        const localUpdatedAt = getLocalStateUpdatedAt(threadsRef.current, projectsRef.current);
        const localHasState = threadsRef.current.length > 0 || projectsRef.current.length > 0;
        const collectionsHaveData = cloudThreadMetadata.length > 0 || cloudProjects.length > 0;
        const cloudThreadsForSelection: Thread[] = cloudThreadMetadata.map((metadata) => ({
          ...metadata,
          messages: [],
        }));
        const canUseLegacyFallback =
          !collectionsHaveData &&
          migrationData?.state !== 'completed' &&
          appState &&
          (appState.threads.length > 0 || appState.projects.length > 0);

        if (canUseLegacyFallback && (!localHasState || cloudUpdatedAt >= localUpdatedAt)) {
          setThreads(removeEmptyThreads(normalizeThreads(appState.threads)));
          setProjects(appState.projects);
        }

        if (shouldStartNewChat) {
          setActiveThreadId(null);
        } else if (
          appState &&
          (typeof appState.activeThreadId === 'string' || appState.activeThreadId === null) &&
          (!localHasState || cloudUpdatedAt >= localUpdatedAt)
        ) {
          setActiveThreadId(
            getSafeActiveThreadId(
              appState.activeThreadId,
              collectionsHaveData ? cloudThreadsForSelection : appState.threads
            )
          );
        }
      } catch (error) {
        runtimeLogger.warn('Cloud sync load failed. Falling back to local state.', error);
      } finally {
        if (!isCancelled) {
          setIsCloudHydrated(true);
        }
      }
    };

    void loadCloudState();

    return () => {
      isCancelled = true;
    };
  }, [cloudProjects, cloudThreadMetadata, user, user?.id]);

  useEffect(() => {
    if (!user || isThreadsLoading || isProjectsLoading) {
      return;
    }

    const collectionsHaveData =
      cloudThreadMetadata.length > 0 || cloudProjects.length > 0 || migrationState === 'completed';
    if (!collectionsHaveData) {
      return;
    }

    setProjects((previousProjects) => {
      if (migrationState === 'completed') {
        return cloudProjects;
      }

      const previousOnly = previousProjects.filter(
        (project) => !cloudProjects.some((cloudProject) => cloudProject.id === project.id)
      );
      return [...cloudProjects, ...previousOnly];
    });
    setThreads((previousThreads) => {
      const previousMap = new Map(previousThreads.map((thread) => [thread.id, thread]));
      const visibleCloudThreadMetadata = cloudThreadMetadata.filter(
        (metadata) => metadata.messageCount > 0 || metadata.id === activeThreadId
      );
      const mergedThreads = visibleCloudThreadMetadata.map((metadata) =>
        buildThreadFromMetadata({
          metadata,
          previousThread: previousMap.get(metadata.id),
          activeMessages: metadata.id === activeThreadId ? activeThreadMessages : undefined,
          isActive: metadata.id === activeThreadId,
          isActiveMessagesLoading: metadata.id === activeThreadId ? isActiveThreadMessagesLoading : false,
          pendingLocalMessages: filterPendingMessages(
            previousMap.get(metadata.id)?.messages,
            pendingMessageIdsRef.current.get(metadata.id)
          ),
        })
      );

      const previousOnly = previousThreads.filter(
        (thread) =>
          !visibleCloudThreadMetadata.some((metadata) => metadata.id === thread.id) &&
          !isThreadPersistable(thread) &&
          thread.id === activeThreadId
      );
      return [...mergedThreads, ...previousOnly].sort((left, right) => right.updatedAt - left.updatedAt);
    });
    setActiveThreadId((current) => getSafeActiveThreadId(current, threadsRef.current));
  }, [
    activeThreadId,
    activeThreadMessages,
    cloudProjects,
    cloudThreadMetadata,
    isProjectsLoading,
    isActiveThreadMessagesLoading,
    isThreadsLoading,
    migrationState,
    user,
  ]);

  useEffect(() => {
    if (!user || !db || !hasFirebaseConfig || !isCloudHydrated) return;
    const firestore = db;

    const timeoutId = setTimeout(() => {
      const cleanedThreads = removeEmptyThreads(threads);
      const safeActiveThreadId = getSafeActiveThreadId(activeThreadId, cleanedThreads);
      const resolvedUid = auth?.currentUser?.uid ?? user.id;
      const stateRef = appStateDocRef(firestore, resolvedUid);
      const payload = stripUndefined(
        serializeLightweightAppState({
          activeThreadId: safeActiveThreadId,
          updatedAt: Date.now(),
          migrationVersion,
          migrationState: migrationState ?? undefined,
        })
      );

      if (estimateSerializedBytes(payload) > APP_STATE_SIZE_GUARD_BYTES) {
        runtimeLogger.warn('Cloud sync save skipped because appState payload exceeded safety guard.', undefined, {
          sizeBytes: estimateSerializedBytes(payload),
        });
        return;
      }

      void setDoc(stateRef, payload, { merge: true }).catch((error) => {
        runtimeLogger.warn('Cloud sync save failed. Local state still available.', error);
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [activeThreadId, isCloudHydrated, migrationState, migrationVersion, threads, user, user?.id]);

  const updateUser = useCallback((data: Partial<UserSession>) => {
    setUserState((prev) => (prev ? normalizeUser({ ...prev, ...data }) : null));
  }, []);

  const setPlan = useCallback((plan: SubscriptionPlan) => {
    updateUser({ plan });
  }, [updateUser]);

  const canUseMode = useCallback(
    (requestedMode: ChatMode) => {
      if (requestedMode === 'Conversational') return true;
      if (currentPlan !== 'Free') return planConfig.allowedModes.includes(requestedMode);
      return (freePremiumModesRemainingToday ?? 0) > 0;
    },
    [currentPlan, freePremiumModesRemainingToday, planConfig.allowedModes]
  );

  const canUseFeature = useCallback(
    (feature: PlanFeatureKey) => planConfig.features[feature],
    [planConfig.features]
  );

  const canSendMessage = useCallback(
    (
      message: string,
      requestedMode: ChatMode,
      options?: { hasAttachments?: boolean }
    ) => {
      if (!isSubscriptionHydrated) {
        return {
          ok: false,
          reason: 'Loading your Pluto plan and usage. Please try again in a moment.',
        };
      }

      if (!canUseMode(requestedMode)) {
        return {
          ok: false,
          reason:
            currentPlan === 'Free'
              ? 'Upgrade required. Free plan includes 3 Homework / Exam Prep uses per day.'
              : `${requestedMode} mode is available on Plus and Pro plans.`,
        };
      }

      const trimmedMessage = message.trim();

      if (!trimmedMessage && !options?.hasAttachments) {
        return {
          ok: false,
          reason: 'Write a message or attach a file before sending.',
        };
      }

      if (trimmedMessage.length > planConfig.maxInputChars) {
        return {
          ok: false,
          reason: `This prompt is too long for ${currentPlan}. Max ${planConfig.maxInputChars} characters.`,
        };
      }

      if (trimmedMessage && estimatePromptTokens(trimmedMessage) > planConfig.maxInputTokensPerRequest) {
        return {
          ok: false,
          reason: `This request is too large for ${currentPlan}. Reduce the prompt and try again.`,
        };
      }

      if (
        estimatePromptTokens(trimmedMessage || ' ') + planConfig.maxOutputTokensPerRequest >
        remainingTodayTokens
      ) {
        return {
          ok: false,
          reason: 'You do not have enough tokens remaining for this request today.',
        };
      }

      if (remainingTodayTokens <= 0) {
        return {
          ok: false,
          reason: `You reached the ${currentPlan} daily token limit for today. Upgrade or wait for the 00:00 IST reset.`,
        };
      }

      return { ok: true };
    },
    [
      canUseMode,
      currentPlan,
      isSubscriptionHydrated,
      planConfig.maxInputChars,
      planConfig.maxInputTokensPerRequest,
      planConfig.maxOutputTokensPerRequest,
      remainingTodayTokens,
    ]
  );

  const logout = useCallback(() => {
    if (auth) {
      void signOut(auth).catch((error) => {
        runtimeLogger.warn('Firebase sign out failed.', error);
      });
    }
    setUserState(null);
    setThreads([]);
    setProjects([]);
    setActiveThreadId(null);
    setIsSubscriptionHydrated(true);
    setUsageTodayTokens(0);
    setDailyTokenLimit(PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit);
    setRemainingTodayTokens(PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit);
    setEstimatedMessagesLeft(
      Math.floor(
        PLAN_CONFIGS[DEFAULT_PLAN].dailyTokenLimit /
          PLAN_CONFIGS[DEFAULT_PLAN].averageTokensPerMessage
      )
    );
    setPremiumModeCount(0);
    setFreePremiumModesRemainingToday(FREE_PREMIUM_MODE_DAILY_LIMIT);
    localStorage.clear();
  }, []);

  const persistThreadMetadata = useCallback(
    async (thread: Thread) => {
      if (!db || !firebaseUid) {
        return;
      }

      await setDoc(
        threadDocRef(db, firebaseUid, thread.id),
        stripUndefined(
          serializeThreadMetadata({
            ...thread,
            messageCount: thread.messages.length,
          })
        ),
        { merge: true }
      );
    },
    [firebaseUid]
  );

  const persistProjectDoc = useCallback(
    async (project: Project) => {
      if (!db || !firebaseUid) {
        return;
      }

      await setDoc(projectDocRef(db, firebaseUid, project.id), serializeProject(project), {
        merge: true,
      });
    },
    [firebaseUid]
  );

  const persistMessageAndThreadUpdate = useCallback(
    async (threadId: string, message: Message, thread: Thread) => {
      if (!db || !firebaseUid) {
        return;
      }

      const messageRef = threadMessageDocRef(db, firebaseUid, threadId, message.id);
      const batch = writeBatch(db);
      batch.set(messageRef, serializeMessage(message), { merge: true });
      batch.set(
        threadDocRef(db, firebaseUid, thread.id),
        stripUndefined(
          serializeThreadMetadata({
            ...thread,
            messageCount: thread.messages.length,
          })
        ),
        { merge: true }
      );
      await batch.commit();

      if (message.role === 'assistant') {
        const persistedMessageSnapshot = await getDocFromServer(messageRef);
        if (!persistedMessageSnapshot.exists()) {
          throw new Error('Assistant message write verification failed: Firestore did not return the message doc.');
        }
      }
    },
    [firebaseUid]
  );

  const createThread = useCallback(
    (initialMode: ChatMode, projectId?: string) => {
      const safeMode: ChatMode = PLAN_CONFIGS[currentPlan].allowedModes.includes(initialMode)
        ? initialMode
        : 'Conversational';
      const newThread: Thread = {
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [],
        mode: safeMode,
        educationLevel: user?.educationLevel || 'High School',
        objective: user?.objective || 'General Learning',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (projectId) {
        newThread.projectId = projectId;
      }
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(newThread.id);
      return newThread.id;
    },
    [currentPlan, user]
  );

  const assignThreadToProject = useCallback((threadId: string, projectId: string | null) => {
    const updatedAt = Date.now();
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId
          ? stripUndefined({ ...thread, projectId: projectId || undefined, updatedAt })
          : thread
      )
    );
    const targetThread = threadsRef.current.find((thread) => thread.id === threadId);
    if (targetThread && isThreadPersistable(targetThread) && db && firebaseUid) {
      void setDoc(
        threadDocRef(db, firebaseUid, threadId),
        stripUndefined({
          projectId: projectId || deleteField(),
          updatedAt,
        }),
        { merge: true }
      ).catch((error) => {
        runtimeLogger.warn('Unable to assign thread to project in Firestore.', error);
      });
    }
  }, [firebaseUid]);

  const updateThread = useCallback((id: string, data: Partial<Thread>) => {
    const updatedAt = Date.now();
    setThreads((prev) =>
      prev.map((thread) => (thread.id === id ? { ...thread, ...data, updatedAt } : thread))
    );
    const existingThread = threadsRef.current.find((thread) => thread.id === id);
    if (!existingThread) {
      return;
    }
    const persistedThread: Thread = {
      ...existingThread,
      ...data,
      updatedAt,
      contextSummary: data.contextSummary ?? existingThread.contextSummary,
    };
    if (!isThreadPersistable(persistedThread)) {
      return;
    }
    void persistThreadMetadata(persistedThread).catch((error) => {
      runtimeLogger.warn('Unable to persist thread metadata.', error);
    });
  }, [persistThreadMetadata]);

  const deleteThread = useCallback((id: string) => {
    const removedThread = threadsRef.current.find((thread) => thread.id === id);
    setThreads((prev) => prev.filter((thread) => thread.id !== id));
    if (activeThreadId === id) {
      setActiveThreadId(null);
    }
    if (!removedThread) {
      return;
    }
    if (!isThreadPersistable(removedThread)) {
      return;
    }
    void deleteThreadRemote({ threadId: id }).catch((error) => {
      runtimeLogger.warn('Unable to delete thread from Firestore.', error);
      setThreads((prev) => [removedThread, ...prev].sort((left, right) => right.updatedAt - left.updatedAt));
      if (activeThreadId === id) {
        setActiveThreadId(id);
      }
    });
  }, [activeThreadId]);

  const addMessageToThread = useCallback((
    threadId: string,
    message: Message,
    options?: { persist?: boolean; retainUntilHydrated?: boolean }
  ) => {
    const shouldPersist = options?.persist ?? true;
    const shouldRetainUntilHydrated = options?.retainUntilHydrated ?? false;
    if (shouldPersist || shouldRetainUntilHydrated) {
      const pendingMessageIds = pendingMessageIdsRef.current.get(threadId) ?? new Set<string>();
      pendingMessageIds.add(message.id);
      pendingMessageIdsRef.current.set(threadId, pendingMessageIds);
    }

    let persistedThread: Thread | null = null;
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) return thread;
        const newMessages = [...thread.messages, message];
        let newTitle = thread.title;
        if (thread.messages.length === 0 && message.role === 'user') {
          const messageText = getMessageText(message);
          newTitle = messageText
            ? messageText.slice(0, 30) + (messageText.length > 30 ? '...' : '')
            : 'New Chat';
        }
        persistedThread = { ...thread, messages: newMessages, title: newTitle, updatedAt: Date.now() };
        return persistedThread;
      })
    );
      if (!persistedThread) {
        return;
      }

    if (!shouldPersist) {
      return;
    }

    void persistMessageAndThreadUpdate(threadId, message, persistedThread)
      .catch((error) => {
        const messagePreview = getMessageText(message).slice(0, 120);
        runtimeLogger.error('Unable to persist message/thread update atomically.', error, {
          threadId,
          messageId: message.id,
          role: message.role,
          mode: message.mode,
          messagePreview,
          threadMessageCount: persistedThread?.messages.length ?? null,
        });

        if (message.role === 'assistant') {
          setThreads((prev) =>
            prev.map((thread) => {
              if (thread.id !== threadId) {
                return thread;
              }

              const revertedMessages = thread.messages.filter(
                (threadMessage) => threadMessage.id !== message.id
              );

              if (revertedMessages.length === thread.messages.length) {
                return thread;
              }

              return {
                ...thread,
                messages: revertedMessages,
                updatedAt: persistedThread?.updatedAt ?? thread.updatedAt,
              };
            })
          );
        }
      })
      .finally(() => {
        const currentPendingMessageIds = pendingMessageIdsRef.current.get(threadId);
        currentPendingMessageIds?.delete(message.id);
        if (currentPendingMessageIds && currentPendingMessageIds.size === 0) {
          pendingMessageIdsRef.current.delete(threadId);
        }
      });
  }, [persistMessageAndThreadUpdate]);

  const createProject = useCallback(
    (name: string, color: string) => {
      if (planConfig.maxProjects !== null && projects.length >= planConfig.maxProjects) {
        return {
          ok: false,
          reason: `${currentPlan} allows up to ${planConfig.maxProjects} projects. Upgrade to create more.`,
        };
      }

      const newProject: Project = {
        id: Date.now().toString(),
        name,
        description: '',
        color,
        createdAt: Date.now(),
      };
      setProjects((prev) => [...prev, newProject]);
      void persistProjectDoc(newProject).catch((error) => {
        runtimeLogger.warn('Unable to create project in Firestore.', error);
      });
      return { ok: true };
    },
    [currentPlan, persistProjectDoc, planConfig.maxProjects, projects.length]
  );

  const value = useMemo<AppContextType>(
    () => ({
      user,
      setUser,
      updateUser,
      refreshServerState,
      applyServerSnapshot,
      threads,
      activeThreadId,
      setActiveThreadId,
      startNewChat,
      createThread,
      assignThreadToProject,
      updateThread,
      deleteThread,
      addMessageToThread,
      hasOlderActiveThreadMessages,
      isActiveThreadMessagesLoading,
      loadOlderActiveThreadMessages,
      projects,
      createProject,
      mode,
      setMode,
      activeProjectId,
      setActiveProjectId,
      currentPlan,
      planConfig,
      isSubscriptionHydrated,
      usageTodayTokens,
      dailyTokenLimit,
      remainingTodayTokens,
      estimatedMessagesLeft,
      premiumModeCount,
      freePremiumModesRemainingToday,
      setPlan,
      canUseMode,
      canUseFeature,
      canSendMessage,
      logout,
    }),
    [
      activeProjectId,
      activeThreadId,
      addMessageToThread,
      applyServerSnapshot,
      assignThreadToProject,
      canUseFeature,
      canUseMode,
      createProject,
      createThread,
      currentPlan,
      dailyTokenLimit,
      estimatedMessagesLeft,
      freePremiumModesRemainingToday,
      isSubscriptionHydrated,
      deleteThread,
      hasOlderActiveThreadMessages,
      isActiveThreadMessagesLoading,
      loadOlderActiveThreadMessages,
      logout,
      mode,
      planConfig,
      premiumModeCount,
      projects,
      refreshServerState,
      remainingTodayTokens,
      setMode,
      setUser,
      startNewChat,
      threads,
      updateThread,
      usageTodayTokens,
      user,
      updateUser,
      canSendMessage,
      setPlan,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
