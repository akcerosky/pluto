import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  EyeOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  deleteFlashcardSet,
  generateFlashcardSet,
  getDueCards,
  getFlashcardCards,
  getFlashcardSets,
  submitCardReview,
} from '../lib/plutoApi';
import { useApp } from '../context/useApp';
import { normalizeLearningErrorMessage } from '../lib/learningUi';
import type { FlashcardCardDoc, FlashcardSetDoc } from '../types';

type ReviewDeckItem = {
  card: FlashcardCardDoc;
  revealCount: number;
  pending: boolean;
  completed: boolean;
  originalOrder: number;
};

const createReviewDeck = (sourceCards: FlashcardCardDoc[]): ReviewDeckItem[] =>
  sourceCards.map((card, index) => ({
    card,
    revealCount: 0,
    pending: true,
    completed: false,
    originalOrder: index,
  }));

const shuffleArray = <T,>(items: T[]) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

export const FlashcardsPage = () => {
  const { setDueFlashcardCount } = useApp();
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [sets, setSets] = useState<FlashcardSetDoc[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [reviewDeck, setReviewDeck] = useState<ReviewDeckItem[]>([]);
  const [reviewDeckSeed, setReviewDeckSeed] = useState<ReviewDeckItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSetsLoading, setIsSetsLoading] = useState(true);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [generationErrorMessage, setGenerationErrorMessage] = useState<string | null>(null);
  const [failedGenerationAttempt, setFailedGenerationAttempt] = useState<{
    topic: string;
    subject?: string;
    educationLevel?: string;
  } | null>(null);
  const [mobileView, setMobileView] = useState<'create' | 'library'>('create');
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false)
  );

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth < 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadSets = useCallback(async () => {
    setIsSetsLoading(true);
    try {
      const response = await getFlashcardSets();
      setSets(response.sets);
      setDueFlashcardCount(response.dueCount);
      return response.sets;
    } finally {
      setIsSetsLoading(false);
    }
  }, [setDueFlashcardCount]);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  const extractGenerationErrorMessage = (error: unknown) => {
    return normalizeLearningErrorMessage({
      error,
      fallback: 'Flashcard generation failed before Pluto could finish building the set. Please try again.',
    });
  };

  const handleGenerate = async (overrideAttempt?: {
    topic: string;
    subject?: string;
    educationLevel?: string;
  }) => {
    const attempt = overrideAttempt ?? {
      topic: topic.trim(),
      subject: subject.trim() || undefined,
      educationLevel: educationLevel.trim() || undefined,
    };

    setGenerationErrorMessage(null);
    setFailedGenerationAttempt(attempt);
    setIsLoading(true);
    try {
      await generateFlashcardSet(attempt);
      setTopic('');
      setSubject('');
      setEducationLevel('');
      setGenerationErrorMessage(null);
      setFailedGenerationAttempt(null);
      await loadSets();
    } catch (error) {
      setGenerationErrorMessage(extractGenerationErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const activeReviewCards = useMemo(
    () =>
      reviewDeck.filter(
        (item) => item.pending && (!newOnly || item.card.masteryLevel === 'new')
      ),
    [reviewDeck, newOnly]
  );

  const currentReviewItem =
    activeReviewCards[Math.min(reviewIndex, Math.max(activeReviewCards.length - 1, 0))] ?? null;
  const sessionTotalCards = reviewDeckSeed.length;
  const completedCardsCount = reviewDeck.filter((item) => item.completed).length;
  const progressPercent =
    sessionTotalCards > 0 ? Math.round((completedCardsCount / sessionTotalCards) * 100) : 0;
  const currentSessionPosition =
    currentReviewItem && sessionTotalCards > 0 ? Math.min(reviewIndex + 1, sessionTotalCards) : 0;
  const isReviewing = sessionTotalCards > 0;
  const selectedSet = sets.find((set) => set.id === selectedSetId) ?? null;

  const flashcardSetList = (
    <div style={{ display: 'grid', gap: '10px' }}>
      {sets.map((set) => (
        <div
          key={set.id}
          onClick={() => void beginReviewForSet(set.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              void beginReviewForSet(set.id);
            }
          }}
          role="button"
          tabIndex={0}
          style={{
            ...flashSetCardStyle,
            borderColor:
              selectedSetId === set.id
                ? 'rgba(136, 104, 255, 0.45)'
                : 'var(--glass-border)',
          }}
        >
          <div>
            <div style={{ fontWeight: 800 }}>{set.title}</div>
            <div
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                marginTop: '4px',
              }}
            >
              {`${set.totalCards} cards · ${set.stats.dueToday} due today`}
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void deleteFlashcardSet({ setId: set.id }).then(async () => {
                if (selectedSetId === set.id) {
                  setSelectedSetId(null);
                  setReviewDeck([]);
                  setReviewDeckSeed([]);
                }
                await loadSets();
              });
            }}
            className="ghost-button"
            aria-label={`Delete ${set.title}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );

  useEffect(() => {
    if (reviewIndex >= activeReviewCards.length && activeReviewCards.length > 0) {
      setReviewIndex(activeReviewCards.length - 1);
    }
    if (activeReviewCards.length === 0) {
      setReviewIndex(0);
      setIsFlipped(false);
    }
  }, [activeReviewCards.length, reviewIndex]);

  const hydrateReviewDeck = (sourceCards: FlashcardCardDoc[]) => {
    const seed = createReviewDeck(sourceCards);
    setReviewDeck(seed);
    setReviewDeckSeed(seed);
    setReviewIndex(0);
    setIsFlipped(false);
    setNewOnly(false);
    setSessionId(crypto.randomUUID());
  };

  const beginReviewForSet = async (setId: string) => {
    setSelectedSetId(setId);
    if (isCompactLayout) {
      setMobileView('library');
    }
    setIsReviewLoading(true);
    try {
      const [dueResponse, cardsResponse] = await Promise.all([
        getDueCards({ setId }),
        getFlashcardCards({ setId }),
      ]);
      hydrateReviewDeck(dueResponse.cards.length > 0 ? dueResponse.cards : cardsResponse.cards);
    } finally {
      setIsReviewLoading(false);
    }
  };

  const resetReview = () => {
    hydrateReviewDeck(reviewDeckSeed.map((item) => item.card));
  };

  const handleFlip = () => {
    if (!currentReviewItem) return;
    if (!isFlipped) {
      setReviewDeck((current) =>
        current.map((item) =>
          item.card.id === currentReviewItem.card.id
            ? { ...item, revealCount: item.revealCount + 1 }
            : item
        )
      );
    }
    setIsFlipped((value) => !value);
  };

  const moveToPreviousCard = () => {
    setReviewIndex((current) => Math.max(current - 1, 0));
    setIsFlipped(false);
  };

  const moveToNextCard = () => {
    setReviewIndex((current) =>
      activeReviewCards.length > 0 ? Math.min(current + 1, activeReviewCards.length - 1) : 0
    );
    setIsFlipped(false);
  };

  const handleShuffle = () => {
    setReviewDeck((current) => {
      const pending = current.filter((item) => item.pending);
      const completed = current.filter((item) => !item.pending);
      return [...shuffleArray(pending), ...completed];
    });
    setReviewIndex(0);
    setIsFlipped(false);
  };

  const handleReviewAction = async (rating: 'hard' | 'good' | 'easy') => {
    if (!currentReviewItem || !selectedSetId || isSubmittingReview) return;

    setIsSubmittingReview(true);
    try {
      const response = await submitCardReview({
        setId: selectedSetId,
        cardId: currentReviewItem.card.id,
        rating,
        sessionId,
      });

      setReviewDeck((current) => {
        const next = current.map((item) =>
          item.card.id === currentReviewItem.card.id
            ? {
                ...item,
                card: response.card,
                completed: true,
                pending: false,
              }
            : item
        );

        return next;
      });

      setIsFlipped(false);
      await loadSets();
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div
      style={{
        padding: '22px',
        display: 'grid',
        gridTemplateColumns: isCompactLayout ? '1fr' : '340px minmax(0, 1fr)',
        gridTemplateRows: isCompactLayout ? 'auto auto' : 'minmax(0, 1fr)',
        gap: '18px',
        height: isCompactLayout ? 'auto' : '100%',
        minHeight: 0,
        alignItems: isCompactLayout ? 'start' : 'stretch',
        alignContent: isCompactLayout ? 'start' : 'stretch',
        overflowY: isCompactLayout ? 'auto' : 'hidden',
      }}
    >
      {isCompactLayout ? (
        <div style={mobileSwitcherStyle}>
          <button
            type="button"
            onClick={() => setMobileView('create')}
            style={{
              ...mobileSwitcherButtonStyle,
              ...(mobileView === 'create' ? mobileSwitcherButtonActiveStyle : null),
            }}
          >
            New Flashcards
          </button>
          <button
            type="button"
            onClick={() => {
              if (mobileView === 'library' && !isReviewing) {
                setSelectedSetId(null);
              } else {
                setMobileView('library');
              }
            }}
            style={{
              ...mobileSwitcherButtonStyle,
              ...(mobileView === 'library' ? mobileSwitcherButtonActiveStyle : null),
            }}
          >
            Previous Flashcards
          </button>
        </div>
      ) : null}

      {!isCompactLayout || mobileView === 'create' ? (
        <div
          style={{
            ...flashPanelStyle,
            height: isCompactLayout ? 'auto' : '100%',
            overflow: isCompactLayout ? 'visible' : 'hidden',
            overflowY: isCompactLayout ? 'visible' : 'auto',
          }}
        >
        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>Create a Flashcard Set</h3>
        <div style={flashPromptBarStyle}>
          <div style={{ display: 'grid', gap: '10px' }}>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Topic"
              style={flashComposerInputStyle}
            />
            <div
              style={{
                ...flashInputRowStyle,
                gridTemplateColumns: '1fr',
              }}
            >
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject (optional)"
                style={flashComposerInputStyle}
              />
              <input
                value={educationLevel}
                onChange={(event) => setEducationLevel(event.target.value)}
                placeholder="Education level (optional)"
                style={flashComposerInputStyle}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isLoading || !topic.trim()}
              className="app-button"
              style={flashActionButtonStyle}
            >
              {isLoading ? <Loader2 size={16} className="spin" /> : null}
              <span>Generate Flashcards</span>
            </button>
          </div>
          {generationErrorMessage ? (
            <div style={flashErrorCardStyle}>
              <div style={flashErrorTitleStyle}>Generation failed</div>
              <div style={flashErrorTextStyle}>{generationErrorMessage}</div>
              <button
                type="button"
                onClick={() => {
                  if (failedGenerationAttempt) {
                    void handleGenerate(failedGenerationAttempt);
                  }
                }}
                disabled={isLoading || !failedGenerationAttempt}
                className="outline-button"
                style={flashRetryButtonStyle}
              >
                Retry generation
              </button>
            </div>
          ) : null}
        </div>

        {!isCompactLayout ? (
          <div style={{ marginTop: '22px', display: 'grid', gap: '10px' }}>
            {isSetsLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <div key={`flash-list-skeleton-${index}`} style={flashcardSkeletonStyle}>
                    <div style={{ ...skeletonLineStyle, width: '62%' }} />
                    <div style={{ ...skeletonLineStyle, width: '38%', height: '12px' }} />
                  </div>
                ))
              : sets.map((set) => (
                  <div
                    key={set.id}
                    onClick={() => void beginReviewForSet(set.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void beginReviewForSet(set.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    style={{
                      ...flashSetCardStyle,
                      borderColor:
                        selectedSetId === set.id
                          ? 'rgba(136, 104, 255, 0.45)'
                          : 'var(--glass-border)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{set.title}</div>
                      <div
                        style={{
                          color: 'var(--text-secondary)',
                          fontSize: '0.85rem',
                          marginTop: '4px',
                        }}
                      >
                        {`${set.totalCards} cards · ${set.stats.dueToday} due today`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteFlashcardSet({ setId: set.id }).then(async () => {
                          if (selectedSetId === set.id) {
                            setSelectedSetId(null);
                            setReviewDeck([]);
                            setReviewDeckSeed([]);
                          }
                          await loadSets();
                        });
                      }}
                      className="ghost-button"
                      aria-label={`Delete ${set.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
          </div>
        ) : null}
        </div>
      ) : null}

      {!isCompactLayout || mobileView === 'library' ? (
        <div
          style={{
            ...flashPanelStyle,
            ...reviewPanelStyle,
            height: isCompactLayout ? 'auto' : '100%',
            minHeight: isCompactLayout ? 'unset' : '680px',
            overflow: isCompactLayout ? 'visible' : 'hidden',
            overflowY: isCompactLayout ? 'visible' : 'auto',
            display:
              !isCompactLayout || !isReviewing || mobileView === 'library'
                ? undefined
                : 'none',
          }}
        >
        {isReviewing ? (
          <div
            style={{
              ...reviewShellStyle,
              minHeight: isCompactLayout ? 'auto' : reviewShellStyle.minHeight,
            }}
          >
            {isCompactLayout && selectedSet ? (
              <div style={mobileReviewHeaderStyle}>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{selectedSet.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '4px' }}>
                    {`${selectedSet.totalCards} cards · ${selectedSet.stats.dueToday} due today`}
                  </div>
                </div>
              </div>
            ) : null}
            <div style={reviewTopRowStyle}>
              <div
                style={{
                  ...reviewToolbarStyle,
                  display: isCompactLayout ? 'grid' : reviewToolbarStyle.display,
                  gridTemplateColumns: isCompactLayout ? 'minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 0.8fr)' : undefined,
                  width: isCompactLayout ? '100%' : undefined,
                  gap: isCompactLayout ? '8px' : reviewToolbarStyle.gap,
                }}
              >
                <button
                  type="button"
                  onClick={() => setNewOnly((value) => !value)}
                  style={{
                    ...reviewToolButtonStyle,
                    minHeight: isCompactLayout ? '42px' : reviewToolButtonStyle.minHeight,
                    padding: isCompactLayout ? '0 8px' : reviewToolButtonStyle.padding,
                    fontSize: isCompactLayout ? '0.76rem' : undefined,
                    gap: isCompactLayout ? '5px' : reviewToolButtonStyle.gap,
                    ...(newOnly ? reviewToolButtonActiveStyle : null),
                  }}
                >
                  <EyeOff size={isCompactLayout ? 14 : 16} />
                  <span>New Only</span>
                </button>
                <button
                  type="button"
                  onClick={handleShuffle}
                  style={{
                    ...reviewToolButtonStyle,
                    minHeight: isCompactLayout ? '42px' : reviewToolButtonStyle.minHeight,
                    padding: isCompactLayout ? '0 8px' : reviewToolButtonStyle.padding,
                    fontSize: isCompactLayout ? '0.76rem' : undefined,
                    gap: isCompactLayout ? '5px' : reviewToolButtonStyle.gap,
                  }}
                >
                  <Shuffle size={isCompactLayout ? 14 : 16} />
                  <span>Shuffle</span>
                </button>
                <button
                  type="button"
                  onClick={resetReview}
                  style={{
                    ...reviewResetButtonStyle,
                    minHeight: isCompactLayout ? '42px' : reviewResetButtonStyle.minHeight,
                    padding: isCompactLayout ? '0 8px' : reviewResetButtonStyle.padding,
                    fontSize: isCompactLayout ? '0.76rem' : undefined,
                    gap: isCompactLayout ? '5px' : reviewResetButtonStyle.gap,
                  }}
                >
                  <RefreshCw size={isCompactLayout ? 14 : 16} />
                  <span>Reset</span>
                </button>
              </div>

              <div style={reviewProgressClusterStyle}>
                <div style={reviewMetricsStyle}>
                  <span style={reviewMetricPrimaryStyle}>
                    {currentSessionPosition}/{sessionTotalCards}
                  </span>
                  <span style={reviewMetricSecondaryStyle}>
                    Completed:{' '}
                    <strong style={{ color: '#31e88e' }}>
                      {completedCardsCount}/{sessionTotalCards}
                    </strong>
                  </span>
                  <span style={reviewPercentStyle}>{progressPercent}%</span>
                </div>
                <div style={reviewProgressTrackStyle}>
                  <div
                    style={{
                      ...reviewProgressFillStyle,
                      width: `${progressPercent}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {currentReviewItem ? (
              <>
                <button
                  type="button"
                  onClick={handleFlip}
                  style={reviewCardButtonStyle}
                  aria-label={isFlipped ? 'Hide answer' : 'Reveal answer'}
                >
                  <div
                    style={{
                      ...reviewFlipInnerStyle,
                      minHeight: isCompactLayout ? '325px' : '390px',
                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    }}
                  >
                    <div
                      style={{
                        ...reviewCardFaceStyle,
                        ...reviewCardFrontStyle,
                        padding: isCompactLayout ? '18px' : '24px',
                      }}
                    >
                      <div style={reviewCardHeaderStyle}>
                        <div style={reviewCardBadgeStyle}>Question</div>
                        <div style={reviewCardConceptStyle}>{currentReviewItem.card.concept}</div>
                      </div>
                      <div style={reviewCardBodyStyle}>
                        <div style={reviewCardTextStyle}>{currentReviewItem.card.front}</div>
                      </div>
                      <div style={reviewCardFooterStyle}>
                        <div style={reviewCardHintStyle}>Tap card or Flip to reveal answer</div>
                      </div>
                    </div>
                    <div
                      style={{
                        ...reviewCardFaceStyle,
                        ...reviewCardBackStyle,
                        padding: isCompactLayout ? '18px' : '24px',
                      }}
                    >
                      <div style={reviewCardHeaderStyle}>
                        <div style={reviewCardBadgeStyle}>Answer</div>
                        <div style={reviewCardConceptStyle}>
                          Reveal {Math.min(currentReviewItem.revealCount, 9)}
                        </div>
                      </div>
                      <div style={reviewCardBodyStyle}>
                        <div style={reviewCardTextStyle}>{currentReviewItem.card.back}</div>
                      </div>
                      <div style={reviewCardFooterStyle}>
                        <div style={reviewCardHintStyle}>
                          Choose Hard, Good, or Easy after checking how quickly you recalled the answer.
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                <div style={{ display: 'grid', gap: '14px' }}>
                  <div
                    style={{
                      ...reviewDecisionRowStyle,
                      display: isCompactLayout ? 'grid' : reviewDecisionRowStyle.display,
                      gridTemplateColumns: isCompactLayout ? '1fr 1fr 1fr' : undefined,
                      gap: isCompactLayout ? '10px' : reviewDecisionRowStyle.gap,
                    }}
                  >
                    {isFlipped ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleReviewAction('hard')}
                          disabled={isSubmittingReview}
                          style={{
                            ...reviewHardButtonStyle,
                            width: isCompactLayout ? '100%' : undefined,
                            maxWidth: isCompactLayout ? 'none' : reviewHardButtonStyle.maxWidth,
                            minHeight: isCompactLayout ? '44px' : reviewHardButtonStyle.minHeight,
                            fontSize: isCompactLayout ? '0.82rem' : undefined,
                            gap: isCompactLayout ? '6px' : reviewHardButtonStyle.gap,
                          }}
                        >
                          <XCircle size={isCompactLayout ? 16 : 18} />
                          <span>{isSubmittingReview ? 'Saving...' : 'Hard'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReviewAction('good')}
                          disabled={isSubmittingReview}
                          style={{
                            ...reviewGoodButtonStyle,
                            width: isCompactLayout ? '100%' : undefined,
                            maxWidth: isCompactLayout ? 'none' : reviewGoodButtonStyle.maxWidth,
                            minHeight: isCompactLayout ? '44px' : reviewGoodButtonStyle.minHeight,
                            fontSize: isCompactLayout ? '0.82rem' : undefined,
                            gap: isCompactLayout ? '6px' : reviewGoodButtonStyle.gap,
                          }}
                        >
                          <CheckCircle2 size={isCompactLayout ? 16 : 18} />
                          <span>{isSubmittingReview ? 'Saving...' : 'Good'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReviewAction('easy')}
                          disabled={isSubmittingReview}
                          style={{
                            ...reviewEasyButtonStyle,
                            width: isCompactLayout ? '100%' : undefined,
                            maxWidth: isCompactLayout ? 'none' : reviewEasyButtonStyle.maxWidth,
                            minHeight: isCompactLayout ? '44px' : reviewEasyButtonStyle.minHeight,
                            fontSize: isCompactLayout ? '0.82rem' : undefined,
                            gap: isCompactLayout ? '6px' : reviewEasyButtonStyle.gap,
                          }}
                        >
                          <CheckCircle2 size={isCompactLayout ? 16 : 18} />
                          <span>{isSubmittingReview ? 'Saving...' : 'Easy'}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ ...reviewDecisionPlaceholderStyle, width: '100%', maxWidth: 'none' }} />
                        <div style={{ ...reviewDecisionPlaceholderStyle, width: '100%', maxWidth: 'none' }} />
                        <div style={{ ...reviewDecisionPlaceholderStyle, width: '100%', maxWidth: 'none' }} />
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      ...reviewNavRowStyle,
                      display: isCompactLayout ? 'grid' : reviewNavRowStyle.display,
                      gridTemplateColumns: isCompactLayout ? '1fr 1fr 1fr' : undefined,
                      gap: isCompactLayout ? '10px' : reviewNavRowStyle.gap,
                    }}
                  >
                    <button
                      type="button"
                      onClick={moveToPreviousCard}
                      disabled={reviewIndex === 0}
                      style={{
                        ...reviewNavButtonStyle,
                        width: isCompactLayout ? '100%' : undefined,
                        maxWidth: isCompactLayout ? 'none' : reviewNavButtonStyle.maxWidth,
                        minWidth: isCompactLayout ? '0' : reviewNavButtonStyle.minWidth,
                        minHeight: isCompactLayout ? '44px' : reviewNavButtonStyle.minHeight,
                        fontSize: isCompactLayout ? '0.82rem' : undefined,
                        gap: isCompactLayout ? '5px' : reviewNavButtonStyle.gap,
                      }}
                    >
                      <ArrowLeft size={isCompactLayout ? 16 : 18} />
                      <span>Prev</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFlip}
                      style={{
                        ...reviewFlipButtonStyle,
                        width: isCompactLayout ? '100%' : undefined,
                        maxWidth: isCompactLayout ? 'none' : reviewFlipButtonStyle.maxWidth,
                        minWidth: isCompactLayout ? '0' : reviewFlipButtonStyle.minWidth,
                        minHeight: isCompactLayout ? '44px' : reviewFlipButtonStyle.minHeight,
                        fontSize: isCompactLayout ? '0.82rem' : undefined,
                        gap: isCompactLayout ? '5px' : reviewFlipButtonStyle.gap,
                      }}
                    >
                      <RotateCcw size={isCompactLayout ? 16 : 18} />
                      <span>{isFlipped ? 'Hide' : 'Flip'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={moveToNextCard}
                      disabled={reviewIndex >= activeReviewCards.length - 1}
                      style={{
                        ...reviewNavButtonStyle,
                        width: isCompactLayout ? '100%' : undefined,
                        maxWidth: isCompactLayout ? 'none' : reviewNavButtonStyle.maxWidth,
                        minWidth: isCompactLayout ? '0' : reviewNavButtonStyle.minWidth,
                        minHeight: isCompactLayout ? '44px' : reviewNavButtonStyle.minHeight,
                        fontSize: isCompactLayout ? '0.82rem' : undefined,
                        gap: isCompactLayout ? '5px' : reviewNavButtonStyle.gap,
                      }}
                    >
                      <span>Next</span>
                      <ArrowRight size={isCompactLayout ? 16 : 18} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={reviewEmptyStateStyle}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>
                  {newOnly ? 'No new cards left in New Only.' : 'Session complete.'}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {newOnly
                    ? 'Turn New Only off to review the rest of this session, or reset to start over.'
                    : 'You have finished the current review queue. Reset the session or go back to the set overview.'}
                </div>
              </div>
            )}
          </div>
        ) : isReviewLoading ? (
          <div style={reviewLoadingSkeletonCardStyle}>
            <div style={{ ...skeletonLineStyle, width: '32%', height: '16px' }} />
            <div style={{ ...skeletonLineStyle, width: '100%', height: '220px', borderRadius: '24px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', width: '100%' }}>
              <div style={{ ...skeletonLineStyle, width: '100%', height: '48px', borderRadius: '18px' }} />
              <div style={{ ...skeletonLineStyle, width: '100%', height: '48px', borderRadius: '18px' }} />
              <div style={{ ...skeletonLineStyle, width: '100%', height: '48px', borderRadius: '18px' }} />
            </div>
          </div>
        ) : isCompactLayout ? (
          <div style={{ display: 'grid', gap: '14px' }}>
            {isSetsLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={`mobile-flash-skeleton-${index}`} style={flashcardSkeletonStyle}>
                  <div style={{ ...skeletonLineStyle, width: '62%' }} />
                  <div style={{ ...skeletonLineStyle, width: '38%', height: '12px' }} />
                </div>
              ))
            ) : sets.length > 0 ? (
              flashcardSetList
            ) : (
              <div style={flashEmptyStateStyle}>
                <div style={flashEmptyStateTitleStyle}>No flashcard sets yet</div>
                <div style={flashEmptyStateTextStyle}>
                  Generate your first set from a topic and Pluto will queue the cards here for daily review.
                </div>
                <button
                  type="button"
                  className="app-button"
                  style={flashEmptyStateButtonStyle}
                  onClick={() => setMobileView('create')}
                >
                  Create your first set
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={flashLibraryEmptyPanelStyle}>
            {isSetsLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={`desktop-flash-skeleton-${index}`} style={flashcardSkeletonStyle}>
                  <div style={{ ...skeletonLineStyle, width: '62%' }} />
                  <div style={{ ...skeletonLineStyle, width: '38%', height: '12px' }} />
                </div>
              ))
            ) : sets.length > 0 ? (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                Choose a flashcard set from the left panel to browse or review it.
              </div>
            ) : (
              <div style={flashEmptyStateStyle}>
                <div style={flashEmptyStateTitleStyle}>No flashcard sets yet</div>
                <div style={flashEmptyStateTextStyle}>
                  Create your first set to start building a spaced-repetition queue for this subject.
                </div>
                <button
                  type="button"
                  className="app-button"
                  style={flashEmptyStateButtonStyle}
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  Create your first set
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      ) : null}
    </div>
  );
};

const flashPanelStyle: CSSProperties = {
  background: 'var(--glass-bg-medium)',
  border: '1px solid var(--glass-border)',
  borderRadius: '24px',
  padding: '20px',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
};

const reviewPanelStyle: CSSProperties = {
  background: `
    radial-gradient(circle at top, color-mix(in srgb, var(--primary) 18%, transparent), transparent 42%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--background) 78%, rgba(130, 110, 255, 0.1)),
      color-mix(in srgb, var(--glass-bg-medium) 92%, rgba(14, 26, 55, 0.06))
    )
  `,
};

const flashPromptBarStyle: CSSProperties = {
  background: 'var(--glass-bg-strong)',
  backdropFilter: 'blur(20px)',
  border: '1px solid var(--glass-border-strong)',
  padding: '10px',
  borderRadius: '28px',
  boxShadow: 'var(--glass-inner-glow), var(--glass-shadow-lg)',
};

const flashInputRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
};

const flashComposerInputStyle: CSSProperties = {
  minHeight: '46px',
  borderRadius: '18px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  color: 'var(--text-primary)',
  padding: '0 14px',
  width: '100%',
};

const flashActionButtonStyle: CSSProperties = {
  borderRadius: '18px',
  minHeight: '48px',
  justifyContent: 'center',
};

const flashSetCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  borderRadius: '16px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg-subtle)',
  padding: '14px',
  color: 'inherit',
  cursor: 'pointer',
};

const reviewShellStyle: CSSProperties = {
  display: 'grid',
  gap: '20px',
  minHeight: '100%',
};

const mobileReviewHeaderStyle: CSSProperties = {
  display: 'grid',
  gap: '4px',
  padding: '4px 2px 0',
};

const mobileSwitcherStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
};

const mobileSwitcherButtonStyle: CSSProperties = {
  minHeight: '40px',
  borderRadius: '999px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--glass-border)',
  background: 'var(--glass-bg-subtle)',
  color: 'var(--text-secondary)',
  fontWeight: 700,
  fontSize: '0.84rem',
  cursor: 'pointer',
};

const mobileSwitcherButtonActiveStyle: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--primary) 38%, var(--glass-border))',
  background: 'color-mix(in srgb, var(--primary) 14%, var(--glass-bg))',
  color: 'var(--text-primary)',
};

const reviewTopRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '18px',
  flexWrap: 'wrap',
};

const reviewToolbarStyle: CSSProperties = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
};

const reviewToolButtonStyle: CSSProperties = {
  minHeight: '50px',
  padding: '0 18px',
  borderRadius: '16px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'color-mix(in srgb, var(--primary) 18%, var(--glass-border))',
  background: 'color-mix(in srgb, var(--glass-bg-strong) 92%, rgba(32, 48, 94, 0.04))',
  color: 'var(--text-primary)',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  cursor: 'pointer',
};

const reviewToolButtonActiveStyle: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--primary) 42%, var(--glass-border))',
  boxShadow: '0 0 0 1px color-mix(in srgb, var(--primary) 18%, transparent) inset',
};

const reviewResetButtonStyle: CSSProperties = {
  ...reviewToolButtonStyle,
  background: 'color-mix(in srgb, rgba(198, 69, 83, 0.16) 82%, var(--glass-bg-strong))',
  borderColor: 'color-mix(in srgb, rgba(198, 69, 83, 0.35) 78%, var(--glass-border))',
  color: 'color-mix(in srgb, #d74457 86%, var(--text-primary))',
};

const reviewProgressClusterStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
  minWidth: 'min(100%, 320px)',
  flex: '1 1 320px',
};

const reviewMetricsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'baseline',
  gap: '18px',
  flexWrap: 'wrap',
};

const reviewMetricPrimaryStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 800,
  fontSize: '1.4rem',
};

const reviewMetricSecondaryStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontWeight: 700,
};

const reviewPercentStyle: CSSProperties = {
  color: 'var(--primary)',
  fontWeight: 800,
  fontSize: '1.2rem',
};

const reviewProgressTrackStyle: CSSProperties = {
  height: '12px',
  borderRadius: '999px',
  background: 'color-mix(in srgb, var(--glass-bg-strong) 88%, rgba(20, 32, 66, 0.08))',
  overflow: 'hidden',
};

const reviewProgressFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: '999px',
  background:
    'linear-gradient(90deg, rgba(144, 61, 255, 0.98), rgba(183, 82, 255, 0.98) 54%, rgba(58, 255, 177, 0.96) 100%)',
  boxShadow: '0 0 20px rgba(155, 73, 255, 0.45)',
  transition: 'width 220ms ease',
};

const reviewCardButtonStyle: CSSProperties = {
  width: '100%',
  minHeight: '325px',
  border: 'none',
  background: 'transparent',
  padding: '0',
  cursor: 'pointer',
  perspective: '1800px',
};

const reviewFlipInnerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  minHeight: '325px',
  transformStyle: 'preserve-3d',
  transition: 'transform 560ms cubic-bezier(0.22, 1, 0.36, 1)',
};

const reviewCardFaceStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: '30px',
  border: '1px solid color-mix(in srgb, var(--primary) 34%, var(--glass-border))',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  textAlign: 'center',
  backfaceVisibility: 'hidden',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 70px rgba(0, 0, 0, 0.28)',
};

const reviewCardFrontStyle: CSSProperties = {
  background: `
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--primary) 18%, var(--glass-bg-strong)),
      color-mix(in srgb, var(--glass-bg-medium) 86%, rgba(45, 64, 118, 0.08))
    )
  `,
};

const reviewCardBackStyle: CSSProperties = {
  background: `
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--primary) 10%, var(--glass-bg-strong)),
      color-mix(in srgb, var(--glass-bg-medium) 92%, rgba(9, 43, 78, 0.08))
    )
  `,
  transform: 'rotateY(180deg)',
};

const reviewCardBadgeStyle: CSSProperties = {
  padding: '12px 24px',
  borderRadius: '999px',
  background: 'color-mix(in srgb, var(--primary) 18%, var(--glass-bg))',
  color: 'color-mix(in srgb, var(--primary) 70%, var(--text-primary))',
  fontWeight: 800,
  letterSpacing: '0.04em',
};

const reviewCardConceptStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontWeight: 700,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  fontSize: '0.82rem',
};

const reviewCardHeaderStyle: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: '20px',
  alignSelf: 'start',
};

const reviewCardBodyStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  alignSelf: 'stretch',
  minHeight: '0',
  width: '100%',
  overflowY: 'auto',
  padding: '0 6px',
};

const reviewCardFooterStyle: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  alignSelf: 'end',
};

const reviewCardTextStyle: CSSProperties = {
  fontSize: 'clamp(0.98rem, 1.8vw, 1.85rem)',
  fontWeight: 800,
  lineHeight: 1.3,
  color: 'var(--text-primary)',
  maxWidth: '100%',
  overflowWrap: 'anywhere',
};

const reviewCardHintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '1rem',
};

const reviewDecisionRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '16px',
  flexWrap: 'wrap',
  minHeight: '54px',
};

const reviewDecisionPlaceholderStyle: CSSProperties = {
  flex: '1 1 180px',
  maxWidth: '220px',
  minHeight: '54px',
  visibility: 'hidden',
};

const reviewHardButtonStyle: CSSProperties = {
  flex: '1 1 180px',
  maxWidth: '220px',
  minHeight: '54px',
  borderRadius: '18px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'color-mix(in srgb, rgba(198, 69, 83, 0.35) 80%, var(--glass-border))',
  background: 'color-mix(in srgb, rgba(198, 69, 83, 0.12) 75%, var(--glass-bg-strong))',
  color: 'color-mix(in srgb, #cf4860 86%, var(--text-primary))',
  fontWeight: 800,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  cursor: 'pointer',
};

const reviewGoodButtonStyle: CSSProperties = {
  flex: '1 1 180px',
  maxWidth: '220px',
  minHeight: '54px',
  borderRadius: '18px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'color-mix(in srgb, rgba(53, 144, 238, 0.38) 82%, var(--glass-border))',
  background: 'color-mix(in srgb, rgba(53, 144, 238, 0.14) 76%, var(--glass-bg-strong))',
  color: 'color-mix(in srgb, #2b86d9 86%, var(--text-primary))',
  fontWeight: 800,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  cursor: 'pointer',
};

const reviewEasyButtonStyle: CSSProperties = {
  flex: '1 1 180px',
  maxWidth: '220px',
  minHeight: '54px',
  borderRadius: '18px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'color-mix(in srgb, rgba(58, 180, 123, 0.35) 82%, var(--glass-border))',
  background: 'color-mix(in srgb, rgba(58, 180, 123, 0.14) 76%, var(--glass-bg-strong))',
  color: 'color-mix(in srgb, #2da871 86%, var(--text-primary))',
  fontWeight: 800,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  cursor: 'pointer',
};

const reviewNavRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '14px',
  flexWrap: 'wrap',
};

const reviewNavButtonStyle: CSSProperties = {
  flex: '1 1 140px',
  minWidth: '120px',
  maxWidth: '170px',
  minHeight: '56px',
  borderRadius: '18px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'color-mix(in srgb, var(--primary) 16%, var(--glass-border))',
  background: 'color-mix(in srgb, var(--glass-bg-strong) 92%, rgba(18, 30, 62, 0.04))',
  color: 'var(--text-primary)',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  cursor: 'pointer',
};

const reviewFlipButtonStyle: CSSProperties = {
  ...reviewNavButtonStyle,
  background:
    'linear-gradient(135deg, color-mix(in srgb, var(--primary) 84%, white), var(--primary) 70%, color-mix(in srgb, var(--primary) 82%, rgba(201, 115, 255, 1)) 100%)',
  borderColor: 'color-mix(in srgb, var(--primary) 50%, var(--glass-border))',
  boxShadow: '0 18px 36px color-mix(in srgb, var(--primary) 22%, transparent)',
};

const reviewEmptyStateStyle: CSSProperties = {
  minHeight: '480px',
  display: 'grid',
  placeItems: 'center',
  textAlign: 'center',
  gap: '10px',
};

const flashErrorCardStyle: CSSProperties = {
  marginTop: '12px',
  display: 'grid',
  gap: '10px',
  borderRadius: '20px',
  border: '1px solid color-mix(in srgb, rgba(198, 69, 83, 0.32) 78%, var(--glass-border))',
  background: 'color-mix(in srgb, rgba(198, 69, 83, 0.1) 68%, var(--glass-bg-subtle))',
  padding: '14px',
};

const flashErrorTitleStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 800,
};

const flashErrorTextStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.92rem',
  lineHeight: 1.55,
};

const flashRetryButtonStyle: CSSProperties = {
  minHeight: '40px',
  borderRadius: '14px',
  justifyContent: 'center',
};

const skeletonLineStyle: CSSProperties = {
  height: '14px',
  borderRadius: '999px',
  background: 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.4), rgba(255,255,255,0.18))',
};

const flashcardSkeletonStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
  borderRadius: '18px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg-subtle)',
  padding: '14px',
};

const flashEmptyStateStyle: CSSProperties = {
  display: 'grid',
  gap: '12px',
  placeItems: 'start',
  borderRadius: '20px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg-subtle)',
  padding: '18px',
};

const flashEmptyStateTitleStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 800,
  fontSize: '1rem',
};

const flashEmptyStateTextStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.94rem',
  lineHeight: 1.6,
};

const flashEmptyStateButtonStyle: CSSProperties = {
  minHeight: '42px',
  borderRadius: '14px',
  justifyContent: 'center',
};

const flashLibraryEmptyPanelStyle: CSSProperties = {
  display: 'grid',
  gap: '14px',
  placeItems: 'center',
  alignContent: 'center',
  minHeight: '100%',
  color: 'var(--text-secondary)',
  textAlign: 'center',
  padding: '24px',
};

const reviewLoadingSkeletonCardStyle: CSSProperties = {
  display: 'grid',
  gap: '14px',
  alignContent: 'center',
  minHeight: '100%',
};



