jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
}));

jest.mock('firebase-functions', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { GoogleGenAI } from '@google/genai';
import { generateGeminiResponse } from './gemini.js';

const generateContent = jest.fn();
const GoogleGenAIMock = GoogleGenAI as unknown as jest.Mock;

const successResponse = (text = 'Here is the answer.') => ({
  text,
  usageMetadata: {
    promptTokenCount: 10,
    candidatesTokenCount: 5,
    totalTokenCount: 15,
  },
});

const providerError = (status: number) => ({
  status,
  message: `provider status ${status}`,
});

const basePayload = {
  prompt: 'Explain photosynthesis',
  educationLevel: 'High School',
  mode: 'Conversational',
  objective: 'Biology',
  plan: 'Free',
  history: [],
  summaryCandidates: [],
  attachments: [],
  maxOutputTokens: 500,
};

beforeEach(() => {
  process.env.GOOGLE_GEMINI_API_KEY = 'test-key';
  generateContent.mockReset();
  GoogleGenAIMock.mockImplementation(() => ({
    models: {
      generateContent,
    },
  }));
});

test('Gemini success returns the primary model only', async () => {
  generateContent.mockResolvedValueOnce(successResponse());

  const result = await generateGeminiResponse(basePayload);

  expect(result.modelUsed).toBe('flash');
  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
});

test('Gemini 503 fails without model fallback', async () => {
  generateContent.mockRejectedValueOnce(providerError(503));

  await expect(generateGeminiResponse(basePayload)).rejects.toMatchObject({ status: 503 });

  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
});

test('429 fails fast without retry or fallback', async () => {
  generateContent.mockRejectedValueOnce(providerError(429));

  await expect(generateGeminiResponse(basePayload)).rejects.toMatchObject({ status: 429 });

  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
});
