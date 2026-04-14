import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { PLAN_DEFINITIONS } from '../config/plans.js';
import { assertAuth, getBootstrapIdentity, getRequestId } from '../lib/http.js';
import { getCachedValue, setCachedValue } from '../services/cache.js';
import { getMeSnapshot, incrementUsage } from '../services/firestoreRepo.js';
import { generatePlutoResponse } from '../services/gemini.js';

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
    return cached;
  }

  const bootstrapIdentity = getBootstrapIdentity(request);
  const snapshot = await getMeSnapshot(uid, bootstrapIdentity);
  const plan = snapshot.subscription.plan;
  const planConfig = PLAN_DEFINITIONS[plan];

  if (!planConfig.allowedModes.includes(payload.mode)) {
    throw new HttpsError('permission-denied', `${payload.mode} mode requires a higher plan.`);
  }

  if (payload.prompt.length > planConfig.maxInputChars) {
    throw new HttpsError(
      'invalid-argument',
      `This prompt exceeds the ${plan} limit of ${planConfig.maxInputChars} characters.`
    );
  }

  if (snapshot.dailyLimit !== null && snapshot.remainingToday !== null && snapshot.remainingToday <= 0) {
    throw new HttpsError('resource-exhausted', `You reached the ${plan} daily limit for today.`);
  }

  let answer: string;
  try {
    answer = await generatePlutoResponse({
      prompt: payload.prompt,
      educationLevel: payload.educationLevel,
      mode: payload.mode,
      objective: payload.objective,
      plan,
      history: payload.history.slice(-planConfig.allowedModes.length * 20),
    });
  } catch (error) {
    throw mapAiErrorToHttpsError(error);
  }

  try {
    await incrementUsage(uid, plan);
  } catch {
    const response = {
      answer,
      usagePendingSync: true,
      subscription: snapshot.subscription,
      usageToday: snapshot.usageToday,
      dailyLimit: snapshot.dailyLimit,
      remainingToday: snapshot.remainingToday,
      planConfig,
    };
    setCachedValue(cacheKey, response, 5 * 60 * 1000);
    return response;
  }

  const updatedSnapshot = await getMeSnapshot(uid, bootstrapIdentity);
  const response = {
    answer,
    usagePendingSync: false,
    subscription: updatedSnapshot.subscription,
    usageToday: updatedSnapshot.usageToday,
    dailyLimit: updatedSnapshot.dailyLimit,
    remainingToday: updatedSnapshot.remainingToday,
    planConfig: PLAN_DEFINITIONS[updatedSnapshot.subscription.plan],
  };
  setCachedValue(cacheKey, response, 5 * 60 * 1000);
  return response;
};
