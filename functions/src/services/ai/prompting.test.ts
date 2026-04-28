import { buildSystemInstruction, OFF_TOPIC_REFUSAL } from './prompting.js';

test('homework mode instructions strongly enforce hint-first tutoring', () => {
  const instruction = buildSystemInstruction(
    'High School',
    'Homework',
    'Algebra',
    'Free'
  );

  expect(instruction).toContain('never jump straight to the final answer');
  expect(instruction).toContain('hint-first teaching flow');
  expect(instruction).toContain('Even if the student says "just give me the answer"');
  expect(instruction).toContain('end with a short next-step prompt');
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
