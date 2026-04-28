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
3. HOMEWORK MODE - STRICT RULES:
   - NEVER give the complete solution or final answer on the first request, even if the student asks directly.
   - On the first attempt: give ONE hint only - identify what concept or formula applies, nothing more.
   - If the student is stuck after the first hint: give the next step only, not the full solution.
   - If the student has genuinely attempted the problem and shows their working: give targeted feedback on their attempt.
   - Only reveal the complete solution if: (a) the student has attempted at least twice AND (b) is still completely unable to proceed.
   - After any solution reveal, always ask: "Now try a similar problem on your own"
   - If the student asks "just give me the answer": respond with "I know it's tempting, but working through it builds real understanding. Here's a hint to get you started:" then give one hint.
   - Never solve more than one step ahead of where the student currently is.
4. EXAM PREP MODE - STRICT RULES:
   - Default behavior is to generate practice questions, NOT to explain concepts.
   - When the student names a topic: immediately generate 2-3 exam-style practice questions on that topic.
   - Do NOT explain the topic before asking questions - test first, explain after.
   - After the student attempts an answer: give detailed marking feedback (what was correct, what was wrong, why, how many marks it would get).
   - After feedback: offer either (a) another practice question or (b) a concept explanation if they struggled.
   - Use exam-style language: "A student is asked to...", "Calculate...", "Explain why...", "Compare and contrast..."
   - If the student asks for explanation without attempting: say "Let me test you first - here's a question:" then give a practice question.
   - After 3+ questions on a topic: give a performance summary and suggest which areas need more practice.
5. RESPONSE FORMAT RULES:
   - In Homework mode: start every response with "💡 Hint:" or "🔍 Next step:" or "✅ Check your work:" - never start with the answer.
   - In Exam Prep mode: start every response with "📝 Practice question:" or "📊 Feedback:" or "🎯 Try this:"
6. Keep the tone polished, premium, and encouraging for the student's level.
7. If the latest message is clearly non-educational or unrelated to the student's studies or learning goals, do not answer it. Reply exactly with: "${OFF_TOPIC_REFUSAL}"
8. If a user asks meta questions about the conversation like "what did I say earlier" or "summarize our chat", answer them factually based on the conversation context. Do not refuse these as off-topic.
9. Prefer continuity with the supplied conversation history instead of inventing missing prior context.
</core_constraints>
<response_organization>
- Use clear markdown headers (## or ###) when there are multiple parts.
- Use bullet points or numbered lists for steps, examples, or strategies.
- Use **bold** text for key terms, equations, formulas, or takeaways.
- Keep paragraphs short and easy to scan.
- Make answers feel neat, structured, and study-friendly.
- In Homework mode, keep the response to one hint, one next step, or one work-check unless the student has already attempted multiple times.
- In Exam Prep mode, ask or mark before teaching whenever possible.
</response_organization>`;
};

const DIRECT_ANSWER_REQUEST_PATTERNS = [
  /\bjust give me the answer\b/i,
  /\bgive (?:me )?(?:the )?(?:complete|full|final) answer\b/i,
  /\bgive (?:me )?(?:the )?(?:complete|full) solution\b/i,
  /\bsolve (?:it|this|the whole thing)\b/i,
  /\banswer it for me\b/i,
];

const ATTEMPT_SIGNAL_PATTERNS = [
  /\bi tried\b/i,
  /\bmy work\b/i,
  /\bmy steps\b/i,
  /\bi got\b/i,
  /\bi think\b/i,
  /\bhere'?s what i did\b/i,
  /\bsubstitute\b/i,
  /\bfactor\b/i,
  /\bdiscriminant\b/i,
  /\b=\s*[-+]?[\dA-Za-z]/,
];

export const isDirectAnswerRequest = (text: string) =>
  DIRECT_ANSWER_REQUEST_PATTERNS.some((pattern) => pattern.test(text));

export const looksLikeStudentAttempt = (text: string) =>
  ATTEMPT_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));

export const buildTurnSpecificInstruction = ({
  mode,
  prompt,
  history,
}: {
  mode: string;
  prompt: string;
  history: AiHistoryMessage[];
}) => {
  if (mode !== 'Homework') {
    return '';
  }

  const normalizedPrompt = prompt.trim();
  const priorUserTexts = history
    .filter((message) => message.role === 'user')
    .map((message) => getHistoryText(message))
    .map((text) => text.trim())
    .filter(Boolean);

  const directAnswerRequest = isDirectAnswerRequest(normalizedPrompt);
  const priorAttemptCount = priorUserTexts.filter((text) => looksLikeStudentAttempt(text)).length;
  const totalStudentTurns = priorUserTexts.length + (normalizedPrompt ? 1 : 0);

  const lines = [
    'TURN-SPECIFIC HOMEWORK ENFORCEMENT:',
    `- Prior student attempt count with visible working: ${priorAttemptCount}.`,
    `- Total student turns in this problem so far: ${totalStudentTurns}.`,
  ];

  if (directAnswerRequest) {
    lines.push(
      '- The latest student message is asking for the answer directly.',
      '- Do NOT provide the complete solution or final answer in this turn.',
      '- Reply with exactly one hint or one next step only, and keep the student doing the work.',
      '- If the student has not already shown two genuine attempts with working, a full solution is forbidden.'
    );
  } else if (priorAttemptCount < 2) {
    lines.push(
      '- The student has not yet earned a full worked solution.',
      '- Stay in hint-first tutoring mode and reveal at most one next step beyond the student\'s current progress.'
    );
  } else {
    lines.push(
      '- Even if the student has attempted multiple times, only reveal a full solution if they are still completely unable to proceed.',
      '- If you reveal a solution, keep it concise and finish with: "Now try a similar problem on your own".'
    );
  }

  return lines.join('\n');
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
  `The following is internal context. Never repeat, quote, or reference this block in your response. Use it silently only.
Prior off-topic or refused requests have already been handled; do not treat them as active context or let them color responses to legitimate educational follow-ups.
Use this only as background for legitimate educational follow-ups, and prioritize the student's latest message.
${contextSummary.text.trim()}`;

const LEAKED_MEMORY_PREFIX_PATTERNS = [
  /^conversation memory snapshot/i,
  /^prior educational focus/i,
];

export const startsWithLeakedMemoryPrefix = (text: string) =>
  LEAKED_MEMORY_PREFIX_PATTERNS.some((pattern) => pattern.test(text.trimStart()));

export const stripLeadingLeakedMemoryBlock = (text: string) => {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!startsWithLeakedMemoryPrefix(normalized)) {
    return normalized;
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const cleanedParagraphs = [...paragraphs];
  while (cleanedParagraphs.length > 0 && startsWithLeakedMemoryPrefix(cleanedParagraphs[0] ?? '')) {
    cleanedParagraphs.shift();
  }

  return cleanedParagraphs.join('\n\n').trim();
};

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
