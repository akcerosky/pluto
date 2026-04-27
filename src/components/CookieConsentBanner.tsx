import { useState } from 'react';

const COOKIE_CONSENT_KEY = 'pluto_cookie_consent_v1';
const isProduction = import.meta.env.VITE_APP_ENV === 'production';

type ConsentValue = 'accepted' | 'rejected';

const getStoredConsent = (): ConsentValue | null => {
  if (!isProduction || typeof window === 'undefined') {
    return null;
  }

  const saved = window.localStorage.getItem(COOKIE_CONSENT_KEY);
  return saved === 'accepted' || saved === 'rejected' ? saved : null;
};

export const CookieConsentBanner = () => {
  const [consent, setConsent] = useState<ConsentValue | null>(() => getStoredConsent());

  if (!isProduction || consent) {
    return null;
  }

  const saveConsent = (value: ConsentValue) => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
    setConsent(value);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: '20px',
        right: '20px',
        bottom: '20px',
        zIndex: 120,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 'min(720px, 100%)',
          borderRadius: '18px',
          background: 'rgba(8, 10, 22, 0.96)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          pointerEvents: 'auto',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'white' }}>Cookie notice</h3>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.92rem' }}>
            Pluto uses essential cookies and local storage to keep you signed in, remember chat state, and secure the
            service. Essential reliability monitoring remains enabled so we can detect and fix production issues.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => saveConsent('rejected')}
            style={{
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'transparent',
              color: 'white',
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Manage / Reject
          </button>
          <button
            type="button"
            onClick={() => saveConsent('accepted')}
            style={{
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary), #6a1b9a)',
              color: 'white',
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
