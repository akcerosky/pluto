import { expect, type Page } from '@playwright/test';

export const loginWithEmail = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
};

export const openNewChatInMode = async (
  page: Page,
  mode: 'Exploration' | 'Homework' | 'Exam Prep'
) => {
  await page.getByTestId('new-chat-button').click();

  const modeButtonId =
    mode === 'Exploration'
      ? 'mode-exploration-button'
      : mode === 'Homework'
        ? 'mode-homework-button'
        : 'mode-examprep-button';

  await page.getByTestId(modeButtonId).click();
};

export const sendChatMessage = async (page: Page, message: string) => {
  const textbox = page.getByTestId('chat-composer-input');
  await textbox.fill(message);
  await page.getByTestId('chat-send-button').click();
};

export const expectChatMessageVisible = async (page: Page, text: string) => {
  await expect(page.getByText(text, { exact: false })).toBeVisible();
};
