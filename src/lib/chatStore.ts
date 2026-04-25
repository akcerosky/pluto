import {
  collection,
  doc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import {
  normalizeMessage,
  normalizeThreadMetadata,
  normalizeThreadContextSummary,
  type Message,
  type Project,
  type Thread,
  type ThreadContextSummary,
  type ThreadMetadata,
} from '../types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

export const userRootPath = (uid: string) => ['users', uid] as const;
export const appStateDocRef = (firestore: Firestore, uid: string) =>
  doc(firestore, ...userRootPath(uid), 'appState', 'main');
export const threadCollectionRef = (firestore: Firestore, uid: string) =>
  collection(firestore, ...userRootPath(uid), 'threads');
export const threadDocRef = (firestore: Firestore, uid: string, threadId: string) =>
  doc(firestore, ...userRootPath(uid), 'threads', threadId);
export const threadMessagesCollectionRef = (
  firestore: Firestore,
  uid: string,
  threadId: string
) => collection(firestore, ...userRootPath(uid), 'threads', threadId, 'messages');
export const threadMessageDocRef = (
  firestore: Firestore,
  uid: string,
  threadId: string,
  messageId: string
) => doc(firestore, ...userRootPath(uid), 'threads', threadId, 'messages', messageId);
export const projectCollectionRef = (firestore: Firestore, uid: string) =>
  collection(firestore, ...userRootPath(uid), 'projects');
export const projectDocRef = (firestore: Firestore, uid: string, projectId: string) =>
  doc(firestore, ...userRootPath(uid), 'projects', projectId);
export const migrationDocRef = (firestore: Firestore, uid: string) =>
  doc(firestore, ...userRootPath(uid), 'meta', 'migration');

export const serializeThreadMetadata = (
  thread: Pick<
    Thread,
    | 'id'
    | 'title'
    | 'mode'
    | 'educationLevel'
    | 'objective'
    | 'createdAt'
    | 'updatedAt'
    | 'projectId'
    | 'contextSummary'
  > & { messageCount: number }
) => ({
  id: thread.id,
  title: thread.title,
  mode: thread.mode,
  educationLevel: thread.educationLevel,
  objective: thread.objective,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
  projectId: thread.projectId,
  contextSummary: thread.contextSummary,
  messageCount: thread.messageCount,
});

export const deserializeThreadMetadata = (id: string, data: DocumentData): ThreadMetadata | null =>
  normalizeThreadMetadata({
    id,
    ...data,
  });

export const serializeMessage = (message: Message) => ({
  id: message.id,
  role: message.role,
  parts: message.parts,
  mode: message.mode,
  timestamp: message.timestamp,
});

export const deserializeMessage = (id: string, data: DocumentData): Message =>
  normalizeMessage({
    id,
    role: data.role,
    parts: data.parts,
    mode: data.mode,
    timestamp: Number(data.timestamp) || Date.now(),
  });

export const serializeProject = (project: Project) => ({
  id: project.id,
  name: project.name,
  description: project.description,
  color: project.color,
  createdAt: project.createdAt,
});

export const deserializeProject = (id: string, data: DocumentData): Project => ({
  id,
  name: typeof data.name === 'string' ? data.name : 'Untitled Project',
  description: typeof data.description === 'string' ? data.description : '',
  color: typeof data.color === 'string' ? data.color : '#8A2BE2',
  createdAt: Math.max(0, Math.floor(Number(data.createdAt) || Date.now())),
});

export const deserializeLegacyAppState = (value: unknown): {
  threads: Thread[];
  projects: Project[];
  activeThreadId: string | null;
  updatedAt: number;
  migrationVersion?: number;
  migrationState?: string;
} | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const rawThreads = Array.isArray(record.threads) ? record.threads : [];
  const rawProjects = Array.isArray(record.projects) ? record.projects : [];
  const threads = rawThreads.reduce<Thread[]>((acc, thread) => {
      const threadRecord = asRecord(thread);
      if (!threadRecord || typeof threadRecord.id !== 'string') {
        return acc;
      }
      const metadata = normalizeThreadMetadata({
        id: threadRecord.id,
        title: threadRecord.title,
        mode: threadRecord.mode,
        educationLevel: threadRecord.educationLevel,
        objective: threadRecord.objective,
        createdAt: threadRecord.createdAt,
        updatedAt: threadRecord.updatedAt,
        projectId: threadRecord.projectId,
        contextSummary: threadRecord.contextSummary,
        messageCount: Array.isArray(threadRecord.messages) ? threadRecord.messages.length : 0,
      });
      if (!metadata) {
        return acc;
      }
      const messages = Array.isArray(threadRecord.messages)
        ? threadRecord.messages.map((message) => normalizeMessage(message as never))
        : [];
      acc.push({
        id: metadata.id,
        title: metadata.title,
        mode: metadata.mode,
        educationLevel: metadata.educationLevel,
        objective: metadata.objective,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        projectId: metadata.projectId,
        contextSummary: metadata.contextSummary,
        messages,
      });
      return acc;
    }, []);

  const projects = rawProjects
    .map((project) => {
      const projectRecord = asRecord(project);
      if (!projectRecord || typeof projectRecord.id !== 'string') {
        return null;
      }
      return deserializeProject(projectRecord.id, projectRecord);
    })
    .filter((project): project is Project => Boolean(project));

  return {
    threads,
    projects,
    activeThreadId:
      typeof record.activeThreadId === 'string' || record.activeThreadId === null
        ? (record.activeThreadId as string | null)
        : null,
    updatedAt: Math.max(0, Math.floor(Number(record.updatedAt) || 0)),
    migrationVersion: Number.isFinite(Number(record.migrationVersion))
      ? Math.floor(Number(record.migrationVersion))
      : undefined,
    migrationState: typeof record.migrationState === 'string' ? record.migrationState : undefined,
  };
};

export const serializeLightweightAppState = (payload: {
  activeThreadId: string | null;
  updatedAt: number;
  migrationVersion?: number;
  migrationState?: string;
}) => ({
  activeThreadId: payload.activeThreadId,
  updatedAt: payload.updatedAt,
  migrationVersion: payload.migrationVersion,
  migrationState: payload.migrationState,
});

export const estimateSerializedBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

export const contextSummaryFromThreadMetadata = (
  thread: Pick<ThreadMetadata, 'contextSummary'> | Pick<Thread, 'contextSummary'> | undefined
): ThreadContextSummary | undefined =>
  normalizeThreadContextSummary(thread?.contextSummary);
