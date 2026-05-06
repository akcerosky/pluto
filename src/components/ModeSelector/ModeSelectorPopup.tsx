import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
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
}) => {
  const [isDesktop, setIsDesktop] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth >= 1100 : true)
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1100);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: 'color-mix(in srgb, var(--background) 48%, transparent)',
        backdropFilter: 'blur(22px)',
        padding: isDesktop ? '32px 40px' : '24px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: 'min(1220px, 100%)',
          maxHeight: isDesktop ? 'calc(100dvh - 64px)' : 'calc(100dvh - 48px)',
          borderRadius: isDesktop ? '36px' : '32px',
          border: '1px solid var(--glass-border-strong)',
          background: isDesktop
            ? 'linear-gradient(135deg, color-mix(in srgb, var(--glass-bg-strong) 90%, white 10%) 0%, color-mix(in srgb, var(--glass-bg) 94%, rgba(121, 90, 255, 0.04)) 48%, color-mix(in srgb, var(--glass-bg-subtle) 96%, transparent) 100%)'
            : 'linear-gradient(180deg, color-mix(in srgb, var(--glass-bg-strong) 92%, white 8%), color-mix(in srgb, var(--glass-bg) 94%, transparent))',
          boxShadow: 'var(--glass-shadow-lg)',
          padding: isDesktop ? '34px' : '28px',
          margin: '0 auto',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isDesktop ? 'minmax(360px, 440px) minmax(0, 1fr)' : '1fr',
            gap: isDesktop ? '28px' : '24px',
            alignItems: 'start',
          }}
        >
          <div
            style={{
              display: 'grid',
              gap: '18px',
              padding: isDesktop ? '10px 4px 10px 2px' : 0,
            }}
          >
            <div
              style={{
                fontSize: '0.8rem',
                letterSpacing: '0.18em',
                color: 'var(--text-secondary)',
                fontWeight: 800,
              }}
            >
              LEARNING MODES
            </div>
            <div
              style={{
                fontSize: isDesktop ? 'clamp(2.2rem, 3vw, 3.1rem)' : '2rem',
                lineHeight: isDesktop ? 1.02 : 1.06,
                fontWeight: 900,
                color: 'var(--text-primary)',
                maxWidth: isDesktop ? '12ch' : 'none',
                letterSpacing: isDesktop ? '-0.04em' : '-0.03em',
                textWrap: 'balance',
              }}
            >
              Choose how you want to study today
            </div>
            <p
              style={{
                margin: 0,
                color: 'var(--text-secondary)',
                maxWidth: isDesktop ? '34ch' : '720px',
                lineHeight: 1.68,
                fontSize: isDesktop ? '1.02rem' : '1rem',
              }}
            >
              Pluto now opens into a dedicated learning shell. Pick a mode to begin, and you can keep switching tabs
              without losing your place.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: isDesktop ? '20px' : '18px',
              alignItems: 'stretch',
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
                    minHeight: isDesktop ? '220px' : 'clamp(180px, 24vw, 220px)',
                    borderRadius: '24px',
                    border: locked
                      ? '1px solid var(--glass-border)'
                      : '1px solid color-mix(in srgb, var(--primary) 24%, var(--glass-border))',
                    background: locked
                      ? 'linear-gradient(180deg, color-mix(in srgb, var(--glass-bg) 88%, white 12%), color-mix(in srgb, var(--glass-bg-subtle) 92%, transparent))'
                      : 'linear-gradient(180deg, color-mix(in srgb, var(--primary) 10%, var(--glass-bg-strong)), color-mix(in srgb, var(--glass-bg-subtle) 97%, transparent))',
                    color: 'var(--text-primary)',
                    padding: isDesktop ? '24px' : '20px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isDesktop ? '18px' : '14px',
                    boxShadow: locked ? 'var(--glass-shadow)' : 'var(--glass-shadow-lg)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: isDesktop ? '58px' : '54px',
                          height: isDesktop ? '58px' : '54px',
                          borderRadius: '18px',
                          display: 'grid',
                          placeItems: 'center',
                          background: locked
                            ? 'color-mix(in srgb, var(--glass-bg-subtle) 88%, white 12%)'
                            : 'color-mix(in srgb, var(--primary) 18%, var(--glass-bg-medium))',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={isDesktop ? 26 : 24} />
                      </div>
                      <div
                        style={{
                          fontSize: isDesktop ? '1.2rem' : '1.15rem',
                          fontWeight: 800,
                          minWidth: 0,
                          lineHeight: 1.18,
                          maxWidth: isDesktop ? '10ch' : 'none',
                        }}
                      >
                        {mode.title}
                      </div>
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
                          flexShrink: 0,
                        }}
                      >
                        <Lock size={12} />
                        Locked
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      color: 'var(--text-secondary)',
                      lineHeight: 1.65,
                      fontSize: isDesktop ? '1rem' : '0.98rem',
                      maxWidth: isDesktop ? '26ch' : 'none',
                    }}
                  >
                    {mode.description}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
