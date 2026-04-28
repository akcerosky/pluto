import { buildSystemInstruction, OFF_TOPIC_REFUSAL } from './prompting.js';

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
