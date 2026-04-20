import { GoogleGenAI } from '@google/genai';
import { requireEnv } from '../config/env.js';
import { buildEstimatedUsage, estimateAiInputTokens, normalizeTokenUsage } from './tokenUsage.js';
import type { AiHistoryMessage, AiInlineAttachment, TokenUsage } from '../types/index.js';

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
7. Prefer continuity with the supplied conversation history instead of inventing missing prior context.
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

const getHistoryText = (message: AiHistoryMessage) =>
  message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');

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
  history: AiHistoryMessage[];
  attachments: AiInlineAttachment[];
  maxOutputTokens: number;
}) => {
  const genAI = new GoogleGenAI({ apiKey: requireEnv('geminiApiKey').trim() });
  const history = normalizeHistory(payload.history);
  const estimatedInputTokens = estimateAiInputTokens({
    prompt: payload.prompt,
    educationLevel: payload.educationLevel,
    mode: payload.mode,
    objective: payload.objective,
    history: payload.history,
  });
  const backoffs = [0, 1000, 3000, 9000];
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
        contents: [...history, currentTurn],
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
        usage: normalizedUsage.usage,
        usageAnomaly: normalizedUsage.anomalyReason,
      };
    } catch (error) {
      lastError = error;
      const status =
        typeof error === 'object' && error && 'status' in error ? Number(error.status) : null;
      if (!status || !RETRYABLE_STATUS_CODES.has(status)) {
        break;
      }
    }
  }

  throw lastError ?? new Error('Gemini request failed.');
};
