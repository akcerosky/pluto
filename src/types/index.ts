import type { EducationLevel, ChatMode } from '../context/appContextTypes';
import type { SubscriptionPlan } from '../config/subscription';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface FilePart {
  type: 'file';
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export type MessagePart = TextPart | ImagePart | FilePart;

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  mode: ChatMode;
  timestamp: number;
}

export interface ThreadContextSummary {
  version: 1;
  text: string;
  summarizedMessageCount: number;
  summarizedExchangeCount: number;
  blockSize: number;
  updatedAt: number;
}

export interface Thread {
  id: string;
  title: string;
  messages: Message[];
  mode: ChatMode;
  educationLevel: EducationLevel;
  objective: string;
  createdAt: number;
  updatedAt: number;
  projectId?: string;
  contextSummary?: ThreadContextSummary;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: number;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  educationLevel: EducationLevel;
  objective: string;
  avatar?: string;
  plan?: SubscriptionPlan;
}

type LegacyMessage = Omit<Message, 'parts'> & {
  content?: string;
  parts?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toFiniteSize = (value: unknown) => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.floor(numberValue) : 0;
};

export const createTextPart = (text: string): TextPart => ({
  type: 'text',
  text,
});

export const getMessageText = (message: Pick<Message, 'parts'>) =>
  message.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();

export const normalizeMessageParts = (
  parts: unknown,
  fallbackContent?: string
): MessagePart[] => {
  const normalizedParts = Array.isArray(parts)
    ? parts.flatMap<MessagePart>((part) => {
        if (!isRecord(part) || typeof part.type !== 'string') {
          return [];
        }

        if (part.type === 'text' && typeof part.text === 'string') {
          return [createTextPart(part.text)];
        }

        if (
          (part.type === 'image' || part.type === 'file') &&
          typeof part.name === 'string' &&
          typeof part.mimeType === 'string'
        ) {
          return [
            {
              type: part.type,
              name: part.name,
              mimeType: part.mimeType,
              sizeBytes: toFiniteSize(part.sizeBytes),
            },
          ];
        }

        return [];
      })
    : [];

  if (normalizedParts.length > 0) {
    return normalizedParts;
  }

  if (typeof fallbackContent === 'string' && fallbackContent.length > 0) {
    return [createTextPart(fallbackContent)];
  }

  return [];
};

export const normalizeMessage = (message: LegacyMessage): Message => ({
  id: message.id,
  role: message.role,
  parts: normalizeMessageParts(message.parts, message.content),
  mode: message.mode,
  timestamp: message.timestamp,
});

export const normalizeThreadContextSummary = (value: unknown): ThreadContextSummary | undefined => {
  if (!isRecord(value) || typeof value.text !== 'string') {
    return undefined;
  }

  const text = value.text.trim();
  if (!text) {
    return undefined;
  }

  return {
    version: 1,
    text: text.slice(0, 4000),
    summarizedMessageCount: Math.max(0, Math.floor(Number(value.summarizedMessageCount) || 0)),
    summarizedExchangeCount: Math.max(0, Math.floor(Number(value.summarizedExchangeCount) || 0)),
    blockSize: Math.max(1, Math.floor(Number(value.blockSize) || 10)),
    updatedAt: Math.max(0, Math.floor(Number(value.updatedAt) || Date.now())),
  };
};
