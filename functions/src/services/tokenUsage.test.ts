import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEstimatedUsage,
  estimateAiInputTokens,
  estimateMessagesLeft,
  normalizeTokenUsage,
  estimateReservedTokens,
} from './tokenUsage.js';

test('estimateAiInputTokens returns a positive deterministic count', () => {
  const first = estimateAiInputTokens({
    prompt: 'Explain photosynthesis in simple terms.',
    educationLevel: 'High School',
    mode: 'Conversational',
    objective: 'Understand biology basics',
    history: [{ role: 'user', parts: [{ type: 'text', text: 'What is chlorophyll?' }] }],
  });

  const second = estimateAiInputTokens({
    prompt: 'Explain photosynthesis in simple terms.',
    educationLevel: 'High School',
    mode: 'Conversational',
    objective: 'Understand biology basics',
    history: [{ role: 'user', parts: [{ type: 'text', text: 'What is chlorophyll?' }] }],
  });

  assert.equal(first, second);
  assert.ok(first > 0);
});

test('estimateReservedTokens adds the plan output cap', () => {
  const result = estimateReservedTokens({
    prompt: 'Summarize Newton laws.',
    educationLevel: 'High School',
    mode: 'Homework',
    objective: 'Physics review',
    history: [],
    plan: 'Free',
  });

  assert.ok(result.inputTokens > 0);
  assert.equal(result.reservedTokens, result.inputTokens + 1500);
});

test('buildEstimatedUsage includes input and output token totals', () => {
  const usage = buildEstimatedUsage({
    prompt: 'Summarize this topic.',
    educationLevel: 'College/University',
    mode: 'ExamPrep',
    objective: 'Study for finals',
    history: [{ role: 'assistant', parts: [{ type: 'text', text: 'Sure, send the material.' }] }],
    answer: 'Here is a concise summary.',
  });

  assert.equal(usage.usageSource, 'estimated');
  assert.ok(usage.inputTokens > 0);
  assert.ok(usage.outputTokens > 0);
  assert.equal(usage.totalTokens, usage.inputTokens + usage.outputTokens);
});

test('estimateMessagesLeft uses plan averages and never goes negative', () => {
  assert.equal(estimateMessagesLeft('Free', 4000), 2);
  assert.equal(estimateMessagesLeft('Plus', 0), 0);
});

test('normalizeTokenUsage falls back when provider usage is anomalous', () => {
  const estimatedUsage = {
    inputTokens: 300,
    outputTokens: 400,
    totalTokens: 700,
    usageSource: 'estimated' as const,
  };

  const normalized = normalizeTokenUsage({
    providerUsage: {
      inputTokens: 50_000,
      outputTokens: 60_000,
      totalTokens: 110_000,
      usageSource: 'provider',
    },
    estimatedUsage,
    estimatedInputTokens: 300,
    maxOutputTokens: 1_500,
  });

  assert.deepEqual(normalized.usage, estimatedUsage);
  assert.equal(normalized.anomalyReason, 'provider_usage_out_of_range');
});
