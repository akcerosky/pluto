import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { AlertCircle, CheckCircle2, LoaderCircle, Rocket } from 'lucide-react';
import { auth } from '../lib/firebase';

const getContinueDestination = (continueUrl: string | null) => {
  if (!continueUrl) {
    return '/verify-email';
  }

  try {
    return new URL(continueUrl, window.location.origin).toString();
  } catch {
    return continueUrl;
  }
};

export const AuthActionPage = () => {
  const [status, setStatus] = useState<'working' | 'success' | 'error'>('working');
  const [message, setMessage] = useState('Verifying your email now...');

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  const continueUrl = params.get('continueUrl');
  const destination = getContinueDestination(continueUrl);

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      if (!auth) {
        setStatus('error');
        setMessage('Firebase Authentication is not configured.');
        return;
      }

      if (mode !== 'verifyEmail' || !oobCode) {
        setStatus('error');
        setMessage('This verification link is invalid or incomplete.');
        return;
      }

      try {
        await applyActionCode(auth, oobCode);
        if (auth.currentUser) {
          await auth.currentUser.reload();
          await auth.currentUser.getIdToken(true);
        }

        if (!isActive) return;
        setStatus('success');
        setMessage('Email verified. Redirecting you back to Pluto...');

        window.location.assign(destination);
      } catch (error) {
        console.error(error);
        if (!isActive) return;
        setStatus('error');
        setMessage('We could not verify this email link. It may have expired or already been used.');
      }
    };

    void run();

    return () => {
      isActive = false;
    };
  }, [destination, mode, oobCode]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        color: 'white',
      }}
    >
      <Link to="/" style={{ marginBottom: '36px', color: 'white', textDecoration: 'none' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            background: 'var(--primary)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px var(--primary-glow)',
          }}
        >
          <Rocket size={20} color="white" />
        </div>
      </Link>

      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          borderRadius: '20px',
          padding: '32px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '18px',
            margin: '0 auto 20px',
            background:
              status === 'error'
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(138, 43, 226, 0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: status === 'error' ? '#fca5a5' : 'var(--primary)',
          }}
        >
          {status === 'working' && <LoaderCircle size={28} className="animate-spin" />}
          {status === 'success' && <CheckCircle2 size={28} />}
          {status === 'error' && <AlertCircle size={28} />}
        </div>

        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '12px' }}>
          {status === 'error' ? 'Verification failed' : 'Email verification'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>{message}</p>
        {status === 'error' && (
          <a
            href={destination}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 18px',
              borderRadius: '10px',
              background: 'var(--primary)',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Back to Pluto
          </a>
        )}
      </div>
    </div>
  );
};
