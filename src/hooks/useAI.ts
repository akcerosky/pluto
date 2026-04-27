import { aiChat } from '../lib/plutoApi';
import type { InlineAttachmentInput } from '../lib/attachments';
import type { MessagePart, ThreadContextSummary } from '../types';

export async function getPlutoResponse(
  threadId: string,
  prompt: string,
  educationLevel: string,
  mode: 'Conversational' | 'Homework' | 'ExamPrep',
  objective: string,
  history: { role: 'user' | 'assistant'; parts: MessagePart[] }[] = [],
  contextSummary?: ThreadContextSummary,
  summaryCandidates: { role: 'user' | 'assistant'; parts: MessagePart[] }[] = [],
  attachments: InlineAttachmentInput[] = [],
  options?: {
    onRetrying?: (state: { attempt: number; delayMs: number; totalRetries: number }) => void;
  }
) {
  const requestId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();

  return aiChat({
    threadId,
    prompt,
    educationLevel,
    mode,
    objective,
    history,
    contextSummary,
    summaryCandidates,
    attachments,
    assistantMessageId,
    requestId,
    onRetrying: options?.onRetrying,
  });
}
