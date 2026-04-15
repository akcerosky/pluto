import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FREE_PREMIUM_MODE_DAILY_LIMIT, PLAN_DEFINITIONS } from '../config/plans.js';
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

const aiChatSchema = z.object({
  prompt: z.string().trim().min(1).max(6000),
  mode: z.enum(['Conversational', 'Homework', 'ExamPrep']),
  educationLevel: z.string().trim().min(1).max(80),
  objective: z.string().trim().min(1).max(200),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(6000),
      })
    )
    .max(80),
  requestId: z.string().trim().min(8).max(200),
});

const clampHistoryForValidation = (
  history: Array<{ role: 'user' | 'assistant'; content: string }>
) =>
  history.map((message) => ({
    role: message.role,
    content: message.content.trim().slice(0, 6000),
  }));

export const aiChatHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const rawPayload = (request.data ?? {}) as Record<string, unknown>;
  const payload = aiChatSchema.parse({
    ...rawPayload,
    history: Array.isArray(rawPayload.history)
      ? clampHistoryForValidation(
          rawPayload.history.filter(
            (message): message is { role: 'user' | 'assistant'; content: string } =>
              typeof message === 'object' &&
              message !== null &&
              ((message as { role?: unknown }).role === 'user' ||
                (message as { role?: unknown }).role === 'assistant') &&
              typeof (message as { content?: unknown }).content === 'string'
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
