import { motion } from 'framer-motion';
import { BookOpen, FileQuestion, Layers3, Lock, ScanSearch } from 'lucide-react';
import type { LearningMode } from '../../context/appContextTypes';
import type { SubscriptionPlan } from '../../config/subscription';

const modes: Array<{
  id: LearningMode;
  title: string;
  description: string;
  icon: typeof BookOpen;
  premium?: boolean;
}> = [
  {
    id: 'chat',
    title: 'Chat',
    description: 'Continue guided learning with Conversational, Homework, and Exam Prep modes.',
    icon: BookOpen,
  },
  {
    id: 'questionPaper',
    title: 'Question Paper',
    description: 'Generate board-aware exam papers and export them as PDFs.',
    icon: FileQuestion,
    premium: true,
  },
  {
    id: 'flashcards',
    title: 'Flash Cards',
    description: 'Practice daily with SM-2 spaced repetition and mastery tracking.',
    icon: Layers3,
    premium: true,
  },
  {
    id: 'pdfQuestionPaper',
    title: 'PDF to Question Paper',
    description: 'Turn your PDFs into structured exam papers based on the source material.',
    icon: ScanSearch,
    premium: true,
  },
];

export const ModeSelectorPopup = ({
  plan,
  onSelect,
  onUpgrade,
}: {
  plan: SubscriptionPlan;
  onSelect: (mode: LearningMode) => void;
  onUpgrade: () => void;
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'color-mix(in srgb, var(--background) 52%, transparent)',
      backdropFilter: 'blur(20px)',
      padding: '24px',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}
  >
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        width: 'min(1080px, 100%)',
        maxHeight: 'calc(100dvh - 48px)',
        borderRadius: '32px',
        border: '1px solid var(--glass-border-strong)',
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--glass-bg-strong) 92%, white 8%), color-mix(in srgb, var(--glass-bg) 94%, transparent))',
        boxShadow: 'var(--glass-shadow-lg)',
        padding: '28px',
        margin: '0 auto',
        overflowY: 'auto',
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '0.8rem', letterSpacing: '0.18em', color: 'var(--text-secondary)', fontWeight: 800 }}>
          LEARNING MODES
        </div>
        <h2 style={{ margin: '8px 0 6px', fontSize: '2rem', color: 'var(--text-primary)' }}>
          Choose how you want to study today
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '720px', lineHeight: 1.6 }}>
          Pluto now opens into a dedicated learning shell. Pick a mode to begin, and you can keep switching tabs without losing your place.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '18px',
        }}
      >
        {modes.map((mode, index) => {
          const locked = Boolean(mode.premium && plan === 'Free');
          const Icon = mode.icon;
          return (
            <motion.button
              key={mode.id}
              type="button"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              onClick={() => (locked ? onUpgrade() : onSelect(mode.id))}
              style={{
                minHeight: 'clamp(180px, 24vw, 220px)',
                borderRadius: '24px',
                border: locked
                  ? '1px solid var(--glass-border)'
                  : '1px solid color-mix(in srgb, var(--primary) 32%, var(--glass-border))',
                background: locked
                  ? 'linear-gradient(180deg, color-mix(in srgb, var(--glass-bg) 88%, white 12%), color-mix(in srgb, var(--glass-bg-subtle) 92%, transparent))'
                  : 'linear-gradient(180deg, color-mix(in srgb, var(--primary) 14%, var(--glass-bg-strong)), color-mix(in srgb, var(--glass-bg-subtle) 96%, transparent))',
                color: 'var(--text-primary)',
                padding: '20px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: locked ? 'var(--glass-shadow)' : 'var(--glass-shadow-lg)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '18px',
                    display: 'grid',
                    placeItems: 'center',
                    background: locked
                      ? 'color-mix(in srgb, var(--glass-bg-subtle) 88%, white 12%)'
                      : 'color-mix(in srgb, var(--primary) 18%, var(--glass-bg-medium))',
                  }}
                >
                  <Icon size={24} />
                </div>
                {locked ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      borderRadius: '999px',
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: 'color-mix(in srgb, var(--warning-soft) 72%, var(--glass-bg))',
                      color: 'var(--warning)',
                    }}
                  >
                    <Lock size={12} />
                    Locked
                  </span>
                ) : null}
              </div>
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '8px' }}>{mode.title}</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>{mode.description}</div>
              </div>
              <div style={{ marginTop: 'auto', fontWeight: 700, color: locked ? 'var(--warning)' : 'var(--primary)' }}>
                {locked ? 'Upgrade to Plus' : 'Open mode'}
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  </div>
);
