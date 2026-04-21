import { GoogleGenAI } from '@google/genai';
import { logger } from 'firebase-functions';
import { requireEnv } from '../config/env.js';
import { buildEstimatedUsage, estimateAiInputTokens, normalizeTokenUsage } from './tokenUsage.js';
import type { AiHistoryMessage, AiInlineAttachment, ThreadContextSummary, TokenUsage } from '../types/index.js';

const OFF_TOPIC_REFUSAL =
  "I can't help with that. Ask me something related to your studies or learning goals.";
const FILLER_PREFIXES = [
  'sure, ',
  'sure. ',
  'here is ',
  'here are ',
  'let us ',
  "let's ",
];
const FOLLOWUP_TAILS = [
  'if you want, i can give more practice questions.',
  'if you need the answers, just let me know!',
  'if you want more, ask me.',
];

const buildSystemInstruction = (
  educationLevel: string,
  mode: string,
  objective: string,
  plan: string
) => {
  const toneLine =
    educationLevel === 'Elementary'
      ? '- Tone: Fun, encouraging, and friendly. Use playful metaphors, simple wording, and confidence-building language.'
      : educationLevel === 'Professional'
        ? '- Tone: Professional colleague and research assistant. Be precise, polished, and domain-aware.'
        : '- Tone: Knowledgeable tutor, encouraging but academic, clear and structured.';

  return `<identity>
You are Pluto, a premium AI learning companion focused on helping students learn deeply and independently.
</identity>
<current_context>
- Education Level: ${educationLevel}
- Learning Objective: ${objective}
- Interaction Mode: ${mode}
- Subscription Plan: ${plan}
</current_context>
<persona>
Adaptive Persona for ${educationLevel}:
${toneLine}
</persona>
<core_constraints>
1. Tailor language, pacing, and difficulty strictly to the ${educationLevel} level.
2. If mode is Conversational: guide the student step by step using a Socratic approach. Be helpful without rushing to hand over the full answer when reasoning can be developed.
3. If mode is Homework: do not give the final answer or a full end-to-end solution immediately. Identify the problem type, explain the approach, and ask for the next specific step or provide a short hint so the student does the solving.
4. If mode is ExamPrep: prioritize practice questions, timed-style drills, mock test scenarios, recall checks, revision strategies, and clear answer explanations.
5. Keep the tone polished, premium, and encouraging for the student's level.
6. If the latest message is clearly non-educational or unrelated to the student's studies or learning goals, do not answer it. Reply exactly with: "${OFF_TOPIC_REFUSAL}"
7. If a user asks meta questions about the conversation like "what did I say earlier" or "summarize our chat", answer them factually based on the conversation context. Do not refuse these as off-topic.
8. Prefer continuity with the supplied conversation history instead of inventing missing prior context.
</core_constraints>
<response_organization>
- Use clear markdown headers (## or ###) when there are multiple parts.
- Use bullet points or numbered lists for steps, examples, or strategies.
- Use **bold** text for key terms, equations, formulas, or takeaways.
- Keep paragraphs short and easy to scan.
- Make answers feel neat, structured, and study-friendly.
</response_organization>`;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const PRIMARY_MODEL = 'gemini-2.5-flash';
const SUMMARY_BLOCK_SIZE_EXCHANGES = 10;
const SUMMARY_MAX_TEXT_CHARS = 4000;
const SUMMARY_FALLBACK_CHARS = 500;

const getHistoryText = (message: AiHistoryMessage) =>
  message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');

const getSummaryCandidateText = (message: AiHistoryMessage) =>
  [
    getHistoryText(message),
    ...message.parts
      .filter((part) => part.type === 'image' || part.type === 'file')
      .map((part) => `[Attachment: ${part.name}, ${part.mimeType}, ${part.sizeBytes} bytes]`),
  ]
    .filter(Boolean)
    .join('\n\n');

const getFirstLine = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? '';

const buildContextSnapshotMessage = (contextSummary: ThreadContextSummary) =>
  `Conversation memory snapshot for continuity.
Prior off-topic or refused requests have already been handled; do not treat them as active context or let them color responses to legitimate educational follow-ups.
Use this only as background for legitimate educational follow-ups, and prioritize the student's latest message.
${contextSummary.text.trim()}`;

const historyToExchanges = (history: AiHistoryMessage[]) => {
  const exchanges: Array<{ user: string; assistant: string }> = [];
  let current: { user: string; assistant: string } | null = null;

  for (const message of history) {
    const text = getSummaryCandidateText(message);
    if (!text) {
      continue;
    }

    if (message.role === 'user') {
      if (current) {
        exchanges.push(current);
      }
      current = { user: text, assistant: '' };
    } else if (current) {
      current.assistant = current.assistant ? `${current.assistant}\n\n${text}` : text;
    } else {
      current = { user: '', assistant: text };
    }
  }

  if (current) {
    exchanges.push(current);
  }

  return exchanges;
};

const buildFallbackSummary = (history: AiHistoryMessage[]) => {
  const lines = historyToExchanges(history)
    .map((exchange) => {
      const userLine = getFirstLine(exchange.user);
      const assistantLine = getFirstLine(exchange.assistant);
      return [userLine && `Student: ${userLine}`, assistantLine && `Tutor: ${assistantLine}`]
        .filter(Boolean)
        .join(' | ');
    })
    .filter(Boolean);

  return lines.join('\n').slice(0, SUMMARY_FALLBACK_CHARS).trim();
};

const clampSummaryText = (value: string) =>
  value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, SUMMARY_MAX_TEXT_CHARS);

