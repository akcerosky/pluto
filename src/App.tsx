import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/useApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { auth } from './lib/firebase';
import { ThemeProvider } from './context/ThemeContext';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const AuthPages = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.AuthPages })));
const LearningShell = lazy(() =>
  import('./components/Learning/LearningShell').then((module) => ({ default: module.LearningShell }))
);
const MainLayout = lazy(() => import('./components/Layout/MainLayout').then((module) => ({ default: module.MainLayout })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const PolicyPage = lazy(() => import('./pages/PolicyPages').then((module) => ({ default: module.PolicyPage })));
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage }))
);
const AuthActionPage = lazy(() =>
  import('./pages/AuthActionPage').then((module) => ({ default: module.AuthActionPage }))
);

const RouteFallback = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--background)',
      color: 'var(--foreground)',
      fontWeight: 700,
    }}
  >
    Loading Pluto...
  </div>
);

const ShellRouteFallback = () => (
  <div
    style={{
      flex: 1,
      display: 'grid',
      placeItems: 'center',
      background: 'var(--background)',
      color: 'var(--foreground)',
      fontWeight: 700,
    }}
  >
    Loading Pluto...
  </div>
);

const LazyRoute = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<RouteFallback />}>{children}</Suspense>
);

const AppRoutes = () => {
  const { isCloudHydrated, isSubscriptionHydrated, user } = useApp();
  const isGoogleUser = Boolean(
    auth?.currentUser?.providerData.some((provider) => provider.providerId === 'google.com')
  );
  // Firebase Google accounts are trusted identity providers and are typically marked verified.
  // We still allow them through explicitly so a provider metadata edge case does not block chat access.
  const isVerifiedUser = Boolean(user && (user.emailVerified || isGoogleUser));
  const canAccessApp = isVerifiedUser;
  const needsVerification = Boolean(user && !isVerifiedUser);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LazyRoute><LandingPage /></LazyRoute>} />
      <Route path="/login" element={user ? <Navigate to={needsVerification ? '/verify-email' : '/chat'} replace /> : <LazyRoute><AuthPages mode="login" /></LazyRoute>} />
      <Route path="/signup" element={user ? <Navigate to={needsVerification ? '/verify-email' : '/chat'} replace /> : <LazyRoute><AuthPages mode="signup" /></LazyRoute>} />
      <Route path="/verify-email" element={<LazyRoute><VerifyEmailPage /></LazyRoute>} />
      <Route path="/__/auth/action" element={<LazyRoute><AuthActionPage /></LazyRoute>} />
      <Route path="/terms" element={<LazyRoute><PolicyPage type="terms" /></LazyRoute>} />
      <Route path="/refund" element={<LazyRoute><PolicyPage type="refund" /></LazyRoute>} />
      <Route path="/privacy" element={<LazyRoute><PolicyPage type="privacy" /></LazyRoute>} />

      {/* Private Chat Routes */}
      <Route 
        path="/chat" 
        element={
          canAccessApp ? (
            <LazyRoute>
              <ErrorBoundary>
                <MainLayout>
                  {isSubscriptionHydrated && isCloudHydrated ? (
                    <LearningShell />
                  ) : (
                    <ShellRouteFallback />
                  )}
                </MainLayout>
              </ErrorBoundary>
            </LazyRoute>
          ) : (
            <Navigate to={needsVerification ? '/verify-email' : '/login'} replace />
          )
        } 
      />
      <Route 
        path="/profile" 
        element={
          canAccessApp ? (
            <LazyRoute>
              <MainLayout>
                <ProfilePage />
              </MainLayout>
            </LazyRoute>
          ) : (
            <Navigate to={needsVerification ? '/verify-email' : '/login'} replace />
          )
        } 
      />
      
      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppProvider>
          <Router>
            <AppRoutes />
            <CookieConsentBanner />
          </Router>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
