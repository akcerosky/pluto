import { test } from '@playwright/test';

export const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const skipUnlessEnv = (names: string[], reason: string) => {
  const missing = names.filter((name) => !process.env[name]);
  test.skip(missing.length > 0, `${reason}. Missing env: ${missing.join(', ')}`);
};
