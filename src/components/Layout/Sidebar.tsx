import { useApp } from '../../context/useApp';
import {
  Plus,
  MessageSquare,
  Settings,
  LayoutGrid,
  Search,
  ChevronLeft,
  Trash2,
  X,
  BookOpen,
  FileQuestion,
  Layers3,
  ScanSearch,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Suspense, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LazyProjectsModal } from '../Chat/LazyModePanels';
import { formatTokenUsageSummary } from '../../lib/tokenQuota';
import type { LearningMode } from '../../context/appContextTypes';

interface SidebarProps {
  isMobile?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar = ({
  isMobile = false,
  isMobileOpen = false,
  onCloseMobile,
}: SidebarProps) => {
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
    planConfig,
    isSubscriptionHydrated,
    remainingTodayTokens,
    estimatedMessagesLeft,
    selectedMode,
    setSelectedMode,
    dueFlashcardCount,
  } = useApp();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const navigate = useNavigate();
  const effectiveCollapsed = isMobile ? false : isCollapsed;
  const showDiscover = import.meta.env.DEV;

  const closeMobile = () => {
    if (isMobile) {
      onCloseMobile?.();
    }
  };

  const handleNewChat = () => {
    setSelectedMode('chat');
    setActiveThreadId(null);
    navigate('/chat', { state: { skipModeSelector: true } });
    closeMobile();
  };

  const filteredThreads = activeProjectId
    ? threads.filter((thread) => thread.projectId === activeProjectId)
    : threads;

  const handleComingSoon = (feature: string) => {
    alert(`${feature} feature coming soon!`);
  };

  const learningModes: Array<{
    id: LearningMode;
    label: string;
    icon: ReactNode;
    locked?: boolean;
    badgeCount?: number;
  }> = [
    { id: 'chat', label: 'Chat', icon: <BookOpen size={19} /> },
    {
      id: 'questionPaper',
      label: 'Question Paper',
      icon: <FileQuestion size={19} />,
      locked: !planConfig.features.learningFeatures,
    },
    {
      id: 'flashcards',
      label: 'Flash Cards',
      icon: <Layers3 size={19} />,
      locked: !planConfig.features.learningFeatures,
      badgeCount: dueFlashcardCount,
    },
    {
      id: 'pdfQuestionPaper',
      label: 'PDF to Question Paper',
      icon: <ScanSearch size={19} />,
      locked: !planConfig.features.learningFeatures,
    },
  ];

  const handleSelectLearningMode = (mode: LearningMode, locked?: boolean) => {
    if (locked) {
      navigate('/profile');
      closeMobile();
      return;
    }

    setSelectedMode(mode);
    navigate('/chat', { state: { skipModeSelector: true } });
    closeMobile();
  };

