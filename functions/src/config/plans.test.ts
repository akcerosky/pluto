import { PLAN_DEFINITIONS } from './plans.js';

test('learning features are disabled on free and enabled on paid plans', () => {
  expect(PLAN_DEFINITIONS.Free.learningFeaturesEnabled).toBe(false);
  expect(PLAN_DEFINITIONS.Plus.learningFeaturesEnabled).toBe(true);
  expect(PLAN_DEFINITIONS.Pro.learningFeaturesEnabled).toBe(true);
});

test('plus now allows pdf attachments', () => {
  expect(PLAN_DEFINITIONS.Plus.allowedAttachmentKinds).toContain('pdf');
});
