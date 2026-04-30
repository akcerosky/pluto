import { logger } from 'firebase-functions';
import { env, requireEnv } from '../../../config/env.js';
import { buildEstimatedUsage, normalizeTokenUsage } from '../../tokenUsage.js';
import { buildContextSnapshotMessage, buildFallbackSummary, buildSummaryPrompt, buildSystemInstruction, buildTurnSpecificInstruction, clampSummaryText, getHistoryText, startsWithLeakedMemoryPrefix, stripLeadingLeakedMemoryBlock, } from '../prompting.js';
const DEFAULT_NOVA_MODEL_ID = 'amazon.nova-micro-v1:0';
const sanitizeResponse = (text) => {
    const cleaned = (text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return cleaned || '';
};
const normalizeForSimilarity = (text) => text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
const buildCharacterBigrams = (text) => {
    const normalized = normalizeForSimilarity(text);
    if (normalized.length < 2) {
        return new Set(normalized ? [normalized] : []);
    }
    const bigrams = new Set();
    for (let index = 0; index < normalized.length - 1; index += 1) {
        bigrams.add(normalized.slice(index, index + 2));
    }
    return bigrams;
};
const getSimilarityScore = (left, right) => {
    const leftBigrams = buildCharacterBigrams(left);
    const rightBigrams = buildCharacterBigrams(right);
    if (leftBigrams.size === 0 || rightBigrams.size === 0) {
        return 0;
    }
    let overlap = 0;
    for (const bigram of leftBigrams) {
        if (rightBigrams.has(bigram)) {
            overlap += 1;
        }
    }
    return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
};
const getLatestAssistantText = (history) => [...history]
    .reverse()
    .filter((message) => message.role === 'assistant')
    .map((message) => getMessageText(message))
    .find((text) => text.trim().length > 0) ?? '';
const getProviderErrorDetails = (error) => {
    if (!(typeof error === 'object' && error !== null)) {
        return {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            status: null,
            code: null,
            details: undefined,
        };
    }
    const record = error;
    return {
        message: typeof record.message === 'string'
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
const getNovaApiKey = () => env.bedrockApiKey ||
    process.env.AWS_BEARER_TOKEN_BEDROCK ||
    process.env.AMAZON_BEDROCK_API_KEY ||
    requireEnv('bedrockApiKey');
const getNovaModelId = () => env.bedrockNovaModelId || DEFAULT_NOVA_MODEL_ID;
const getNovaEndpoint = (modelId) => `https://bedrock-runtime.${env.bedrockRegion}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
const getMessageText = (message) => {
    const text = getHistoryText(message);
    const attachmentLines = message.parts
        .filter((part) => part.type === 'image' || part.type === 'file')
        .map((part) => `[Attachment: ${part.name}, ${part.mimeType}, ${part.sizeBytes} bytes]`);
    return [text, ...attachmentLines].filter(Boolean).join('\n\n').trim();
};
const normalizeHistory = (history) => {
    const sanitized = history
        .map((message) => ({
        role: message.role,
        content: getMessageText(message),
    }))
        .filter((message) => message.content.length > 0);
    while (sanitized.length > 0 && sanitized[0]?.role !== 'user') {
        sanitized.shift();
    }
    return sanitized.reduce((acc, message) => {
        const previous = acc.at(-1);
        if (!previous || previous.role !== message.role) {
            acc.push(message);
            return acc;
        }
        previous.content = `${previous.content}\n\n${message.content}`;
        return acc;
    }, []);
};
const buildNovaMessages = (request) => {
    const history = normalizeHistory(request.history).map((message) => ({
        role: message.role,
        content: [{ text: message.content }],
    }));
    const prompt = request.prompt.trim();
    return [
        ...history,
        {
            role: 'user',
            content: [{ text: prompt || 'Continue helping the student.' }],
        },
    ];
};
const buildNovaSystemMessages = ({ systemInstruction, contextSummary, }) => {
    const messages = [{ text: systemInstruction }];
    if (contextSummary?.text.trim()) {
        messages.push({
            text: buildContextSnapshotMessage(contextSummary),
        });
    }
    return messages;
};
const extractConverseText = (response) => {
    if (!(typeof response === 'object' && response !== null)) {
        return '';
    }
    const output = response.output;
    const parts = output?.message?.content ?? [];
    return parts
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
};
const extractUsage = (response) => {
    if (!(typeof response === 'object' && response !== null)) {
        return null;
    }
    const usage = response.usage;
    return usage &&
        typeof usage.inputTokens === 'number' &&
        typeof usage.outputTokens === 'number' &&
        typeof usage.totalTokens === 'number'
        ? {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            usageSource: 'provider',
        }
        : null;
};
const validateNovaText = (text) => {
    if (!text.trim()) {
        const error = new Error('Nova returned an empty response.');
        error.code = 'INVALID_RESPONSE';
        throw error;
    }
    if (startsWithLeakedMemoryPrefix(text)) {
        const error = new Error('Nova leaked internal memory context.');
        error.code = 'INVALID_RESPONSE';
        throw error;
    }
};
const callNovaConverse = async ({ request, systemInstruction, contextSummary, maxOutputTokens, }) => {
    const modelId = getNovaModelId();
    const response = await fetch(getNovaEndpoint(modelId), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getNovaApiKey().trim()}`,
        },
        body: JSON.stringify({
            system: buildNovaSystemMessages({ systemInstruction, contextSummary }),
            messages: buildNovaMessages(request),
            inferenceConfig: {
                maxTokens: maxOutputTokens,
            },
        }),
    });
    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    }
    catch {
        payload = null;
    }
    if (!response.ok) {
        const error = new Error(typeof payload?.message === 'string'
            ? payload.message
            : `Nova request failed with status ${response.status}.`);
        Object.assign(error, {
            status: response.status,
            code: typeof payload?.__type === 'string' ? payload.__type : null,
            details: payload,
        });
        throw error;
    }
    return {
        modelId,
        payload,
    };
};
const refreshContextSummary = async (request, systemInstruction) => {
    if (request.summaryCandidates.length === 0) {
        return request.contextSummary;
    }
    const fallbackText = buildFallbackSummary(request.summaryCandidates);
    const fallbackSummary = {
        version: 1,
        text: clampSummaryText([request.contextSummary?.text, fallbackText].filter(Boolean).join('\n')),
        summarizedMessageCount: (request.contextSummary?.summarizedMessageCount ?? 0) + request.summaryCandidates.length,
        summarizedExchangeCount: (request.contextSummary?.summarizedExchangeCount ?? 0) + Math.ceil(request.summaryCandidates.length / 2),
        blockSize: 10,
        updatedAt: Date.now(),
    };
    try {
        const { payload } = await callNovaConverse({
            request: {
                ...request,
                prompt: buildSummaryPrompt({
                    existingSummary: request.contextSummary,
                    summaryCandidates: request.summaryCandidates,
                    educationLevel: request.educationLevel,
                    mode: request.mode,
                    objective: request.objective,
                }),
                history: [],
                contextSummary: undefined,
                summaryCandidates: [],
                attachments: [],
                maxOutputTokens: 700,
            },
            systemInstruction,
            contextSummary: undefined,
            maxOutputTokens: 700,
        });
        const text = clampSummaryText(sanitizeResponse(extractConverseText(payload)));
        return text ? { ...fallbackSummary, text } : fallbackSummary;
    }
    catch (error) {
        const details = getProviderErrorDetails(error);
        logger.warn('nova_summary_generation_failed', {
            eventType: 'nova_summary_generation_failed',
            requestId: request.requestId ?? null,
            providerStatus: details.status,
            providerCode: details.code,
            errorMessage: details.message,
        });
        return fallbackSummary;
    }
};
export const isRetryableNovaError = (error) => {
    const details = getProviderErrorDetails(error);
    const code = String(details.code ?? '').toUpperCase();
    return details.status === 500 || (details.status !== null && details.status >= 500) || code === 'INVALID_RESPONSE';
};
export const generateNovaMicroResponse = async (request) => {
    const startedAt = Date.now();
    const systemInstruction = buildSystemInstruction(request.educationLevel, request.mode, request.objective, request.plan);
    const turnSpecificInstruction = buildTurnSpecificInstruction({
        mode: request.mode,
        prompt: request.prompt,
        history: request.history,
    });
    const contextSummary = await refreshContextSummary(request, systemInstruction);
    const providerRequest = { ...request, contextSummary, summaryCandidates: [] };
    let response = await callNovaConverse({
        request: providerRequest,
        systemInstruction: [systemInstruction, turnSpecificInstruction].filter(Boolean).join('\n\n'),
        contextSummary,
        maxOutputTokens: request.maxOutputTokens,
    });
    let text = sanitizeResponse(extractConverseText(response.payload));
    if (startsWithLeakedMemoryPrefix(text)) {
        logger.warn('nova_memory_leak_detected', {
            eventType: 'nova_memory_leak_detected',
            requestId: request.requestId ?? null,
            modelId: response.modelId,
        });
        response = await callNovaConverse({
            request: providerRequest,
            systemInstruction: [systemInstruction, turnSpecificInstruction].filter(Boolean).join('\n\n'),
            contextSummary,
            maxOutputTokens: request.maxOutputTokens,
        });
        const retriedText = sanitizeResponse(extractConverseText(response.payload));
        if (startsWithLeakedMemoryPrefix(retriedText)) {
            validateNovaText(retriedText);
        }
        text = sanitizeResponse(stripLeadingLeakedMemoryBlock(retriedText));
    }
    const previousAssistantText = getLatestAssistantText(request.history);
    if (previousAssistantText && getSimilarityScore(text, previousAssistantText) > 0.9) {
        response = await callNovaConverse({
            request: providerRequest,
            systemInstruction: [
                systemInstruction,
                turnSpecificInstruction,
                'Your previous response was identical to your last answer. The student needs a DIFFERENT response. Give more scaffolding, ask a smaller question, or use a different explanation, but do not give the complete solution in Homework mode.',
            ]
                .filter(Boolean)
                .join('\n\n'),
            contextSummary,
            maxOutputTokens: request.maxOutputTokens,
        });
        text = sanitizeResponse(extractConverseText(response.payload));
    }
    validateNovaText(text);
    const estimatedUsage = buildEstimatedUsage({
        prompt: request.prompt,
        educationLevel: request.educationLevel,
        mode: request.mode,
        objective: request.objective,
        history: request.history,
        contextSummaryText: contextSummary?.text,
        answer: text,
    });
    const normalizedUsage = normalizeTokenUsage({
        providerUsage: extractUsage(response.payload),
        estimatedUsage,
        estimatedInputTokens: estimatedUsage.inputTokens,
        maxOutputTokens: request.maxOutputTokens,
    });
    return {
        text,
        contextSummary,
        usage: normalizedUsage.usage,
        usageAnomaly: normalizedUsage.anomalyReason,
        provider: 'nova-micro',
        modelId: response.modelId,
        modelUsed: 'nova-micro',
        latencyMs: Date.now() - startedAt,
    };
};
export const novaMicroProvider = {
    provider: 'nova-micro',
    configuredModelId: getNovaModelId(),
    configuredModelUsed: 'nova-micro',
    execute: generateNovaMicroResponse,
};
