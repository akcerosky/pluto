import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { LandingPage } from './pages/LandingPage';
import { AuthPages } from './pages/AuthPages';
import { ChatInterface } from './components/Chat/ChatInterface';
import { MainLayout } from './components/Layout/MainLayout';
import { ProfilePage } from './pages/ProfilePage';
import { PolicyPage } from './pages/PolicyPages';

const AppRoutes = () => {

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPages mode="login" />} />
      <Route path="/signup" element={<AuthPages mode="signup" />} />
      <Route path="/T&C" element={<PolicyPage type="terms" />} />
      <Route path="/refund_policy" element={<PolicyPage type="refund" />} />
      <Route path="/privacy_policy" element={<PolicyPage type="privacy" />} />

      {/* Private Chat Routes */}
      <Route 
        path="/chat" 
        element={
          <MainLayout>
            <ChatInterface />
          </MainLayout>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <MainLayout>
            <ProfilePage />
          </MainLayout>
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
