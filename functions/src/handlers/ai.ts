import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { adminDb } from '../lib/firebaseAdmin.js';
import {
  FREE_PREMIUM_MODE_DAILY_LIMIT,
  getEffectiveMaxOutputTokens,
  PLAN_DEFINITIONS,
  INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES,
} from '../config/plans.js';
import { assertAuth, getBootstrapIdentity, getRequestId } from '../lib/http.js';
import { logAiQuotaEvent, logAiQuotaMetric } from '../lib/observability.js';
import {
  getMeSnapshot,
  reconcileUsageTokens,
  releaseReservedUsageTokens,
  reserveUsageTokens,
} from '../services/firestoreRepo.js';
import { executeHybridAiRequest } from '../services/ai/orchestrator.js';
import {
  acquireAiRequest,
  completeAiRequest,
  failAiRequest,
  throwCachedAiError,
  type CachedAiError,
} from '../services/aiRequestCache.js';
import { checkAndRecordAiRateLimit } from '../services/aiRateLimit.js';
import {
  estimateAiInputTokenBreakdown,
  MESSAGE_OVERHEAD_TOKENS,
  estimateReservedTokens,
} from '../services/tokenUsage.js';
import type {
  AiHistoryMessage,
  AiInlineAttachment,
  AiMessagePart,
  ThreadContextSummary,
} from '../types/index.js';

const SHARED_HISTORY_WINDOW = 16;
const RECENT_HISTORY_TOKEN_BUDGET = 4000;
const SUMMARY_CANDIDATE_MESSAGE_LIMIT = 20;
const SUMMARY_MIN_CANDIDATE_MESSAGES = 10;

const mapAiErrorToHttpsError = (error: unknown) => {
  const status =
    typeof error === 'object' && error && 'status' in error ? Number(error.status) : null;
  const message =
    typeof error === 'object' && error && 'message' in error ? String(error.message) : '';

  if (status === 429) {
    return new HttpsError('resource-exhausted', 'Pluto is receiving a lot of requests right now. Please try again in a moment.');
  }

  if (status === 500 || status === 503) {
    return new HttpsError('unavailable', 'Pluto is temporarily busy. Please try again in a moment.');
  }

  if (status === 404) {
    return new HttpsError('unavailable', 'Pluto is temporarily unavailable. Please try again in a moment.');
  }

  if (error instanceof HttpsError) {
    return error;
  }

  return new HttpsError(
    'internal',
    message || 'Pluto hit an unexpected AI error. Please try again.'
  );
};

const getCachedErrorFromHttpsError = (error: HttpsError): CachedAiError => ({
  code: error.code as CachedAiError['code'],
  message: error.message,
});

const getDailyQuotaExceededMessage = (plan: 'Free' | 'Plus' | 'Pro') => {
  if (plan === 'Pro') {
    return 'You reached the Pro daily token limit for today. Please wait for the 00:00 IST reset.';
  }

  return `You reached the ${plan} daily token limit for today. Upgrade to continue or wait for the 00:00 IST reset.`;
};

const logAiRequestCacheCompleteFailure = ({
  uid,
  requestId,
  cacheKey,
  error,
}: {
  uid: string;
  requestId: string;
  cacheKey: string;
  error: unknown;
}) => {
  logger.error('ai_request_cache_complete_failed', {
    eventType: 'ai_request_cache_complete_failed',
    uid,
    requestId,
    cacheKey,
    errorMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
};

const persistAssistantReply = async ({
  uid,
  threadId,
  assistantMessageId,
  mode,
  answer,
  contextSummary,
}: {
  uid: string;
  threadId: string;
  assistantMessageId: string;
  mode: 'Conversational' | 'Homework' | 'ExamPrep';
  answer: string;
  contextSummary?: ThreadContextSummary | null;
}) => {
  const threadRef = adminDb.collection('users').doc(uid).collection('threads').doc(threadId);
  const messageRef = threadRef.collection('messages').doc(assistantMessageId);
  const assistantTimestamp = Date.now();

  await adminDb.runTransaction(async (transaction) => {
    const [threadSnapshot, messageSnapshot] = await Promise.all([
      transaction.get(threadRef),
      transaction.get(messageRef),
    ]);

    if (!messageSnapshot.exists) {
      transaction.set(
        messageRef,
        {
          id: assistantMessageId,
          role: 'assistant',
          parts: [{ type: 'text', text: answer }],
          mode,
          timestamp: assistantTimestamp,
        },
        { merge: true }
      );
    }

    const existingMessageCount = Math.max(
      0,
      Math.floor(Number(threadSnapshot.data()?.messageCount) || 0)
    );
    const threadUpdate: Record<string, unknown> = {
      updatedAt: assistantTimestamp,
      messageCount: messageSnapshot.exists ? existingMessageCount : existingMessageCount + 1,
    };

    if (contextSummary) {
      threadUpdate.contextSummary = contextSummary;
    }

    transaction.set(threadRef, threadUpdate, { merge: true });
  });

  return assistantTimestamp;
};

const isTransientProviderError = (error: unknown) => {
  const details = getErrorDetails(error);
  const status = details.status;
  const code = String(details.code ?? details.message ?? '').toUpperCase();
  return status === 500 || status === 503 || code.includes('DEADLINE_EXCEEDED');
};

const isPermanentProviderError = (error: unknown) => {
  const details = getErrorDetails(error);
  return details.status === 400 || details.status === 403 || details.status === 429;
};

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1).max(6000),
});

