import { aiChat } from '../lib/plutoApi';

export async function getPlutoResponse(
  prompt: string,
  educationLevel: string,
  mode: 'Conversational' | 'Homework' | 'ExamPrep',
  objective: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
) {
  const requestId = crypto.randomUUID();

  return aiChat({
    prompt,
    educationLevel,
    mode,
    objective,
    history,
    requestId,
  });
}
