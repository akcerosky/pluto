import { generateGeminiResponse } from '../../gemini.js';
export const geminiProvider = {
    provider: 'gemini',
    execute: generateGeminiResponse,
};