const attachmentPartSchema = z.object({
  type: z.union([z.literal('image'), z.literal('file')]),
  name: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(0).max(20 * 1024 * 1024),
});

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(1).max(20 * 1024 * 1024),
  base64Data: z.string().trim().min(1),
});

const contextSummarySchema = z.object({
  version: z.literal(1),
  text: z.string().trim().min(1).max(4000),
  summarizedMessageCount: z.number().int().min(0).max(10000),
  summarizedExchangeCount: z.number().int().min(0).max(5000),
  blockSize: z.number().int().min(1).max(50),
  updatedAt: z.number().int().min(0),
});

const aiChatSchema = z.object({
  prompt: z.string().trim().max(6000),
  mode: z.enum(['Conversational', 'Homework', 'ExamPrep']),
  educationLevel: z.string().trim().min(1).max(80),
  objective: z.string().trim().min(1).max(200),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        parts: z.array(z.union([textPartSchema, attachmentPartSchema])).max(16),
      })
    )
    .max(80),
  contextSummary: contextSummarySchema.optional(),
  summaryCandidates: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        parts: z.array(z.union([textPartSchema, attachmentPartSchema])).max(16),
      })
    )
    .max(SUMMARY_CANDIDATE_MESSAGE_LIMIT)
    .optional(),
  attachments: z.array(attachmentSchema).max(8),
  threadId: z.string().trim().min(1).max(200),
  assistantMessageId: z.string().trim().min(1).max(200),
  requestId: z.string().trim().min(8).max(200),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getErrorDetails = (error: unknown) => {
  if (!isRecord(error)) {
    return {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      status: null as number | null,
      code: null as string | null,
      details: undefined as unknown,
    };
  }

  return {
    message:
      typeof error.message === 'string'
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error',
    stack: typeof error.stack === 'string' ? error.stack : error instanceof Error ? error.stack : undefined,
    status: typeof error.status === 'number' ? error.status : null,
    code: typeof error.code === 'string' ? error.code : null,
    provider: typeof error.provider === 'string' ? error.provider : null,
    modelId: typeof error.modelId === 'string' ? error.modelId : null,
    modelUsed: typeof error.modelUsed === 'string' ? error.modelUsed : null,
    attemptNumber: typeof error.attemptNumber === 'number' ? error.attemptNumber : null,
    retryEligible: typeof error.retryEligible === 'boolean' ? error.retryEligible : null,
    details: 'details' in error ? error.details : undefined,
  };
};

const normalizeHistoryParts = (parts: unknown): AiMessagePart[] =>
  Array.isArray(parts)
    ? parts.flatMap<AiMessagePart>((part) => {
        if (!isRecord(part) || typeof part.type !== 'string') {
          return [];
        }

        if (part.type === 'text' && typeof part.text === 'string') {
          const text = part.text.trim().slice(0, 6000);
          return text ? [{ type: 'text', text }] : [];
        }

        if (
          (part.type === 'image' || part.type === 'file') &&
          typeof part.name === 'string' &&
          typeof part.mimeType === 'string'
        ) {
          return [
            {
              type: part.type,
              name: part.name.trim().slice(0, 260),
              mimeType: part.mimeType.trim().slice(0, 120),
              sizeBytes: Math.max(0, Math.floor(Number(part.sizeBytes) || 0)),
            },
          ];
        }

        return [];
      })
    : [];

const clampHistoryForValidation = (history: AiHistoryMessage[]) =>
  history.map((message) => ({
    role: message.role,
    parts: normalizeHistoryParts(message.parts),
  }));

const clampAttachmentsForValidation = (attachments: AiInlineAttachment[]) =>
  attachments.map((attachment) => ({
    name: attachment.name.trim().slice(0, 260),
    mimeType: attachment.mimeType.trim().slice(0, 120),
    sizeBytes: Math.max(0, Math.floor(attachment.sizeBytes)),
    base64Data: attachment.base64Data.trim(),
  }));

const clampContextSummaryForValidation = (summary: unknown): ThreadContextSummary | undefined => {
  if (!isRecord(summary) || typeof summary.text !== 'string') {
    return undefined;
  }

  const text = summary.text.trim().slice(0, 4000);
  if (!text) {
    return undefined;
  }

  return {
    version: 1,
    text,
    summarizedMessageCount: Math.max(0, Math.floor(Number(summary.summarizedMessageCount) || 0)),
    summarizedExchangeCount: Math.max(0, Math.floor(Number(summary.summarizedExchangeCount) || 0)),
    blockSize: Math.max(1, Math.floor(Number(summary.blockSize) || 10)),
    updatedAt: Math.max(0, Math.floor(Number(summary.updatedAt) || 0)),
  };
};

