import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/useApp';
import type { LearningMode } from '../../context/appContextTypes';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  isCollapsed?: boolean;
}

const SEARCH_SUGGESTIONS: Array<{
  label: string;
  mode: LearningMode;
  keywords: string[];
}> = [
  {
    label: 'Question Paper Generator',
    mode: 'questionPaper',
    keywords: ['question', 'paper', 'question paper'],
  },
  {
    label: 'Flash Cards',
    mode: 'flashcards',
    keywords: ['flash', 'cards', 'flashcards'],
  },
  {
    label: 'PDF to Question Paper',
    mode: 'pdfQuestionPaper',
    keywords: ['pdf', 'pdf paper', 'pdf question'],
  },
];

export const SearchOverlay = ({
  isOpen,
  onClose,
  onOpen,
  isCollapsed = false,
}: SearchOverlayProps) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const { setSelectedMode, startChatWithPrompt } = useApp();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, onClose]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    return SEARCH_SUGGESTIONS.filter((suggestion) =>
      suggestion.keywords.some((keyword) => normalized.includes(keyword))
    );
  }, [query]);

  const openLearningMode = (mode: LearningMode) => {
    setSelectedMode(mode);
    navigate('/chat', { state: { skipModeSelector: true } });
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    if (matches.length > 0) {
      openLearningMode(matches[0].mode);
      return;
    }

    startChatWithPrompt(trimmed);
    navigate('/chat', { state: { skipModeSelector: true } });
    onClose();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="sidebar-link"
        style={{
          justifyContent: isCollapsed ? 'center' : 'flex-start',
        }}
      >
        <span className="sidebar-link-icon">
          <Search size={19} />
        </span>
        {!isCollapsed && <span>Discover</span>}
      </button>
    );
  }

  return (
    <div ref={shellRef} style={shellStyle}>
      <div style={searchRowShellStyle}>
        <div
          style={{
            ...searchRowStyle,
            border: isFocused
              ? '1px solid color-mix(in srgb, var(--primary) 42%, var(--glass-border))'
              : searchRowStyle.border,
            boxShadow: isFocused
              ? 'var(--focus-ring), var(--glass-inner-glow)'
              : searchRowStyle.boxShadow,
          }}
        >
          <Search size={16} color="var(--text-secondary)" />
          <input
            ref={inputRef}
            className="discover-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSubmit();
              }
              if (event.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search Pluto features"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={onClose}
            className="ghost-button"
            style={closeButtonStyle}
            aria-label="Close discover search"
          >
            <X size={14} />
          </button>
        </div>
        {matches.length > 0 ? (
          <div style={suggestionMenuStyle}>
            {matches.map((match) => (
              <button
                key={match.mode}
                type="button"
                onClick={() => openLearningMode(match.mode)}
                style={suggestionItemStyle}
              >
                {match.label}
              </button>
            ))}
          </div>
        ) : query.trim() ? (
          <div style={suggestionMenuStyle}>
            <button
              type="button"
              onClick={handleSubmit}
              style={suggestionItemStyle}
            >
              Start chat: {query.trim()}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const shellStyle: CSSProperties = {
  display: 'grid',
  gap: '8px',
};

const searchRowShellStyle: CSSProperties = {
  position: 'relative',
};

const searchRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  height: '44px',
  borderRadius: '14px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  padding: '0 14px',
  boxShadow: 'var(--glass-inner-glow)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: '44px',
  height: '44px',
  display: 'block',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  padding: 0,
  lineHeight: 'normal',
  outline: 'none',
};

const closeButtonStyle: CSSProperties = {
  width: '30px',
  height: '30px',
  minHeight: '30px',
  padding: 0,
  borderRadius: '999px',
  flexShrink: 0,
};

const suggestionMenuStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  zIndex: 40,
  display: 'grid',
  gap: '6px',
  padding: '8px',
  borderRadius: '18px',
  border: '1px solid var(--glass-border-strong)',
  background: 'var(--glass-bg-strong)',
  boxShadow: 'var(--glass-inner-glow), var(--glass-shadow-lg)',
  backdropFilter: 'blur(18px)',
};

const suggestionItemStyle: CSSProperties = {
  minHeight: '40px',
  padding: '0 12px',
  borderRadius: '12px',
  border: '1px solid transparent',
  background: 'var(--glass-bg-subtle)',
  color: 'var(--text-primary)',
  fontWeight: 700,
  textAlign: 'left',
};
