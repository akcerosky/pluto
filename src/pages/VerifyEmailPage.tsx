import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { sendEmailVerification } from 'firebase/auth';
import { LoaderCircle, Mail, RefreshCw, Rocket } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useApp } from '../context/useApp';
import { getEmailVerificationActionCodeSettings } from '../lib/authActionCode';
import { runtimeLogger } from '../lib/runtimeLogger';

export const VerifyEmailPage = () => {
  const { refreshServerState, startNewChat, updateUser, user } = useApp();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompletingAccess, setIsCompletingAccess] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const completeVerifiedAccess = async () => {
    if (isCompletingAccess) {
      return;
    }

    setIsCompletingAccess(true);
    setNotice('Email verified. Loading your Pluto workspace...');

    try {
      startNewChat();
      await refreshServerState();
      navigate('/chat', { replace: true });
    } catch (error) {
      runtimeLogger.warn('Unable to warm Pluto workspace after email verification.', error);
      navigate('/chat', { replace: true });
    } finally {
      setIsCompletingAccess(false);
    }
  };

  const handleResend = async () => {
    if (!auth?.currentUser) return;
    setIsSending(true);
    setNotice(null);
    try {
      const actionCodeSettings = getEmailVerificationActionCodeSettings();
      await sendEmailVerification(auth.currentUser, actionCodeSettings);
      setNotice('Verification email sent. Check your inbox for the latest link.');
    } catch (error) {
      runtimeLogger.warn('Unable to resend verification email.', error);
      setNotice('Unable to send verification email right now. Please try again in a moment.');
    } finally {
      setIsSending(false);
    }
  };

  const handleRefresh = async () => {
    if (!auth?.currentUser) return;
    setIsRefreshing(true);
    setNotice(null);
    try {
      if (user.emailVerified) {
        await completeVerifiedAccess();
        return;
      }

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await auth.currentUser?.reload();
        await auth.currentUser?.getIdToken(true);
        const fresh = auth.currentUser;
        const verified = fresh?.emailVerified === true;
        updateUser({ emailVerified: verified });
        if (verified) {
          await completeVerifiedAccess();
          return;
        }

        if (attempt < 9) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      setNotice('Still waiting, please make sure you clicked the link in the email.');
    } catch (error) {
      runtimeLogger.warn('Unable to refresh email verification status.', error);
      setNotice('Could not refresh verification status right now.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="status-shell">
      <Link to="/" style={{ marginBottom: '36px', color: 'var(--text-primary)', textDecoration: 'none' }}>
        <div className="auth-logo-chip">
          <Rocket size={20} color="var(--user-bubble-text)" />
        </div>
      </Link>

      <div className="status-card-shell" style={{ width: '100%', maxWidth: '460px' }}>
        <div className="status-icon-badge default">
          <Mail size={28} />
        </div>

        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '12px' }}>Verify your email</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
          Check your inbox and click the verification link to unlock Pluto chat access.
        </p>
        <p style={{ color: 'var(--text-primary)', fontSize: '0.92rem', marginBottom: '24px' }}>
          Signed in as <strong>{user.email}</strong>
        </p>

        {notice && (
          <div
            style={{
              marginBottom: '18px',
              padding: '12px',
              borderRadius: '12px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
            }}
          >
            {notice}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleResend}
            disabled={isSending}
            className="outline-button"
            style={{ padding: '0 18px' }}
          >
            {isSending ? 'Sending...' : 'Resend email'}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || isCompletingAccess}
            className="app-button"
            style={{ padding: '0 18px' }}
          >
            <RefreshCw size={16} />
            {isRefreshing || isCompletingAccess
              ? 'Checking...'
              : user.emailVerified
                ? 'Continue to Pluto'
                : 'I verified'}
          </button>
        </div>
        {isCompletingAccess && (
          <div
            style={{
              marginTop: '18px',
              display: 'flex',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <LoaderCircle size={18} className="animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};
