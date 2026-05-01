import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/useApp';
import { useNavigate, Link } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { Rocket, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { DEFAULT_PLAN } from '../config/subscription';
import { auth } from '../lib/firebase';
import { runtimeLogger } from '../lib/runtimeLogger';
import {
  getEmailVerificationActionCodeSettings,
  getPasswordResetActionCodeSettings,
} from '../lib/authActionCode';

const toUserSession = (firebaseUser: FirebaseUser) => ({
  id: firebaseUser.uid,
  name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
  email: firebaseUser.email || '',
  emailVerified: firebaseUser.emailVerified,
  avatar: firebaseUser.photoURL || undefined,
  educationLevel: 'High School' as const,
  objective: 'General Learning',
  plan: DEFAULT_PLAN,
});

const getAuthErrorMessage = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'Account already exists. Please log in.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it completed.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase Authentication.';
    case 'auth/configuration-not-found':
      return 'Firebase Authentication is not fully configured for this project.';
    default:
      return code
        ? `Authentication failed (${code}). ${message}`
        : 'Authentication failed. Please try again.';
  }
};

export const AuthPages = ({ mode }: { mode: 'login' | 'signup' }) => {
  const { user, setUser, startNewChat } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openFreshChat = useCallback(() => {
    startNewChat();
    navigate('/chat', { replace: true });
  }, [navigate, startNewChat]);

  const openVerifyEmail = useCallback(() => {
    navigate('/verify-email', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [mode]);

  useEffect(() => {
    if (user) {
      if (user.emailVerified) {
        openFreshChat();
      } else {
        openVerifyEmail();
      }
    }
  }, [user, openFreshChat, openVerifyEmail]);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    if (!auth) {
      setError('Firebase Authentication is not configured.');
      setIsLoading(false);
      return;
    }

    try {
      let firebaseUser: FirebaseUser;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Please enter a valid email address.');
        setIsLoading(false);
        return;
      }

      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        setIsLoading(false);
        return;
      }

      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = credential.user;
        await updateProfile(firebaseUser, {
          displayName: email.split('@')[0],
        });
        const actionCodeSettings = getEmailVerificationActionCodeSettings();
        await sendEmailVerification(firebaseUser, actionCodeSettings);
        setNotice('Verification email sent. Please check your inbox to continue.');
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = credential.user;
      }

      setUser(toUserSession(firebaseUser));
      if (
        firebaseUser.providerData.some((provider) => provider.providerId === 'google.com') ||
        firebaseUser.emailVerified
      ) {
        openFreshChat();
      } else {
        openVerifyEmail();
      }
    } catch (err) {
      runtimeLogger.warn('Email/password authentication failed.', err, { mode });
      setError(getAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);

    if (!auth) {
      setError('Firebase Authentication is not configured.');
      return;
    }

    if (!email.trim()) {
      setError('Enter your email address first, then use Forgot password.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const actionCodeSettings = getPasswordResetActionCodeSettings();
      await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
      setNotice('Password reset email sent. Check your inbox for the reset link.');
    } catch (err) {
      runtimeLogger.warn('Password reset email request failed.', err);
      setError(getAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);

    if (!auth) {
      setError('Firebase Authentication is not configured.');
      setIsLoading(false);
      return;
    }

    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      setUser(toUserSession(credential.user));
      openFreshChat();
    } catch (err) {
      runtimeLogger.warn('Google sign-in failed.', err);
      setError(getAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page auth-shell">
      <Link to="/" style={{ marginBottom: '40px', color: 'var(--text-primary)', textDecoration: 'none' }}>
        <div className="auth-logo-chip">
          <Rocket size={20} color="var(--user-bubble-text)" />
        </div>
      </Link>

      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}
      >
        <div className="auth-card-shell">
          <h2 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>

          <div style={{ marginTop: '32px' }}>
            {error && (
              <motion.div className="auth-feedback error">
                <AlertCircle size={16} /> {error}
              </motion.div>
            )}

            {notice && <motion.div className="auth-feedback success">{notice}</motion.div>}

            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="secondary-button"
              style={{
                width: '100%',
                minHeight: '48px',
                marginBottom: '20px',
                gap: '12px',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            <div className="divider-row">
              <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>OR</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                required
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={inputStyle}
              />
              <div style={{ position: 'relative' }}>
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={{ ...inputStyle, paddingRight: '52px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
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
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                  style={{
                    alignSelf: 'flex-end',
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                    padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isLoading}
                className="app-button"
                style={{
                  width: '100%',
                  minHeight: '48px',
                  marginTop: '12px',
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Continue'}
              </button>
            </div>

            <div style={{ marginTop: '24px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {mode === 'login' ? (
                <>
                  Don't have an account?
                  <Link to="/signup" style={{ color: 'var(--primary)', textDecoration: 'none', marginLeft: '6px' }}>
                    Sign up
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?
                  <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none', marginLeft: '6px' }}>
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
      <p style={{ marginTop: '24px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        Registered Business Name: AKCERO PRIVATE LIMITED
      </p>
    </div>
  );
};

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: '14px',
  color: 'var(--text-primary)',
  fontSize: '1rem',
  outline: 'none',
  backdropFilter: 'blur(20px)',
};
