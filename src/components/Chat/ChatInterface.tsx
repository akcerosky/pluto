import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import type { Message } from '../../types';
import {
  Send,
  Award,
  User,
  Sparkles,
  Rocket,
  Folder,
  ChevronDown,
  X,
  MessageSquare,
  FileEdit,
  Lock,
} from 'lucide-react';
import { ProjectsModal } from '../Modals/ProjectsModal';
import { ConversationalModeUI, HomeworkModeUI, ExamPrepUI } from '../Modes/ModeSpecializations';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { getPlutoResponse } from '../../hooks/useAI';

export const ChatInterface = () => {
  const {
    user,
    threads,
    activeThreadId,
    addMessageToThread,
    createThread,
    projects,
    activeProjectId,
    setActiveProjectId,
    currentPlan,
    planConfig,
    dailyLimit,
    remainingToday,
    canSendMessage,
    canUseMode,
  } = useApp();

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const assignedProject = projects.find((p) => p.id === activeThread?.projectId);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [activeThread?.messages]);

  if (!activeThread) {
    return (
      <div className="chat-empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="glass-card chat-empty-card"
          style={{ padding: '60px 40px', maxWidth: '600px' }}
        >
          <motion.div
            animate={{
              y: [0, -10, 0],
              filter: ['drop-shadow(0 0 10px var(--primary-glow))', 'drop-shadow(0 0 25px var(--primary-glow))', 'drop-shadow(0 0 10px var(--primary-glow))'],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: '100px',
              height: '100px',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              borderRadius: '30px',
              margin: '0 auto 32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
          >
            <Rocket size={50} color="white" />
          </motion.div>
          <h2 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '16px', letterSpacing: '-1px' }}>Welcome back, Astronaut.</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '40px' }}>
            Ready to continue your learning journey? Select a past conversation or start a new one to begin.
          </p>
          <div className="chat-empty-modes" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
            <motion.button
              whileHover={{ y: -5, background: 'rgba(138, 43, 226, 0.1)' }}
              onClick={() => createThread('Conversational', activeProjectId || undefined)}
              style={modeCardStyle}
            >
              <MessageSquare size={28} />
              <span>Exploration</span>
            </motion.button>
            <motion.button
              whileHover={{ y: -5, background: 'rgba(0, 210, 255, 0.1)' }}
              onClick={() => (canUseMode('Homework') ? createThread('Homework', activeProjectId || undefined) : setPlanNotice('Homework mode is available on Plus and Pro plans.'))}
              style={{ ...modeCardStyle, borderColor: 'rgba(0, 210, 255, 0.3)', color: 'var(--secondary)' }}
            >
              <FileEdit size={28} />
              <span>{canUseMode('Homework') ? 'Homework' : 'Homework (Plus)'}</span>
            </motion.button>
            <motion.button
              whileHover={{ y: -5, background: 'rgba(255, 0, 193, 0.1)' }}
              onClick={() => (canUseMode('ExamPrep') ? createThread('ExamPrep', activeProjectId || undefined) : setPlanNotice('Exam Prep mode is available on Plus and Pro plans.'))}
              style={{ ...modeCardStyle, borderColor: 'rgba(255, 0, 193, 0.3)', color: 'var(--accent)' }}
            >
              <Award size={28} />
              <span>{canUseMode('ExamPrep') ? 'Exam Prep' : 'Exam Prep (Plus)'}</span>
            </motion.button>
          </div>
          {planNotice && <p style={{ marginTop: '18px', color: '#fbbf24', fontSize: '0.9rem' }}>{planNotice}</p>}
          {activeProjectId && (
            <button
              onClick={() => setActiveProjectId(null)}
              style={{ marginTop: '32px', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <X size={14} /> Clear project focus ({projects.find((p) => p.id === activeProjectId)?.name})
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const access = canSendMessage(input, activeThread.mode);
    if (!access.ok) {
      setPlanNotice(access.reason || 'Upgrade required to continue.');
      const blockedMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `## Upgrade Required\n\n${access.reason}\n\nSwitch to **Plus** or **Pro** from Profile to continue.`,
        mode: activeThread.mode,
        timestamp: Date.now(),
      };
      addMessageToThread(activeThread.id, blockedMsg);
      return;
    }

    setPlanNotice(null);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      mode: activeThread.mode,
      timestamp: Date.now(),
    };

    addMessageToThread(activeThread.id, userMsg);
    setInput('');
    setIsLoading(true);

    try {
      const history = activeThread.messages.slice(-planConfig.historyWindow).map((m) => ({ role: m.role, content: m.content }));
      const aiResponse = await getPlutoResponse(input, user?.educationLevel || 'High School', activeThread.mode, user?.objective || 'General Learning', history, currentPlan);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        mode: activeThread.mode,
        timestamp: Date.now(),
      };
      addMessageToThread(activeThread.id, assistantMsg);
    } catch (error: any) {
      console.error('AI Error:', error);
      const errorText = `Pluto Error: ${error.message || 'Gravity glitch detected.'}`;

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorText,
        mode: activeThread.mode,
        timestamp: Date.now(),
      };
      addMessageToThread(activeThread.id, errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const modeIcons = {
    Conversational: <MessageSquare size={18} />,
    Homework: <FileEdit size={18} />,
    ExamPrep: <Award size={18} />,
  };

  const handleQuickAction = (action: string) => {
    let prompt = action;
    if (action.includes('Story')) prompt = "Tell me a fun story about what we're learning!";
    else if (action.includes('Why?')) prompt = 'Why is this important to know?';
    else if (action.includes('Riddle')) prompt = 'Give me a learning riddle!';
    setInput(prompt);
  };

  return (
    <div className="chat-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>
      <header
        className="chat-header"
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--card-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(10, 11, 22, 0.4)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="chat-header-main" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="chat-thread-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ color: 'var(--primary)' }}>{modeIcons[activeThread.mode]}</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', letterSpacing: '-0.02em' }}>{activeThread.title}</h3>
          </div>
          <div className="chat-header-divider" style={{ width: '1px', height: '20px', background: 'var(--card-border)' }} />
          <motion.button
            className="chat-project-button"
            whileHover={{ background: 'rgba(255,255,255,0.05)' }}
            onClick={() => setIsProjectsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '10px',
              border: '1px solid var(--card-border)',
              background: 'transparent',
              cursor: 'pointer',
              color: assignedProject ? 'white' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            <Folder size={14} color={assignedProject?.color || 'currentColor'} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{assignedProject?.name || 'No Project'}</span>
            <ChevronDown size={14} opacity={0.5} />
          </motion.button>
        </div>

        <div className="chat-status-pills" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="chat-status-pill" style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#f59e0b', fontWeight: '700', letterSpacing: '0.5px' }}>
            {currentPlan.toUpperCase()}
          </div>
          <div className="chat-status-pill" style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '0.5px' }}>
            {dailyLimit === null ? 'UNLIMITED DAILY' : `${remainingToday} LEFT TODAY`}
          </div>
          <div className="chat-status-pill" style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '0.5px' }}>
            {activeThread.mode.toUpperCase()}
          </div>
        </div>
      </header>

      <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {activeThread.messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.5 }}>
            <Sparkles size={48} color="var(--primary)" />
            <p>Starting a new {activeThread.mode} session...</p>
          </div>
        )}

        {activeThread.messages.map((msg) => (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            key={msg.id}
            className={`chat-message-row ${msg.role === 'user' ? 'chat-message-row-user' : 'chat-message-row-assistant'}`}
            style={{ display: 'flex', gap: '16px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start', padding: '0 20px' }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                background: msg.role === 'user' ? 'linear-gradient(135deg, var(--primary), #6a1b9a)' : 'linear-gradient(135deg, #1a1a3a, #050515)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                border: '1px solid var(--card-border)',
              }}
            >
              {msg.role === 'user' ? <User size={18} color="white" /> : <Rocket size={18} color="var(--secondary)" />}
            </div>

            <div
              className="markdown-content chat-bubble"
              style={{
                maxWidth: '75%',
                padding: '18px 24px',
                borderRadius: msg.role === 'user' ? '24px 4px 24px 24px' : '4px 24px 24px 24px',
                background: msg.role === 'user' ? 'linear-gradient(135deg, var(--primary), #4a148c)' : 'var(--surface-1)',
                backdropFilter: msg.role === 'assistant' ? 'blur(10px)' : 'none',
                color: 'white',
                border: '1px solid var(--card-border)',
                lineHeight: 1.7,
                fontSize: '1rem',
                boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                position: 'relative',
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {msg.content}
              </ReactMarkdown>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <motion.div className="chat-message-row chat-message-row-assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '0 20px' }}>
            <div className="animate-thinking" style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--card-border)' }}>
              <Sparkles size={18} color="var(--primary)" />
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '500', letterSpacing: '0.5px' }}>PLUTO IS COMPOSING...</div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="chat-footer" style={{ padding: '24px 20px', width: '100%', maxWidth: '850px', margin: '0 auto', zIndex: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <motion.div className="chat-mode-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '0 12px' }}>
            {activeThread.mode === 'Conversational' && <ConversationalModeUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
            {activeThread.mode === 'Homework' && <HomeworkModeUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
            {activeThread.mode === 'ExamPrep' && <ExamPrepUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
          </motion.div>

          <div
            className="chat-composer"
            style={{
              display: 'flex',
              gap: '12px',
              background: 'rgba(10, 10, 26, 0.7)',
              backdropFilter: 'blur(24px)',
              border: '1px solid var(--glass-border)',
              padding: '10px',
              borderRadius: '20px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5), var(--glass-inner-glow)',
            }}
          >
            <textarea
              className="chat-textarea"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`Ask anything in ${activeThread.mode}...`}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: 'white',
                padding: '14px',
                fontSize: '1rem',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                maxHeight: '200px',
              }}
            />
            <motion.button
              className="chat-send-button"
              whileHover={{ scale: 1.05, background: 'var(--secondary)' }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                opacity: isLoading || !input.trim() ? 0.3 : 1,
                boxShadow: '0 4px 15px var(--primary-glow)',
              }}
            >
              <Send size={20} />
            </motion.button>
          </div>
          {!canUseMode(activeThread.mode) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#fbbf24', fontSize: '0.8rem' }}>
              <Lock size={14} />
              <span>This mode is locked on {currentPlan}. Upgrade to Plus or Pro.</span>
            </div>
          )}
          <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.85 }}>
            {dailyLimit === null ? `Pro plan active. Extended context window: ${planConfig.historyWindow} messages.` : `${currentPlan} plan: ${remainingToday}/${dailyLimit} requests remaining today.`}
          </p>
          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
            Pluto Intelligence may be wrong. Verification recommended.
          </p>
        </div>
      </footer>

      <ProjectsModal isOpen={isProjectsOpen} onClose={() => setIsProjectsOpen(false)} activeThreadId={activeThreadId} />
    </div>
  );
};

const modeCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--primary-glow)',
  color: 'var(--primary)',
  borderRadius: '16px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  width: '140px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontSize: '0.9rem',
  fontWeight: '700',
};
