const getOptional = (envKey: string, fallback = ''): string => process.env[envKey] ?? fallback;

const envReaders = {
  region: () => 'asia-south1',
  logLevel: () => getOptional('LOG_LEVEL', 'info'),
  projectId: () => getOptional('FIREBASE_PROJECT_ID'),
  geminiApiKey: () => getOptional('GOOGLE_GEMINI_API_KEY'),
  razorpayKeyId: () => getOptional('RAZORPAY_KEY_ID'),
  razorpayKeySecret: () => getOptional('RAZORPAY_KEY_SECRET'),
  razorpayWebhookSecret: () => getOptional('RAZORPAY_WEBHOOK_SECRET'),
  razorpayPlusPlanId: () => getOptional('RAZORPAY_PLUS_PLAN_ID'),
  razorpayProPlanId: () => getOptional('RAZORPAY_PRO_PLAN_ID'),
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