const getInlinePayloadBytes = (prompt: string, attachments: AiInlineAttachment[]) =>
  Buffer.byteLength(
    JSON.stringify({
      prompt,
      attachments: attachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        base64Data: attachment.base64Data,
      })),
    }),
    'utf8'
  );

const isMimeAllowed = (
  allowedKinds: Array<'image' | 'pdf'>,
  mimeType: string
) =>
  (allowedKinds.includes('image') && mimeType.startsWith('image/')) ||
  (allowedKinds.includes('pdf') && mimeType === 'application/pdf');

const decodeAttachment = (attachment: AiInlineAttachment) => {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(attachment.base64Data)) {
    throw new HttpsError('invalid-argument', `Attachment "${attachment.name}" is not valid base64.`);
  }

  const buffer = Buffer.from(attachment.base64Data, 'base64');
  if (!buffer.length) {
    throw new HttpsError('invalid-argument', `Attachment "${attachment.name}" is empty.`);
  }

  if (buffer.byteLength !== attachment.sizeBytes) {
    throw new HttpsError(
      'invalid-argument',
      `Attachment "${attachment.name}" size metadata does not match the uploaded content.`
    );
  }

  return buffer;
};

const MIN_HISTORY_MESSAGES_AFTER_TRIM = 2;

const trimSummaryTextToTokenBudget = (summaryText: string, availableTokens: number) => {
  if (availableTokens <= MESSAGE_OVERHEAD_TOKENS) {
    return '';
  }

  const maxSummaryChars = Math.max(0, (availableTokens - MESSAGE_OVERHEAD_TOKENS) * 4);
  return summaryText.trim().slice(0, maxSummaryChars).trim();
};

const cloneContextSummaryWithText = (
  contextSummary: ThreadContextSummary | undefined,
  text: string
): ThreadContextSummary | undefined => {
  const trimmedText = text.trim();
  if (!contextSummary || !trimmedText) {
    return undefined;
  }

  return {
    ...contextSummary,
    text: trimmedText,
    updatedAt: Date.now(),
  };
};

const fitInputContextToPlan = ({
  prompt,
  educationLevel,
  mode,
  objective,
  history,
  contextSummary,
  maxInputTokens,
}: {
  prompt: string;
  educationLevel: string;
  mode: string;
  objective: string;
  history: AiHistoryMessage[];
  contextSummary?: ThreadContextSummary;
  maxInputTokens: number;
}) => {
  let trimmedHistory = [...history];
  let trimmedSummaryText = contextSummary?.text.trim() ?? '';
  const initialBreakdown = estimateAiInputTokenBreakdown({
    prompt,
    educationLevel,
    mode,
    objective,
    history: trimmedHistory,
    contextSummaryText: trimmedSummaryText,
  });
  const promptOnlyBreakdown = estimateAiInputTokenBreakdown({
    prompt,
    educationLevel,
    mode,
    objective,
    history: [],
  });

  if (promptOnlyBreakdown.totalTokens > maxInputTokens) {
    return {
      ok: false as const,
      reason: 'prompt_exceeds_input_cap' as const,
      history,
      contextSummary,
      initialBreakdown,
      finalBreakdown: promptOnlyBreakdown,
      trimmedHistoryCount: 0,
      trimmedSummaryChars: 0,
      budget: maxInputTokens - promptOnlyBreakdown.totalTokens,
      historyTokenBudget: RECENT_HISTORY_TOKEN_BUDGET,
    };
  }

  let finalBreakdown = initialBreakdown;
  let trimmedHistoryCount = 0;
  const originalSummaryLength = trimmedSummaryText.length;

  while (
    (finalBreakdown.totalTokens > maxInputTokens ||
      finalBreakdown.historyTokens > RECENT_HISTORY_TOKEN_BUDGET) &&
    trimmedHistory.length > MIN_HISTORY_MESSAGES_AFTER_TRIM
  ) {
    const dropCount = Math.min(2, trimmedHistory.length - MIN_HISTORY_MESSAGES_AFTER_TRIM);
    trimmedHistory = trimmedHistory.slice(dropCount);
    trimmedHistoryCount += dropCount;
    finalBreakdown = estimateAiInputTokenBreakdown({
      prompt,
      educationLevel,
      mode,
      objective,
      history: trimmedHistory,
      contextSummaryText: trimmedSummaryText,
    });
  }

  if (finalBreakdown.totalTokens > maxInputTokens && trimmedSummaryText) {
    const nonSummaryTokens =
      finalBreakdown.promptTokens +
      finalBreakdown.historyTokens +
      finalBreakdown.systemContextTokens +
      finalBreakdown.systemOverheadTokens;
    trimmedSummaryText = trimSummaryTextToTokenBudget(
      trimmedSummaryText,
      maxInputTokens - nonSummaryTokens
    );
    finalBreakdown = estimateAiInputTokenBreakdown({
      prompt,
      educationLevel,
      mode,
      objective,
      history: trimmedHistory,
      contextSummaryText: trimmedSummaryText,
    });
  }

  const trimmedSummaryChars = Math.max(0, originalSummaryLength - trimmedSummaryText.length);

  return {
    ok: finalBreakdown.totalTokens <= maxInputTokens,
    reason: finalBreakdown.totalTokens <= maxInputTokens ? null : 'context_exceeds_input_cap',
    history: trimmedHistory,
    contextSummary: cloneContextSummaryWithText(contextSummary, trimmedSummaryText),
    initialBreakdown,
    finalBreakdown,
    trimmedHistoryCount,
    trimmedSummaryChars,
    budget:
      maxInputTokens -
      initialBreakdown.systemOverheadTokens -
      initialBreakdown.promptTokens -
      initialBreakdown.systemContextTokens,
    historyTokenBudget: RECENT_HISTORY_TOKEN_BUDGET,
  };
};

