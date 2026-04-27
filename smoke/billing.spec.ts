import { expect, test } from '@playwright/test';
import { getRequiredEnv, skipUnlessEnv } from './helpers/env';
import { loginWithEmail } from './helpers/pluto';

test.describe('Billing smoke flows', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessEnv(
      ['PLUTO_SMOKE_LOGIN_EMAIL', 'PLUTO_SMOKE_LOGIN_PASSWORD'],
      'Billing smoke tests require a login account'
    );

    await loginWithEmail(
      page,
      getRequiredEnv('PLUTO_SMOKE_LOGIN_EMAIL'),
      getRequiredEnv('PLUTO_SMOKE_LOGIN_PASSWORD')
    );
    await page.goto('/profile');
  });

  test('Razorpay test transaction activates the selected plan', async ({ page, context }) => {
    skipUnlessEnv(
      ['PLUTO_SMOKE_RAZORPAY_PLAN', 'PLUTO_SMOKE_RAZORPAY_ASSERT_TEXT', 'PLUTO_SMOKE_RAZORPAY_SUCCESS_URL'],
      'Razorpay smoke test requires billing environment details'
    );

    const plan = getRequiredEnv('PLUTO_SMOKE_RAZORPAY_PLAN');
    const assertText = getRequiredEnv('PLUTO_SMOKE_RAZORPAY_ASSERT_TEXT');
    const successUrl = getRequiredEnv('PLUTO_SMOKE_RAZORPAY_SUCCESS_URL');

    const [popup] = await Promise.all([
      context.waitForEvent('page').catch(() => null),
      page.getByRole('button', { name: new RegExp(`Subscribe ${plan}`, 'i') }).click(),
    ]);

    if (popup) {
      await popup.waitForLoadState('domcontentloaded');
    }

    await page.waitForURL(new RegExp(successUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.getByText(new RegExp(assertText, 'i'))).toBeVisible();
  });

  test('billing email verification hook is available', async ({ page }) => {
    skipUnlessEnv(
      ['PLUTO_SMOKE_BILLING_EMAIL_ASSERT_TEXT'],
      'Billing email smoke test requires an assertion string from the expected email flow'
    );

    await expect(
      page.getByText(new RegExp(getRequiredEnv('PLUTO_SMOKE_BILLING_EMAIL_ASSERT_TEXT'), 'i'))
    ).toBeVisible();
  });
});
