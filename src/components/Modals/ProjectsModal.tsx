import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/useApp';
import { X, Plus, Folder, Check } from 'lucide-react';

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeThreadId?: string | null;
}

export const ProjectsModal = ({ isOpen, onClose, activeThreadId }: ProjectsModalProps) => {
  const {
    projects,
    createProject,
    threads,
    assignThreadToProject,
    currentPlan,
    planConfig,
    isSubscriptionHydrated,
  } = useApp();
  const [newProjectName, setNewProjectName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    const colors = ['#8A2BE2', '#00D2FF', '#FF00C1', '#10b981', '#f59e0b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const result = createProject(newProjectName, randomColor);
    if (!result.ok) {
      setCreateError(result.reason || 'Cannot create project on current plan.');
      return;
    }
    setCreateError(null);
    setNewProjectName('');
    setShowCreate(false);
  };

  const handleAssign = (projectId: string | null) => {
    if (activeThreadId) {
      assignThreadToProject(activeThreadId, projectId);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="project-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-shell project-modal-card"
        style={{
          width: '100%',
          maxWidth: '500px',
          padding: '32px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <button
          onClick={onClose}
          className="ghost-button"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            minHeight: '36px',
            width: '36px',
            borderRadius: '999px',
            padding: 0,
          }}
        >
          <X size={18} />
        </button>

        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '8px' }}>Projects</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {activeThreadId
              ? `Organize "${activeThread?.title}" into a project.`
              : 'Manage your learning spaces.'}
          </p>
          <p style={{ color: 'var(--price-accent)', fontSize: '0.8rem', marginTop: '8px' }}>
            {isSubscriptionHydrated
              ? planConfig.maxProjects === null
                ? `${currentPlan} plan: unlimited projects`
                : `${currentPlan} plan: ${projects.length}/${planConfig.maxProjects} projects used`
              : 'Syncing plan limits...'}
          </p>
        </div>

        <div
          className="project-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: '300px',
            overflowY: 'auto',
            paddingRight: '8px',
          }}
        >
          {activeThreadId && (
            <button
              onClick={() => handleAssign(null)}
              className={`project-item ${activeThread?.projectId === undefined ? 'active' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Folder size={18} color="var(--text-secondary)" />
                <span>Unassigned</span>
              </div>
              {!activeThread?.projectId && <Check size={18} color="var(--primary)" />}
            </button>
          )}

          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => (activeThreadId ? handleAssign(project.id) : null)}
              className={`project-item ${activeThread?.projectId === project.id ? 'active' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '4px',
                    background: project.color,
                  }}
                />
                <span>{project.name}</span>
              </div>
              {activeThread?.projectId === project.id && <Check size={18} color="var(--primary)" />}
            </button>
          ))}

          {projects.length === 0 && !showCreate && (
            <p
              style={{
                textAlign: 'center',
                padding: '20px 0',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
              }}
            >
              No projects created yet.
            </p>
          )}
        </div>

        <AnimatePresence>
          {showCreate ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="project-create-row"
              style={{ display: 'flex', gap: '12px' }}
            >
              <input
                autoFocus
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
                placeholder="Project name..."
                style={{ flex: 1 }}
              />
              <button onClick={handleCreate} className="app-button" style={{ padding: '0 20px' }}>
                Create
              </button>
            </motion.div>
          ) : (
            <button
              onClick={() => {
                setCreateError(null);
                setShowCreate(true);
              }}
              className="outline-button"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                borderStyle: 'dashed',
              }}
            >
              <Plus size={18} />
              <span>New Project</span>
            </button>
          )}
        </AnimatePresence>
        {createError && (
          <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-8px' }}>{createError}</p>
        )}
      </motion.div>
    </div>
  );
};
