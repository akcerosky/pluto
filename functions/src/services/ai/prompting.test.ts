import {
  buildSystemInstruction,
  buildTurnSpecificInstruction,
  isLearningFramedRequest,
  shouldRefuseGeneralTopicRequest,
  OFF_TOPIC_REFUSAL,
} from './prompting.js';

test('homework mode instructions strongly enforce hint-first tutoring', () => {
  const instruction = buildSystemInstruction(
    'High School',
    'Homework',
    'Algebra',
    'Free'
  );

  expect(instruction).toContain('HOMEWORK MODE - STRICT RULES');
  expect(instruction).toContain('NEVER give the complete solution or final answer on the first request');
  expect(instruction).toContain('On the first attempt: give ONE hint only');
  expect(instruction).toContain('I know it\'s tempting, but working through it builds real understanding.');
  expect(instruction).toContain('Now try a similar problem on your own');
  expect(instruction).toContain('start every response with "💡 Hint:" or "🔍 Next step:" or "✅ Check your work:"');
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
  expect(instruction).toContain('immediately generate 2-3 exam-style practice questions');
  expect(instruction).toContain('Let me test you first - here\'s a question:');
  expect(instruction).toContain('After 3+ questions on a topic: give a performance summary');
  expect(instruction).toContain('start every response with "📝 Practice question:" or "📊 Feedback:" or "🎯 Try this:"');
});

test('off-topic refusal remains explicit in the system instruction', () => {
  const instruction = buildSystemInstruction(
    'High School',
    'Conversational',
    'Physics',
    'Free'
  );

  expect(instruction).toContain(OFF_TOPIC_REFUSAL);
});

test('off-topic rule explicitly preserves educational solution requests', () => {
  const instruction = buildSystemInstruction(
    'High School',
    'Homework',
    'Algebra',
    'Pro'
  );

  expect(instruction).toContain('Treat these as educational and NEVER refuse them as off-topic');
  expect(instruction).toContain('asking for a solution');
  expect(instruction).toContain('asking for a worked example');
  expect(instruction).toContain('asking to check an answer');
  expect(instruction).toContain('asking how to solve a problem');
  expect(instruction).toContain('Only when the message is not clearly learning-focused should you refuse it');
});

test('off-topic rule explicitly blocks elections and celebrity queries unless framed as study tasks', () => {
  const instruction = buildSystemInstruction(
    'High School',
    'Conversational',
    'General Learning',
    'Pro'
  );

  expect(instruction).toContain('Treat these as OFF-TOPIC unless the user clearly frames them as a school or learning task');
  expect(instruction).toContain('elections');
  expect(instruction).toContain('seat counts');
  expect(instruction).toContain('actors');
  expect(instruction).toContain('actresses');
  expect(instruction).toContain('celebrities');
  expect(instruction).toContain('general current-affairs');
});

test('server-side general-topic refusal blocks celebrity and election prompts without study framing', () => {
  expect(shouldRefuseGeneralTopicRequest('tell me about actress samatha')).toBe(true);
  expect(shouldRefuseGeneralTopicRequest('What is the number of seats won by tmc?')).toBe(true);
});

test('server-side general-topic refusal allows explicitly school-framed requests', () => {
  expect(isLearningFramedRequest('Explain elections for my civics class')).toBe(true);
  expect(shouldRefuseGeneralTopicRequest('Explain elections for my civics class')).toBe(false);
  expect(shouldRefuseGeneralTopicRequest('Compare two actors for my media studies assignment')).toBe(false);
});

test('homework follow-up asking for the full answer stays locked to hint-only mode', () => {
  const instruction = buildTurnSpecificInstruction({
    mode: 'Homework',
    prompt: 'give complete answer',
    history: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'solve 2x^2+3x+4=0' }],
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: '💡 Hint: Use the quadratic formula and identify a, b, and c first.' }],
      },
    ],
  });

  expect(instruction).toContain('TURN-SPECIFIC HOMEWORK ENFORCEMENT');
  expect(instruction).toContain('The latest student message is asking for the answer directly.');
  expect(instruction).toContain('Do NOT provide the complete solution or final answer in this turn.');
  expect(instruction).toContain('If the student has not already shown two genuine attempts with working, a full solution is forbidden.');
});

test('homework turn-specific instruction recognizes when no full solution has been earned yet', () => {
  const instruction = buildTurnSpecificInstruction({
    mode: 'Homework',
    prompt: 'I am stuck after the first hint',
    history: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Find the roots of x^2 - 5x + 6 = 0' }],
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: '💡 Hint: Think about factoring into two binomials.' }],
      },
    ],
  });

  expect(instruction).toContain('The student has not yet earned a full worked solution.');
  expect(instruction).toContain("Stay in hint-first tutoring mode");
});
