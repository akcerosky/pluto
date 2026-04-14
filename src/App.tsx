import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { LandingPage } from './pages/LandingPage';
import { AuthPages } from './pages/AuthPages';
import { ChatInterface } from './components/Chat/ChatInterface';
import { MainLayout } from './components/Layout/MainLayout';
import { ProfilePage } from './pages/ProfilePage';
import { PolicyPage } from './pages/PolicyPages';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { AuthActionPage } from './pages/AuthActionPage';
import { useApp } from './context/useApp';

const AppRoutes = () => {
  const { user } = useApp();
  const canAccessApp = Boolean(user && user.emailVerified);
  const needsVerification = Boolean(user && !user.emailVerified);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={user ? <Navigate to={needsVerification ? '/verify-email' : '/chat'} replace /> : <AuthPages mode="login" />} />
      <Route path="/signup" element={user ? <Navigate to={needsVerification ? '/verify-email' : '/chat'} replace /> : <AuthPages mode="signup" />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/__/auth/action" element={<AuthActionPage />} />
      <Route path="/terms" element={<PolicyPage type="terms" />} />
      <Route path="/refund" element={<PolicyPage type="refund" />} />
      <Route path="/privacy" element={<PolicyPage type="privacy" />} />

      {/* Private Chat Routes */}
      <Route 
        path="/chat" 
        element={
          canAccessApp ? (
            <MainLayout>
              <ChatInterface />
            </MainLayout>
          ) : (
            <Navigate to={needsVerification ? '/verify-email' : '/login'} replace />
          )
        } 
      />
      <Route 
        path="/profile" 
        element={
          canAccessApp ? (
            <MainLayout>
              <ProfilePage />
            </MainLayout>
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
    <AppProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AppProvider>
  );
}

export default App;
