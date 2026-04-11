import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useApp } from '../../context/AppContext';
import { Navigate } from 'react-router-dom';

export const MainLayout = ({ children }: { children: ReactNode }) => {
  const { user } = useApp();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      overflow: 'hidden',
      background: 'var(--background)',
      color: 'var(--foreground)'
    }}>
      <Sidebar />
      <main style={{ 
        flex: 1, 
        position: 'relative', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {children}
      </main>
    </div>
  );
};
