import { GoogleGenAI } from '@google/genai';
import { requireEnv } from '../config/env.js';
import { buildEstimatedUsage, estimateAiInputTokens, normalizeTokenUsage } from './tokenUsage.js';
import type { AiHistoryMessage, AiInlineAttachment, TokenUsage } from '../types/index.js';

const buildSystemInstruction = (
  educationLevel: string,
  mode: string,
  objective: string,
  plan: string
) => `<identity>
You are Pluto, an advanced AI learning companion designed exclusively for educational support. Your sole purpose is to help students learn effectively.
</identity>
<current_context>
- Education Level: ${educationLevel}
- Learning Objective: ${objective}
- Interaction Mode: ${mode}
- Subscription Plan: ${plan}
</current_context>
<rules>
- Stay educational
- Reject non-educational requests
- Homework mode gives hints, not full solutions
- ExamPrep mode can generate practice and explain reasoning
- Use structured markdown with clear headings and lists
</rules>`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const PRIMARY_MODEL = 'gemini-2.5-flash';

const getHistoryText = (message: AiHistoryMessage) =>
  message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');

export const normalizeHistory = (history: AiHistoryMessage[]) => {
  const sanitized: Array<{ role: 'user' | 'model'; content: string }> = history
    .map((message) => ({
      role: (message.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      content: getHistoryText(message),
    }))
    .filter((message) => message.content.length > 0);

  while (sanitized.length > 0 && sanitized[0]?.role !== 'user') {
    sanitized.shift();
  }

  const alternating = sanitized.reduce<Array<{ role: 'user' | 'model'; content: string }>>((acc, message) => {
    const previous = acc.at(-1);
    if (!previous || previous.role !== message.role) {
      acc.push(message);
    }
    return acc;
  }, []);

  return alternating.map((message) => ({
    role: message.role,
    parts: [{ text: message.content }],
  }));
};

export const generatePlutoResponse = async (payload: {
  prompt: string;
  educationLevel: string;
  mode: string;
  objective: string;
  plan: string;
  history: AiHistoryMessage[];
  attachments: AiInlineAttachment[];
  maxOutputTokens: number;
}) => {
  const genAI = new GoogleGenAI({ apiKey: requireEnv('geminiApiKey').trim() });
  const history = normalizeHistory(payload.history);
  const estimatedInputTokens = estimateAiInputTokens({
    prompt: payload.prompt,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    history: payload.history,
  });
  const backoffs = [0, 1000, 3000, 9000];
  let lastError: unknown;

  const currentTurn = {
    role: 'user' as const,
    parts: [
      ...(payload.prompt.trim() ? [{ text: payload.prompt }] : []),
      ...payload.attachments.map((attachment) => ({
        inlineData: {
          mimeType: attachment.mimeType,
          data: attachment.base64Data,
        },
      })),
    ],
  };

  for (let attempt = 0; attempt < backoffs.length; attempt += 1) {
    if (attempt > 0) {
      const jitter = Math.floor(Math.random() * 301);
      await wait(backoffs[attempt] + jitter);
    }

    try {
      const response = await genAI.models.generateContent({
        model: PRIMARY_MODEL,
        contents: [...history, currentTurn],
        config: {
          systemInstruction: buildSystemInstruction(
            payload.educationLevel,
            payload.mode,
            payload.objective,
            payload.plan
          ),
          maxOutputTokens: payload.maxOutputTokens,
        },
      });
      const text = response.text ?? '';
      const metadata = response.usageMetadata;
      const estimatedUsage = buildEstimatedUsage({
        prompt: payload.prompt,
        educationLevel: payload.educationLevel,
        mode: payload.mode,
        objective: payload.objective,
        history: payload.history,
        answer: text,
      });
      const providerUsage: TokenUsage | null =
        metadata &&
        typeof metadata.promptTokenCount === 'number' &&
        typeof metadata.candidatesTokenCount === 'number' &&
        typeof metadata.totalTokenCount === 'number'
          ? {
              inputTokens: metadata.promptTokenCount,
              outputTokens: metadata.candidatesTokenCount,
              totalTokens: metadata.totalTokenCount,
              usageSource: 'provider',
            }
          : null;
      const normalizedUsage = normalizeTokenUsage({
        providerUsage,
        estimatedUsage,
        estimatedInputTokens,
        maxOutputTokens: payload.maxOutputTokens,
      });

      return {
        text,
        usage: normalizedUsage.usage,
        usageAnomaly: normalizedUsage.anomalyReason,
      };
    } catch (error) {
      lastError = error;
      const status =
        typeof error === 'object' && error && 'status' in error ? Number(error.status) : null;
      if (!status || !RETRYABLE_STATUS_CODES.has(status)) {
        break;
      }
    }
  }

  throw lastError ?? new Error('Gemini request failed.');
};
