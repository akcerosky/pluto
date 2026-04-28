import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Rocket,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { runtimeLogger } from '../lib/runtimeLogger';

const cardStyle = {
  width: '100%',
  maxWidth: '480px',
  borderRadius: '20px',
  padding: '32px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  textAlign: 'center' as const,
};

const getContinueDestination = (continueUrl: string | null, fallbackPath: string) => {
  if (!continueUrl) {
    return fallbackPath;
  }

  try {
    return new URL(continueUrl, window.location.origin).toString();
  } catch {
    return continueUrl;
  }
};

const getFriendlyResetError = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  switch (code) {
    case 'auth/expired-action-code':
      return 'This reset link has expired. Please request a fresh password reset email.';
    case 'auth/invalid-action-code':
      return 'This reset link is invalid or has already been used. Please request a new one.';
    case 'auth/weak-password':
      return 'Choose a stronger password with at least 8 characters.';
    default:
      return 'We could not reset your password right now. Please try again.';
  }
};

const StatusShell = ({
  tone,
  title,
  message,
  children,
}: {
  tone: 'default' | 'error';
  title: string;
  message: string;
  children?: React.ReactNode;
}) => (
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

    <div style={cardStyle}>
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '18px',
          margin: '0 auto 20px',
          background: tone === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(138, 43, 226, 0.14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone === 'error' ? '#fca5a5' : 'var(--primary)',
        }}
      >
        {tone === 'error' ? <AlertCircle size={28} /> : <CheckCircle2 size={28} />}
      </div>

      <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '12px' }}>{title}</h1>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>{message}</p>
      {children}
    </div>
  </div>
);

export const AuthActionPage = () => {
  const [status, setStatus] = useState<'working' | 'error' | 'reset-ready' | 'reset-success'>('working');
  const [message, setMessage] = useState('Checking this Pluto link...');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  const continueUrl = params.get('continueUrl');
  const verifyDestination = getContinueDestination(continueUrl, '/verify-email');
  const loginDestination = getContinueDestination(continueUrl, '/login');

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      if (!auth) {
        setStatus('error');
        setMessage('Firebase Authentication is not configured.');
        return;
      }

      if (!mode || !oobCode) {
        setStatus('error');
        setMessage('This Pluto link is invalid or incomplete.');
        return;
      }

      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          if (auth.currentUser) {
            await auth.currentUser.reload();
            await auth.currentUser.getIdToken(true);
          }

          if (!isActive) return;
          setStatus('reset-success');
          setMessage('Email verified. Redirecting you back to Pluto...');
          window.location.assign(verifyDestination);
          return;
        }

        if (mode === 'resetPassword') {
          const email = await verifyPasswordResetCode(auth, oobCode);
          if (!isActive) return;
          setAccountEmail(email);
          setStatus('reset-ready');
          setMessage('Choose your new password.');
          return;
        }

        setStatus('error');
        setMessage('This Pluto link type is not supported yet.');
      } catch (error) {
        runtimeLogger.warn('Auth action handling failed.', error, { mode });
        if (!isActive) return;
        setStatus('error');
        setMessage(
          mode === 'resetPassword'
            ? getFriendlyResetError(error)
            : 'We could not verify this email link. It may have expired or already been used.'
        );
      }
    };

    void run();

    return () => {
      isActive = false;
    };
  }, [loginDestination, mode, oobCode, verifyDestination]);

  const handlePasswordReset = async () => {
    if (!auth || !oobCode) return;

    if (password.length < 8) {
      setStatus('error');
      setMessage('Choose a stronger password with at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setStatus('error');
      setMessage('Passwords do not match yet. Please type them again.');
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus('reset-success');
      setMessage('Password updated. You can sign in with your new password now.');
    } catch (error) {
      runtimeLogger.warn('Password reset confirmation failed.', error);
      setStatus('error');
      setMessage(getFriendlyResetError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'working') {
    return (
      <StatusShell tone="default" title="Working on it" message={message}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <LoaderCircle size={28} className="animate-spin" />
        </div>
      </StatusShell>
    );
  }

  if (status === 'error') {
    return (
      <StatusShell tone="error" title="Action failed" message={message}>
        <a
          href={mode === 'resetPassword' ? loginDestination : verifyDestination}
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
      </StatusShell>
    );
  }

  if (status === 'reset-success') {
    return (
      <StatusShell tone="default" title="All set" message={message}>
        <a
          href={mode === 'resetPassword' ? loginDestination : verifyDestination}
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
          {mode === 'resetPassword' ? 'Go to login' : 'Back to Pluto'}
        </a>
      </StatusShell>
    );
  }

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

      <div style={cardStyle}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '18px',
            margin: '0 auto 20px',
            background: 'rgba(138, 43, 226, 0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary)',
          }}
        >
          <CheckCircle2 size={28} />
        </div>

        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '12px' }}>Reset your password</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px' }}>
          {message}
        </p>
        {accountEmail && (
          <p style={{ color: '#e5e7eb', fontSize: '0.92rem', marginBottom: '24px' }}>
            Updating access for <strong>{accountEmail}</strong>
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <input
              required
              type={showPassword ? 'text' : 'password'}
              placeholder="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '1rem',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#666',
                cursor: 'pointer',
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <input
            required
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '1rem',
              outline: 'none',
            }}
          />

          <button
            type="button"
            onClick={() => void handlePasswordReset()}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '8px',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isSubmitting ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
};
