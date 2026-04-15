import { PLAN_DEFINITIONS } from '../config/plans.js';
const CHARS_PER_TOKEN = 4;
const SYSTEM_INSTRUCTION_OVERHEAD_TOKENS = 180;
const MESSAGE_OVERHEAD_TOKENS = 12;
export const ABSOLUTE_MAX_DAILY_TOKEN_CEILING = 1_000_000;
const PROVIDER_TOKEN_SANITY_MULTIPLIER = 2;
const estimateTextTokens = (value) => Math.max(1, Math.ceil(value.trim().length / CHARS_PER_TOKEN));
export const estimateHistoryTokens = (history) => history.reduce((sum, message) => sum + estimateTextTokens(message.content) + MESSAGE_OVERHEAD_TOKENS, 0);
export const estimateAiInputTokens = (payload) => {
    const systemContext = payload.educationLevel.trim().length +
        payload.mode.trim().length +
        payload.objective.trim().length;
    return (estimateTextTokens(payload.prompt) +
        estimateHistoryTokens(payload.history) +
        estimateTextTokens(String(systemContext)) +
        SYSTEM_INSTRUCTION_OVERHEAD_TOKENS);
};
export const estimateReservedTokens = (payload) => {
    const inputTokens = estimateAiInputTokens(payload);
    const planDef = PLAN_DEFINITIONS[payload.plan];
    return {
        inputTokens,
        reservedTokens: inputTokens + planDef.maxOutputTokensPerRequest,
    };
};
export const estimateOutputTokensFromText = (text) => estimateTextTokens(text) + MESSAGE_OVERHEAD_TOKENS;
export const buildEstimatedUsage = ({ prompt, educationLevel, mode, objective, history, answer, }) => {
    const inputTokens = estimateAiInputTokens({
        prompt,
        educationLevel,
        mode,
        objective,
        history,
    });
    const outputTokens = estimateOutputTokensFromText(answer);
    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        usageSource: 'estimated',
    };
};
export const estimateMessagesLeft = (plan, remainingTokens) => {
    const average = PLAN_DEFINITIONS[plan].averageTokensPerMessage;
    return Math.max(Math.floor(remainingTokens / average), 0);
};
export const normalizeTokenUsage = ({ providerUsage, estimatedUsage, estimatedInputTokens, maxOutputTokens, }) => {
    if (!providerUsage) {
        return {
            usage: estimatedUsage,
            anomalyReason: null,
        };
    }
    const numbers = [providerUsage.inputTokens, providerUsage.outputTokens, providerUsage.totalTokens];
    const hasInvalidNumber = numbers.some((value) => !Number.isFinite(value) || value < 0);
    if (hasInvalidNumber) {
        return {
            usage: estimatedUsage,
            anomalyReason: 'provider_usage_non_finite',
        };
    }
    if (providerUsage.totalTokens < providerUsage.inputTokens + providerUsage.outputTokens) {
        return {
            usage: estimatedUsage,
            anomalyReason: 'provider_usage_total_less_than_parts',
        };
    }
    if (providerUsage.inputTokens > estimatedInputTokens * PROVIDER_TOKEN_SANITY_MULTIPLIER ||
        providerUsage.outputTokens > maxOutputTokens * PROVIDER_TOKEN_SANITY_MULTIPLIER ||
        providerUsage.totalTokens >
            (estimatedInputTokens + maxOutputTokens) * PROVIDER_TOKEN_SANITY_MULTIPLIER) {
        return {
            usage: estimatedUsage,
            anomalyReason: 'provider_usage_out_of_range',
        };
    }
    return {
        usage: providerUsage,
        anomalyReason: null,
    };
};
