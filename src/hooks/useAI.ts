import { aiChat } from '../lib/plutoApi';
import type { InlineAttachmentInput } from '../lib/attachments';
import type { MessagePart } from '../types';

export async function getPlutoResponse(
  prompt: string,
  educationLevel: string,
  mode: 'Conversational' | 'Homework' | 'ExamPrep',
  objective: string,
  history: { role: 'user' | 'assistant'; parts: MessagePart[] }[] = [],
  attachments: InlineAttachmentInput[] = []
) {
  const requestId = crypto.randomUUID();

  return aiChat({
    prompt,
    educationLevel,
    mode,
    objective,
    history,
    attachments,
    requestId,
  });
}