const buildSummaryPrompt = ({
  existingSummary,
  summaryCandidates,
  educationLevel,
  mode,
  objective,
}: {
  existingSummary?: ThreadContextSummary;
  summaryCandidates: AiHistoryMessage[];
  educationLevel: string;
  mode: string;
  objective: string;
}) => {
  const exchanges = historyToExchanges(summaryCandidates);
  const startExchange = (existingSummary?.summarizedExchangeCount ?? 0) + 1;
  const transcript = exchanges
    .map((exchange, index) => {
      const turn = startExchange + index;
      return `Turn ${turn}
Student: ${getFirstLine(exchange.user) || '(no text)'}
Tutor: ${getFirstLine(exchange.assistant) || '(no text)'}`;
    })
    .join('\n\n');

  return [
    'You are updating tutoring memory for Pluto, an AI learning companion.',
    `Education level: ${educationLevel}`,
    `Mode: ${mode}`,
    `Learning objective: ${objective}`,
    existingSummary?.text
      ? `Existing summary, already covering earlier turns:\n${existingSummary.text.trim()}`
      : '',
    `New transcript block:\n${transcript}`,
    [
      'Return only compact markdown bullets.',
      'Preserve turn numbers, student answers, tutor pending questions, formulas, mistakes, attachment mentions, and next-step context.',
      'Make the summary useful when a later student reply is short, such as "yes", "4", or "continue".',
      'Do not add intro text, outro text, or commentary outside the bullet list.',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
};

export const refreshContextSummary = async (payload: {
  genAI: GoogleGenAI;
  contextSummary?: ThreadContextSummary;
  summaryCandidates: AiHistoryMessage[];
  educationLevel: string;
  mode: string;
  objective: string;
  requestId?: string;
}) => {
  if (payload.summaryCandidates.length === 0) {
    return payload.contextSummary;
  }

  const fallbackText = buildFallbackSummary(payload.summaryCandidates);
  const fallbackSummary: ThreadContextSummary = {
    version: 1,
    text: clampSummaryText([payload.contextSummary?.text, fallbackText].filter(Boolean).join('\n')),
    summarizedMessageCount:
      (payload.contextSummary?.summarizedMessageCount ?? 0) + payload.summaryCandidates.length,
    summarizedExchangeCount:
      (payload.contextSummary?.summarizedExchangeCount ?? 0) + historyToExchanges(payload.summaryCandidates).length,
    blockSize: SUMMARY_BLOCK_SIZE_EXCHANGES,
    updatedAt: Date.now(),
  };

  try {
    const response = await payload.genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: buildSummaryPrompt({
                existingSummary: payload.contextSummary,
                summaryCandidates: payload.summaryCandidates,
                educationLevel: payload.educationLevel,
                mode: payload.mode,
                objective: payload.objective,
              }),
            },
          ],
        },
      ],
      config: {
        maxOutputTokens: 700,
        temperature: 0.2,
      },
    });

    const text = clampSummaryText(response.text ?? '');
    return text
      ? {
          ...fallbackSummary,
          text,
        }
      : fallbackSummary;
  } catch (error) {
    const providerError = getProviderErrorDetails(error);
    logger.warn('gemini_summary_generation_failed', {
      eventType: 'gemini_summary_generation_failed',
      requestId: payload.requestId ?? null,
      summaryCandidateCount: payload.summaryCandidates.length,
      providerStatus: providerError.status,
      providerCode: providerError.code,
      errorMessage: providerError.message,
    });
    return fallbackSummary;
  }
};

