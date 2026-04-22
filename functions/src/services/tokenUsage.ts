import { getEffectiveMaxOutputTokens, PLAN_DEFINITIONS, type ChatMode, type SubscriptionPlan } from '../config/plans.js';
import type { AiHistoryMessage, TokenUsage } from '../types/index.js';

export const CHARS_PER_TOKEN = 4;
export const SYSTEM_INSTRUCTION_OVERHEAD_TOKENS = 500;
export const MESSAGE_OVERHEAD_TOKENS = 12;
export const ABSOLUTE_MAX_DAILY_TOKEN_CEILING = 1_000_000;
const PROVIDER_TOKEN_SANITY_MULTIPLIER = 2;

export const estimateTextTokens = (value: string) =>
  Math.max(1, Math.ceil(value.trim().length / CHARS_PER_TOKEN));

export const estimateHistoryTokens = (history: AiHistoryMessage[]) =>
  history.reduce(
    (sum, message) =>
      sum +
      message.parts.reduce(
        (partSum, part) =>
          part.type === 'text' ? partSum + estimateTextTokens(part.text) : partSum,
        0
      ) +
      MESSAGE_OVERHEAD_TOKENS,
    0
  );

export const estimateAiInputTokenBreakdown = (payload: {
  prompt: string;
  educationLevel: string;
  mode: string;
  objective: string;
  history: AiHistoryMessage[];
  contextSummaryText?: string;
}) => {
  const systemContext =
    payload.educationLevel.trim().length +
    payload.mode.trim().length +
    payload.objective.trim().length;
  const promptTokens = estimateTextTokens(payload.prompt);
  const summaryTokens = payload.contextSummaryText
    ? estimateTextTokens(payload.contextSummaryText) + MESSAGE_OVERHEAD_TOKENS
    : 0;
  const historyTokens = estimateHistoryTokens(payload.history);
  const systemContextTokens = estimateTextTokens(String(systemContext));

  return {
    promptTokens,
    summaryTokens,
    historyTokens,
    systemContextTokens,
    systemOverheadTokens: SYSTEM_INSTRUCTION_OVERHEAD_TOKENS,
    totalTokens:
      promptTokens +
      summaryTokens +
      historyTokens +
      systemContextTokens +
      SYSTEM_INSTRUCTION_OVERHEAD_TOKENS,
  };
};

export const estimateAiInputTokens = (payload: {
  prompt: string;
  educationLevel: string;
  mode: string;
  objective: string;
  history: AiHistoryMessage[];
  contextSummaryText?: string;
}) => estimateAiInputTokenBreakdown(payload).totalTokens;

export const estimateReservedTokens = (payload: {
  prompt: string;
  educationLevel: string;
  mode: ChatMode;
  objective: string;
  history: AiHistoryMessage[];
  contextSummaryText?: string;
  plan: SubscriptionPlan;
}) => {
  const inputTokens = estimateAiInputTokens(payload);
  const planDef = PLAN_DEFINITIONS[payload.plan];
  const maxOutputTokens = getEffectiveMaxOutputTokens(payload.mode, planDef);
  return {
    inputTokens,
    reservedTokens: inputTokens + maxOutputTokens,
    maxOutputTokens,
  };
};

export const estimateOutputTokensFromText = (text: string) =>
  estimateTextTokens(text) + MESSAGE_OVERHEAD_TOKENS;

export const buildEstimatedUsage = ({
  prompt,
  educationLevel,
  mode,
  objective,
  history,
  contextSummaryText,
  answer,
}: {
  prompt: string;
  educationLevel: string;
  mode: string;
  objective: string;
  history: AiHistoryMessage[];
  contextSummaryText?: string;
  answer: string;
}): TokenUsage => {
  const inputTokens = estimateAiInputTokens({
    prompt,
    educationLevel,
    mode,
    objective,
    history,
    contextSummaryText,
  });
  const outputTokens = estimateOutputTokensFromText(answer);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    usageSource: 'estimated',
  };
};

export const estimateMessagesLeft = (plan: SubscriptionPlan, remainingTokens: number) => {
  const average = PLAN_DEFINITIONS[plan].averageTokensPerMessage;
  return Math.max(Math.floor(remainingTokens / average), 0);
};

export const normalizeTokenUsage = ({
  providerUsage,
  estimatedUsage,
  estimatedInputTokens,
  maxOutputTokens,
}: {
  providerUsage: TokenUsage | null;
  estimatedUsage: TokenUsage;
  estimatedInputTokens: number;
  maxOutputTokens: number;
}) => {
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

  if (
    providerUsage.inputTokens > estimatedInputTokens * PROVIDER_TOKEN_SANITY_MULTIPLIER ||
    providerUsage.outputTokens > maxOutputTokens * PROVIDER_TOKEN_SANITY_MULTIPLIER ||
    providerUsage.totalTokens >
      (estimatedInputTokens + maxOutputTokens) * PROVIDER_TOKEN_SANITY_MULTIPLIER
  ) {
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
