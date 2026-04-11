import { BookOpen, Lightbulb, Stars, Rocket, Zap, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import type { EducationLevel } from '../../context/AppContext';

interface ModeUIProps {
  educationLevel: EducationLevel;
  onActionClick: (action: string) => void;
}

export const ConversationalModeUI = ({ educationLevel, onActionClick }: ModeUIProps) => {
  const isElementary = educationLevel === 'Elementary';
  const isProfessional = educationLevel === 'Professional' || educationLevel === 'College/University';

  const actions = isElementary 
    ? ['Tell a Story 📖', 'Ask Why? ❓', 'Riddle Me! 🧩'] 
    : isProfessional 
      ? ['Abstract Summary 📄', 'Critique Logic ⚖️', 'Synthesize Trends 📈']
      : ['Deep Dive 🌊', 'Analogy please! 💡', 'Real-world example 🌍'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        style={{ 
          display: 'flex', 
          gap: '12px', 
          padding: '10px 16px', 
          background: 'rgba(138, 43, 226, 0.08)', 
          borderRadius: '14px',
          border: '1px solid rgba(138, 43, 226, 0.2)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.9rem' }}>
            {isElementary ? <Rocket size={16} color="var(--primary)" /> : <Lightbulb size={16} color="var(--primary)" />}
            {isElementary ? 'Power-Up!' : isProfessional ? 'Core Frameworks' : 'Concept Breakdown'}
          </div>
          <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            {isElementary 
              ? "I'm making this super fun and easy to understand!" 
              : isProfessional 
                ? "Synthesizing complex methodologies for your field."
                : "I'm simplifying this concept for your level."}
          </p>
        </div>
        <div style={{ width: '1px', background: 'var(--card-border)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.9rem' }}>
            {isElementary ? <Zap size={16} color="var(--primary)" /> : <Search size={16} color="var(--primary)" />}
            {isElementary ? 'Quick Tip' : isProfessional ? 'Research Probe' : 'Ask Me'}
          </div>
          <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            {isElementary 
              ? "Ask: 'Explain like I'm 5!'" 
              : isProfessional
                ? "Ask: 'Critique this approach' or 'Cite sources'."
                : "Ask: 'Deep dive into the origin'."}
          </p>
        </div>
      </motion.div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {actions.map(action => (
          <button
            key={action}
            onClick={() => onActionClick(action)}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'var(--glass)',
              border: '1px solid var(--primary-glow)',
              color: 'var(--foreground)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--primary-glow)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'var(--glass)')}
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
};

export const HomeworkModeUI = ({ educationLevel, onActionClick }: ModeUIProps) => {
  const isElementary = educationLevel === 'Elementary';
  
  const actions = isElementary 
    ? ['Help me start! 🚀', 'Check my answer ✅', 'Give me a hint 💡']
    : ['Break it down 🛠️', 'Verify Logic 📎', 'Alternative Method 🔄'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        style={{ 
          padding: '10px 16px', 
          background: 'rgba(0, 210, 255, 0.08)', 
          borderRadius: '14px',
          border: '1px solid rgba(0, 210, 255, 0.2)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.9rem', marginBottom: '8px' }}>
          <BookOpen size={16} color="var(--secondary)" />
          {isElementary ? 'Homework Adventure!' : 'Step-by-Step Solver Activated'}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i === 1 ? 'var(--secondary)' : 'var(--card-border)' }} />
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '8px' }}>
          {isElementary 
            ? "I'll help you solve this like a puzzle, one piece at a time!"
            : "I'll guide you through the solution without just giving the answer."}
        </p>
      </motion.div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {actions.map(action => (
          <button
            key={action}
            onClick={() => onActionClick(action)}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'var(--glass)',
              border: '1px solid var(--secondary-glow)',
              color: 'var(--foreground)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--secondary-glow)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'var(--glass)')}
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
};

export const ExamPrepUI = ({ educationLevel, onActionClick }: ModeUIProps) => {
  const isElementary = educationLevel === 'Elementary';
  const isProfessional = educationLevel === 'Professional' || educationLevel === 'College/University';

  const actions = isElementary 
    ? ['Start Quiz! 🕹️', 'Easy Match 🧩', 'Spelling Fun ✨']
    : isProfessional
      ? ['Certification Mock 🏆', 'Case Study Probe 🔍', 'Scenario Simulator 🚨']
      : ['Quick Quiz (5Q) ⏱️', 'Flashcard Mode 🃏', 'Common Pitfalls ⚠️'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        style={{ 
          padding: '10px 16px', 
          background: 'rgba(255, 0, 193, 0.08)', 
          borderRadius: '14px',
          border: '1px solid rgba(255, 0, 193, 0.2)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.9rem' }}>
            <Stars size={16} color="var(--accent)" />
            {isElementary ? 'Quiz Game' : isProfessional ? 'Certification Simulator' : 'Mock Exam Generator'}
          </div>
          <div style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'var(--accent)', borderRadius: '4px', color: 'white' }}>LIVE</div>
        </div>
        <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
          {isElementary 
            ? "Let's play a quiz game to test what you know!"
            : isProfessional
              ? "Simulating high-stakes industry scenarios and certification probes."
              : "I can generate a 5-question quiz or time your responses. What should we focus on?"}
        </p>
      </motion.div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {actions.map(action => (
          <button
            key={action}
            onClick={() => onActionClick(action)}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'var(--glass)',
              border: '1px solid var(--accent-glow)',
              color: 'var(--foreground)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--accent-glow)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'var(--glass)')}
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
};
