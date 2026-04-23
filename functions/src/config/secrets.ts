import { defineSecret } from 'firebase-functions/params';

export const googleGeminiApiKey = defineSecret('GOOGLE_GEMINI_API_KEY');
export const amazonBedrockApiKey = defineSecret('AMAZON_BEDROCK_API_KEY');
export const razorpayKeySecret = defineSecret('RAZORPAY_KEY_SECRET');
export const razorpayWebhookSecret = defineSecret('RAZORPAY_WEBHOOK_SECRET');
export const razorpayPlusPlanId = defineSecret('RAZORPAY_PLUS_PLAN_ID');
export const razorpayProPlanId = defineSecret('RAZORPAY_PRO_PLAN_ID');
export const resendApiKey = defineSecret('RESEND_API_KEY');
export const resendFromEmail = defineSecret('RESEND_FROM_EMAIL');

export const runtimeSecrets = [
  googleGeminiApiKey,
  amazonBedrockApiKey,
  razorpayKeySecret,
  razorpayWebhookSecret,
  razorpayPlusPlanId,
  razorpayProPlanId,
  resendApiKey,
  resendFromEmail,
];
