import {
  buildSystemInstruction,
  buildTurnSpecificInstruction,
  enforceHomeworkResponsePolicy,
  isLearningFramedRequest,
  OFF_TOPIC_REFUSAL,
  shouldRefuseGeneralTopicRequest,
} from './prompting.js';

test('homework system instruction stays generic and forbids full solutions', () => {
  const instruction = buildSystemInstruction('High School', 'Homework', 'Algebra', 'Free');

  expect(instruction).toContain('NEVER give the complete solution, final answer, or fully worked-out solution in Homework mode.');
  expect(instruction).toContain('On the first turn about a problem: identify the problem type, name the method or formula needed, and ask one specific question to get the student started.');
  expect(instruction).toContain('start every response with "💡 Hint:" or "🔍 Next step:" or "✅ Check your work:"');
  expect(instruction).not.toContain('quadratic formula');
  expect(instruction).not.toContain('b² - 4ac');
});

test('exam prep mode instructions enforce question-first practice flow', () => {
  const instruction = buildSystemInstruction(
    'College/University',
    'ExamPrep',
    'Organic Chemistry',
    'Plus'
  );

  expect(instruction).toContain('EXAM PREP MODE - STRICT RULES');
  expect(instruction).toContain('Default behavior is to generate practice questions, NOT to explain concepts.');
  expect(instruction).toContain('start every response with "📝 Practice question:" or "📊 Feedback:" or "🎯 Try this:"');
});

test('off-topic refusal remains explicit in the system instruction', () => {
  const instruction = buildSystemInstruction('High School', 'Conversational', 'Physics', 'Free');

  expect(instruction).toContain(OFF_TOPIC_REFUSAL);
});

test('server-side general-topic refusal blocks celebrity and election prompts without study framing', () => {
  expect(shouldRefuseGeneralTopicRequest('tell me about actress samatha')).toBe(true);
  expect(shouldRefuseGeneralTopicRequest('What is the number of seats won by tmc?')).toBe(true);
});

test('server-side general-topic refusal allows explicitly school-framed requests', () => {
  expect(isLearningFramedRequest('Explain elections for my civics class')).toBe(true);
  expect(shouldRefuseGeneralTopicRequest('Explain elections for my civics class')).toBe(false);
});

test('first homework turn-specific instruction is generic and structured', () => {
  const instruction = buildTurnSpecificInstruction({
    mode: 'Homework',
    prompt: 'solve this problem',
    history: [],
  });

  expect(instruction).toContain('HOMEWORK TURN INSTRUCTION - FIRST TURN:');
  expect(instruction).toContain('1. Identify what type of problem this is.');
  expect(instruction).toContain('4. Use 💡 Hint: prefix.');
  expect(instruction).toContain('FULL_ANSWER_PERMISSION: false');
  expect(instruction).not.toContain('quadratic');
});

test('direct answer request instruction stays generic and denies the answer', () => {
  const instruction = buildTurnSpecificInstruction({
    mode: 'Homework',
    prompt: 'give me full answer',
    history: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Explain this problem' }],
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: '💡 Hint: Start with the first part.' }],
      },
    ],
  });

  expect(instruction).toContain('HOMEWORK TURN INSTRUCTION - DIRECT ANSWER REQUEST:');
  expect(instruction).toContain('Do NOT give the answer.');
  expect(instruction).toContain('Repeat the previous question with slightly more scaffolding.');
  expect(instruction).toContain('FULL_ANSWER_PERMISSION: false');
});

test('attempt instruction focuses on feedback and next step only', () => {
  const instruction = buildTurnSpecificInstruction({
    mode: 'Homework',
    prompt: 'I tried x = 4',
    history: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Help me solve this' }],
      },
    ],
  });

  expect(instruction).toContain('HOMEWORK TURN INSTRUCTION - STUDENT SHOWED WORK:');
  expect(instruction).toContain('Confirm what is correct.');
  expect(instruction).toContain('Use ✅ Check your work: or 🔍 Next step: prefix.');
  expect(instruction).toContain('FULL_ANSWER_PERMISSION: false');
});

test('homework response policy leaves ordinary guided replies untouched', () => {
  const answer = enforceHomeworkResponsePolicy({
    mode: 'Homework',
    prompt: 'help me',
    history: [],
    answer: '💡 Hint: Start by identifying what the first part is asking.',
  });

  expect(answer).toBe('💡 Hint: Start by identifying what the first part is asking.');
});

test('homework response policy blocks complete solution markers', () => {
  const answer = enforceHomeworkResponsePolicy({
    mode: 'Homework',
    prompt: 'give me the answer',
    history: [],
    answer: 'Complete Solution:\n1. Do this\n2. Do that\n3. Final answer',
  });

  expect(answer).toBe(
    "💡 Let's work through this together step by step. What do you know about this problem so far? Try starting with the first part."
  );
});

test('homework response policy blocks calculation-heavy worked solutions', () => {
  const answer = enforceHomeworkResponsePolicy({
    mode: 'Homework',
    prompt: 'check this',
    history: [],
    answer: 'a = 3\nb = 2\nc = 4\nx = 5',
  });

  expect(answer).toBe(
    "💡 Let's work through this together step by step. What do you know about this problem so far? Try starting with the first part."
  );
});

test('homework response policy does not rewrite non-homework answers', () => {
  const answer = enforceHomeworkResponsePolicy({
    mode: 'Conversational',
    prompt: 'help me',
    history: [],
    answer: 'Here is a complete explanation.',
  });

  expect(answer).toBe('Here is a complete explanation.');
});