  return (
    <motion.aside
      className={`app-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}
      initial={false}
      animate={{ width: effectiveCollapsed ? 82 : 296 }}
      style={{
        height: '100%',
        background: 'var(--sidebar-gradient)',
        borderRight: '1px solid var(--glass-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 20,
        boxShadow: 'var(--glass-shadow-lg)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
      <div
        style={{
          padding: '24px 18px 18px',
          borderBottom: '1px solid var(--glass-border)',
          position: 'relative',
          background: 'color-mix(in srgb, var(--glass-bg) 78%, rgba(108, 63, 197, 0.08))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : 0 }}>
          <motion.button
            data-testid="new-chat-button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            onClick={handleNewChat}
            className="app-button"
            style={{
              width: '100%',
              padding: effectiveCollapsed ? '0 14px' : '0 16px',
              borderRadius: '16px',
              justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 12px 28px rgba(108, 63, 197, 0.32)',
              flex: 1,
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

      <div
        style={{
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {learningModes.map((mode) => {
          const isActive = selectedMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => handleSelectLearningMode(mode.id, mode.locked)}
              className="sidebar-link"
              style={{
                justifyContent: effectiveCollapsed ? 'center' : 'space-between',
                background: isActive
                  ? 'color-mix(in srgb, var(--primary) 14%, var(--glass-bg-active))'
                  : undefined,
                border: isActive
                  ? '1px solid color-mix(in srgb, var(--primary) 30%, var(--glass-border))'
                  : undefined,
                color: mode.locked ? 'var(--text-secondary)' : isActive ? 'var(--text-primary)' : undefined,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  minWidth: 0,
                }}
              >
                <span className="sidebar-link-icon">{mode.icon}</span>
                {!effectiveCollapsed && <span>{mode.label}</span>}
              </span>
              {!effectiveCollapsed ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {mode.badgeCount && mode.badgeCount > 0 ? (
                    <span
                      style={{
                        borderRadius: '999px',
                        padding: '4px 8px',
                        background: 'var(--warning-soft)',
                        color: 'var(--warning)',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                      }}
                    >
                      {mode.badgeCount}
                    </span>
                  ) : null}
                  {mode.locked ? <Lock size={14} /> : null}
                </span>
              ) : null}
            </motion.button>
          );
        })}
        <SidebarLink
          icon={<LayoutGrid size={19} />}
          label="Projects"
          isCollapsed={effectiveCollapsed}
          onClick={() => setIsProjectsOpen(true)}
        />
        {showDiscover ? (
          <SidebarLink
            icon={<Search size={19} />}
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
        <div
          style={{
            padding: '0 12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {projects.map((project) => {
            const isActive = activeProjectId === project.id;

            return (
              <motion.button
                key={project.id}
                whileHover={{ y: -1 }}
                onClick={() => {
                  const nextProjectId = activeProjectId === project.id ? null : project.id;
                  setActiveProjectId(nextProjectId);
                  setActiveThreadId(null);
                  navigate('/chat');
                  closeMobile();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '14px',
                  background: isActive
                    ? 'color-mix(in srgb, rgba(108, 63, 197, 0.2) 70%, var(--glass-bg-active))'
                    : 'var(--glass-bg-subtle)',
                  border: `1px solid ${isActive ? 'color-mix(in srgb, var(--primary) 38%, var(--glass-border))' : 'var(--glass-border)'}`,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '3px',
                    background: project.color,
                    boxShadow: `0 0 0 3px color-mix(in srgb, ${project.color} 18%, transparent)`,
                  }}
                />
                <span
                  style={{
                    fontSize: '0.83rem',
                    fontWeight: '600',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {project.name}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      <div
        style={{
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {!effectiveCollapsed && (
          <div
            style={{
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
              padding: '8px 12px',
              letterSpacing: '0.12em',
              fontWeight: '800',
            }}
          >
            RECENT CHATS
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {filteredThreads.map((thread) => {
            const isActive = activeThreadId === thread.id;

            return (
              <motion.div
                key={thread.id}
                data-testid={`thread-item-${thread.id}`}
                className={`sidebar-thread-item ${isActive ? 'active' : ''}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                whileHover={{ y: -1 }}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  navigate('/chat');
                  closeMobile();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    overflow: 'hidden',
                    marginLeft: isActive ? '6px' : '0',
                  }}
                >
                  <MessageSquare size={16} color={isActive ? 'var(--primary)' : 'currentColor'} />
                  {!effectiveCollapsed && (
                    <span
                      style={{
                        fontSize: '0.84rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: isActive ? 'var(--text-primary)' : 'inherit',
                      }}
                    >
                      {thread.title}
                    </span>
                  )}
                </div>
                {!effectiveCollapsed && isActive && (
                  <button
                    aria-label={`Delete thread ${thread.title}`}
                    data-testid={`delete-thread-${thread.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteThread(thread.id);
                    }}
                    className="ghost-button"
                    style={{
                      minHeight: '30px',
                      width: '30px',
                      padding: 0,
                      borderRadius: '10px',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div
        style={{
          padding: '14px 18px',
          borderTop: '1px solid var(--glass-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: 'var(--glass-bg-medium)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            navigate('/profile');
            closeMobile();
          }}
          className="sidebar-profile-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            justifyContent: effectiveCollapsed ? 'center' : 'space-between',
            width: '100%',
            minHeight: '52px',
            maxHeight: '52px',
            padding: effectiveCollapsed ? '0' : '10px 12px',
            borderRadius: '16px',
            background: effectiveCollapsed ? 'transparent' : 'var(--glass-bg)',
            border: effectiveCollapsed ? '1px solid transparent' : '1px solid var(--glass-border)',
            boxShadow: effectiveCollapsed ? 'none' : 'var(--glass-inner-glow), var(--glass-shadow)',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '999px',
                background: 'var(--action-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--action-text)',
                fontWeight: '800',
                fontSize: '0.82rem',
                border: '1px solid var(--action-border)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
                flexShrink: 0,
              }}
            >
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            {!effectiveCollapsed && (
              <div
                style={{
                  overflow: 'hidden',
                  minWidth: 0,
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    color: 'var(--text-primary)',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user?.name || 'Pluto user'}
                </div>
                <span className="pill pill-primary" style={{ flex: '0 0 auto' }}>
                  {isSubscriptionHydrated ? currentPlan : 'Syncing'}
                </span>
              </div>
            )}
          </div>
          {!effectiveCollapsed && (
            <span
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--glass-bg-subtle)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)',
                flex: '0 0 auto',
                backdropFilter: 'blur(12px)',
              }}
            >
              <Settings size={15} />
            </span>
          )}
        </button>
        {!effectiveCollapsed && (
          <div
            style={{
              fontSize: '0.78rem',
              lineHeight: 1.35,
              color: 'var(--warning)',
              fontWeight: '700',
              padding: '0 4px',
              textAlign: 'center',
              width: '100%',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isSubscriptionHydrated
              ? formatTokenUsageSummary(remainingTodayTokens, estimatedMessagesLeft)
              : 'Syncing subscription...'}
          </div>
        )}
      </div>
      </div>

      <button
        className="app-sidebar-collapse"
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          position: 'absolute',
          right: '-12px',
          top: '50%',
          width: '24px',
          height: '24px',
          borderRadius: '999px',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          zIndex: 30,
          boxShadow: 'var(--glass-shadow)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <ChevronLeft
          size={14}
          style={{
            transform: effectiveCollapsed ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--page-transition)',
          }}
        />
      </button>

      <Suspense fallback={null}>
        <LazyProjectsModal isOpen={isProjectsOpen} onClose={() => setIsProjectsOpen(false)} />
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
    whileHover={{ x: 2 }}
    whileTap={{ scale: 0.985 }}
    onClick={onClick}
    className="sidebar-link"
    style={{
      justifyContent: isCollapsed ? 'center' : 'flex-start',
    }}
  >
    <span className="sidebar-link-icon">{icon}</span>
    {!isCollapsed && <span>{label}</span>}
  </motion.button>
);
