import type { AiHistoryMessage, ThreadContextSummary } from '../../types/index.js';

export const OFF_TOPIC_REFUSAL =
  "I can't help with that. Ask me something related to your studies or learning goals.";

export const buildSystemInstruction = (
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

export const SUMMARY_BLOCK_SIZE_EXCHANGES = 10;
export const SUMMARY_MAX_TEXT_CHARS = 4000;
export const SUMMARY_FALLBACK_CHARS = 500;

export const getHistoryText = (message: AiHistoryMessage) =>
  message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');

export const getSummaryCandidateText = (message: AiHistoryMessage) =>
  [
    getHistoryText(message),
    ...message.parts
      .filter((part) => part.type === 'image' || part.type === 'file')
      .map((part) => `[Attachment: ${part.name}, ${part.mimeType}, ${part.sizeBytes} bytes]`),
  ]
    .filter(Boolean)
    .join('\n\n');

export const getFirstLine = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? '';

export const buildContextSnapshotMessage = (contextSummary: ThreadContextSummary) =>
  `Conversation memory snapshot for continuity.
Prior off-topic or refused requests have already been handled; do not treat them as active context or let them color responses to legitimate educational follow-ups.
Use this only as background for legitimate educational follow-ups, and prioritize the student's latest message.
Do not repeat, quote, mention, or label this memory snapshot in the visible response. Use it silently as background context only.
${contextSummary.text.trim()}`;

export const historyToExchanges = (history: AiHistoryMessage[]) => {
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

export const buildFallbackSummary = (history: AiHistoryMessage[]) => {
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

export const clampSummaryText = (value: string) =>
  value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, SUMMARY_MAX_TEXT_CHARS);

export const buildSummaryPrompt = ({
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
      'Prefer durable labels such as "Topics", "Student state", "Open questions", "Attachments/references", and "Next step".',
      'Preserve turn numbers, student answers, tutor pending questions, formulas, mistakes, attachment mentions, and next-step context.',
      'Make the summary useful when a later student reply is short, such as "yes", "4", or "continue".',
      'Do not add intro text, outro text, or commentary outside the bullet list.',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
};
