import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useApp } from '../../context/AppContext';
import { Navigate } from 'react-router-dom';
import { Menu, Rocket } from 'lucide-react';

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
  const { user } = useApp();
  const isMobile = useIsMobileShell();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isDrawerVisible = isMobile && isMobileSidebarOpen;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

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
        {children}
      </main>
    </div>
  );
};
