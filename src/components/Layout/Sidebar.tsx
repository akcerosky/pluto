import { useApp } from '../../context/useApp';
import { 
  Plus, 
  MessageSquare, 
  Settings, 
  LogOut, 
  LayoutGrid, 
  Search,
  ChevronLeft,
  Trash2,
  X,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LazyProjectsModal } from '../Chat/LazyModePanels';
import { formatTokenUsageSummary } from '../../lib/tokenQuota';

interface SidebarProps {
  isMobile?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const getNextIstResetLabel = () => {
  const now = new Date();
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(istParts.find((part) => part.type === 'year')?.value);
  const month = Number(istParts.find((part) => part.type === 'month')?.value);
  const day = Number(istParts.find((part) => part.type === 'day')?.value);
  const nextIstMidnightUtc = Date.UTC(year, month - 1, day + 1, -5, -30);
  const resetDate = new Date(nextIstMidnightUtc);
  const formattedReset = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(resetDate);

  return `Daily limit resets at ${formattedReset} IST`;
};

export const Sidebar = ({ isMobile = false, isMobileOpen = false, onCloseMobile }: SidebarProps) => {
  const { 
    threads,
    activeThreadId, 
    setActiveThreadId, 
    deleteThread,
    projects,
    activeProjectId,
    setActiveProjectId,
    user,
    currentPlan,
    isSubscriptionHydrated,
    remainingTodayTokens,
    estimatedMessagesLeft,
    logout 
  } = useApp();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isUsageResetVisible, setIsUsageResetVisible] = useState(false);
  const usageResetRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const effectiveCollapsed = isMobile ? false : isCollapsed;
  const usageResetTitle = getNextIstResetLabel();
  const showDiscover = import.meta.env.VITE_APP_ENV !== 'production';
  const closeMobile = () => {
    if (isMobile) onCloseMobile?.();
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!usageResetRef.current?.contains(event.target as Node)) {
        setIsUsageResetVisible(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const handleNewChat = () => {
    setActiveThreadId(null);
    navigate('/chat');
    closeMobile();
  };
  
  const filteredThreads = activeProjectId 
    ? threads.filter(t => t.projectId === activeProjectId)
    : threads;

  const handleComingSoon = (feature: string) => {
    alert(`${feature} feature coming soon!`);
  };

  return (
    <motion.aside
      className={`app-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}
      initial={false}
      animate={{ width: effectiveCollapsed ? 80 : 280 }}
      style={{
        height: '100%',
        background: 'rgba(5, 5, 20, 0.4)',
        backdropFilter: 'blur(10px)',
        borderRight: '1px solid var(--card-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 20
      }}
    >
      {/* Header / New Chat */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--card-border)', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '12px' : 0,
          }}
        >
        <motion.button
          data-testid="new-chat-button"
          whileHover={{ scale: 1.02, boxShadow: '0 0 20px var(--primary-glow)' }}
          whileTap={{ scale: 0.98 }}
          onClick={handleNewChat}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--primary), #6a1b9a)',
            color: 'white',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
            gap: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px var(--primary-glow)',
            flex: 1
          }}
        >
          <Plus size={20} />
          {!effectiveCollapsed && <span>New Chat</span>}
        </motion.button>
        {isMobile && (
          <button
            className="app-sidebar-mobile-close"
            type="button"
            onClick={closeMobile}
            aria-label="Close navigation"
            style={{ display: 'flex', margin: 0, flex: '0 0 52px' }}
          >
            <X size={18} />
          </button>
        )}
        </div>
      </div>

      {/* Navigation Links */}
      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
         <SidebarLink 
          icon={<LayoutGrid size={20} />} 
          label="Projects" 
          isCollapsed={effectiveCollapsed} 
          onClick={() => setIsProjectsOpen(true)}
        />
        {showDiscover ? (
          <SidebarLink 
            icon={<Search size={20} />} 
            label="Discover" 
            isCollapsed={effectiveCollapsed} 
            onClick={() => {
              handleComingSoon('Discover');
              closeMobile();
            }}
          />
        ) : null}
      </div>

      {!effectiveCollapsed && projects.length > 0 && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {projects.map(p => (
            <motion.button 
              key={p.id} 
              whileHover={{ background: 'rgba(255,255,255,0.05)' }}
              onClick={() => {
                const nextProjectId = activeProjectId === p.id ? null : p.id;
                setActiveProjectId(nextProjectId);
                setActiveThreadId(null);
                navigate('/chat');
                closeMobile();
              }}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                padding: '8px 12px', 
                borderRadius: '10px',
                background: activeProjectId === p.id ? 'rgba(138, 43, 226, 0.1)' : 'transparent',
                border: `1px solid ${activeProjectId === p.id ? 'rgba(138, 43, 226, 0.3)' : 'transparent'}`,
                color: activeProjectId === p.id ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left'
              }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: p.color }} />
              <span style={{ fontSize: '0.85rem', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Thread History */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        {!effectiveCollapsed && (
          <div style={{ 
            fontSize: '0.65rem', 
            color: 'var(--text-secondary)', 
            padding: '8px 12px',
            letterSpacing: '1px',
            fontWeight: '700'
          }}>
            RECENT CHATS
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {filteredThreads.map(thread => (
            <motion.div
              key={thread.id}
              data-testid={`thread-item-${thread.id}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              whileHover={{ background: 'var(--surface-2)' }}
              onClick={() => {
                setActiveThreadId(thread.id);
                navigate('/chat');
                closeMobile();
              }}
              style={{
                position: 'relative',
                padding: '12px 12px',
                borderRadius: '10px',
                background: activeThreadId === thread.id ? 'var(--surface-3)' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                transition: 'background 0.2s ease'
              }}
            >
              {activeThreadId === thread.id && (
                <motion.div 
                  layoutId="active-pill"
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: '3px',
                    height: '18px',
                    background: 'var(--primary)',
                    borderRadius: '0 4px 4px 0',
                    boxShadow: '0 0 10px var(--primary)'
                  }}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden', marginLeft: activeThreadId === thread.id ? '6px' : '0' }}>
                <MessageSquare size={16} color={activeThreadId === thread.id ? 'var(--primary)' : 'currentColor'} />
                {!effectiveCollapsed && <span style={{ 
                  fontSize: '0.85rem', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  color: activeThreadId === thread.id ? 'var(--foreground)' : 'var(--text-secondary)'
                }}>
                  {thread.title}
                </span>}
              </div>
              {!effectiveCollapsed && activeThreadId === thread.id && (
                <button 
                  aria-label={`Delete thread ${thread.title}`}
                  data-testid={`delete-thread-${thread.id}`}
                  onClick={(e) => { e.stopPropagation(); deleteThread(thread.id); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* User Footer */}
      <div style={{ 
        marginTop: 'auto', 
        padding: '24px 20px', 
        borderTop: '1px solid var(--card-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'rgba(0,0,0,0.2)'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          justifyContent: effectiveCollapsed ? 'center' : 'flex-start'
        }}>
          <div style={{ 
            width: '36px', 
            height: '36px', 
            borderRadius: '10px', 
            background: 'linear-gradient(45deg, var(--primary), var(--secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: '700',
            fontSize: '0.9rem',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
          }}>
            {user?.name?.[0] || 'U'}
          </div>
          {!effectiveCollapsed && (
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{user?.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4CAF50' }}></div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {isSubscriptionHydrated ? `${currentPlan} Plan` : 'Loading plan...'}
                </div>
              </div>
              <div
                ref={usageResetRef}
                onMouseEnter={() => setIsUsageResetVisible(true)}
                onMouseLeave={() => setIsUsageResetVisible(false)}
                style={{ marginTop: '3px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                  <span style={{ fontSize: '0.65rem', color: '#f59e0b', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isSubscriptionHydrated
                      ? formatTokenUsageSummary(remainingTodayTokens, estimatedMessagesLeft)
                      : 'Syncing subscription...'}
                  </span>
                  {isSubscriptionHydrated && (
                    <button
                      type="button"
                      aria-label="Show daily reset time"
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsUsageResetVisible((visible) => !visible);
                      }}
                      style={{
                        width: '15px',
                        height: '15px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#f59e0b',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        flex: '0 0 auto',
                        cursor: 'pointer',
                      }}
                    >
                      <Info size={10} />
                    </button>
                  )}
                </div>
                {isSubscriptionHydrated && isUsageResetVisible && (
                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: '0.62rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.35,
                    }}
                  >
                    {usageResetTitle}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {!effectiveCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <SidebarLink 
              icon={<Settings size={18} />} 
              label="Settings" 
              onClick={() => {
                navigate(location.pathname === '/profile' ? '/chat' : '/profile');
                closeMobile();
              }}
            />
            <button 
              onClick={() => {
                logout();
                closeMobile();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(255, 68, 68, 0.05)',
                border: 'none',
                color: '#ff4444',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 68, 68, 0.05)')}
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        className="app-sidebar-collapse"
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          position: 'absolute',
          right: '-12px',
          top: '50%',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: '#1a1a2e',
          border: '1px solid var(--card-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 30,
          boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
        }}
      >
        <ChevronLeft size={14} style={{ transform: effectiveCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
      </button>

      <Suspense fallback={null}>
        <LazyProjectsModal 
          isOpen={isProjectsOpen} 
          onClose={() => setIsProjectsOpen(false)} 
        />
      </Suspense>
    </motion.aside>
  );
};

const SidebarLink = ({
  icon,
  label,
  isCollapsed,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  isCollapsed?: boolean;
  onClick?: () => void;
}) => (
  <motion.button 
    whileHover={{ x: 4, background: 'var(--surface-2)' }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      width: '100%',
      padding: '10px 14px',
      borderRadius: '10px',
      background: 'transparent',
      border: 'none',
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: '500',
      transition: 'color 0.2s ease',
      justifyContent: isCollapsed ? 'center' : 'flex-start'
    }}
    onMouseOver={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
  >
    <span style={{ color: 'var(--primary)' }}>{icon}</span>
    {!isCollapsed && <span>{label}</span>}
  </motion.button>
);
