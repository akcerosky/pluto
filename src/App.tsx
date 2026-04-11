import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { LandingPage } from './pages/LandingPage';
import { AuthPages } from './pages/AuthPages';
import { ChatInterface } from './components/Chat/ChatInterface';
import { MainLayout } from './components/Layout/MainLayout';
import { ProfilePage } from './pages/ProfilePage';

const AppRoutes = () => {

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPages mode="login" />} />
      <Route path="/signup" element={<AuthPages mode="signup" />} />

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
