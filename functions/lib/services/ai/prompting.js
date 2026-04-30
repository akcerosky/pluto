export const OFF_TOPIC_REFUSAL = "I can't help with that. Ask me something related to your studies or learning goals.";
export const buildSystemInstruction = (educationLevel, mode, objective, plan) => {
    const toneLine = educationLevel === 'Elementary'
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
   - NEVER give the complete solution, final answer, or fully worked-out solution in Homework mode.
   - On the first turn about a problem: identify the problem type, name the method or formula needed, and ask one specific question to get the student started.
   - Do not solve anything or show any calculation on the first turn.
   - If the student asks for the answer without showing work: acknowledge the frustration briefly, do not give the answer, restate the current question with slightly more scaffolding, and ask for only the first step.
   - If the student has genuinely attempted the problem and shows their working: give targeted feedback on their attempt.
   - Never reveal the final numeric answer, the final expression, or a complete derivation. Keep the student responsible for the final step.
   - Even after multiple student follow-ups, stay in coaching mode: offer only one hint, one next step, or one check of their work per turn.
   - If the student asks "just give me the answer": respond with "I know it feels like I'm being unhelpful, but you'll remember this much better if you work through it. Let's try just this one part:" then ask one specific small question.
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
7. Pluto is for learning-focused conversations only. Apply the off-topic refusal unless the latest message is clearly tied to education, studying, academic work, career learning, skill-building, or the current lesson.
8. Treat these as educational and NEVER refuse them as off-topic: asking for a solution, asking for a worked example, asking to check an answer, asking for the next step, asking how to solve a problem, asking for formula help, and asking follow-up questions about a math, science, coding, writing, or exam topic.
9. Treat these as OFF-TOPIC unless the user clearly frames them as a school or learning task: elections, political parties, vote counts, seat counts, politicians, actors, actresses, celebrities, entertainment gossip, sports scores, breaking news, and general current-affairs.
10. If a user asks meta questions about the conversation like "what did I say earlier" or "summarize our chat", answer them factually based on the conversation context. Do not refuse these as off-topic.
11. Only when the message is not clearly learning-focused should you refuse it. In that case, reply exactly with: "${OFF_TOPIC_REFUSAL}"
12. Prefer continuity with the supplied conversation history instead of inventing missing prior context.
</core_constraints>
<response_organization>
- Use clear markdown headers (## or ###) when there are multiple parts.
- Use bullet points or numbered lists for steps, examples, or strategies.
- Use **bold** text for key terms, equations, formulas, or takeaways.
- Keep paragraphs short and easy to scan.
- Make answers feel neat, structured, and study-friendly.
- In Homework mode, keep the response to one hint, one next step, or one work-check only. Do not end with the final answer.
- In Exam Prep mode, ask or mark before teaching whenever possible.
</response_organization>`;
};
const DIRECT_ANSWER_REQUEST_PATTERNS = [
    /\bjust give me the answer\b/i,
    /\bgive (?:me )?(?:the )?(?:complete|full|final) answer\b/i,
    /\bgive (?:me )?(?:the )?(?:complete|full) solution\b/i,
    /\btell me the answer\b/i,
    /\bshow me the answer\b/i,
    /\bjust tell me\b/i,
    /\bi don'?t know\b/i,
    /\bi'?m stuck\b/i,
    /\banswer it for me\b/i,
];
const ATTEMPT_SIGNAL_PATTERNS = [
    /\bi tried\b/i,
    /\bmy (?:work|steps|answer|paragraph|equation|draft)\b/i,
    /\bi got\b/i,
    /\bi think\b/i,
    /\bhere'?s what i did\b/i,
    /\bhere'?s my\b/i,
    /\bI wrote\b/i,
    /[A-Za-z]\s*=\s*[-+]?(?:\d+|\w+)/,
    /\d+\s*[=+\-*/^]\s*[-+]?(?:\d+|[A-Za-z(])/,
];
const BLOCKED_GENERAL_TOPIC_PATTERNS = [
    /\belections?\b/i,
    /\bseat counts?\b/i,
    /\bvote counts?\b/i,
    /\bpoliticians?\b/i,
    /\bpolitical part(?:y|ies)\b/i,
    /\btmc\b/i,
    /\bactors?\b/i,
    /\bactress(?:es)?\b/i,
    /\bcelebrit(?:y|ies)\b/i,
    /\bentertainment gossip\b/i,
    /\bbreaking news\b/i,
    /\bcurrent affairs?\b/i,
    /\bsports scores?\b/i,
];
const LEARNING_FRAME_PATTERNS = [
    /\bfor (?:my |a )?(?:class|exam|assignment|homework|project|lesson|quiz|test|course)\b/i,
    /\b(?:class|exam|assignment|homework|project|lesson|quiz|test|course|syllabus|chapter)\b/i,
    /\b(?:study|revise|revision|practice|learn|learning|curriculum)\b/i,
    /\b(?:history|civics|political science|media studies|film studies|journalism)\b/i,
    /\b(?:explain|analyze|compare|contrast|discuss|summarize)\b.+\b(?:for|in)\b/i,
    /\bhypothetical\b/i,
    /\bexample problem\b/i,
];
const COMPLETE_SOLUTION_MARKERS = [
    'Complete Solution:',
    'Final Solution:',
    'Full Solution:',
    'Here is the answer:',
    'Here is the solution:',
    'The answer is:',
    'The solution is:',
    'Step-by-step solution:',
];
export const isDirectAnswerRequest = (text) => DIRECT_ANSWER_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
export const looksLikeStudentAttempt = (text) => ATTEMPT_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
export const isBlockedGeneralTopicRequest = (text) => BLOCKED_GENERAL_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
export const isLearningFramedRequest = (text) => LEARNING_FRAME_PATTERNS.some((pattern) => pattern.test(text));
export const shouldRefuseGeneralTopicRequest = (text) => isBlockedGeneralTopicRequest(text) && !isLearningFramedRequest(text);
export const getHistoryText = (message) => message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n');
const hasCompleteSolutionMarker = (answer) => COMPLETE_SOLUTION_MARKERS.some((marker) => answer.includes(marker));
const hasThreeSequentialCalculationLines = (answer) => {
    const lines = answer
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    let sequentialCalcLines = 0;
    for (const line of lines) {
        if (/[=]/.test(line) && /[\dA-Za-z()[\]+\-*/^]/.test(line)) {
            sequentialCalcLines += 1;
            if (sequentialCalcLines >= 3) {
                return true;
            }
        }
        else if (/^\d+\.\s+/.test(line)) {
            sequentialCalcLines += 1;
            if (sequentialCalcLines >= 3) {
                return true;
            }
        }
        else {
            sequentialCalcLines = 0;
        }
    }
    return false;
};
export const enforceHomeworkResponsePolicy = ({ mode, answer, }) => {
    if (mode !== 'Homework') {
        return answer;
    }
    const hasCompleteSolution = hasCompleteSolutionMarker(answer) || hasThreeSequentialCalculationLines(answer);
    if (!hasCompleteSolution) {
        return answer;
    }
    return "💡 Let's work through this together step by step. What do you know about this problem so far? Try starting with the first part.";
};
export const buildTurnSpecificInstruction = ({ mode, prompt, history, }) => {
    if (mode !== 'Homework') {
        return '';
    }
    const normalizedPrompt = prompt.trim();
    const priorUserTexts = history
        .filter((message) => message.role === 'user')
        .map((message) => getHistoryText(message))
        .map((text) => text.trim())
        .filter(Boolean);
    const hasPriorAttempt = priorUserTexts.some((text) => looksLikeStudentAttempt(text));
    const hasCurrentAttempt = looksLikeStudentAttempt(normalizedPrompt);
    const hasAttemptedWork = hasPriorAttempt || hasCurrentAttempt;
    const directAnswerRequest = isDirectAnswerRequest(normalizedPrompt);
    if (history.length === 0) {
        return [
            'HOMEWORK TURN INSTRUCTION - FIRST TURN:',
            'This is the first turn. Do NOT solve the problem.',
            '1. Identify what type of problem this is.',
            '2. Name the method, formula, or approach the student should use.',
            '3. Ask ONE specific starter question to get the student thinking.',
            '4. Use 💡 Hint: prefix.',
            '5. FULL_ANSWER_PERMISSION: false.',
        ].join('\n');
    }
    if (directAnswerRequest && !hasAttemptedWork) {
        return [
            'HOMEWORK TURN INSTRUCTION - DIRECT ANSWER REQUEST:',
            'The student asked for the answer without showing any work.',
            '1. Acknowledge their frustration briefly in one sentence.',
            '2. Do NOT give the answer.',
            '3. Repeat the previous question with slightly more scaffolding.',
            '4. Ask them to try just the very first calculation or step.',
            '5. Use 💡 Hint: prefix.',
            '6. FULL_ANSWER_PERMISSION: false.',
        ].join('\n');
    }
    if (hasAttemptedWork) {
        return [
            'HOMEWORK TURN INSTRUCTION - STUDENT SHOWED WORK:',
            'The student attempted something.',
            '1. Confirm what is correct.',
            '2. Point out any error without fixing it — just say what to check.',
            '3. Ask them to try the next specific step only.',
            '4. Use ✅ Check your work: or 🔍 Next step: prefix.',
            '5. FULL_ANSWER_PERMISSION: false.',
        ].join('\n');
    }
    return [
        'HOMEWORK TURN INSTRUCTION - FOLLOW-UP WITHOUT WORK:',
        'The student has not shown work yet.',
        '1. Restate the current starter question.',
        '2. Add one small scaffolding detail.',
        '3. Ask them to try just the first part.',
        '4. Use 💡 Hint: prefix.',
        '5. FULL_ANSWER_PERMISSION: false.',
    ].join('\n');
};
export const SUMMARY_BLOCK_SIZE_EXCHANGES = 10;
export const SUMMARY_MAX_TEXT_CHARS = 4000;
export const SUMMARY_FALLBACK_CHARS = 500;
export const getSummaryCandidateText = (message) => [
    getHistoryText(message),
    ...message.parts
        .filter((part) => part.type === 'image' || part.type === 'file')
        .map((part) => `[Attachment: ${part.name}, ${part.mimeType}, ${part.sizeBytes} bytes]`),
]
    .filter(Boolean)
    .join('\n\n');
export const getFirstLine = (value) => value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? '';
export const buildContextSnapshotMessage = (contextSummary) => `The following is internal context. Never repeat, quote, or reference this block in your response. Use it silently only.
Prior off-topic or refused requests have already been handled; do not treat them as active context or let them color responses to legitimate educational follow-ups.
Use this only as background for legitimate educational follow-ups, and prioritize the student's latest message.
${contextSummary.text.trim()}`;
const LEAKED_MEMORY_PREFIX_PATTERNS = [
    /^conversation memory snapshot/i,
    /^prior educational focus/i,
];
export const startsWithLeakedMemoryPrefix = (text) => LEAKED_MEMORY_PREFIX_PATTERNS.some((pattern) => pattern.test(text.trimStart()));
export const stripLeadingLeakedMemoryBlock = (text) => {
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
export const historyToExchanges = (history) => {
    const exchanges = [];
    let current = null;
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
        }
        else if (current) {
            current.assistant = current.assistant ? `${current.assistant}\n\n${text}` : text;
        }
        else {
            current = { user: '', assistant: text };
        }
    }
    if (current) {
        exchanges.push(current);
    }
    return exchanges;
};
export const buildFallbackSummary = (history) => {
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
export const clampSummaryText = (value) => value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, SUMMARY_MAX_TEXT_CHARS);
export const buildSummaryPrompt = ({ existingSummary, summaryCandidates, educationLevel, mode, objective, }) => {
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
