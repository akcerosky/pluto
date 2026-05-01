import { BookOpen, Lightbulb, Stars, Rocket, Zap, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import type { EducationLevel } from '../../context/appContextTypes';

interface ModeUIProps {
  educationLevel: EducationLevel;
  onActionClick: (action: string) => void;
}

export const ConversationalModeUI = ({ educationLevel, onActionClick }: ModeUIProps) => {
  const isElementary = educationLevel === 'Elementary';
  const isProfessional = educationLevel === 'Professional' || educationLevel === 'College/University';

  const actions = isElementary
    ? ['Explain simply', 'Ask why', 'Tell me a story']
    : isProfessional
      ? ['Socratic walkthrough', 'Critique logic', 'Connect ideas']
      : ['Guide me step by step', 'Give an analogy', 'Real-world example'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mode-panel-card conversational"
        style={{ display: 'flex', gap: '12px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.9rem' }}>
            {isElementary ? <Rocket size={16} color="var(--primary)" /> : <Lightbulb size={16} color="var(--primary)" />}
            {isElementary ? 'Learning Buddy' : isProfessional ? 'Guided Reasoning' : 'Concept Coaching'}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {isElementary
              ? "I'll explain ideas in fun, simple steps and help you think through them."
              : isProfessional
                ? 'I will challenge assumptions, build reasoning, and keep the explanation structured.'
                : 'I will guide you with questions, examples, and step-by-step understanding.'}
          </p>
        </div>
        <div style={{ width: '1px', background: 'var(--border-color)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.9rem' }}>
            {isElementary ? <Zap size={16} color="var(--primary)" /> : <Search size={16} color="var(--primary)" />}
            {isElementary ? 'Try Asking' : isProfessional ? 'Explore Deeper' : 'Best Prompt'}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {isElementary
              ? "Try: 'Can you explain this like a game?'"
              : isProfessional
                ? "Try: 'Question my assumptions' or 'walk me through the reasoning.'"
                : "Try: 'Do not give the answer yet, guide me to it.'"}
          </p>
        </div>
      </motion.div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {actions.map((action) => (
          <button
            key={action}
            onClick={() => onActionClick(action)}
            className="mode-action-chip conversational"
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
    ? ['Help me start', 'Check my step', 'Give me one hint']
    : ['Identify the approach', 'Check my next step', 'Hint only'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mode-panel-card homework"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.9rem', marginBottom: '8px' }}>
          <BookOpen size={16} color="var(--mode-homework)" />
          {isElementary ? 'Homework Helper' : 'Hint-First Solver'}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[1, 2, 3, 4].map((index) => (
            <div
              key={index}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                background: index === 1 ? 'var(--mode-homework)' : 'var(--border-color)',
              }}
            />
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
          {isElementary
            ? 'I will help you solve it one clue at a time without taking over.'
            : 'I will focus on method, next step, and short hints instead of handing over the full answer.'}
        </p>
      </motion.div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {actions.map((action) => (
          <button key={action} onClick={() => onActionClick(action)} className="mode-action-chip homework">
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
    ? ['Start a quiz', 'Ask me fast questions', 'Test what I know']
    : isProfessional
      ? ['Mock exam', 'Case-based drill', 'Common traps']
      : ['Quick quiz', 'Flashcard drill', 'Mock test strategy'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mode-panel-card examprep"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.9rem' }}>
            <Stars size={16} color="var(--mode-examprep)" />
            {isElementary ? 'Quiz Practice' : isProfessional ? 'Exam Simulation' : 'Practice Mode'}
          </div>
          <div className="pill pill-success" style={{ minHeight: '22px', padding: '0 8px' }}>
            LIVE
          </div>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {isElementary
            ? 'I can quiz you, check recall, and help you practice with short questions.'
            : isProfessional
              ? 'I can generate mock scenarios, practice questions, and exam-style reasoning drills.'
              : 'I can run quizzes, mock tests, revision checks, and common-mistake reviews.'}
        </p>
      </motion.div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {actions.map((action) => (
          <button key={action} onClick={() => onActionClick(action)} className="mode-action-chip examprep">
            {action}
          </button>
        ))}
      </div>
    </div>
  );
};