export const aiChatHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const rawPayload = (request.data ?? {}) as Record<string, unknown>;
  const payload = aiChatSchema.parse({
    ...rawPayload,
    history: Array.isArray(rawPayload.history)
      ? clampHistoryForValidation(
          rawPayload.history.filter(
            (message): message is AiHistoryMessage =>
              isRecord(message) &&
              (message.role === 'user' || message.role === 'assistant') &&
              Array.isArray(message.parts)
          )
        )
      : [],
    contextSummary: clampContextSummaryForValidation(rawPayload.contextSummary),
    summaryCandidates: Array.isArray(rawPayload.summaryCandidates)
      ? clampHistoryForValidation(
          rawPayload.summaryCandidates.filter(
            (message): message is AiHistoryMessage =>
              isRecord(message) &&
              (message.role === 'user' || message.role === 'assistant') &&
              Array.isArray(message.parts)
          )
        )
      : [],
    attachments: Array.isArray(rawPayload.attachments)
      ? clampAttachmentsForValidation(
          rawPayload.attachments.filter(
            (attachment): attachment is AiInlineAttachment =>
              isRecord(attachment) &&
              typeof attachment.name === 'string' &&
              typeof attachment.mimeType === 'string' &&
              typeof attachment.sizeBytes === 'number' &&
              typeof attachment.base64Data === 'string'
          )
        )
      : [],
  });
  const requestId = getRequestId(payload);

  const bootstrapIdentity = getBootstrapIdentity(request);
  const snapshot = await getMeSnapshot(uid, bootstrapIdentity);
  const plan = snapshot.subscription.plan;
  const planConfig = PLAN_DEFINITIONS[plan];
  const effectiveMaxOutputTokens = getEffectiveMaxOutputTokens(payload.mode, planConfig);
  const isPremiumMode = payload.mode === 'Homework' || payload.mode === 'ExamPrep';
  const history = payload.history.slice(-SHARED_HISTORY_WINDOW);
  const summaryCandidates =
    (payload.summaryCandidates ?? []).length >= SUMMARY_MIN_CANDIDATE_MESSAGES
      ? (payload.summaryCandidates ?? []).slice(0, SUMMARY_CANDIDATE_MESSAGE_LIMIT)
      : [];

  if (!payload.prompt.trim() && payload.attachments.length === 0) {
    throw new HttpsError('invalid-argument', 'Write a message or attach a file before sending.');
  }

  if (
    !planConfig.allowedModes.includes(payload.mode) &&
    !(plan === 'Free' && isPremiumMode && (snapshot.freePremiumModesRemainingToday ?? 0) > 0)
  ) {
    throw new HttpsError('permission-denied', `${payload.mode} mode requires a higher plan.`);
  }

  if (plan === 'Free' && isPremiumMode && (snapshot.freePremiumModesRemainingToday ?? 0) <= 0) {
    logAiQuotaMetric('quota_rejection', {
      uid,
      requestId,
      plan,
      rejectionReason: 'free_premium_mode_limit',
      remainingBefore: snapshot.remainingTodayTokens,
      premiumModeCount: snapshot.premiumModeCount,
      freePremiumModesRemainingToday: snapshot.freePremiumModesRemainingToday ?? 0,
      freePremiumModeDailyLimit: FREE_PREMIUM_MODE_DAILY_LIMIT,
    });
    throw new HttpsError(
      'permission-denied',
      'Upgrade required. Free plan includes 3 Homework / Exam Prep uses per day.'
    );
  }

  if (payload.prompt.length > planConfig.maxInputChars) {
    throw new HttpsError(
      'invalid-argument',
      `This prompt exceeds the ${plan} limit of ${planConfig.maxInputChars} characters.`
    );
  }

  if (!planConfig.attachmentsEnabled && payload.attachments.length > 0) {
    throw new HttpsError(
      'permission-denied',
      `${plan} does not include attachment support. Upgrade to continue.`
    );
  }

  const inlinePayloadBytes = getInlinePayloadBytes(payload.prompt, payload.attachments);
  if (inlinePayloadBytes > INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES) {
    throw new HttpsError(
      'invalid-argument',
      'Attachments are too large to send inline. Reduce the number or size of files so the total request stays under 8 MB.'
    );
  }

  const decodedAttachments = payload.attachments.map((attachment) => {
    if (!isMimeAllowed(planConfig.allowedAttachmentKinds, attachment.mimeType)) {
      throw new HttpsError(
        'permission-denied',
        `Attachment type "${attachment.mimeType}" is not available on ${plan}.`
      );
    }

    if (attachment.sizeBytes > planConfig.maxAttachmentBytes) {
      throw new HttpsError(
        'invalid-argument',
        `Attachment "${attachment.name}" exceeds the ${plan} per-file limit.`
      );
    }

    return {
      ...attachment,
      data: decodeAttachment(attachment),
    };
  });

  const inputContextFit = fitInputContextToPlan({
    prompt: payload.prompt,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    history,
    contextSummary: payload.contextSummary,
    maxInputTokens: planConfig.maxInputTokensPerRequest,
  });

  const inputContextLog = {
    uid,
    requestId,
    plan,
    status: inputContextFit.ok ? 'accepted' : 'rejected',
    reason: inputContextFit.reason,
    budget: inputContextFit.budget,
    historyTokenBudget: inputContextFit.historyTokenBudget,
    maxInputTokens: planConfig.maxInputTokensPerRequest,
    promptTokens: inputContextFit.initialBreakdown.promptTokens,
    summaryTokens: inputContextFit.initialBreakdown.summaryTokens,
    historyTokens: inputContextFit.initialBreakdown.historyTokens,
    systemContextTokens: inputContextFit.initialBreakdown.systemContextTokens,
    systemOverheadTokens: inputContextFit.initialBreakdown.systemOverheadTokens,
    inputTokens: inputContextFit.finalBreakdown.totalTokens,
    inputtokkens: inputContextFit.finalBreakdown.totalTokens,
    outputtokens: null,
    maxOutputTokens: planConfig.maxOutputTokensPerRequest,
    finalPromptTokens: inputContextFit.finalBreakdown.promptTokens,
    finalSummaryTokens: inputContextFit.finalBreakdown.summaryTokens,
    finalHistoryTokens: inputContextFit.finalBreakdown.historyTokens,
    initialInputTokens: inputContextFit.initialBreakdown.totalTokens,
    historyCount: history.length,
    sentHistoryMessageCount: inputContextFit.history.length,
    finalHistoryCount: inputContextFit.history.length,
    summaryLength: payload.contextSummary?.text.length ?? 0,
    finalSummaryLength: inputContextFit.contextSummary?.text.length ?? 0,
    trimmedHistoryCount: inputContextFit.trimmedHistoryCount,
    trimmedSummaryChars: inputContextFit.trimmedSummaryChars,
    summaryCandidateCount: summaryCandidates.length,
    hasContextSummary: Boolean(payload.contextSummary?.text),
  };
  logger.info('ai_input_context_fit', {
    eventType: 'ai_input_context_fit',
    ...inputContextLog,
  });

  if (
    inputContextFit.initialBreakdown.totalTokens > planConfig.maxInputTokensPerRequest ||
    inputContextFit.initialBreakdown.historyTokens > RECENT_HISTORY_TOKEN_BUDGET ||
    inputContextFit.trimmedHistoryCount > 0 ||
    inputContextFit.trimmedSummaryChars > 0
  ) {
    logger.info('ai_input_token_cap', {
      eventType: 'ai_input_token_cap',
      ...inputContextLog,
      status: inputContextFit.ok ? 'trimmed' : 'rejected',
    });
  }

  if (!inputContextFit.ok) {
    logAiQuotaMetric('quota_rejection', {
      uid,
      requestId,
      plan,
      rejectionReason: inputContextFit.reason ?? 'input_token_cap',
      estimatedTokens: inputContextFit.finalBreakdown.totalTokens,
      reservedTokens: inputContextFit.finalBreakdown.totalTokens + effectiveMaxOutputTokens,
      remainingBefore: snapshot.remainingTodayTokens,
      promptTokens: inputContextFit.initialBreakdown.promptTokens,
      summaryTokens: inputContextFit.initialBreakdown.summaryTokens,
      historyTokens: inputContextFit.initialBreakdown.historyTokens,
      historyCount: history.length,
      summaryLength: payload.contextSummary?.text.length ?? 0,
      trimmedHistoryCount: inputContextFit.trimmedHistoryCount,
      trimmedSummaryChars: inputContextFit.trimmedSummaryChars,
      inputTokens: inputContextFit.finalBreakdown.totalTokens,
      inputtokkens: inputContextFit.finalBreakdown.totalTokens,
      outputtokens: null,
      maxOutputTokens: effectiveMaxOutputTokens,
    });
    throw new HttpsError(
      'invalid-argument',
      inputContextFit.reason === 'prompt_exceeds_input_cap'
        ? `This request is too large for ${plan}. Reduce the prompt or history and try again.`
        : `Your prompt is too long for ${plan}. Please shorten it and try again.`
    );
  }

  const reservationEstimate = estimateReservedTokens({
    prompt: payload.prompt,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    history: inputContextFit.history,
    contextSummaryText: inputContextFit.contextSummary?.text,
    plan,
  });
  reservationEstimate.reservedTokens =
    reservationEstimate.inputTokens + effectiveMaxOutputTokens;

  if (reservationEstimate.inputTokens > planConfig.maxInputTokensPerRequest) {
    logAiQuotaMetric('quota_rejection', {
      uid,
      requestId,
      plan,
      rejectionReason: 'input_token_cap',
      estimatedTokens: reservationEstimate.inputTokens,
      reservedTokens: reservationEstimate.reservedTokens,
      remainingBefore: snapshot.remainingTodayTokens,
      promptTokens: inputContextFit.finalBreakdown.promptTokens,
      summaryTokens: inputContextFit.finalBreakdown.summaryTokens,
      historyTokens: inputContextFit.finalBreakdown.historyTokens,
      historyCount: inputContextFit.history.length,
      summaryLength: inputContextFit.contextSummary?.text.length ?? 0,
      trimmedHistoryCount: inputContextFit.trimmedHistoryCount,
      trimmedSummaryChars: inputContextFit.trimmedSummaryChars,
      inputTokens: reservationEstimate.inputTokens,
      inputtokkens: reservationEstimate.inputTokens,
      outputtokens: null,
      maxOutputTokens: effectiveMaxOutputTokens,
    });
    throw new HttpsError(
      'invalid-argument',
      `Your prompt is too long for ${plan}. Please shorten it and try again.`
    );
  }

  if (reservationEstimate.reservedTokens > snapshot.remainingTodayTokens) {
    logAiQuotaMetric('quota_rejection', {
      uid,
      requestId,
      plan,
      rejectionReason: 'insufficient_tokens_preflight',
      estimatedTokens: reservationEstimate.inputTokens,
      reservedTokens: reservationEstimate.reservedTokens,
      remainingBefore: snapshot.remainingTodayTokens,
    });
    throw new HttpsError(
      'resource-exhausted',
      getDailyQuotaExceededMessage(plan)
    );
  }

  const requestClaim = await acquireAiRequest(uid, requestId);
  if (requestClaim.state === 'completed') {
    logger.info('ai_request_deduplicated', {
      eventType: 'ai_request_deduplicated',
      uid,
      requestId,
      cacheKey: requestClaim.cacheKey,
      cacheState: 'completed',
      ageMs: requestClaim.ageMs,
    });
    return requestClaim.response;
  }

  if (requestClaim.state === 'permanent_failure') {
    logger.info('ai_request_deduplicated', {
      eventType: 'ai_request_deduplicated',
      uid,
      requestId,
      cacheKey: requestClaim.cacheKey,
      cacheState: 'failed',
      failureType: 'permanent',
      ageMs: requestClaim.ageMs,
    });
    throwCachedAiError(requestClaim.failure);
  }

  if (requestClaim.state === 'in_flight') {
    logger.info('ai_request_in_flight', {
      eventType: 'ai_request_in_flight',
      uid,
      requestId,
      cacheKey: requestClaim.cacheKey,
      ageMs: requestClaim.ageMs,
      lockExpiresAt: requestClaim.lockExpiresAt,
    });
    throw new HttpsError(
      'already-exists',
      'This request is already being processed. Retrying shortly.'
    );
  }

  const rateLimit = await checkAndRecordAiRateLimit(uid);
  if (!rateLimit.allowed) {
    logger.warn('ai_rate_limit_hit', {
      eventType: 'ai_rate_limit_hit',
      uid,
      requestId,
      cacheKey: requestClaim.cacheKey,
      limit: rateLimit.limit,
      windowMs: rateLimit.windowMs,
      count: rateLimit.count,
    });
    const rateLimitError = new HttpsError(
      'resource-exhausted',
      'Too many requests. Please wait a moment and try again.'
    );
    await failAiRequest(
      requestClaim.cacheKey,
      'permanent',
      getCachedErrorFromHttpsError(rateLimitError)
    ).catch(() => undefined);
    throw rateLimitError;
  }

  try {
    await reserveUsageTokens(uid, plan, reservationEstimate.reservedTokens);
  } catch (error) {
    if (error instanceof Error && error.message === 'TOKEN_QUOTA_EXCEEDED') {
      logAiQuotaMetric('quota_rejection', {
        uid,
        requestId,
        plan,
        rejectionReason: 'transaction_ceiling',
        estimatedTokens: reservationEstimate.inputTokens,
        reservedTokens: reservationEstimate.reservedTokens,
        remainingBefore: snapshot.remainingTodayTokens,
      });
      const quotaError = new HttpsError(
        'resource-exhausted',
        getDailyQuotaExceededMessage(plan)
      );
      await failAiRequest(
        requestClaim.cacheKey,
        'permanent',
        getCachedErrorFromHttpsError(quotaError)
      ).catch(() => undefined);
      throw quotaError;
    }
    await failAiRequest(requestClaim.cacheKey, 'transient').catch(() => undefined);
    throw error;
  }

  let result: Awaited<ReturnType<typeof executeHybridAiRequest>>;
  try {
    result = await executeHybridAiRequest({
      prompt: payload.prompt,
      educationLevel: payload.educationLevel,
      mode: payload.mode,
      objective: payload.objective,
      plan,
      uid,
      requestId,
      history: inputContextFit.history,
      contextSummary: inputContextFit.contextSummary,
      summaryCandidates,
      attachments: decodedAttachments.map(({ name, mimeType, sizeBytes, base64Data }) => ({
        name,
        mimeType,
        sizeBytes,
        base64Data,
      })),
      maxOutputTokens: effectiveMaxOutputTokens,
    });
  } catch (error) {
    const mappedError = mapAiErrorToHttpsError(error);
    if (isTransientProviderError(error)) {
      await releaseReservedUsageTokens(uid, reservationEstimate.reservedTokens).catch(() => undefined);
      await failAiRequest(requestClaim.cacheKey, 'transient').catch(() => undefined);
    } else if (isPermanentProviderError(error)) {
      await failAiRequest(
        requestClaim.cacheKey,
        'permanent',
        getCachedErrorFromHttpsError(mappedError)
      ).catch(() => undefined);
    } else {
      await releaseReservedUsageTokens(uid, reservationEstimate.reservedTokens).catch(() => undefined);
      await failAiRequest(requestClaim.cacheKey, 'transient').catch(() => undefined);
    }
    const errorDetails = getErrorDetails(error);
    logger.error('ai_model_request_failed', {
      eventType: 'ai_model_request_failed',
      uid,
      requestId,
      plan,
      mode: payload.mode,
      objective: payload.objective,
      educationLevel: payload.educationLevel,
      promptLength: payload.prompt.length,
      historyMessageCount: payload.history.length,
      sentHistoryMessageCount: inputContextFit.history.length,
      summaryCandidateCount: summaryCandidates.length,
      hasContextSummary: Boolean(inputContextFit.contextSummary?.text),
      originalContextSummaryLength: payload.contextSummary?.text.length ?? 0,
      sentContextSummaryLength: inputContextFit.contextSummary?.text.length ?? 0,
      trimmedHistoryCount: inputContextFit.trimmedHistoryCount,
      trimmedSummaryChars: inputContextFit.trimmedSummaryChars,
      promptTokens: inputContextFit.finalBreakdown.promptTokens,
      summaryTokens: inputContextFit.finalBreakdown.summaryTokens,
      historyTokens: inputContextFit.finalBreakdown.historyTokens,
      attachmentCount: payload.attachments.length,
      attachmentSummary: payload.attachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
      inlinePayloadBytes,
      estimatedInputTokens: reservationEstimate.inputTokens,
      reservedTokens: reservationEstimate.reservedTokens,
      remainingBefore: snapshot.remainingTodayTokens,
      provider: errorDetails.provider,
      modelId: errorDetails.modelId,
      modelUsed: errorDetails.modelUsed,
      attemptNumber: errorDetails.attemptNumber,
      retryEligible: errorDetails.retryEligible,
      providerStatus: errorDetails.status,
      providerCode: errorDetails.code,
      errorMessage: errorDetails.message,
      errorDetails: errorDetails.details,
      stack: errorDetails.stack,
    });
    logAiQuotaEvent({
      uid,
      requestId,
      plan,
      estimatedTokens: reservationEstimate.inputTokens,
      reservedTokens: reservationEstimate.reservedTokens,
      actualTokens: null,
      usageSource: null,
      remainingBefore: snapshot.remainingTodayTokens,
      remainingAfter: snapshot.remainingTodayTokens,
      status: 'model_error',
    });
    throw mappedError;
  }

  let assistantTimestamp: number;
  try {
    assistantTimestamp = await persistAssistantReply({
      uid,
      threadId: payload.threadId,
      assistantMessageId: payload.assistantMessageId,
      mode: payload.mode,
      answer: result.text,
      contextSummary: result.contextSummary ?? null,
    });
  } catch (error) {
    await releaseReservedUsageTokens(uid, reservationEstimate.reservedTokens).catch(() => undefined);
    await failAiRequest(requestClaim.cacheKey, 'transient').catch(() => undefined);
    logger.error('ai_assistant_persist_failed', {
      eventType: 'ai_assistant_persist_failed',
      uid,
      threadId: payload.threadId,
      requestId,
      assistantMessageId: payload.assistantMessageId,
      mode: payload.mode,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new HttpsError('internal', 'Pluto could not save this answer. Please try again.');
  }

  let reconciledUsage: Awaited<ReturnType<typeof reconcileUsageTokens>>;
  try {
    reconciledUsage = await reconcileUsageTokens(uid, plan, reservationEstimate.reservedTokens, result.usage, {
      countsTowardPremiumModeLimit: plan === 'Free' && isPremiumMode,
    });
  } catch {
    await releaseReservedUsageTokens(uid, reservationEstimate.reservedTokens).catch(() => undefined);
    const response = {
      answer: result.text,
      modelUsed: result.modelUsed,
      provider: result.finalProvider,
      assistantMessageId: payload.assistantMessageId,
      assistantTimestamp,
      contextSummary: result.contextSummary ?? null,
      usagePendingSync: true,
      subscription: snapshot.subscription,
      usageTodayTokens: snapshot.usageTodayTokens,
      dailyTokenLimit: snapshot.dailyTokenLimit,
      remainingTodayTokens: snapshot.remainingTodayTokens,
      estimatedMessagesLeft: snapshot.estimatedMessagesLeft,
      premiumModeCount: snapshot.premiumModeCount,
      freePremiumModesRemainingToday: snapshot.freePremiumModesRemainingToday,
      planConfig,
    };
    await completeAiRequest(requestClaim.cacheKey, response).catch((error) =>
      logAiRequestCacheCompleteFailure({
        uid,
        requestId,
        cacheKey: requestClaim.cacheKey,
        error,
      })
    );
    return response;
  }

  logAiQuotaEvent({
    uid,
    requestId,
    plan,
    estimatedTokens: reservationEstimate.inputTokens,
    reservedTokens: reservationEstimate.reservedTokens,
    actualTokens: result.usage.totalTokens,
    usageSource: result.usage.usageSource,
    remainingBefore: snapshot.remainingTodayTokens,
    remainingAfter: reconciledUsage.remainingTodayTokens,
    status: 'success',
  });

  if (
    decodedAttachments.some((attachment) => attachment.mimeType === 'application/pdf') &&
    result.usage.usageSource === 'provider' &&
    result.usage.inputTokens > 8000
  ) {
    logger.warn('high_pdf_token_cost', {
      eventType: 'high_pdf_token_cost',
      uid,
      requestId,
      plan,
      provider: result.finalProvider,
      modelId: result.modelId,
      modelUsed: result.modelUsed,
      providerInputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      attachmentCount: decodedAttachments.length,
      pdfAttachmentCount: decodedAttachments.filter((attachment) => attachment.mimeType === 'application/pdf').length,
      largestPdfBytes: decodedAttachments
        .filter((attachment) => attachment.mimeType === 'application/pdf')
        .reduce((max, attachment) => Math.max(max, attachment.sizeBytes), 0),
    });
  }

  logAiQuotaMetric('reserved_actual_delta', {
    uid,
    requestId,
    plan,
    reservedTokens: reservationEstimate.reservedTokens,
    actualTokens: result.usage.totalTokens,
    deltaTokens: reservationEstimate.reservedTokens - result.usage.totalTokens,
  });
  logAiQuotaMetric('token_consumption_by_plan', {
    uid,
    requestId,
    plan,
    actualTokens: result.usage.totalTokens,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });
  if (result.usage.usageSource === 'estimated') {
    logAiQuotaMetric('fallback_estimation_used', {
      uid,
      requestId,
      plan,
      actualTokens: result.usage.totalTokens,
    });
  }
  if (result.usageAnomaly) {
    logAiQuotaMetric('token_anomaly', {
      uid,
      requestId,
      plan,
      anomalyReason: result.usageAnomaly,
      estimatedTokens: reservationEstimate.inputTokens,
      reservedTokens: reservationEstimate.reservedTokens,
      actualTokens: result.usage.totalTokens,
    });
  }
  const response = {
    answer: result.text,
    modelUsed: result.modelUsed,
    provider: result.finalProvider,
    assistantMessageId: payload.assistantMessageId,
    assistantTimestamp,
    contextSummary: result.contextSummary ?? null,
    usagePendingSync: false,
    subscription: snapshot.subscription,
    usageTodayTokens: reconciledUsage.usageTodayTokens,
    dailyTokenLimit: reconciledUsage.dailyTokenLimit,
    remainingTodayTokens: reconciledUsage.remainingTodayTokens,
    estimatedMessagesLeft: reconciledUsage.estimatedMessagesLeft,
    premiumModeCount: reconciledUsage.premiumModeCount,
    freePremiumModesRemainingToday: reconciledUsage.freePremiumModesRemainingToday,
    planConfig: PLAN_DEFINITIONS[snapshot.subscription.plan],
    usage: result.usage,
  };
  await completeAiRequest(requestClaim.cacheKey, response).catch((error) =>
    logAiRequestCacheCompleteFailure({
      uid,
      requestId,
      cacheKey: requestClaim.cacheKey,
      error,
    })
  );
  return response;
};
