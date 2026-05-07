import {
  assertNovaLiteSuccessObservabilityPayload,
  buildNovaLiteSuccessObservabilityPayload,
} from './novaLiteProvider.js';

describe('novaLiteProvider observability contract', () => {
  test('builds a valid success observability payload', () => {
    const payload = buildNovaLiteSuccessObservabilityPayload({
      request: {
        prompt: 'Explain photosynthesis',
        educationLevel: 'Class 10',
        mode: 'ExamPrep',
        objective: 'Science',
        plan: 'Plus',
        uid: 'user-1',
        requestId: 'req-123',
        history: [],
        contextSummary: undefined,
        summaryCandidates: [],
        attachments: [],
        maxOutputTokens: 500,
      },
      usage: {
        inputTokens: 100,
        outputTokens: 80,
        totalTokens: 180,
        usageSource: 'provider',
      },
      latencyMs: 3210,
    });

    expect(payload).toEqual({
      requestId: 'req-123',
      latencyMs: 3210,
      providerStatus: 200,
      inputTokens: 100,
      outputTokens: 80,
      totalTokens: 180,
      usageSource: 'provider',
    });
  });

  test('throws a structured error when required telemetry fields are missing', () => {
    expect(() =>
      assertNovaLiteSuccessObservabilityPayload({
        requestId: '',
        latencyMs: 100,
        providerStatus: 200,
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        usageSource: 'provider',
      })
    ).toThrow('Nova Lite success telemetry is missing requestId.');

    try {
      assertNovaLiteSuccessObservabilityPayload({
        requestId: 'req-123',
        latencyMs: 100,
        providerStatus: 200,
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        usageSource: undefined,
      });
      throw new Error('Expected observability validation to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error & { code?: string }).code).toBe('INVALID_OBSERVABILITY_PAYLOAD');
      expect((error as Error & { status?: number }).status).toBe(500);
    }
  });
});
