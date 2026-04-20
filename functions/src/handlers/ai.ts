import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  FREE_PREMIUM_MODE_DAILY_LIMIT,
  PLAN_DEFINITIONS,
  INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES,
} from '../config/plans.js';
import { assertAuth, getBootstrapIdentity, getRequestId } from '../lib/http.js';
import { logAiQuotaEvent, logAiQuotaMetric } from '../lib/observability.js';
import { getCachedValue, setCachedValue } from '../services/cache.js';
import {
  getMeSnapshot,
  reconcileUsageTokens,
  releaseReservedUsageTokens,
  reserveUsageTokens,
} from '../services/firestoreRepo.js';
import { generatePlutoResponse } from '../services/gemini.js';
import { estimateReservedTokens } from '../services/tokenUsage.js';
import type { AiHistoryMessage, AiInlineAttachment, AiMessagePart } from '../types/index.js';

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
  attachments: z.array(attachmentSchema).max(8),
  requestId: z.string().trim().min(8).max(200),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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
  const cacheKey = `${uid}:${requestId}`;
  const cached = getCachedValue<unknown>(cacheKey);
  if (cached) {
    logAiQuotaEvent({
      uid,
      requestId,
      source: 'cache',
    });
    return cached;
  }

  const bootstrapIdentity = getBootstrapIdentity(request);
  const snapshot = await getMeSnapshot(uid, bootstrapIdentity);
  const plan = snapshot.subscription.plan;
  const planConfig = PLAN_DEFINITIONS[plan];
  const isPremiumMode = payload.mode === 'Homework' || payload.mode === 'ExamPrep';

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

  const reservationEstimate = estimateReservedTokens({
    prompt: payload.prompt,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    history: payload.history.slice(-planConfig.allowedModes.length * 20),
    plan,
  });

  if (reservationEstimate.inputTokens > planConfig.maxInputTokensPerRequest) {
    logAiQuotaMetric('quota_rejection', {
      uid,
      requestId,
      plan,
      rejectionReason: 'input_token_cap',
      estimatedTokens: reservationEstimate.inputTokens,
      reservedTokens: reservationEstimate.reservedTokens,
      remainingBefore: snapshot.remainingTodayTokens,
    });
    throw new HttpsError(
      'invalid-argument',
      `This request is too large for ${plan}. Reduce the prompt or history and try again.`
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
      'You do not have enough tokens remaining for this request today.'
    );
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
      throw new HttpsError(
        'resource-exhausted',
        'You do not have enough tokens remaining for this request today.'
      );
    }
    throw error;
  }

  let result: Awaited<ReturnType<typeof generatePlutoResponse>>;
  try {
    result = await generatePlutoResponse({
      prompt: payload.prompt,
      educationLevel: payload.educationLevel,
      mode: payload.mode,
      objective: payload.objective,
      plan,
      history: payload.history.slice(-planConfig.allowedModes.length * 20),
      attachments: decodedAttachments.map(({ data: _data, ...attachment }) => attachment),
      maxOutputTokens: planConfig.maxOutputTokensPerRequest,
    });
  } catch (error) {
    await releaseReservedUsageTokens(uid, reservationEstimate.reservedTokens).catch(() => undefined);
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
    throw mapAiErrorToHttpsError(error);
  }

  try {
    await reconcileUsageTokens(uid, plan, reservationEstimate.reservedTokens, result.usage, {
      countsTowardPremiumModeLimit: plan === 'Free' && isPremiumMode,
    });
  } catch {
    await releaseReservedUsageTokens(uid, reservationEstimate.reservedTokens).catch(() => undefined);
    const response = {
      answer: result.text,
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
    setCachedValue(cacheKey, response, 5 * 60 * 1000);
    return response;
  }

  const updatedSnapshot = await getMeSnapshot(uid, bootstrapIdentity);
  logAiQuotaEvent({
    uid,
    requestId,
    plan,
    estimatedTokens: reservationEstimate.inputTokens,
    reservedTokens: reservationEstimate.reservedTokens,
    actualTokens: result.usage.totalTokens,
    usageSource: result.usage.usageSource,
    remainingBefore: snapshot.remainingTodayTokens,
    remainingAfter: updatedSnapshot.remainingTodayTokens,
    status: 'success',
  });
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
    usagePendingSync: false,
    subscription: updatedSnapshot.subscription,
    usageTodayTokens: updatedSnapshot.usageTodayTokens,
    dailyTokenLimit: updatedSnapshot.dailyTokenLimit,
    remainingTodayTokens: updatedSnapshot.remainingTodayTokens,
    estimatedMessagesLeft: updatedSnapshot.estimatedMessagesLeft,
    premiumModeCount: updatedSnapshot.premiumModeCount,
    freePremiumModesRemainingToday: updatedSnapshot.freePremiumModesRemainingToday,
    planConfig: PLAN_DEFINITIONS[updatedSnapshot.subscription.plan],
    usage: result.usage,
  };
  setCachedValue(cacheKey, response, 5 * 60 * 1000);
  return response;
};
