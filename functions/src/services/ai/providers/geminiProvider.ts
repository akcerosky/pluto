import { generateGeminiResponse } from '../../gemini.js';
import type { ProviderExecutor } from '../providerTypes.js';

export const geminiProvider: ProviderExecutor = {
  provider: 'gemini',
  execute: generateGeminiResponse,
};
