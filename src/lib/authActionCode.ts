const getVerificationRedirectUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL('/verify-email', window.location.origin).toString();
  }

  return import.meta.env.VITE_APP_ENV === 'development'
    ? 'http://localhost:5174/verify-email'
    : 'https://pluto.akcero.ai/verify-email';
};

export const getEmailVerificationActionCodeSettings = () => ({
  url: getVerificationRedirectUrl(),
  handleCodeInApp: false,
});

const getPasswordResetRedirectUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL('/login', window.location.origin).toString();
  }

  return import.meta.env.VITE_APP_ENV === 'development'
    ? 'http://localhost:5174/login'
    : 'https://pluto.akcero.ai/login';
};

export const getPasswordResetActionCodeSettings = () => ({
  url: getPasswordResetRedirectUrl(),
  handleCodeInApp: false,
});
