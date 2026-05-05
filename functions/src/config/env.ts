import {
  amazonBedrockApiKey,
  googleGeminiApiKey,
  razorpayKeySecret,
  razorpayWebhookSecret,
  razorpayPlusPlanId,
  razorpayProPlanId,
  resendApiKey,
  resendFromEmail,
} from './secrets.js';

const getOptional = (envKey: string, fallback = ''): string => process.env[envKey] ?? fallback;
const getSecretOptional = (secret: { value: () => string }, envKey: string, fallback = ''): string => {
  try {
    return secret.value() || getOptional(envKey, fallback);
  } catch {
    return getOptional(envKey, fallback);
  }
};

const envReaders = {
  region: () => 'asia-south1',
  logLevel: () => getOptional('LOG_LEVEL', 'info'),
  projectId: () => getOptional('FIREBASE_PROJECT_ID'),
  geminiApiKey: () => getSecretOptional(googleGeminiApiKey, 'GOOGLE_GEMINI_API_KEY'),
  bedrockApiKey: () =>
    getSecretOptional(amazonBedrockApiKey, 'AMAZON_BEDROCK_API_KEY') ||
    getOptional('AWS_BEARER_TOKEN_BEDROCK'),
  bedrockRegion: () => getOptional('BEDROCK_REGION', 'ap-south-1'),
  bedrockNovaModelId: () => getOptional('BEDROCK_NOVA_MICRO_MODEL_ID', 'apac.amazon.nova-micro-v1:0'),
  bedrockNovaLiteModelId: () => getOptional('BEDROCK_NOVA_LITE_MODEL_ID', 'apac.amazon.nova-lite-v1:0'),
  // Razorpay key IDs are intentionally public publishable keys used by Razorpay Checkout.
  // They are safe to expose to the client and do not need Secret Manager protection.
  razorpayKeyId: () => getOptional('RAZORPAY_KEY_ID'),
  razorpayKeySecret: () => getSecretOptional(razorpayKeySecret, 'RAZORPAY_KEY_SECRET'),
  razorpayWebhookSecret: () => getSecretOptional(razorpayWebhookSecret, 'RAZORPAY_WEBHOOK_SECRET'),
  razorpayPlusPlanId: () => getSecretOptional(razorpayPlusPlanId, 'RAZORPAY_PLUS_PLAN_ID'),
  razorpayProPlanId: () => getSecretOptional(razorpayProPlanId, 'RAZORPAY_PRO_PLAN_ID'),
  resendApiKey: () => getSecretOptional(resendApiKey, 'RESEND_API_KEY'),
  resendFromEmail: () => getSecretOptional(resendFromEmail, 'RESEND_FROM_EMAIL'),
};

export const env = {
  get region() {
    return envReaders.region();
  },
  get logLevel() {
    return envReaders.logLevel();
  },
  get projectId() {
    return envReaders.projectId();
  },
  get geminiApiKey() {
    return envReaders.geminiApiKey();
  },
  get bedrockApiKey() {
    return envReaders.bedrockApiKey();
  },
  get bedrockRegion() {
    return envReaders.bedrockRegion();
  },
  get bedrockNovaModelId() {
    return envReaders.bedrockNovaModelId();
  },
  get bedrockNovaLiteModelId() {
    return envReaders.bedrockNovaLiteModelId();
  },
  get razorpayKeyId() {
    return envReaders.razorpayKeyId();
  },
  get razorpayKeySecret() {
    return envReaders.razorpayKeySecret();
  },
  get razorpayWebhookSecret() {
    return envReaders.razorpayWebhookSecret();
  },
  get razorpayPlusPlanId() {
    return envReaders.razorpayPlusPlanId();
  },
  get razorpayProPlanId() {
    return envReaders.razorpayProPlanId();
  },
  get resendApiKey() {
    return envReaders.resendApiKey();
  },
  get resendFromEmail() {
    return envReaders.resendFromEmail();
  },
};

export const requireEnv = (key: keyof typeof env): string => {
  const value = envReaders[key]();
  if (!value) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value;
};

export const getRazorpayPlanId = (plan: 'Plus' | 'Pro'): string => {
  return plan === 'Plus' ? requireEnv('razorpayPlusPlanId') : requireEnv('razorpayProPlanId');
};
