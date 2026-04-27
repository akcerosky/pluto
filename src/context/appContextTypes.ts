import type { PlanConfig, PlanFeatureKey, SubscriptionPlan } from '../config/subscription';
import type { Message, Project, Thread, UserSession } from '../types';

export type EducationLevel =
  | 'Elementary'
  | 'Middle School'
  | 'High School'
  | 'College/University'
  | 'Professional';

export type ChatMode = 'Conversational' | 'Homework' | 'ExamPrep';

export interface AppContextType {
  user: UserSession | null;
  setUser: (user: UserSession | null) => void;
  updateUser: (data: Partial<UserSession>) => void;
  refreshServerState: () => Promise<void>;
  applyServerSnapshot: (snapshot: {
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
  }) => void;

  threads: Thread[];
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  startNewChat: () => void;
  createThread: (mode: ChatMode, projectId?: string) => string;
  assignThreadToProject: (threadId: string, projectId: string | null) => void;
  updateThread: (id: string, data: Partial<Thread>) => void;
  deleteThread: (id: string) => void;
  addMessageToThread: (
    threadId: string,
    message: Message,
    options?: { persist?: boolean; retainUntilHydrated?: boolean }
  ) => void;
  hasOlderActiveThreadMessages: boolean;
  isActiveThreadMessagesLoading: boolean;
  loadOlderActiveThreadMessages: () => void;

  projects: Project[];
  createProject: (name: string, color: string) => { ok: boolean; reason?: string };

  mode: ChatMode;
  setMode: (mode: ChatMode) => void;

  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;

  currentPlan: SubscriptionPlan;
  planConfig: PlanConfig;
  isSubscriptionHydrated: boolean;
  usageTodayTokens: number;
  dailyTokenLimit: number;
  remainingTodayTokens: number;
  estimatedMessagesLeft: number;
  premiumModeCount: number;
  freePremiumModesRemainingToday: number | null;
  setPlan: (plan: SubscriptionPlan) => void;
  canUseMode: (mode: ChatMode) => boolean;
  canUseFeature: (feature: PlanFeatureKey) => boolean;
  canSendMessage: (
    message: string,
    mode: ChatMode,
    options?: { hasAttachments?: boolean }
  ) => { ok: boolean; reason?: string };

  logout: () => void;
}
