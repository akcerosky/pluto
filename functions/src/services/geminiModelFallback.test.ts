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
import { generatePlutoResponse } from './gemini.js';

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

test('Flash success returns without fallback', async () => {
  generateContent.mockResolvedValueOnce(successResponse());

  const result = await generatePlutoResponse(basePayload);

  expect(result.modelUsed).toBe('flash');
  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
});

test('Flash 503 falls back to Flash Lite and includes modelUsed', async () => {
  generateContent
    .mockRejectedValueOnce(providerError(503))
    .mockResolvedValueOnce(successResponse('Lite answer'));

  const result = await generatePlutoResponse(basePayload);

  expect(result.text).toBe('Lite answer');
  expect(result.modelUsed).toBe('flash-lite');
  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
  expect(generateContent.mock.calls[1][0].model).toBe('gemini-2.5-flash-lite');
});

test('both Flash and Flash Lite 503 failures throw', async () => {
  generateContent
    .mockRejectedValueOnce(providerError(503))
    .mockRejectedValueOnce(providerError(503));

  await expect(generatePlutoResponse(basePayload)).rejects.toMatchObject({ status: 503 });

  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(generateContent.mock.calls[1][0].model).toBe('gemini-2.5-flash-lite');
});

test('429 fails fast without retry or fallback', async () => {
  generateContent.mockRejectedValueOnce(providerError(429));

  await expect(generatePlutoResponse(basePayload)).rejects.toMatchObject({ status: 429 });

  expect(generateContent).toHaveBeenCalledTimes(1);
  expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
});
