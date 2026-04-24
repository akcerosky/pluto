import { generateGeminiResponse } from '../../gemini.js';
import type { ProviderExecutor } from '../providerTypes.js';

export const geminiProvider: ProviderExecutor = {
  provider: 'gemini',
  configuredModelId: 'gemini-2.5-flash',
  configuredModelUsed: 'gemini-2.5-flash',
  execute: generateGeminiResponse,
};
