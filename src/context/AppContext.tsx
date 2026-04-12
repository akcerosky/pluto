import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Thread, UserSession, Project, Message } from '../types';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  DEFAULT_PLAN,
  PLAN_CONFIGS,
  type PlanConfig,
  type PlanFeatureKey,
  type SubscriptionPlan,
} from '../config/subscription';
import { auth, db, hasFirebaseConfig } from '../lib/firebase';

export type EducationLevel = 'Elementary' | 'Middle School' | 'High School' | 'College/University' | 'Professional';
export type ChatMode = 'Conversational' | 'Homework' | 'ExamPrep';

interface AppContextType {
  user: UserSession | null;
  setUser: (user: UserSession | null) => void;
  updateUser: (data: Partial<UserSession>) => void;

  threads: Thread[];
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  startNewChat: () => void;
  createThread: (mode: ChatMode, projectId?: string) => string;
  assignThreadToProject: (threadId: string, projectId: string | null) => void;
  updateThread: (id: string, data: Partial<Thread>) => void;
  deleteThread: (id: string) => void;
  addMessageToThread: (threadId: string, message: Message) => void;

  projects: Project[];
  createProject: (name: string, color: string) => { ok: boolean; reason?: string };

  mode: ChatMode;
  setMode: (mode: ChatMode) => void;

  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;

  currentPlan: SubscriptionPlan;
  planConfig: PlanConfig;
  usageToday: number;
  dailyLimit: number | null;
  remainingToday: number | null;
  setPlan: (plan: SubscriptionPlan) => void;
  canUseMode: (mode: ChatMode) => boolean;
  canUseFeature: (feature: PlanFeatureKey) => boolean;
  canSendMessage: (message: string, mode: ChatMode) => { ok: boolean; reason?: string };

  logout: () => void;
}

const STORAGE_KEY = 'pluto_v2';
const CLOUD_STATE_DOC = 'main';
const START_NEW_CHAT_KEY = `${STORAGE_KEY}_start_new_chat`;

const AppContext = createContext<AppContextType | undefined>(undefined);

const getTodayKey = () => new Date().toDateString();

