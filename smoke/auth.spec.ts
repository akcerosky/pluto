import { expect, test } from '@playwright/test';
import { getRequiredEnv, skipUnlessEnv } from './helpers/env';
import { expectChatMessageVisible, loginWithEmail, sendChatMessage } from './helpers/pluto';

test.describe('Auth smoke flows', () => {
  test('signup -> email verification -> first chat -> refresh', async ({ page }) => {
    skipUnlessEnv(
      ['PLUTO_SMOKE_SIGNUP_EMAIL', 'PLUTO_SMOKE_SIGNUP_PASSWORD', 'PLUTO_SMOKE_EMAIL_VERIFICATION_LINK'],
      'Signup smoke test requires a provisioned signup account and verification link'
    );

    const email = getRequiredEnv('PLUTO_SMOKE_SIGNUP_EMAIL');
    const password = getRequiredEnv('PLUTO_SMOKE_SIGNUP_PASSWORD');
    const verificationLink = getRequiredEnv('PLUTO_SMOKE_EMAIL_VERIFICATION_LINK');

    await page.goto('/signup');
    await page.getByPlaceholder('Email address').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(/verification email sent/i)).toBeVisible();

    await page.goto(verificationLink);
    await page.waitForURL(/verify-email|chat|login/);

    await page.goto('/verify-email');
    await page.getByRole('button', { name: /i verified/i }).click();
    await page.waitForURL(/chat/);

    await sendChatMessage(page, 'Smoke test persistence message');
    await expectChatMessageVisible(page, 'Smoke test persistence message');

    await page.reload();
    await expectChatMessageVisible(page, 'Smoke test persistence message');
  });

  test('Google sign-in -> chat', async ({ page, context }) => {
    skipUnlessEnv(
      ['PLUTO_SMOKE_GOOGLE_EMAIL', 'PLUTO_SMOKE_GOOGLE_PASSWORD'],
      'Google smoke test requires a real Google account'
    );

    const email = getRequiredEnv('PLUTO_SMOKE_GOOGLE_EMAIL');
    const password = getRequiredEnv('PLUTO_SMOKE_GOOGLE_PASSWORD');

    await page.goto('/login');
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: /continue with google/i }).click(),
    ]);

    await popup.waitForLoadState('domcontentloaded');
    await popup.getByLabel(/email or phone/i).fill(email);
    await popup.getByRole('button', { name: /next/i }).click();
    await popup.getByLabel(/enter your password/i).fill(password);
    await popup.getByRole('button', { name: /next/i }).click();
    await popup.close({ runBeforeUnload: true }).catch(() => {});

    await page.waitForURL(/chat/);
    await expect(page).toHaveURL(/chat/);
  });

  test('password reset end-to-end', async ({ page }) => {
    skipUnlessEnv(
      ['PLUTO_SMOKE_RESET_EMAIL', 'PLUTO_SMOKE_PASSWORD_RESET_LINK', 'PLUTO_SMOKE_NEW_PASSWORD'],
      'Password reset smoke test requires a reset email, password reset link, and new password'
    );

    const email = getRequiredEnv('PLUTO_SMOKE_RESET_EMAIL');
    const resetLink = getRequiredEnv('PLUTO_SMOKE_PASSWORD_RESET_LINK');
    const newPassword = getRequiredEnv('PLUTO_SMOKE_NEW_PASSWORD');

    await page.goto('/login');
    await page.getByPlaceholder('Email address').fill(email);
    await page.getByRole('button', { name: /forgot password/i }).click();
    await expect(page.getByText(/password reset email sent/i)).toBeVisible();

    await page.goto(resetLink);
    await page.getByPlaceholder('New password').fill(newPassword);
    await page.getByPlaceholder('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: /update password/i }).click();
    await expect(page.getByText(/password updated/i)).toBeVisible();

    await loginWithEmail(page, email, newPassword);
    await page.waitForURL(/chat|verify-email/);
  });
});
