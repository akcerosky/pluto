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
  const { projects, createProject, threads, assignThreadToProject, currentPlan, planConfig } = useApp();
  const [newProjectName, setNewProjectName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const activeThread = threads.find(t => t.id === activeThreadId);

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
    <div className="project-modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-card project-modal-card"
        style={{
          width: '100%',
          maxWidth: '500px',
          padding: '32px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: '24px', right: '24px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>

        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '8px' }}>Projects</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {activeThreadId ? `Organize "${activeThread?.title}" into a project.` : 'Manage your learning spaces.'}
          </p>
          <p style={{ color: '#f59e0b', fontSize: '0.8rem', marginTop: '8px' }}>
            {planConfig.maxProjects === null
              ? `${currentPlan} plan: unlimited projects`
              : `${currentPlan} plan: ${projects.length}/${planConfig.maxProjects} projects used`}
          </p>
        </div>

        <div className="project-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
          {/* Unassigned Option (if moving a thread) */}
          {activeThreadId && (
            <button
              onClick={() => handleAssign(null)}
              style={projectItemStyle(activeThread?.projectId === undefined)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Folder size={18} color="var(--text-secondary)" />
                <span>Unassigned</span>
              </div>
              {!activeThread?.projectId && <Check size={18} color="var(--primary)" />}
            </button>
          )}

          {projects.map(project => (
            <button
              key={project.id}
              onClick={() => activeThreadId ? handleAssign(project.id) : null}
              style={projectItemStyle(activeThread?.projectId === project.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: project.color }} />
                <span>{project.name}</span>
              </div>
              {activeThread?.projectId === project.id && <Check size={18} color="var(--primary)" />}
            </button>
          ))}

          {projects.length === 0 && !showCreate && (
             <p style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No projects created yet.</p>
          )}
        </div>

        <AnimatePresence>
          {showCreate ? (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="project-create-row"
              style={{ display: 'flex', gap: '12px' }}
            >
              <input 
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Project name..."
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: 'white',
                  outline: 'none'
                }}
              />
              <button 
                onClick={handleCreate}
                style={{ padding: '0 20px', borderRadius: '12px', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: '600', cursor: 'pointer' }}
              >
                Create
              </button>
            </motion.div>
          ) : (
            <button
              onClick={() => {
                setCreateError(null);
                setShowCreate(true);
              }}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px', 
                padding: '14px', 
                borderRadius: '12px', 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px dashed var(--card-border)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
            >
              <Plus size={18} />
              <span>New Project</span>
            </button>
          )}
        </AnimatePresence>
        {createError && (
          <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginTop: '-8px' }}>{createError}</p>
        )}
      </motion.div>
    </div>
  );
};

const projectItemStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderRadius: '12px',
  background: isActive ? 'rgba(138, 43, 226, 0.1)' : 'rgba(255,255,255,0.03)',
  border: `1px solid ${isActive ? 'rgba(138, 43, 226, 0.3)' : 'transparent'}`,
  color: isActive ? 'white' : 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'all 0.2s',
  textAlign: 'left',
  width: '100%'
});
