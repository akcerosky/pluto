import { buildEstimatedUsage, estimateAiInputTokens, estimateMessagesLeft, normalizeTokenUsage, estimateReservedTokens, } from './tokenUsage.js';
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
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
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
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.reservedTokens).toBe(result.inputTokens + 1000);
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
    expect(usage.usageSource).toBe('estimated');
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
});
test('estimateMessagesLeft uses plan averages and never goes negative', () => {
    expect(estimateMessagesLeft('Free', 4000)).toBe(2);
    expect(estimateMessagesLeft('Plus', 0)).toBe(0);
});
test('normalizeTokenUsage falls back when provider usage is anomalous', () => {
    const estimatedUsage = {
        inputTokens: 300,
        outputTokens: 400,
        totalTokens: 700,
        usageSource: 'estimated',
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
    expect(normalized.usage).toEqual(estimatedUsage);
    expect(normalized.anomalyReason).toBe('provider_usage_out_of_range');
});
