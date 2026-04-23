import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/useApp';
import { ErrorBoundary } from './components/ErrorBoundary';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const AuthPages = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.AuthPages })));
const ChatInterface = lazy(() =>
  import('./components/Chat/ChatInterface').then((module) => ({ default: module.ChatInterface }))
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

const LazyRoute = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<RouteFallback />}>{children}</Suspense>
);

const AppRoutes = () => {
  const { user } = useApp();
  const canAccessApp = Boolean(user && user.emailVerified);
  const needsVerification = Boolean(user && !user.emailVerified);

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
                  <ChatInterface />
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
      <AppProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
