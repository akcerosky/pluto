import { generateGeminiResponse } from '../../gemini.js';
export const geminiProvider = {
    provider: 'gemini',
    configuredModelId: 'gemini-2.5-flash',
    configuredModelUsed: 'gemini-2.5-flash',
    execute: generateGeminiResponse,
};
