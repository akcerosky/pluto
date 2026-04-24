import { GoogleGenAI } from '@google/genai';
import { logger } from 'firebase-functions';
import { requireEnv } from '../config/env.js';
import { recordGemini503 } from './gemini503Monitor.js';
import { buildEstimatedUsage, estimateAiInputTokens, normalizeTokenUsage } from './tokenUsage.js';
import type { AiHistoryMessage, ThreadContextSummary, TokenUsage } from '../types/index.js';
import {
  buildContextSnapshotMessage,
  buildFallbackSummary,
  buildSummaryPrompt,
  buildSystemInstruction,
  clampSummaryText,
  getHistoryText,
  historyToExchanges,
  SUMMARY_BLOCK_SIZE_EXCHANGES,
} from './ai/prompting.js';
import type { ProviderRequest, ProviderResult } from './ai/providerTypes.js';

const FILLER_PREFIXES = [
  'sure, ',
  'sure. ',
  'here is ',
  'here are ',
  'let us ',
  "let's ",
];
const FOLLOWUP_TAILS = [
  'if you want, i can give more practice questions.',
  'if you need the answers, just let me know!',
  'if you want more, ask me.',
];

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';
export type GeminiModelUsed = typeof PRIMARY_MODEL | typeof FALLBACK_MODEL;

export const refreshContextSummary = async (payload: {
  genAI: GoogleGenAI;
  contextSummary?: ThreadContextSummary;
  summaryCandidates: AiHistoryMessage[];
  educationLevel: string;
  mode: string;
  objective: string;
  requestId?: string;
}) => {
  if (payload.summaryCandidates.length === 0) {
    return payload.contextSummary;
  }

  const fallbackText = buildFallbackSummary(payload.summaryCandidates);
  const fallbackSummary: ThreadContextSummary = {
    version: 1,
    text: clampSummaryText([payload.contextSummary?.text, fallbackText].filter(Boolean).join('\n')),
    summarizedMessageCount:
      (payload.contextSummary?.summarizedMessageCount ?? 0) + payload.summaryCandidates.length,
    summarizedExchangeCount:
      (payload.contextSummary?.summarizedExchangeCount ?? 0) + historyToExchanges(payload.summaryCandidates).length,
    blockSize: SUMMARY_BLOCK_SIZE_EXCHANGES,
    updatedAt: Date.now(),
  };

  try {
    const response = await payload.genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: buildSummaryPrompt({
                existingSummary: payload.contextSummary,
                summaryCandidates: payload.summaryCandidates,
                educationLevel: payload.educationLevel,
                mode: payload.mode,
                objective: payload.objective,
              }),
            },
          ],
        },
      ],
      config: {
        maxOutputTokens: 700,
        temperature: 0.2,
      },
    });

    const text = clampSummaryText(response.text ?? '');
    return text
      ? {
          ...fallbackSummary,
          text,
        }
      : fallbackSummary;
  } catch (error) {
    const providerError = getProviderErrorDetails(error);
    logger.warn('gemini_summary_generation_failed', {
      eventType: 'gemini_summary_generation_failed',
      requestId: payload.requestId ?? null,
      summaryCandidateCount: payload.summaryCandidates.length,
      providerStatus: providerError.status,
      providerCode: providerError.code,
      errorMessage: providerError.message,
    });
    return fallbackSummary;
  }
};

const getProviderErrorDetails = (error: unknown) => {
  if (!(typeof error === 'object' && error !== null)) {
    return {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      status: null as number | null,
      code: null as string | null,
      details: undefined as unknown,
    };
  }

  const record = error as Record<string, unknown>;
  return {
    message:
      typeof record.message === 'string'
        ? record.message
        : error instanceof Error
          ? error.message
          : 'Unknown provider error',
    stack: typeof record.stack === 'string' ? record.stack : error instanceof Error ? error.stack : undefined,
    status: typeof record.status === 'number' ? record.status : null,
    code: typeof record.code === 'string' ? record.code : null,
    details: record.details,
  };
};

