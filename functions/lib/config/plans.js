export const IST_TIME_ZONE = 'Asia/Kolkata';
export const PRO_REFUND_DAILY_LIMIT = 100;
export const PLAN_DEFINITIONS = {
    Free: {
        id: 'Free',
        displayPrice: 'INR 0',
        amountInr: 0,
        dailyLimit: 10,
        maxInputChars: 500,
        allowedModes: ['Conversational'],
    },
    Plus: {
        id: 'Plus',
        displayPrice: 'INR 299/month',
        amountInr: 299,
        dailyLimit: 100,
        maxInputChars: 2000,
        allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
    },
    Pro: {
        id: 'Pro',
        displayPrice: 'INR 599/month',
        amountInr: 599,
        dailyLimit: null,
        maxInputChars: 6000,
        allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
    },
};
export const DEFAULT_PLAN = 'Free';
