import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, hasFirebaseConfig } from '../lib/firebase';
import { meGet } from '../lib/plutoApi';
import {
  DEFAULT_PLAN,
  PLAN_CONFIGS,
  type PlanFeatureKey,
  type SubscriptionPlan,
} from '../config/subscription';
import type { Message, Project, Thread, UserSession } from '../types';
import type { AppContextType, ChatMode, EducationLevel } from './appContextTypes';
import { AppContext } from './appContextValue';

const STORAGE_KEY = 'pluto_v3';
const CLOUD_STATE_DOC = 'main';
const START_NEW_CHAT_KEY = `${STORAGE_KEY}_start_new_chat`;

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

const removeEmptyThreads = (threads: Thread[]) =>
  threads.filter((thread) => Array.isArray(thread.messages) && thread.messages.length > 0);

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
  plan: DEFAULT_PLAN,
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

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_user`);
    return saved ? normalizeUser(JSON.parse(saved)) : null;
  });
  const [threads, setThreads] = useState<Thread[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_threads`);
    return saved ? removeEmptyThreads(JSON.parse(saved)) : [];
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const savedThreads = localStorage.getItem(`${STORAGE_KEY}_threads`);
    const savedActiveThreadId = localStorage.getItem(`${STORAGE_KEY}_active_thread_id`);
    const cleanedThreads = savedThreads ? removeEmptyThreads(JSON.parse(savedThreads)) : [];
    return getSafeActiveThreadId(savedActiveThreadId, cleanedThreads);
  });
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_projects`);
    return saved ? JSON.parse(saved) : [];
  });
  const [mode, setMode] = useState<ChatMode>('Conversational');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isCloudHydrated, setIsCloudHydrated] = useState(false);
  const [usageToday, setUsageToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState<number | null>(PLAN_CONFIGS[DEFAULT_PLAN].dailyMessageLimit);
  const [remainingToday, setRemainingToday] = useState<number | null>(PLAN_CONFIGS[DEFAULT_PLAN].dailyMessageLimit);
  const threadsRef = useRef(threads);
  const projectsRef = useRef(projects);

  const currentPlan: SubscriptionPlan = user?.plan ?? DEFAULT_PLAN;
  const planConfig = PLAN_CONFIGS[currentPlan];

  const applyServerSnapshot = useCallback(
    (snapshot: {
      plan: SubscriptionPlan;
      usageToday: number;
      dailyLimit: number | null;
      remainingToday: number | null;
      educationLevel?: string;
      objective?: string;
      name?: string;
      email?: string;
      avatar?: string;
    }) => {
      setUsageToday(snapshot.usageToday);
      setDailyLimit(snapshot.dailyLimit);
      setRemainingToday(snapshot.remainingToday);
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
    const response = await meGet();
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
    setUsageToday(response.usageToday);
    setDailyLimit(response.dailyLimit);
    setRemainingToday(response.remainingToday);
  }, []);

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
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    if (!auth || !hasFirebaseConfig) return;

    return onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUserState(null);
        setThreads([]);
        setProjects([]);
        setActiveThreadId(null);
        setUsageToday(0);
        setDailyLimit(PLAN_CONFIGS[DEFAULT_PLAN].dailyMessageLimit);
        setRemainingToday(PLAN_CONFIGS[DEFAULT_PLAN].dailyMessageLimit);
        setIsCloudHydrated(true);
        return;
      }

      setUserState((prev) => {
        const firebaseSession = userFromFirebase(firebaseUser);
        if (prev?.id === firebaseUser.uid) {
          return normalizeUser({
            ...firebaseSession,
            ...prev,
            id: firebaseUser.uid,
            email: firebaseSession.email,
            emailVerified: firebaseSession.emailVerified,
            avatar: prev.avatar || firebaseSession.avatar,
          });
        }
        return firebaseSession;
      });

      void refreshServerState().catch((error) => {
        console.warn('Unable to refresh Pluto server state.', error);
      });
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
        return;
      }

      setIsCloudHydrated(false);
      try {
        const firebaseUid = auth?.currentUser?.uid ?? user.id;
        const stateRef = doc(db, 'users', firebaseUid, 'appState', CLOUD_STATE_DOC);
        const snapshot = await getDoc(stateRef);
        const shouldStartNewChat = consumeFreshChatViewRequest();

        if (!snapshot.exists() || isCancelled) {
          if (shouldStartNewChat) {
            setActiveThreadId(null);
          }
          setIsCloudHydrated(true);
          return;
        }

        const data = snapshot.data() as {
          threads?: Thread[];
          projects?: Project[];
          activeThreadId?: string | null;
          updatedAt?: number | string;
        };
        const cloudUpdatedAt = Number(data.updatedAt || 0);
        const localUpdatedAt = getLocalStateUpdatedAt(threadsRef.current, projectsRef.current);
        const cloudHasState = Boolean(data.threads?.length || data.projects?.length || data.activeThreadId);
        const localHasState = threadsRef.current.length > 0 || projectsRef.current.length > 0;

        if (!cloudHasState && localHasState) {
          setIsCloudHydrated(true);
          return;
        }

        if (localHasState && localUpdatedAt > cloudUpdatedAt) {
          setIsCloudHydrated(true);
          return;
        }

        const cleanedCloudThreads = Array.isArray(data.threads) ? removeEmptyThreads(data.threads) : null;
        if (cleanedCloudThreads) {
          setThreads(cleanedCloudThreads);
        }
        if (Array.isArray(data.projects)) {
          setProjects(data.projects);
        }
        if (shouldStartNewChat) {
          setActiveThreadId(null);
        } else if (typeof data.activeThreadId === 'string' || data.activeThreadId === null) {
          setActiveThreadId(getSafeActiveThreadId(data.activeThreadId, cleanedCloudThreads ?? threadsRef.current));
        }
      } catch (error) {
        console.warn('Cloud sync load failed. Falling back to local state.', error);
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
  }, [user, user?.id]);

  useEffect(() => {
    if (!user || !db || !hasFirebaseConfig || !isCloudHydrated) return;
    const firestore = db;

    const timeoutId = setTimeout(() => {
      const cleanedThreads = removeEmptyThreads(threads);
      const safeActiveThreadId = getSafeActiveThreadId(activeThreadId, cleanedThreads);
      const firebaseUid = auth?.currentUser?.uid ?? user.id;
      const stateRef = doc(firestore, 'users', firebaseUid, 'appState', CLOUD_STATE_DOC);
      void setDoc(
        stateRef,
        stripUndefined({
          threads: cleanedThreads,
          projects,
          activeThreadId: safeActiveThreadId,
          updatedAt: Date.now(),
        }),
        { merge: true }
      ).catch((error) => {
        console.warn('Cloud sync save failed. Local state still available.', error);
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [activeThreadId, isCloudHydrated, projects, threads, user, user?.id]);

  const updateUser = useCallback((data: Partial<UserSession>) => {
    setUserState((prev) => (prev ? normalizeUser({ ...prev, ...data }) : null));
  }, []);

  const setPlan = useCallback((plan: SubscriptionPlan) => {
    updateUser({ plan });
  }, [updateUser]);

  const canUseMode = useCallback(
    (requestedMode: ChatMode) => planConfig.allowedModes.includes(requestedMode),
    [planConfig.allowedModes]
  );

  const canUseFeature = useCallback(
    (feature: PlanFeatureKey) => planConfig.features[feature],
    [planConfig.features]
  );

  const canSendMessage = useCallback(
    (message: string, requestedMode: ChatMode) => {
      if (!canUseMode(requestedMode)) {
        return { ok: false, reason: `${requestedMode} mode is available on Plus and Pro plans.` };
      }

      if (message.trim().length > planConfig.maxInputChars) {
        return {
          ok: false,
          reason: `This prompt is too long for ${currentPlan}. Max ${planConfig.maxInputChars} characters.`,
        };
      }

      if (dailyLimit !== null && remainingToday !== null && remainingToday <= 0) {
        return {
          ok: false,
          reason: `You reached the ${currentPlan} daily limit for today. Upgrade or wait for the 00:00 IST reset.`,
        };
      }

      return { ok: true };
    },
    [canUseMode, currentPlan, dailyLimit, planConfig.maxInputChars, remainingToday]
  );

  const logout = useCallback(() => {
    if (auth) {
      void signOut(auth).catch((error) => {
        console.warn('Firebase sign out failed.', error);
      });
    }
    setUserState(null);
    setThreads([]);
    setProjects([]);
    setActiveThreadId(null);
    setUsageToday(0);
    setDailyLimit(PLAN_CONFIGS[DEFAULT_PLAN].dailyMessageLimit);
    setRemainingToday(PLAN_CONFIGS[DEFAULT_PLAN].dailyMessageLimit);
    localStorage.clear();
  }, []);

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
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId
          ? stripUndefined({ ...thread, projectId: projectId || undefined, updatedAt: Date.now() })
          : thread
      )
    );
  }, []);

  const updateThread = useCallback((id: string, data: Partial<Thread>) => {
    setThreads((prev) => prev.map((thread) => (thread.id === id ? { ...thread, ...data, updatedAt: Date.now() } : thread)));
  }, []);

  const deleteThread = useCallback((id: string) => {
    setThreads((prev) => prev.filter((thread) => thread.id !== id));
    if (activeThreadId === id) {
      setActiveThreadId(null);
    }
  }, [activeThreadId]);

  const addMessageToThread = useCallback((threadId: string, message: Message) => {
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) return thread;
        const newMessages = [...thread.messages, message];
        let newTitle = thread.title;
        if (thread.messages.length === 0 && message.role === 'user') {
          newTitle = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
        }
        return { ...thread, messages: newMessages, title: newTitle, updatedAt: Date.now() };
      })
    );
  }, []);

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
      return { ok: true };
    },
    [currentPlan, planConfig.maxProjects, projects.length]
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
      projects,
      createProject,
      mode,
      setMode,
      activeProjectId,
      setActiveProjectId,
      currentPlan,
      planConfig,
      usageToday,
      dailyLimit,
      remainingToday,
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
      dailyLimit,
      deleteThread,
      logout,
      mode,
      planConfig,
      projects,
      refreshServerState,
      remainingToday,
      setMode,
      setUser,
      startNewChat,
      threads,
      updateThread,
      usageToday,
      user,
      updateUser,
      canSendMessage,
      setPlan,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