export const isRetryableGeminiError = (error: unknown) => {
  const providerError = getProviderErrorDetails(error);
  const status = providerError.status;
  const code = String(providerError.code ?? providerError.message ?? '').toUpperCase();
  return status === 500 || status === 503 || code.includes('DEADLINE_EXCEEDED');
};

const getModelUsed = (modelId: GeminiModelUsed): GeminiModelUsed => modelId;
const getAuditModelUsed = (modelId: GeminiModelUsed) => modelId;

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

const buildGeminiContents = ({
  history,
  currentTurn,
  contextSummary,
}: {
  history: ReturnType<typeof normalizeHistory>;
  currentTurn: { role: 'user'; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };
  contextSummary?: ThreadContextSummary;
}) => {
  if (!contextSummary?.text.trim()) {
    return [...history, currentTurn];
  }

  const contextText = buildContextSnapshotMessage(contextSummary);
  const [firstHistory, ...restHistory] = history;

  if (firstHistory?.role === 'user') {
    return [
      {
        ...firstHistory,
        parts: [
          {
            text: `${contextText}\n\nRecent conversation starts here:\n${firstHistory.parts[0]?.text ?? ''}`,
          },
        ],
      },
      ...restHistory,
      currentTurn,
    ];
  }

  const [firstPart, ...restParts] = currentTurn.parts;
  if (firstPart && 'text' in firstPart) {
    return [
      ...history,
      {
        ...currentTurn,
        parts: [
          {
            text: `${contextText}\n\nLatest student message:\n${firstPart.text}`,
          },
          ...restParts,
        ],
      },
    ];
  }

  return [
    ...history,
    {
      ...currentTurn,
      parts: [
        {
          text: contextText,
        },
        ...currentTurn.parts,
      ],
    },
  ];
};

export const sanitizeResponse = (text: string) => {
  let cleaned = (text || '').trim();
  if (!cleaned) {
    return 'I could not generate a response for that question.';
  }

  const latexReplacements: Array<[string | RegExp, string]> = [
    [/\\text\{([^{}]+)\}/g, '$1'],
    [/\\boxed\{([^{}]+)\}/g, '$1'],
    [/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)'],
    [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1 / $2'],
    [/\\cdot/g, ' * '],
    [/\\rightarrow/g, ' -> '],
    [/\\pm/g, '+/-'],
    [/\\circ/g, ' deg'],
    [/\\geq/g, ' >= '],
    [/\\leq/g, ' <= '],
    [/\\times/g, ' x '],
    [/\\\(/g, ''],
    [/\\\)/g, ''],
    [/\\\[/g, ''],
    [/\\\]/g, ''],
  ];

  for (const [pattern, replacement] of latexReplacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  const lowered = cleaned.toLowerCase();
  for (const prefix of FILLER_PREFIXES) {
    if (lowered.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trimStart();
      break;
    }
  }

  const loweredTail = cleaned.toLowerCase();
  for (const tail of FOLLOWUP_TAILS) {
    if (loweredTail.endsWith(tail)) {
      cleaned = cleaned.slice(0, -tail.length).trimEnd();
      break;
    }
  }

  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\{\}/g, '');
  cleaned = cleaned.trim();

  return cleaned || 'I could not generate a response for that question.';
};

const logGeminiFailure = async ({
  payload,
  modelId,
  error,
}: {
  payload: ProviderRequest;
  modelId: GeminiModelUsed;
  error: unknown;
}) => {
  const providerError = getProviderErrorDetails(error);
  logger.error('gemini_generate_content_failed', {
    eventType: 'gemini_generate_content_failed',
    requestId: payload.requestId ?? null,
    model: modelId,
    modelUsed: getAuditModelUsed(modelId),
    mode: payload.mode,
    plan: payload.plan,
    promptLength: payload.prompt.length,
    historyMessageCount: payload.history.length,
    attachmentCount: payload.attachments.length,
    attachmentSummary: payload.attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    })),
    providerStatus: providerError.status,
    providerCode: providerError.code,
    errorMessage: providerError.message,
    errorDetails: providerError.details,
    stack: providerError.stack,
  });
  if (providerError.status === 503 && payload.uid && payload.requestId) {
    await recordGemini503(payload.uid, payload.requestId).catch(() => undefined);
  }
};

