import { expect, test } from '@playwright/test';
import { getRequiredEnv, skipUnlessEnv } from './helpers/env';
import { expectChatMessageVisible, loginWithEmail, openNewChatInMode, sendChatMessage } from './helpers/pluto';

test.describe('Chat smoke flows', () => {
  test.beforeEach(async ({ page }) => {
    skipUnlessEnv(
      ['PLUTO_SMOKE_LOGIN_EMAIL', 'PLUTO_SMOKE_LOGIN_PASSWORD'],
      'Chat smoke tests require a login account'
    );

    await loginWithEmail(
      page,
      getRequiredEnv('PLUTO_SMOKE_LOGIN_EMAIL'),
      getRequiredEnv('PLUTO_SMOKE_LOGIN_PASSWORD')
    );
    await page.waitForURL(/chat|verify-email/);
  });

  test('all three modes can create threads and send messages', async ({ page }) => {
    const modes: Array<{ button: 'Exploration' | 'Homework' | 'Exam Prep'; prompt: string }> = [
      { button: 'Exploration', prompt: 'Explain inertia in one sentence.' },
      { button: 'Homework', prompt: 'Help me solve 2x + 3 = 11 step by step.' },
      { button: 'Exam Prep', prompt: 'Give me a quick quiz on photosynthesis.' },
    ];

    for (const mode of modes) {
      await openNewChatInMode(page, mode.button);
      await sendChatMessage(page, mode.prompt);
      await expectChatMessageVisible(page, mode.prompt);
    }
  });

  test('delete thread removes it from the sidebar after refresh', async ({ page }) => {
    const threadSeed = `delete smoke ${Date.now()}`;
    await openNewChatInMode(page, 'Exploration');
    await sendChatMessage(page, threadSeed);
    await expectChatMessageVisible(page, threadSeed);

    const sidebarItem = page.getByText(threadSeed, { exact: false }).first();
    await expect(sidebarItem).toBeVisible();
    await sidebarItem.click();
    await page.getByRole('button', { name: new RegExp(`delete thread ${threadSeed}`, 'i') }).click();

    await page.reload();
    await expect(page.getByText(threadSeed, { exact: false })).toHaveCount(0);
  });

  test('error boundary catches forced runtime error', async ({ page }) => {
    await page.goto('/chat?plutoThrowChatError=1');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(/Pluto needs a quick refresh/i)).toBeVisible();
  });
});
