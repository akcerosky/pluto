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
  borderRadius: '24px',
  padding: '32px',
  textAlign: 'center' as const,
};

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  background: 'var(--input-bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  color: 'var(--text-primary)',
  fontSize: '1rem',
  outline: 'none',
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
  <div className="status-shell">
    <Link to="/" style={{ marginBottom: '36px', color: 'var(--text-primary)', textDecoration: 'none' }}>
      <div className="auth-logo-chip">
        <Rocket size={20} color="var(--user-bubble-text)" />
      </div>
    </Link>

    <div className="status-card-shell" style={cardStyle}>
      <div className={`status-icon-badge ${tone}`}>
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
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

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

  useEffect(() => {
    if (status !== 'reset-success' || mode !== 'resetPassword' || redirectCountdown === null) {
      return;
    }

    if (redirectCountdown <= 0) {
      window.location.assign(loginDestination);
      return;
    }

    const timer = window.setTimeout(() => {
      setRedirectCountdown((current) => (current === null ? current : current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loginDestination, mode, redirectCountdown, status]);

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
      setRedirectCountdown(2);
      setStatus('reset-success');
      setMessage('Password updated. Redirecting to login...');
    } catch (error) {
      runtimeLogger.warn('Password reset confirmation failed.', error);
      setRedirectCountdown(null);
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
          className="app-button"
          style={{ textDecoration: 'none', padding: '0 18px' }}
        >
          Back to Pluto
        </a>
      </StatusShell>
    );
  }

  if (status === 'reset-success') {
    const successMessage =
      mode === 'resetPassword' && redirectCountdown !== null
        ? `${message} Redirecting in ${redirectCountdown}...`
        : message;

    return (
      <StatusShell
        tone="default"
        title={mode === 'resetPassword' ? 'Password updated' : 'All set'}
        message={successMessage}
      >
        {mode !== 'resetPassword' && (
          <a
            href={verifyDestination}
            className="app-button"
            style={{ textDecoration: 'none', padding: '0 18px' }}
          >
            Back to Pluto
          </a>
        )}
      </StatusShell>
    );
  }

  return (
    <div className="status-shell">
      <Link to="/" style={{ marginBottom: '36px', color: 'var(--text-primary)', textDecoration: 'none' }}>
        <div className="auth-logo-chip">
          <Rocket size={20} color="var(--user-bubble-text)" />
        </div>
      </Link>

      <div className="status-card-shell" style={cardStyle}>
        <div className="status-icon-badge default">
          <CheckCircle2 size={28} />
        </div>

        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '12px' }}>Reset your password</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px' }}>{message}</p>
        {accountEmail && (
          <p style={{ color: 'var(--text-primary)', fontSize: '0.92rem', marginBottom: '24px' }}>
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
              style={{ ...inputStyle, paddingRight: '52px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="ghost-button"
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                minHeight: '32px',
                width: '32px',
                padding: 0,
                borderRadius: '999px',
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
            style={inputStyle}
          />

          <button
            type="button"
            onClick={() => void handlePasswordReset()}
            disabled={isSubmitting}
            className="app-button"
            style={{ width: '100%' }}
          >
            {isSubmitting ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
};
