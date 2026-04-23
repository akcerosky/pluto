import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { sendEmailVerification } from 'firebase/auth';
import { Mail, RefreshCw, Rocket } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useApp } from '../context/useApp';
import { getEmailVerificationActionCodeSettings } from '../lib/authActionCode';

export const VerifyEmailPage = () => {
  const { user, updateUser, startNewChat } = useApp();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.emailVerified) {
    startNewChat();
    return <Navigate to="/chat" replace />;
  }

  const handleResend = async () => {
    if (!auth?.currentUser) return;
    setIsSending(true);
    setNotice(null);
    try {
      const actionCodeSettings = getEmailVerificationActionCodeSettings();
      await sendEmailVerification(auth.currentUser, actionCodeSettings);
      setNotice('Verification email sent. Check your inbox for the latest link.');
    } catch (error) {
      console.error(error);
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
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await auth.currentUser?.reload();
        await auth.currentUser?.getIdToken(true);
        const fresh = auth.currentUser;
        const verified = fresh?.emailVerified === true;
        updateUser({ emailVerified: verified });
        if (verified) {
          startNewChat();
          navigate('/chat', { replace: true });
          return;
        }

        if (attempt < 9) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      setNotice('Still waiting - please make sure you clicked the link in the email.');
    } catch (error) {
      console.error(error);
      setNotice('Could not refresh verification status right now.');
    } finally {
      setIsRefreshing(false);
    }
  };

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
          maxWidth: '460px',
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
            background: 'rgba(138, 43, 226, 0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary)',
          }}
        >
          <Mail size={28} />
        </div>

        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '12px' }}>Verify your email</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
          Check your inbox and click the verification link to unlock Pluto chat access.
        </p>
        <p style={{ color: '#e5e7eb', fontSize: '0.92rem', marginBottom: '24px' }}>
          Signed in as <strong>{user.email}</strong>
        </p>

        {notice && (
          <div
            style={{
              marginBottom: '18px',
              padding: '12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#f8fafc',
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
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {isSending ? 'Sending...' : 'Resend email'}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--primary)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <RefreshCw size={16} />
            {isRefreshing ? 'Checking...' : 'I verified'}
          </button>
        </div>
      </div>
    </div>
  );
};