const normalizeUser = (user: UserSession | null): UserSession | null => {
  if (!user) return null;
  return {
    ...user,
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

const getLocalStateUpdatedAt = (threads: Thread[], projects: Project[]) => {
  return Math.max(
    0,
    ...threads.map((thread) => thread.updatedAt || thread.createdAt || 0),
    ...projects.map((project) => project.createdAt || 0)
  );
};

const removeEmptyThreads = (threads: Thread[]) => {
  return threads.filter((thread) => Array.isArray(thread.messages) && thread.messages.length > 0);
};

const getSafeActiveThreadId = (activeThreadId: string | null | undefined, threads: Thread[]) => {
  if (!activeThreadId) return null;
  return threads.some((thread) => thread.id === activeThreadId) ? activeThreadId : null;
};

const userFromFirebase = (firebaseUser: FirebaseUser): UserSession => ({
  id: firebaseUser.uid,
  name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
  email: firebaseUser.email || '',
  avatar: firebaseUser.photoURL || undefined,
  educationLevel: 'High School' as EducationLevel,
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
  // --- Auth State ---
  const [user, setUserState] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_user`);
    return saved ? normalizeUser(JSON.parse(saved)) : null;
  });

  // --- Thread State ---
  const [threads, setThreads] = useState<Thread[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_threads`);
    return saved ? removeEmptyThreads(JSON.parse(saved)) : [];
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const savedThreads = localStorage.getItem(`${STORAGE_KEY}_threads`);
    const activeThreadId = localStorage.getItem(`${STORAGE_KEY}_active_thread_id`);
    const cleanedThreads = savedThreads ? removeEmptyThreads(JSON.parse(savedThreads)) : [];
    return getSafeActiveThreadId(activeThreadId, cleanedThreads);
  });

  // --- Projects State ---
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_projects`);
    return saved ? JSON.parse(saved) : [];
  });

  const [mode, setMode] = useState<ChatMode>('Conversational');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isCloudHydrated, setIsCloudHydrated] = useState(false);
  const threadsRef = useRef(threads);
  const projectsRef = useRef(projects);

  const currentPlan: SubscriptionPlan = user?.plan ?? DEFAULT_PLAN;
  const planConfig = PLAN_CONFIGS[currentPlan];

  const usageToday = useMemo(() => {
    const today = getTodayKey();
    return threads.reduce((count, thread) => {
      const inThreadToday = thread.messages.filter(
        (msg) => msg.role === 'user' && new Date(msg.timestamp).toDateString() === today
      ).length;
      return count + inThreadToday;
    }, 0);
  }, [threads]);

  const dailyLimit = planConfig.dailyMessageLimit;
  const remainingToday = dailyLimit === null ? null : Math.max(dailyLimit - usageToday, 0);

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
    const firebaseAuth = auth;
    if (!firebaseAuth || !hasFirebaseConfig) return;

    return onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (!firebaseUser) {
        setUserState(null);
        setThreads([]);
        setProjects([]);
        setActiveThreadId(null);
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
            avatar: prev.avatar || firebaseSession.avatar,
          });
        }
        return firebaseSession;
      });
    });
  }, []);

  // Persistence
  useEffect(() => {
    if (user) {
      localStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(user));
    } else {
      localStorage.removeItem(`${STORAGE_KEY}_user`);
    }
  }, [user]);

  useEffect(() => {
    const cleanedThreads = removeEmptyThreads(threads);
    localStorage.setItem(`${STORAGE_KEY}_threads`, JSON.stringify(cleanedThreads));
  }, [threads]);

  useEffect(() => {
    const safeActiveThreadId = getSafeActiveThreadId(activeThreadId, removeEmptyThreads(threads));
    if (safeActiveThreadId) {
      localStorage.setItem(`${STORAGE_KEY}_active_thread_id`, safeActiveThreadId);
    } else {
      localStorage.removeItem(`${STORAGE_KEY}_active_thread_id`);
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_projects`, JSON.stringify(projects));
  }, [projects]);

  // Load cloud chat/project state once the user is available.
  useEffect(() => {
    let isCancelled = false;

    const loadCloudState = async () => {
      const firestore = db;
      if (!user || !firestore || !hasFirebaseConfig) {
        setIsCloudHydrated(true);
        return;
      }

      setIsCloudHydrated(false);
      try {
        const firebaseUid = auth?.currentUser?.uid ?? user.id;
        const stateRef = doc(firestore, 'users', firebaseUid, 'appState', CLOUD_STATE_DOC);
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
  }, [user?.id]);

  // Save chat/project state to Firestore.
  useEffect(() => {
    const firestore = db;
    if (!user || !firestore || !hasFirebaseConfig || !isCloudHydrated) return;

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
  }, [user?.id, threads, projects, activeThreadId, isCloudHydrated]);

  const updateUser = (data: Partial<UserSession>) => {
    setUserState((prev) => (prev ? normalizeUser({ ...prev, ...data }) : null));
  };

  const setPlan = (plan: SubscriptionPlan) => {
    updateUser({ plan });
  };

  const canUseMode = (requestedMode: ChatMode) => {
    return planConfig.allowedModes.includes(requestedMode);
  };

  const canUseFeature = (feature: PlanFeatureKey) => {
    return planConfig.features[feature];
  };

  const canSendMessage = (message: string, requestedMode: ChatMode) => {
    if (!canUseMode(requestedMode)) {
      return {
        ok: false,
        reason: `${requestedMode} mode is available on Plus and Pro plans.`,
      };
    }

    if (message.trim().length > planConfig.maxInputChars) {
      return {
        ok: false,
        reason: `This prompt is too long for ${currentPlan}. Max ${planConfig.maxInputChars} characters.`,
      };
    }

    if (dailyLimit !== null && usageToday >= dailyLimit) {
      return {
        ok: false,
        reason: `You reached the free daily limit (${dailyLimit}/${dailyLimit}). Upgrade to Plus or Pro to continue today.`,
      };
    }

    return { ok: true };
  };

  const logout = () => {
    if (auth) {
      void signOut(auth).catch((error) => {
        console.warn('Firebase sign out failed.', error);
      });
    }
    setUserState(null);
    setThreads([]);
    setProjects([]);
    setActiveThreadId(null);
    localStorage.clear();
  };

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
    [user, currentPlan]
  );

  const assignThreadToProject = (threadId: string, projectId: string | null) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? stripUndefined({ ...t, projectId: projectId || undefined, updatedAt: Date.now() })
          : t
      )
    );
  };

  const updateThread = (id: string, data: Partial<Thread>) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...data, updatedAt: Date.now() } : t)));
  };

  const deleteThread = (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) {
      setActiveThreadId(null);
    }
  };

  const addMessageToThread = (threadId: string, message: Message) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          const newMessages = [...t.messages, message];
          // Auto-generate title from first message
          let newTitle = t.title;
          if (t.messages.length === 0 && message.role === 'user') {
            newTitle = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '');
          }
          return { ...t, messages: newMessages, title: newTitle, updatedAt: Date.now() };
        }
        return t;
      })
    );
  };

  const createProject = (name: string, color: string) => {
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
  };

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        updateUser,
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
