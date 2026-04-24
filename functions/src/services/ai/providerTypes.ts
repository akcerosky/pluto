import type { SubscriptionPlan } from '../../config/plans.js';
import type { AiHistoryMessage, AiInlineAttachment, ThreadContextSummary, TokenUsage } from '../../types/index.js';

export type AiProvider = 'gemini' | 'nova-micro';

export interface ProviderRequest {
  prompt: string;
  educationLevel: string;
  mode: string;
  objective: string;
  plan: SubscriptionPlan;
  uid?: string;
  requestId?: string;
  history: AiHistoryMessage[];
  contextSummary?: ThreadContextSummary;
  summaryCandidates: AiHistoryMessage[];
  attachments: AiInlineAttachment[];
  maxOutputTokens: number;
}

export interface ProviderResult {
  text: string;
  contextSummary?: ThreadContextSummary;
  usage: TokenUsage;
  usageAnomaly: string | null;
  provider: AiProvider;
  modelId: string;
  modelUsed: string;
  latencyMs: number;
}

export interface AttemptExecutionResult extends ProviderResult {
  attemptNumber: number;
}

export interface ProviderExecutor {
  provider: AiProvider;
  configuredModelId: string;
  configuredModelUsed: string;
  execute: (request: ProviderRequest) => Promise<ProviderResult>;
}

export interface OrchestrationResult extends ProviderResult {
  primaryProvider: AiProvider;
  finalProvider: AiProvider;
  fallbackTriggered: boolean;
  retryCount: number;
  totalLatencyMs: number;
}
