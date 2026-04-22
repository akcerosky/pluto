export const IST_TIME_ZONE = 'Asia/Kolkata';
export const PRO_REFUND_DAILY_LIMIT = 100;
export const FREE_PREMIUM_MODE_DAILY_LIMIT = 3;
export const INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES = 8 * 1024 * 1024;
export const MODE_OUTPUT_TOKEN_BUDGETS = {
    Conversational: 4_000,
    Homework: 4_000,
    ExamPrep: 2_500,
};
export const getEffectiveMaxOutputTokens = (mode, planConfig) => Math.min(MODE_OUTPUT_TOKEN_BUDGETS[mode], planConfig.maxOutputTokensPerRequest);
export const PLAN_DEFINITIONS = {
    Free: {
        id: 'Free',
        displayPrice: 'INR 0',
        amountInr: 0,
        dailyTokenLimit: 25_000,
        maxInputTokensPerRequest: 1_000,
        maxOutputTokensPerRequest: 1_000,
        averageTokensPerMessage: 2_000,
        maxInputChars: 500,
        allowedModes: ['Conversational'],
        attachmentsEnabled: false,
        allowedAttachmentKinds: [],
        maxAttachmentBytes: 0,
        maxTotalAttachmentPayloadBytes: INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES,
    },
    Plus: {
        id: 'Plus',
        displayPrice: 'INR 299/month',
        amountInr: 299,
        dailyTokenLimit: 250_000,
        maxInputTokensPerRequest: 4_000,
        maxOutputTokensPerRequest: 4_000,
        averageTokensPerMessage: 4_000,
        maxInputChars: 2000,
        allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
        attachmentsEnabled: true,
        allowedAttachmentKinds: ['image'],
        maxAttachmentBytes: 5 * 1024 * 1024,
        maxTotalAttachmentPayloadBytes: INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES,
    },
    Pro: {
        id: 'Pro',
        displayPrice: 'INR 599/month',
        amountInr: 599,
        dailyTokenLimit: 1_000_000,
        maxInputTokensPerRequest: 8_000,
        maxOutputTokensPerRequest: 8_000,
        averageTokensPerMessage: 6_000,
        maxInputChars: 6000,
        allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
        attachmentsEnabled: true,
        allowedAttachmentKinds: ['image', 'pdf'],
        maxAttachmentBytes: 20 * 1024 * 1024,
        maxTotalAttachmentPayloadBytes: INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES,
    },
};
export const DEFAULT_PLAN = 'Free';
