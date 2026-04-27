import { executeHybridAiRequest } from '../services/ai/orchestrator.js';

process.env.FIREBASE_PROJECT_ID ||= 'pluto-ef61b';
process.env.GOOGLE_CLOUD_PROJECT ||= process.env.FIREBASE_PROJECT_ID;
process.env.GCLOUD_PROJECT ||= process.env.FIREBASE_PROJECT_ID;
if (!process.env.GOOGLE_GEMINI_API_KEY && process.env.PLUTO_SMOKE_GEMINI_API_KEY) {
  process.env.GOOGLE_GEMINI_API_KEY = process.env.PLUTO_SMOKE_GEMINI_API_KEY;
}

const originalBedrockKey = process.env.AMAZON_BEDROCK_API_KEY;
const originalBearerKey = process.env.AWS_BEARER_TOKEN_BEDROCK;

const run = async () => {
  if (!process.env.GOOGLE_GEMINI_API_KEY?.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'Set GOOGLE_GEMINI_API_KEY or PLUTO_SMOKE_GEMINI_API_KEY to run the Nova fallback smoke test.',
        },
        null,
        2
      )
    );
    return;
  }

  process.env.AMAZON_BEDROCK_API_KEY = 'invalid-smoke-token';
  process.env.AWS_BEARER_TOKEN_BEDROCK = '';

  try {
    const result = await executeHybridAiRequest({
      prompt: 'Explain evaporation in one short sentence.',
      educationLevel: 'High School',
      mode: 'Conversational',
      objective: 'Smoke fallback verification',
      plan: 'Free',
      uid: 'smoke-fallback-user',
      requestId: `smoke-fallback-${Date.now()}`,
      history: [],
      contextSummary: undefined,
      summaryCandidates: [],
      attachments: [],
      maxOutputTokens: 200,
    });

    if (result.primaryProvider !== 'nova-micro') {
      throw new Error(`Expected primaryProvider=nova-micro but received ${result.primaryProvider}`);
    }

    if (result.finalProvider !== 'gemini' || !result.fallbackTriggered) {
      throw new Error(
        `Expected Gemini fallback after Nova failure but received finalProvider=${result.finalProvider}, fallbackTriggered=${String(result.fallbackTriggered)}`
      );
    }

    if (!result.text.trim()) {
      throw new Error('Gemini fallback returned an empty response.');
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          primaryProvider: result.primaryProvider,
          finalProvider: result.finalProvider,
          fallbackTriggered: result.fallbackTriggered,
          retryCount: result.retryCount,
          modelUsed: result.modelUsed,
          preview: result.text.slice(0, 120),
        },
        null,
        2
      )
    );
  } finally {
    if (originalBedrockKey === undefined) {
      delete process.env.AMAZON_BEDROCK_API_KEY;
    } else {
      process.env.AMAZON_BEDROCK_API_KEY = originalBedrockKey;
    }

    if (originalBearerKey === undefined) {
      delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    } else {
      process.env.AWS_BEARER_TOKEN_BEDROCK = originalBearerKey;
    }
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