const executeGeminiModel = async ({
  genAI,
  payload,
  modelId,
  contextSummary,
  history,
  currentTurn,
  estimatedInputTokens,
}: {
  genAI: GoogleGenAI;
  payload: ProviderRequest;
  modelId: GeminiModelUsed;
  contextSummary?: ThreadContextSummary;
  history: ReturnType<typeof normalizeHistory>;
  currentTurn: { role: 'user'; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };
  estimatedInputTokens: number;
}): Promise<ProviderResult> => {
  const startedAt = Date.now();
  const response = await genAI.models.generateContent({
    model: modelId,
    contents: buildGeminiContents({
      history,
      currentTurn,
      contextSummary,
    }),
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
  const text = sanitizeResponse(response.text ?? '');
  const metadata = response.usageMetadata;
  const estimatedUsage = buildEstimatedUsage({
    prompt: payload.prompt,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    history: payload.history,
    contextSummaryText: contextSummary?.text,
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
  const modelUsed = getModelUsed(modelId);

  logger.info('gemini_success', {
    eventType: 'gemini_success',
    requestId: payload.requestId ?? null,
    model: modelId,
    modelUsed,
    auditModelUsed: getAuditModelUsed(modelId),
    mode: payload.mode,
    plan: payload.plan,
  });

  return {
    text,
    contextSummary,
    usage: normalizedUsage.usage,
    usageAnomaly: normalizedUsage.anomalyReason,
    provider: 'gemini',
    modelId,
    modelUsed,
    latencyMs: Date.now() - startedAt,
  };
};

export const generateGeminiResponse = async (payload: ProviderRequest): Promise<ProviderResult> => {
  const genAI = new GoogleGenAI({ apiKey: requireEnv('geminiApiKey').trim() });
  const contextSummary = await refreshContextSummary({
    genAI,
    contextSummary: payload.contextSummary,
    summaryCandidates: payload.summaryCandidates,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    requestId: payload.requestId,
  });
  const history = normalizeHistory(payload.history);
  const estimatedInputTokens = estimateAiInputTokens({
    prompt: payload.prompt,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    history: payload.history,
    contextSummaryText: contextSummary?.text,
  });
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

  try {
    return await executeGeminiModel({
      genAI,
      payload,
      modelId: PRIMARY_MODEL,
      contextSummary,
      history,
      currentTurn,
      estimatedInputTokens,
    });
  } catch (error) {
    await logGeminiFailure({
      payload,
      modelId: PRIMARY_MODEL,
      error,
    });

    if (!isRetryableGeminiError(error)) {
      if (typeof error === 'object' && error !== null) {
        Object.assign(error as Record<string, unknown>, {
          modelId: PRIMARY_MODEL,
          modelUsed: getModelUsed(PRIMARY_MODEL),
        });
      }
      throw error;
    }

    logger.warn('gemini_model_fallback_triggered', {
      eventType: 'gemini_model_fallback_triggered',
      requestId: payload.requestId ?? null,
      fromModel: PRIMARY_MODEL,
      toModel: FALLBACK_MODEL,
      mode: payload.mode,
      plan: payload.plan,
    });

    try {
      return await executeGeminiModel({
        genAI,
        payload,
        modelId: FALLBACK_MODEL,
        contextSummary,
        history,
        currentTurn,
        estimatedInputTokens,
      });
    } catch (fallbackError) {
      await logGeminiFailure({
        payload,
        modelId: FALLBACK_MODEL,
        error: fallbackError,
      });
      if (typeof fallbackError === 'object' && fallbackError !== null) {
        Object.assign(fallbackError as Record<string, unknown>, {
          modelId: FALLBACK_MODEL,
          modelUsed: getModelUsed(FALLBACK_MODEL),
        });
      }
      throw fallbackError;
    }
  }
};

export const generatePlutoResponse = generateGeminiResponse;
