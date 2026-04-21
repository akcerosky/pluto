import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { FREE_PREMIUM_MODE_DAILY_LIMIT, PLAN_DEFINITIONS, INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES, } from '../config/plans.js';
import { assertAuth, getBootstrapIdentity, getRequestId } from '../lib/http.js';
import { logAiQuotaEvent, logAiQuotaMetric } from '../lib/observability.js';
import { getCachedValue, setCachedValue } from '../services/cache.js';
import { getMeSnapshot, reconcileUsageTokens, releaseReservedUsageTokens, reserveUsageTokens, } from '../services/firestoreRepo.js';
import { generatePlutoResponse } from '../services/gemini.js';
import { estimateReservedTokens } from '../services/tokenUsage.js';
const SHARED_HISTORY_WINDOW = 16;
const SUMMARY_CANDIDATE_MESSAGE_LIMIT = 20;
const SUMMARY_MIN_CANDIDATE_MESSAGES = 10;
const mapAiErrorToHttpsError = (error) => {
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : null;
    const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
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
    return new HttpsError('internal', message || 'Pluto hit an unexpected AI error. Please try again.');
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
        .array(z.object({
        role: z.enum(['user', 'assistant']),
        parts: z.array(z.union([textPartSchema, attachmentPartSchema])).max(16),
    }))
        .max(80),
    contextSummary: contextSummarySchema.optional(),
    summaryCandidates: z
        .array(z.object({
        role: z.enum(['user', 'assistant']),
        parts: z.array(z.union([textPartSchema, attachmentPartSchema])).max(16),
    }))
        .max(SUMMARY_CANDIDATE_MESSAGE_LIMIT)
        .optional(),
    attachments: z.array(attachmentSchema).max(8),
    requestId: z.string().trim().min(8).max(200),
});
const isRecord = (value) => typeof value === 'object' && value !== null;
const getErrorDetails = (error) => {
    if (!isRecord(error)) {
        return {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            status: null,
            code: null,
            details: undefined,
        };
    }
    return {
        message: typeof error.message === 'string'
            ? error.message
            : error instanceof Error
                ? error.message
                : 'Unknown error',
        stack: typeof error.stack === 'string' ? error.stack : error instanceof Error ? error.stack : undefined,
        status: typeof error.status === 'number' ? error.status : null,
        code: typeof error.code === 'string' ? error.code : null,
        details: 'details' in error ? error.details : undefined,
    };
};
const normalizeHistoryParts = (parts) => Array.isArray(parts)
    ? parts.flatMap((part) => {
        if (!isRecord(part) || typeof part.type !== 'string') {
            return [];
        }
        if (part.type === 'text' && typeof part.text === 'string') {
            const text = part.text.trim().slice(0, 6000);
            return text ? [{ type: 'text', text }] : [];
        }
        if ((part.type === 'image' || part.type === 'file') &&
            typeof part.name === 'string' &&
            typeof part.mimeType === 'string') {
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
const clampHistoryForValidation = (history) => history.map((message) => ({
    role: message.role,
    parts: normalizeHistoryParts(message.parts),
}));
const clampAttachmentsForValidation = (attachments) => attachments.map((attachment) => ({
    name: attachment.name.trim().slice(0, 260),
    mimeType: attachment.mimeType.trim().slice(0, 120),
    sizeBytes: Math.max(0, Math.floor(attachment.sizeBytes)),
    base64Data: attachment.base64Data.trim(),
}));
const clampContextSummaryForValidation = (summary) => {
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
const getInlinePayloadBytes = (prompt, attachments) => Buffer.byteLength(JSON.stringify({
    prompt,
    attachments: attachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        base64Data: attachment.base64Data,
    })),
}), 'utf8');
const isMimeAllowed = (allowedKinds, mimeType) => (allowedKinds.includes('image') && mimeType.startsWith('image/')) ||
    (allowedKinds.includes('pdf') && mimeType === 'application/pdf');
const decodeAttachment = (attachment) => {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(attachment.base64Data)) {
        throw new HttpsError('invalid-argument', `Attachment "${attachment.name}" is not valid base64.`);
    }
    const buffer = Buffer.from(attachment.base64Data, 'base64');
    if (!buffer.length) {
        throw new HttpsError('invalid-argument', `Attachment "${attachment.name}" is empty.`);
    }
    if (buffer.byteLength !== attachment.sizeBytes) {
        throw new HttpsError('invalid-argument', `Attachment "${attachment.name}" size metadata does not match the uploaded content.`);
    }
    return buffer;
};
export const aiChatHandler = async (request) => {
    const uid = assertAuth(request);
    const rawPayload = (request.data ?? {});
    const payload = aiChatSchema.parse({
        ...rawPayload,
        history: Array.isArray(rawPayload.history)
            ? clampHistoryForValidation(rawPayload.history.filter((message) => isRecord(message) &&
                (message.role === 'user' || message.role === 'assistant') &&
                Array.isArray(message.parts)))
            : [],
        contextSummary: clampContextSummaryForValidation(rawPayload.contextSummary),
        summaryCandidates: Array.isArray(rawPayload.summaryCandidates)
            ? clampHistoryForValidation(rawPayload.summaryCandidates.filter((message) => isRecord(message) &&
                (message.role === 'user' || message.role === 'assistant') &&
                Array.isArray(message.parts)))
            : [],
        attachments: Array.isArray(rawPayload.attachments)
            ? clampAttachmentsForValidation(rawPayload.attachments.filter((attachment) => isRecord(attachment) &&
                typeof attachment.name === 'string' &&
                typeof attachment.mimeType === 'string' &&
                typeof attachment.sizeBytes === 'number' &&
                typeof attachment.base64Data === 'string'))
            : [],
    });
    const requestId = getRequestId(payload);
    const cacheKey = `${uid}:${requestId}`;
    const cached = getCachedValue(cacheKey);
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
    const history = payload.history.slice(-SHARED_HISTORY_WINDOW);
    const summaryCandidates = (payload.summaryCandidates ?? []).length >= SUMMARY_MIN_CANDIDATE_MESSAGES
        ? (payload.summaryCandidates ?? []).slice(0, SUMMARY_CANDIDATE_MESSAGE_LIMIT)
        : [];
    if (!payload.prompt.trim() && payload.attachments.length === 0) {
        throw new HttpsError('invalid-argument', 'Write a message or attach a file before sending.');
    }
    if (!planConfig.allowedModes.includes(payload.mode) &&
        !(plan === 'Free' && isPremiumMode && (snapshot.freePremiumModesRemainingToday ?? 0) > 0)) {
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
        throw new HttpsError('permission-denied', 'Upgrade required. Free plan includes 3 Homework / Exam Prep uses per day.');
    }
    if (payload.prompt.length > planConfig.maxInputChars) {
        throw new HttpsError('invalid-argument', `This prompt exceeds the ${plan} limit of ${planConfig.maxInputChars} characters.`);
    }
    if (!planConfig.attachmentsEnabled && payload.attachments.length > 0) {
        throw new HttpsError('permission-denied', `${plan} does not include attachment support. Upgrade to continue.`);
    }
    const inlinePayloadBytes = getInlinePayloadBytes(payload.prompt, payload.attachments);
    if (inlinePayloadBytes > INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES) {
        throw new HttpsError('invalid-argument', 'Attachments are too large to send inline. Reduce the number or size of files so the total request stays under 8 MB.');
    }
    const decodedAttachments = payload.attachments.map((attachment) => {
        if (!isMimeAllowed(planConfig.allowedAttachmentKinds, attachment.mimeType)) {
            throw new HttpsError('permission-denied', `Attachment type "${attachment.mimeType}" is not available on ${plan}.`);
        }
        if (attachment.sizeBytes > planConfig.maxAttachmentBytes) {
            throw new HttpsError('invalid-argument', `Attachment "${attachment.name}" exceeds the ${plan} per-file limit.`);
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
        history,
        contextSummaryText: payload.contextSummary?.text,
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
        throw new HttpsError('invalid-argument', `This request is too large for ${plan}. Reduce the prompt or history and try again.`);
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
        throw new HttpsError('resource-exhausted', 'You do not have enough tokens remaining for this request today.');
    }
    try {
        await reserveUsageTokens(uid, plan, reservationEstimate.reservedTokens);
    }
    catch (error) {
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
            throw new HttpsError('resource-exhausted', 'You do not have enough tokens remaining for this request today.');
        }
        throw error;
    }
    let result;
    try {
        result = await generatePlutoResponse({
            prompt: payload.prompt,
            educationLevel: payload.educationLevel,
            mode: payload.mode,
            objective: payload.objective,
            plan,
            requestId,
            history,
            contextSummary: payload.contextSummary,
            summaryCandidates,
            attachments: decodedAttachments.map(({ name, mimeType, sizeBytes, base64Data }) => ({
                name,
                mimeType,
                sizeBytes,
                base64Data,
            })),
            maxOutputTokens: planConfig.maxOutputTokensPerRequest,
        });
    }
    catch (error) {
        await releaseReservedUsageTokens(uid, reservationEstimate.reservedTokens).catch(() => undefined);
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
            summaryCandidateCount: summaryCandidates.length,
            hasContextSummary: Boolean(payload.contextSummary?.text),
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
        throw mapAiErrorToHttpsError(error);
    }
    let reconciledUsage;
    try {
        reconciledUsage = await reconcileUsageTokens(uid, plan, reservationEstimate.reservedTokens, result.usage, {
            countsTowardPremiumModeLimit: plan === 'Free' && isPremiumMode,
        });
    }
    catch {
        await releaseReservedUsageTokens(uid, reservationEstimate.reservedTokens).catch(() => undefined);
        const response = {
            answer: result.text,
            contextSummary: result.contextSummary,
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
        contextSummary: result.contextSummary,
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
    setCachedValue(cacheKey, response, 5 * 60 * 1000);
    return response;
};