const getProviderErrorDetails = (error: unknown) => {
  if (!(typeof error === 'object' && error !== null)) {
    return {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      status: null as number | null,
      code: null as string | null,
      details: undefined as unknown,
    };
  }

  const record = error as Record<string, unknown>;
  return {
    message:
      typeof record.message === 'string'
        ? record.message
        : error instanceof Error
          ? error.message
          : 'Unknown provider error',
    stack: typeof record.stack === 'string' ? record.stack : error instanceof Error ? error.stack : undefined,
    status: typeof record.status === 'number' ? record.status : null,
    code: typeof record.code === 'string' ? record.code : null,
    details: record.details,
  };
};

export const normalizeHistory = (history: AiHistoryMessage[]) => {
  const sanitized: Array<{ role: 'user' | 'model'; content: string }> = history
    .map((message) => ({
      role: (message.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      content: getHistoryText(message),
    }))
    .filter((message) => message.content.length > 0);

  while (sanitized.length > 0 && sanitized[0]?.role !== 'user') {
    sanitized.shift();
  }

  const alternating = sanitized.reduce<Array<{ role: 'user' | 'model'; content: string }>>((acc, message) => {
    const previous = acc.at(-1);
    if (!previous || previous.role !== message.role) {
      acc.push(message);
    }
    return acc;
  }, []);

  return alternating.map((message) => ({
    role: message.role,
    parts: [{ text: message.content }],
  }));
};

const buildGeminiContents = ({
  history,
  currentTurn,
  contextSummary,
}: {
  history: ReturnType<typeof normalizeHistory>;
  currentTurn: { role: 'user'; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };
  contextSummary?: ThreadContextSummary;
}) => {
  if (!contextSummary?.text.trim()) {
    return [...history, currentTurn];
  }

  const contextText = buildContextSnapshotMessage(contextSummary);
  const [firstHistory, ...restHistory] = history;

  if (firstHistory?.role === 'user') {
    return [
      {
        ...firstHistory,
        parts: [
          {
            text: `${contextText}\n\nRecent conversation starts here:\n${firstHistory.parts[0]?.text ?? ''}`,
          },
        ],
      },
      ...restHistory,
      currentTurn,
    ];
  }

  const [firstPart, ...restParts] = currentTurn.parts;
  if (firstPart && 'text' in firstPart) {
    return [
      ...history,
      {
        ...currentTurn,
        parts: [
          {
            text: `${contextText}\n\nLatest student message:\n${firstPart.text}`,
          },
          ...restParts,
        ],
      },
    ];
  }

  return [
    ...history,
    {
      ...currentTurn,
      parts: [
        {
          text: contextText,
        },
        ...currentTurn.parts,
      ],
    },
  ];
};

export const sanitizeResponse = (text: string) => {
  let cleaned = (text || '').trim();
  if (!cleaned) {
    return 'I could not generate a response for that question.';
  }

  const latexReplacements: Array<[string | RegExp, string]> = [
    [/\\text\{([^{}]+)\}/g, '$1'],
    [/\\boxed\{([^{}]+)\}/g, '$1'],
    [/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)'],
    [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1 / $2'],
    [/\\cdot/g, ' * '],
    [/\\rightarrow/g, ' -> '],
    [/\\pm/g, '+/-'],
    [/\\circ/g, ' deg'],
    [/\\geq/g, ' >= '],
    [/\\leq/g, ' <= '],
    [/\\times/g, ' x '],
    [/\\\(/g, ''],
    [/\\\)/g, ''],
    [/\\\[/g, ''],
    [/\\\]/g, ''],
  ];

  for (const [pattern, replacement] of latexReplacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  const lowered = cleaned.toLowerCase();
  for (const prefix of FILLER_PREFIXES) {
    if (lowered.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trimStart();
      break;
    }
  }

  const loweredTail = cleaned.toLowerCase();
  for (const tail of FOLLOWUP_TAILS) {
    if (loweredTail.endsWith(tail)) {
      cleaned = cleaned.slice(0, -tail.length).trimEnd();
      break;
    }
  }

  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\{\}/g, '');
  cleaned = cleaned.trim();

  return cleaned || 'I could not generate a response for that question.';
};

export const generatePlutoResponse = async (payload: {
  prompt: string;
  educationLevel: string;
  mode: string;
  objective: string;
  plan: string;
  requestId?: string;
  history: AiHistoryMessage[];
  contextSummary?: ThreadContextSummary;
  summaryCandidates: AiHistoryMessage[];
  attachments: AiInlineAttachment[];
  maxOutputTokens: number;
}) => {
  const genAI = new GoogleGenAI({ apiKey: requireEnv('geminiApiKey').trim() });
  const contextSummary = await refreshContextSummary({
    genAI,
    contextSummary: payload.contextSummary,
    summaryCandidates: payload.summaryCandidates,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    requestId: payload.requestId,
  });
  const history = normalizeHistory(payload.history);
  const estimatedInputTokens = estimateAiInputTokens({
    prompt: payload.prompt,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    history: payload.history,
    contextSummaryText: contextSummary?.text,
  });
  const backoffs = [0, 500, 1500, 3000];
  let lastError: unknown;

  const currentTurn = {
    role: 'user' as const,
    parts: [
      ...(payload.prompt.trim() ? [{ text: payload.prompt }] : []),
      ...payload.attachments.map((attachment) => ({
        inlineData: {
          mimeType: attachment.mimeType,
          data: attachment.base64Data,
        },
      })),
    ],
  };

  for (let attempt = 0; attempt < backoffs.length; attempt += 1) {
    if (attempt > 0) {
      const jitter = Math.floor(Math.random() * 301);
      await wait(backoffs[attempt] + jitter);
    }

    try {
      const response = await genAI.models.generateContent({
        model: PRIMARY_MODEL,
        contents: buildGeminiContents({
          history,
          currentTurn,
          contextSummary,
        }),
        config: {
          systemInstruction: buildSystemInstruction(
            payload.educationLevel,
            payload.mode,
            payload.objective,
            payload.plan
          ),
          maxOutputTokens: payload.maxOutputTokens,
        },
      });
      const text = sanitizeResponse(response.text ?? '');
      const metadata = response.usageMetadata;
      const estimatedUsage = buildEstimatedUsage({
        prompt: payload.prompt,
        educationLevel: payload.educationLevel,
        mode: payload.mode,
        objective: payload.objective,
        history: payload.history,
        contextSummaryText: contextSummary?.text,
        answer: text,
      });
      const providerUsage: TokenUsage | null =
        metadata &&
        typeof metadata.promptTokenCount === 'number' &&
        typeof metadata.candidatesTokenCount === 'number' &&
        typeof metadata.totalTokenCount === 'number'
          ? {
              inputTokens: metadata.promptTokenCount,
              outputTokens: metadata.candidatesTokenCount,
              totalTokens: metadata.totalTokenCount,
              usageSource: 'provider',
            }
          : null;
      const normalizedUsage = normalizeTokenUsage({
        providerUsage,
        estimatedUsage,
        estimatedInputTokens,
        maxOutputTokens: payload.maxOutputTokens,
      });

      return {
        text,
        contextSummary,
        usage: normalizedUsage.usage,
        usageAnomaly: normalizedUsage.anomalyReason,
      };
    } catch (error) {
      lastError = error;
      const providerError = getProviderErrorDetails(error);
      logger.error('gemini_generate_content_attempt_failed', {
        eventType: 'gemini_generate_content_attempt_failed',
        requestId: payload.requestId ?? null,
        model: PRIMARY_MODEL,
        attempt: attempt + 1,
        maxAttempts: backoffs.length,
        mode: payload.mode,
        plan: payload.plan,
        promptLength: payload.prompt.length,
        historyMessageCount: payload.history.length,
        attachmentCount: payload.attachments.length,
        attachmentSummary: payload.attachments.map((attachment) => ({
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        })),
        providerStatus: providerError.status,
        providerCode: providerError.code,
        nextRetryDelayMs:
          providerError.status && RETRYABLE_STATUS_CODES.has(providerError.status)
            ? backoffs[attempt + 1] ?? null
            : null,
        errorMessage: providerError.message,
        errorDetails: providerError.details,
        stack: providerError.stack,
      });
      const status = providerError.status;
      if (!status || !RETRYABLE_STATUS_CODES.has(status)) {
        break;
      }
    }
  }

  throw lastError ?? new Error('Gemini request failed.');
};
