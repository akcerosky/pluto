import { BookOpen, FileQuestion, Layers3, ScanSearch } from 'lucide-react';
import type { LearningMode } from '../../context/appContextTypes';

const tabs: Array<{ id: LearningMode; label: string; icon: typeof BookOpen }> = [
  { id: 'chat', label: 'Chat', icon: BookOpen },
  { id: 'questionPaper', label: 'Question Paper', icon: FileQuestion },
  { id: 'flashcards', label: 'Flash Cards', icon: Layers3 },
  { id: 'pdfQuestionPaper', label: 'PDF to Question Paper', icon: ScanSearch },
];

export const ModeTabs = ({
  selectedMode,
  onSelect,
  dueFlashcardCount,
}: {
  selectedMode: LearningMode;
  onSelect: (mode: LearningMode) => void;
  dueFlashcardCount: number;
}) => (
  <div
    style={{
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      padding: '16px 20px 8px',
      borderBottom: '1px solid var(--glass-border)',
      background: 'color-mix(in srgb, var(--glass-bg-strong) 82%, rgba(111, 78, 255, 0.06))',
      backdropFilter: 'blur(18px)',
    }}
  >
    {tabs.map((tab) => {
      const active = tab.id === selectedMode;
      const Icon = tab.icon;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '999px',
            border: active ? '1px solid rgba(136, 104, 255, 0.45)' : '1px solid var(--glass-border)',
            background: active ? 'rgba(114, 88, 255, 0.14)' : 'var(--glass-bg-subtle)',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <Icon size={16} />
          <span style={{ fontWeight: active ? 800 : 700, fontSize: '0.92rem' }}>{tab.label}</span>
          {tab.id === 'flashcards' && dueFlashcardCount > 0 ? (
            <span
              style={{
                borderRadius: '999px',
                background: 'var(--warning-soft)',
                color: 'var(--warning)',
                padding: '4px 8px',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              {dueFlashcardCount} due
            </span>
          ) : null}
          {active ? (
            <span
              style={{
                position: 'absolute',
                left: '16px',
                right: '16px',
                bottom: '-9px',
                height: '3px',
                borderRadius: '999px',
                background: '#8b5cf6',
              }}
            />
          ) : null}
        </button>
      );
    })}
  </div>
);
