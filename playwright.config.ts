import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './smoke',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLUTO_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: process.env.CI ? true : undefined,
  },
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
});
