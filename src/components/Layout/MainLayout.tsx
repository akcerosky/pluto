import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useApp } from '../../context/useApp';
import { Navigate } from 'react-router-dom';
import { Menu, Rocket } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { getEmailVerificationActionCodeSettings } from '../../lib/authActionCode';
import { runtimeLogger } from '../../lib/runtimeLogger';

const useIsMobileShell = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const update = () => setIsMobile(media.matches);

    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isMobile;
};

export const MainLayout = ({ children }: { children: ReactNode }) => {
  const { user, updateUser } = useApp();
  const isMobile = useIsMobileShell();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isDrawerVisible = isMobile && isMobileSidebarOpen;
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleResendVerification = async () => {
    if (!auth?.currentUser) return;
    setIsSendingVerification(true);
    setVerificationNotice(null);
    try {
      const actionCodeSettings = getEmailVerificationActionCodeSettings();
      await sendEmailVerification(auth.currentUser, actionCodeSettings);
      setVerificationNotice('Verification email sent. Check your inbox for the latest link.');
    } catch (error) {
      runtimeLogger.warn('Unable to send verification email.', error);
      setVerificationNotice('Unable to send verification email right now. Please try again in a moment.');
    } finally {
      setIsSendingVerification(false);
    }
  };

  const handleRefreshVerification = async () => {
    if (!auth?.currentUser) return;
    setVerificationNotice(null);
    try {
      await auth.currentUser.reload();
      updateUser({ emailVerified: auth.currentUser.emailVerified });
      if (!auth.currentUser.emailVerified) {
        setVerificationNotice('Still waiting for verification. Open the email link, then click refresh again.');
      }
    } catch (error) {
      runtimeLogger.warn('Could not refresh verification status.', error);
      setVerificationNotice('Could not refresh verification status right now.');
    }
  };

  return (
    <div
      className="app-shell"
      style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      overflow: 'hidden',
      background: 'var(--background)',
      color: 'var(--foreground)'
    }}>
      <div className="mobile-topbar mobile-only">
        <button
          className="mobile-menu-button"
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <div className="mobile-topbar-brand">
          <Rocket size={18} />
          <span>PLUTO</span>
        </div>
      </div>

      {isDrawerVisible && (
        <button
          className="mobile-sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        isMobile={isMobile}
        isMobileOpen={isDrawerVisible}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      <main
        className="app-main"
        style={{ 
        flex: 1, 
        position: 'relative', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {!user.emailVerified && (
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--warning-soft)',
              color: 'var(--warning)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: '0.92rem' }}>
              Verify your email to secure your Pluto account and keep recovery options available.
              {verificationNotice && (
                <span style={{ marginLeft: '10px', color: 'var(--warning)' }}>{verificationNotice}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isSendingVerification}
                className="outline-button"
                style={{ minHeight: '36px', padding: '0 12px', fontSize: '0.85rem' }}
              >
                {isSendingVerification ? 'Sending...' : 'Resend email'}
              </button>
              <button
                type="button"
                onClick={handleRefreshVerification}
                className="app-button"
                style={{ minHeight: '36px', padding: '0 12px', fontSize: '0.85rem' }}
              >
                I verified
              </button>
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};
