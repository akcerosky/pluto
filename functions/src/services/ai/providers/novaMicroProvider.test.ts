jest.mock('firebase-functions', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { generateNovaMicroResponse } from './novaMicroProvider.js';

const originalFetch = global.fetch;

const baseRequest = {
  prompt: 'Explain refraction',
  educationLevel: 'High School',
  mode: 'Conversational',
  objective: 'Physics',
  plan: 'Free',
  history: [],
  contextSummary: {
    version: 1,
    text: '- Topics: Refraction through prisms',
    summarizedMessageCount: 12,
    summarizedExchangeCount: 6,
    blockSize: 10,
    updatedAt: 1,
  },
  summaryCandidates: [],
  attachments: [],
  maxOutputTokens: 300,
  requestId: 'req-nova-test',
  uid: 'user-nova-test',
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  process.env.AMAZON_BEDROCK_API_KEY = 'test-bedrock-key';
  global.fetch = jest.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('retries once when Nova leaks internal memory labels and returns cleaned retry text', async () => {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock
    .mockResolvedValueOnce(
      jsonResponse({
        output: {
          message: {
            content: [{ text: 'Conversation memory snapshot for continuity.\nInternal notes' }],
          },
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        output: {
          message: {
            content: [{ text: '## Refraction\nLight bends when it enters a new medium.' }],
          },
        },
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
      })
    );

  const result = await generateNovaMicroResponse(baseRequest);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.text).toBe('## Refraction\nLight bends when it enters a new medium.');
  expect(result.text).not.toMatch(/Conversation memory snapshot|Prior educational focus/i);
});

test('fails if Nova still returns leaked memory labels after the retry', async () => {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock
    .mockResolvedValueOnce(
      jsonResponse({
        output: {
          message: {
            content: [{ text: 'Conversation memory snapshot for continuity.\nInternal notes' }],
          },
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        output: {
          message: {
            content: [{ text: 'Prior educational focus\nCarry over old labels' }],
          },
        },
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
      })
    );

  await expect(generateNovaMicroResponse(baseRequest)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});

test('does not retry valid Nova responses that do not contain leaked memory labels', async () => {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      output: {
        message: {
          content: [{ text: '## Refraction\nA prism bends light because different wavelengths slow differently.' }],
        },
      },
      usage: { inputTokens: 14, outputTokens: 9, totalTokens: 23 },
    })
  );

  const result = await generateNovaMicroResponse(baseRequest);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.text).toContain('## Refraction');
  expect(result.text).not.toMatch(/Conversation memory snapshot|Prior educational focus/i);
});

test('retries when Nova repeats the previous assistant response almost exactly', async () => {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock
    .mockResolvedValueOnce(
      jsonResponse({
        output: {
          message: {
            content: [{ text: 'Next step: Compute b^2 - 4ac using a = 3, b = 2, and c = 4.' }],
          },
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        output: {
          message: {
            content: [{ text: 'Check your work: What number do you get for 2^2 - 4*3*4?' }],
          },
        },
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
      })
    );

  const result = await generateNovaMicroResponse({
    ...baseRequest,
    mode: 'Homework',
    prompt: 'give me full answer',
    history: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'solve 3x^2 + 2x + 4 = 0' }],
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: 'Next step: Compute b^2 - 4ac using a = 3, b = 2, and c = 4.' }],
      },
    ],
  });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.text).toBe('Check your work: What number do you get for 2^2 - 4*3*4?');
  expect((fetchMock.mock.calls[1]?.[1] as { body?: string })?.body ?? '').toContain(
    'The student needs a DIFFERENT response'
  );
});
