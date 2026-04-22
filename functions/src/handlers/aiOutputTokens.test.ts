import { getEffectiveMaxOutputTokens, PLAN_DEFINITIONS } from '../config/plans.js';

test('mode output token budgets clamp against plan maximums', () => {
  expect(getEffectiveMaxOutputTokens('Conversational', PLAN_DEFINITIONS.Pro)).toBe(4000);
  expect(getEffectiveMaxOutputTokens('Homework', PLAN_DEFINITIONS.Pro)).toBe(4000);
  expect(getEffectiveMaxOutputTokens('ExamPrep', PLAN_DEFINITIONS.Pro)).toBe(2500);

  expect(getEffectiveMaxOutputTokens('Conversational', PLAN_DEFINITIONS.Free)).toBe(1000);
  expect(getEffectiveMaxOutputTokens('Homework', PLAN_DEFINITIONS.Free)).toBe(1000);
  expect(getEffectiveMaxOutputTokens('ExamPrep', PLAN_DEFINITIONS.Free)).toBe(1000);

  expect(getEffectiveMaxOutputTokens('Homework', PLAN_DEFINITIONS.Plus)).toBe(4000);
});
