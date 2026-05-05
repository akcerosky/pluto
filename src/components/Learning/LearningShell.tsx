import { lazy, Suspense, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/useApp';
import { getFlashcardSets } from '../../lib/plutoApi';
import { ChatInterface } from '../Chat/ChatInterface';
import { ModeSelectorPopup } from '../ModeSelector/ModeSelectorPopup';

const QuestionPaperPage = lazy(() => import('../../pages/QuestionPaperPage').then((module) => ({ default: module.QuestionPaperPage })));
const FlashcardsPage = lazy(() => import('../../pages/FlashcardsPage').then((module) => ({ default: module.FlashcardsPage })));
const PdfQuestionPaperPage = lazy(() => import('../../pages/PdfQuestionPaperPage').then((module) => ({ default: module.PdfQuestionPaperPage })));

export const LearningShell = () => {
  const {
    currentPlan,
    planConfig,
    selectedMode,
    setSelectedMode,
    showModeSelector,
    setShowModeSelector,
    setDueFlashcardCount,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const consumedSkipModeSelectorRef = useRef(false);

  useEffect(() => {
    const shouldSkipModeSelector =
      typeof location.state === 'object' &&
      location.state !== null &&
      'skipModeSelector' in location.state &&
      Boolean((location.state as { skipModeSelector?: boolean }).skipModeSelector);

    if (shouldSkipModeSelector) {
      consumedSkipModeSelectorRef.current = true;
      setShowModeSelector(false);
    } else if (consumedSkipModeSelectorRef.current) {
      consumedSkipModeSelectorRef.current = false;
      setShowModeSelector(false);
    } else {
      setShowModeSelector(true);
    }

    if (shouldSkipModeSelector) {
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: null,
      });
    }
  }, [location.hash, location.pathname, location.search, location.state, navigate, setShowModeSelector]);

  useEffect(() => {
    if (!planConfig.features.learningFeatures) {
      setDueFlashcardCount(0);
      return;
    }
    void getFlashcardSets()
      .then((response) => setDueFlashcardCount(response.dueCount))
      .catch(() => setDueFlashcardCount(0));
  }, [planConfig.features.learningFeatures, setDueFlashcardCount]);

  const openMode = (mode: typeof selectedMode) => {
    setSelectedMode(mode);
    setShowModeSelector(false);
  };

  const isScrollableLearningMode = selectedMode !== 'chat';

  const renderSelectedMode = () => {
    if (!planConfig.features.learningFeatures && selectedMode !== 'chat') {
      return (
        <div style={{ padding: '28px', height: '100%', display: 'grid', placeItems: 'center' }}>
          <div
            style={{
              width: 'min(560px, 100%)',
              borderRadius: '28px',
              border: '1px solid rgba(136, 104, 255, 0.28)',
              background: 'linear-gradient(180deg, rgba(114,88,255,0.12), rgba(255,255,255,0.04))',
              padding: '28px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentPlan} plan upgrade required
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Question papers, flashcards, and PDF-based paper generation are available on Pluto Plus and Pro.
            </p>
            <button type="button" onClick={() => navigate('/profile')} className="app-button">
              Upgrade to Plus
            </button>
          </div>
        </div>
      );
    }

    switch (selectedMode) {
      case 'questionPaper':
        return <QuestionPaperPage />;
      case 'flashcards':
        return <FlashcardsPage />;
      case 'pdfQuestionPaper':
        return <PdfQuestionPaperPage />;
      case 'chat':
      default:
        return <ChatInterface />;
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        overflowX: 'hidden',
        overflowY: isScrollableLearningMode ? 'auto' : 'hidden',
      }}
    >
      {showModeSelector ? (
        <ModeSelectorPopup
          plan={currentPlan}
          onSelect={openMode}
          onUpgrade={() => {
            setShowModeSelector(false);
            navigate('/profile');
          }}
        />
      ) : null}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Suspense fallback={<div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading learning mode...</div>}>
          {renderSelectedMode()}
        </Suspense>
      </div>
    </div>
  );
};
