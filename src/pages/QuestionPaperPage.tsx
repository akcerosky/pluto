import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import {
  deleteQuestionPaper,
  generateQuestionPaper,
  generateQuestionPaperPdf,
  getQuestionPapers,
} from '../lib/plutoApi';
import {
  DEFAULT_QUESTION_PAPER_EDUCATION_LEVEL,
  DEFAULT_QUESTION_PAPER_EXAM_BOARD,
  QUESTION_PAPER_EDUCATION_LEVEL_GROUPS,
  QUESTION_PAPER_EXAM_BOARD_GROUPS,
  getQuestionPaperEducationLevelPlaceholder,
  getQuestionPaperExamBoardPlaceholder,
  questionPaperEducationLevelRequiresCustomInput,
  questionPaperExamBoardRequiresCustomInput,
  resolveQuestionPaperSelectValue,
} from '../lib/questionPaperFormOptions';
import { normalizeLearningErrorMessage } from '../lib/learningUi';
import type { QuestionPaperDoc } from '../types';

const downloadBase64File = (base64Data: string, filename: string, mimeType: string) => {
  const bytes = Uint8Array.from(atob(base64Data), (character) => character.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const stripMarkdownNoise = (value: string) =>
  normalizeWhitespace(
    value
      .replace(/\*\*/g, ' ')
      .replace(/[`#>~_]/g, ' ')
      .replace(/\s+([.,:;!?])/g, '$1')
  );

const SUBJECT_LABELS = [
  'Physics',
  'Chemistry',
  'Biology',
  'Mathematics',
  'Maths',
  'English',
  'History',
  'Geography',
  'Economics',
  'Political Science',
  'Computer Science',
  'Science',
];

const inferPaperSourceType = (paper: Partial<QuestionPaperDoc>) => {
  if (paper.sourceType === 'pdf' || paper.sourceType === 'topic') {
    return paper.sourceType;
  }

  if ((paper.sourcePdfNames?.length ?? 0) > 0 || typeof paper.sourcePdfTextLength === 'number') {
    return 'pdf' as const;
  }

  return 'topic' as const;
};

const inferDisplaySubject = (paper: QuestionPaperDoc) => {
  const raw = stripMarkdownNoise(`${paper.subject || ''} ${paper.title || ''}`);
  const matched = SUBJECT_LABELS.find((label) => new RegExp(`\\b${label.replace(/\s+/g, '\\s+')}\\b`, 'i').test(raw));
  if (matched) {
    return matched === 'Maths' ? 'Mathematics' : matched;
  }
  return stripMarkdownNoise(paper.subject || '').slice(0, 48) || 'General';
};

const getDisplayTitle = (paper: QuestionPaperDoc) => {
  const cleanedTitle = stripMarkdownNoise(paper.title || '');
  const hasBrokenInference =
    /this document primarily focuses/i.test(cleanedTitle) ||
    cleanedTitle.length > 90 ||
    cleanedTitle.split(' ').length > 10;

  if (inferPaperSourceType(paper) === 'pdf' && hasBrokenInference) {
    return `${paper.educationLevel} ${paper.examBoard} ${inferDisplaySubject(paper)}`;
  }

  return cleanedTitle || `${paper.educationLevel} ${paper.examBoard} ${inferDisplaySubject(paper)}`;
};

const getDisplaySourceLabel = (paper: QuestionPaperDoc) =>
  inferPaperSourceType(paper) === 'pdf' ? 'From PDF' : 'From topic';

const getDisplayFailureMessage = (paper: QuestionPaperDoc) => {
  return normalizeLearningErrorMessage({
    error: stripMarkdownNoise(paper.failureMessage || ''),
    fallback: 'This paper could not be generated. Please delete it and try again.',
  });
};

export const QuestionPaperPage = ({
  sourceType = 'topic',
  refreshToken = 0,
  mobilePreviousPapersResetToken = 0,
  onRequestNewGeneration,
}: {
  sourceType?: 'topic' | 'pdf';
  refreshToken?: number;
  mobilePreviousPapersResetToken?: number;
  onRequestNewGeneration?: () => void;
}) => {
  const isMountedRef = useRef(true);
  const [subject, setSubject] = useState('');
  const [educationLevel, setEducationLevel] = useState(DEFAULT_QUESTION_PAPER_EDUCATION_LEVEL);
  const [educationLevelCustomValue, setEducationLevelCustomValue] = useState('');
  const [examBoard, setExamBoard] = useState(DEFAULT_QUESTION_PAPER_EXAM_BOARD);
  const [examBoardCustomValue, setExamBoardCustomValue] = useState('');
  const [topic, setTopic] = useState('');
  const [papers, setPapers] = useState<QuestionPaperDoc[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListLoading, setIsListLoading] = useState(true);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [generationErrorMessage, setGenerationErrorMessage] = useState<string | null>(null);
  const [lastGenerationPayload, setLastGenerationPayload] = useState<{
    subject: string;
    educationLevel: string;
    examBoard: string;
    topic?: string;
  } | null>(null);
  const [mobileView, setMobileView] = useState<'new' | 'previous'>('new');
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 900 : false)
  );
  const compactListPanelRef = useRef<HTMLDivElement | null>(null);
  const compactPaperPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth < 900);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadPapers = useCallback(async () => {
    if (isMountedRef.current) {
      setIsListLoading(true);
    }
    try {
      const response = await getQuestionPapers();
      const filteredPapers = response.papers.filter((paper) => inferPaperSourceType(paper) === sourceType);
      if (isMountedRef.current) {
        setPapers(filteredPapers);
      }
      return filteredPapers;
    } finally {
      if (isMountedRef.current) {
        setIsListLoading(false);
      }
    }
  }, [sourceType]);

  useEffect(() => {
    void loadPapers();
  }, [loadPapers, refreshToken]);

  useEffect(() => {
    if (isCompactLayout && mobilePreviousPapersResetToken > 0) {
      setActivePaperId(null);
    }
  }, [isCompactLayout, mobilePreviousPapersResetToken]);

  const activePaper = useMemo(
    () => {
      if (isCompactLayout && activePaperId === null) {
        return null;
      }
      return papers.find((paper) => paper.id === activePaperId) ?? papers[0] ?? null;
    },
    [activePaperId, isCompactLayout, papers]
  );
  const effectiveMobileView = sourceType === 'pdf' ? 'previous' : mobileView;
  const isActivePaperReady =
    activePaper?.status === 'ready' &&
    Boolean(activePaper.format) &&
    Array.isArray(activePaper.questions);
  const showCompactPreviousList =
    isCompactLayout && effectiveMobileView === 'previous' && activePaperId === null;
  const showCompactPreviousPaper =
    isCompactLayout && effectiveMobileView === 'previous' && activePaperId !== null;
  const shouldShowEmbeddedMobileSwitcher = false;
  const shouldShowInlineComposer = false;
  const educationLevelNeedsCustomInput = questionPaperEducationLevelRequiresCustomInput(educationLevel);
  const examBoardNeedsCustomInput = questionPaperExamBoardRequiresCustomInput(examBoard);
  const resolvedEducationLevel = resolveQuestionPaperSelectValue(
    educationLevel,
    educationLevelCustomValue,
    educationLevelNeedsCustomInput
  );
  const resolvedExamBoard = resolveQuestionPaperSelectValue(
    examBoard,
    examBoardCustomValue,
    examBoardNeedsCustomInput
  );
  const isGenerateDisabled =
    isLoading ||
    !subject.trim() ||
    (educationLevelNeedsCustomInput && !educationLevelCustomValue.trim()) ||
    (examBoardNeedsCustomInput && !examBoardCustomValue.trim());

  useEffect(() => {
    if (!isCompactLayout) return;

    const target = showCompactPreviousPaper
      ? compactPaperPanelRef.current
      : showCompactPreviousList || effectiveMobileView === 'new'
        ? compactListPanelRef.current
        : null;

    if (!target) return;

    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [effectiveMobileView, isCompactLayout, showCompactPreviousList, showCompactPreviousPaper]);

  const extractGenerationErrorMessage = (error: unknown) => {
    return normalizeLearningErrorMessage({
      error,
      fallback: 'Generation failed before Pluto could finish building the paper. Please try again.',
    });
  };

  const openGeneratorView = () => {
    if (isCompactLayout) {
      setMobileView('new');
    }
    setActivePaperId(null);
    onRequestNewGeneration?.();
  };

  const handleRetryActivePaper = async () => {
    if (!activePaper) return;

    if (sourceType === 'pdf') {
      openGeneratorView();
      return;
    }

    await handleGenerate({
      subject: activePaper.subject,
      educationLevel: activePaper.educationLevel,
      examBoard: activePaper.examBoard,
      topic: activePaper.topic || undefined,
    });
  };

  const findFailedPaperForPayload = (
    availablePapers: QuestionPaperDoc[],
    payload: { subject: string; educationLevel: string; examBoard: string; topic?: string }
  ) => {
    const normalizedSubject = normalizeWhitespace(payload.subject).toLowerCase();
    const normalizedTopic = normalizeWhitespace(payload.topic || '').toLowerCase();

    const exactMatch = availablePapers.find(
      (paper) =>
        paper.status === 'failed' &&
        paper.educationLevel === payload.educationLevel &&
        paper.examBoard === payload.examBoard &&
        normalizeWhitespace(paper.subject || '').toLowerCase() === normalizedSubject &&
        normalizeWhitespace(paper.topic || '').toLowerCase() === normalizedTopic
    );

    if (exactMatch) {
      return exactMatch;
    }

    const boardMatch = availablePapers.find(
      (paper) =>
        paper.status === 'failed' &&
        paper.educationLevel === payload.educationLevel &&
        paper.examBoard === payload.examBoard
    );

    return boardMatch ?? availablePapers.find((paper) => paper.status === 'failed') ?? null;
  };

  const handleGenerate = async (overridePayload?: {
    subject: string;
    educationLevel: string;
    examBoard: string;
    topic?: string;
  }) => {
    const payload = overridePayload ?? {
      subject: normalizeWhitespace(subject),
      educationLevel: resolvedEducationLevel,
      examBoard: resolvedExamBoard,
      topic: normalizeWhitespace(topic) || undefined,
    };

    setLastGenerationPayload(payload);
    setGenerationErrorMessage(null);
    setIsLoading(true);
    setStatusText('Searching exam format and generating questions...');
    try {
      const result = await generateQuestionPaper(payload);
      await loadPapers();
      setActivePaperId(result.paperId);
      setGenerationErrorMessage(null);
      if (isCompactLayout) {
        setMobileView('previous');
      }
    } catch (error) {
      const nextPapers = await loadPapers();
      const failedPaper = findFailedPaperForPayload(nextPapers, payload);
      setGenerationErrorMessage(extractGenerationErrorMessage(error));
      if (failedPaper) {
        setActivePaperId(failedPaper.id);
        if (isCompactLayout) {
          setMobileView('previous');
        }
      }
    } finally {
      setIsLoading(false);
      setStatusText(null);
    }
  };

  const handleDelete = async (paperId: string) => {
    await deleteQuestionPaper({ paperId });
    await loadPapers();
    if (activePaperId === paperId) {
      setActivePaperId(null);
    }
  };

  const handleDownload = async (paperId: string) => {
    const result = await generateQuestionPaperPdf({ paperId });
    downloadBase64File(result.base64Pdf, result.filename, 'application/pdf');
  };

  const renderEducationLevelSelect = () => (
    <>
      <select
        value={educationLevel}
        onChange={(event) => setEducationLevel(event.target.value)}
        style={composerInputStyle}
      >
        {QUESTION_PAPER_EDUCATION_LEVEL_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {educationLevelNeedsCustomInput ? (
        <input
          value={educationLevelCustomValue}
          onChange={(event) => setEducationLevelCustomValue(event.target.value)}
          placeholder={getQuestionPaperEducationLevelPlaceholder(educationLevel)}
          style={composerInputStyle}
        />
      ) : null}
    </>
  );

  const renderExamBoardSelect = () => (
    <>
      <select
        value={examBoard}
        onChange={(event) => setExamBoard(event.target.value)}
        style={composerInputStyle}
      >
        {QUESTION_PAPER_EXAM_BOARD_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((board) => (
              <option key={board.value} value={board.value}>
                {board.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {examBoardNeedsCustomInput ? (
        <input
          value={examBoardCustomValue}
          onChange={(event) => setExamBoardCustomValue(event.target.value)}
          placeholder={getQuestionPaperExamBoardPlaceholder(examBoard)}
          style={composerInputStyle}
        />
      ) : null}
    </>
  );

  const renderTopicComposer = () => (
    <div style={promptBarShellStyle}>
      {isCompactLayout ? (
        <div style={fieldStackStyle}>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            style={composerInputStyle}
          />
          <div
            style={{
              ...stackedSelectRowStyle,
              gridTemplateColumns: '1fr',
            }}
          >
            {renderEducationLevelSelect()}
            {renderExamBoardSelect()}
          </div>
          <div
            style={{
              ...actionRowStyle,
              flexDirection: 'column',
              alignItems: 'stretch',
            }}
          >
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Topic (optional)"
              style={{ ...composerInputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerateDisabled}
              className="app-button"
              style={{
                ...composerActionButtonStyle,
                width: '100%',
              }}
            >
              {isLoading ? <Loader2 size={18} className="spin" /> : null}
              <span>Generate Paper</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={desktopComposerRowStyle}>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            style={composerInputStyle}
          />
          <div style={stackedInlineFieldStyle}>{renderEducationLevelSelect()}</div>
          <div style={stackedInlineFieldStyle}>{renderExamBoardSelect()}</div>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Topic (optional)"
            style={composerInputStyle}
          />
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isGenerateDisabled}
            className="app-button"
            style={composerActionButtonStyle}
          >
            {isLoading ? <Loader2 size={18} className="spin" /> : null}
            <span>Generate Paper</span>
          </button>
        </div>
      )}
      {statusText ? (
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
            padding: '2px 6px 0',
          }}
        >
          {statusText}
        </div>
      ) : null}
      {generationErrorMessage ? (
        <div style={inlineErrorCardStyle}>
          <div style={inlineErrorTitleStyle}>Generation failed</div>
          <div style={inlineErrorTextStyle}>{generationErrorMessage}</div>
          <button
            type="button"
            onClick={() => {
              if (lastGenerationPayload) {
                void handleGenerate(lastGenerationPayload);
              }
            }}
            disabled={isLoading || !lastGenerationPayload}
            className="outline-button"
            style={inlineRetryButtonStyle}
          >
            Retry generation
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderPaperListPanel = ({ withHeading }: { withHeading: boolean }) => (
    <div
      ref={compactListPanelRef}
      style={{
        ...panelStyle,
        height: isCompactLayout ? undefined : panelStyle.height,
        minHeight: isCompactLayout ? 'fit-content' : panelStyle.minHeight,
        alignSelf: isCompactLayout ? 'stretch' : undefined,
        overflow: isCompactLayout ? 'visible' : panelStyle.overflow,
        overflowY: isCompactLayout ? 'visible' : 'auto',
      }}
    >
      {withHeading ? <h3 style={panelTitleStyle}>Generated from PDFs</h3> : null}
      {sourceType === 'pdf' ? (
        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Upload PDFs above, then review the generated papers here.
        </div>
      ) : null}

      <div style={{ marginTop: withHeading ? '22px' : 0 }}>
        <div style={recentPapersLabelStyle}>RECENT PAPERS</div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {isListLoading
            ? Array.from({ length: 3 }, (_, index) => (
                <div key={`paper-skeleton-${index}`} style={paperCardSkeletonStyle}>
                  <div style={{ display: 'grid', gap: '10px', width: '100%' }}>
                    <div style={{ ...skeletonLineStyle, width: '72%' }} />
                    <div style={{ ...skeletonLineStyle, width: '48%', height: '12px' }} />
                  </div>
                </div>
              ))
            : papers.map((paper) => (
            <div
              key={paper.id}
              onClick={() => setActivePaperId(paper.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActivePaperId(paper.id);
                }
              }}
              role="button"
              tabIndex={0}
              style={{
                ...paperCardStyle,
                border:
                  activePaper?.id === paper.id
                    ? '1px solid rgba(136, 104, 255, 0.45)'
                    : '1px solid var(--glass-border)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{getDisplayTitle(paper)}</div>
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.84rem',
                    marginTop: '4px',
                  }}
                >
                  {paper.examBoard} · {inferDisplaySubject(paper)} · {getDisplaySourceLabel(paper)} ·{' '}
                  <span
                    style={
                      paper.status === 'failed'
                        ? failedStatusPillStyle
                        : paper.status === 'generating'
                          ? generatingStatusPillStyle
                          : readyStatusPillStyle
                    }
                  >
                    {paper.status}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDelete(paper.id);
                }}
                className="ghost-button"
                style={paperCardDeleteButtonStyle}
                aria-label={`Delete ${getDisplayTitle(paper)}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!isListLoading && papers.length === 0 ? (
            <div style={emptyStateCardStyle}>
              <div style={emptyStateTitleStyle}>
                {sourceType === 'pdf' ? 'No PDF papers yet' : 'No question papers yet'}
              </div>
              <div style={emptyStateTextStyle}>
                {sourceType === 'pdf'
                  ? 'Upload your first PDF set above and Pluto will turn it into a structured paper here.'
                  : 'Generate your first topic-based paper to start building your paper library.'}
              </div>
              <button
                type="button"
                onClick={openGeneratorView}
                className="outline-button"
                style={emptyStateButtonStyle}
              >
                {sourceType === 'pdf' ? 'Go to upload' : 'Create first paper'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderPaperPreviewPanel = () => (
    <div
      ref={compactPaperPanelRef}
      style={{
        ...panelStyle,
        height: isCompactLayout ? undefined : panelStyle.height,
        minHeight: isCompactLayout ? 'fit-content' : panelStyle.minHeight,
        alignSelf: isCompactLayout ? 'stretch' : undefined,
        overflow: isCompactLayout ? 'visible' : panelStyle.overflow,
        overflowY: isCompactLayout ? 'visible' : 'auto',
      }}
    >
      {activePaper ? (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              alignItems: isCompactLayout ? 'stretch' : 'flex-start',
              flexDirection: isCompactLayout ? 'column' : 'row',
              marginBottom: '18px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{getDisplayTitle(activePaper)}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
                {inferDisplaySubject(activePaper)} · {activePaper.examBoard} · {activePaper.educationLevel} ·{' '}
                {getDisplaySourceLabel(activePaper)}
              </div>
            </div>
            {isActivePaperReady ? (
              <button
                type="button"
                onClick={() => void handleDownload(activePaper.id)}
                className="outline-button"
                style={{ minHeight: '40px', width: isCompactLayout ? '100%' : undefined }}
              >
                <Download size={16} />
                <span>Download PDF</span>
              </button>
            ) : null}
          </div>
          {activePaper.status === 'generating' ? (
            <div style={paperStateStyle}>
              <Loader2 size={20} className="spin" />
              <div style={{ fontWeight: 800 }}>Generating question paper...</div>
              <div style={paperStateTextStyle}>
                {sourceType === 'pdf'
                  ? 'Pluto is still processing the uploaded PDFs and drafting the paper. This panel will populate once the paper is ready.'
                  : 'Pluto is still extracting the format and drafting the paper. This panel will populate once the paper is ready.'}
              </div>
              <button
                type="button"
                onClick={() => void handleRetryActivePaper()}
                disabled={isLoading}
                className="outline-button"
                style={inlineRetryButtonStyle}
              >
                {sourceType === 'pdf' ? 'Upload PDFs again' : 'Try again'}
              </button>
            </div>
          ) : activePaper.status === 'failed' ? (
            <div style={paperStateStyle}>
              <div style={{ fontWeight: 800 }}>Generation failed</div>
              <div style={paperStateTextStyle}>{getDisplayFailureMessage(activePaper)}</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => void handleRetryActivePaper()}
                  disabled={isLoading}
                  className="outline-button"
                  style={inlineRetryButtonStyle}
                >
                  {sourceType === 'pdf' ? 'Upload PDFs again' : 'Retry generation'}
                </button>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', alignSelf: 'center' }}>
                  {sourceType === 'pdf'
                    ? 'Delete this failed attempt if you no longer need it, then re-upload the PDFs above.'
                    : 'Or delete this failed attempt and start fresh.'}
                </div>
              </div>
            </div>
          ) : isActivePaperReady ? (
            <div
              style={{
                color: 'var(--text-primary)',
                lineHeight: 1.65,
                height: isCompactLayout ? 'auto' : '100%',
                overflow: isCompactLayout ? 'visible' : 'hidden',
                overflowY: isCompactLayout ? 'visible' : 'auto',
                minWidth: 0,
              }}
            >
              <div style={{ marginBottom: '18px', fontWeight: 700 }}>
                Time Allowed: {activePaper.format.duration} · Maximum Marks: {activePaper.format.totalMarks}
              </div>
              {activePaper.format.sections.map((section) => (
                <div key={section.name} style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '6px' }}>
                    {section.name} - {section.questionType}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    {section.instructions}
                  </div>
                  {activePaper.questions
                    .filter((question) => question.sectionName === section.name)
                    .map((question) => (
                      <div key={question.id} style={{ marginBottom: '12px' }}>
                        <div>
                          {question.questionNumber}. {question.text}{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>[{question.marks}]</span>
                        </div>
                        {question.options?.length ? (
                          <div
                            style={{
                              marginTop: '6px',
                              paddingLeft: '18px',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {question.options.map((option) => (
                              <div key={option}>{option}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                </div>
              ))}
              {activePaper.webSearchSources?.length ? (
                <div
                  style={{
                    marginTop: '18px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    wordBreak: 'break-word',
                  }}
                >
                  Sources: {activePaper.webSearchSources.join(', ')}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={paperStateStyle}>
              <div style={{ fontWeight: 800 }}>Paper is not ready yet</div>
              <div style={paperStateTextStyle}>
                This paper is still being prepared. Please check back in a moment.
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100%',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}
        >
          Generate a paper to see it here.
        </div>
      )}
    </div>
  );

  if (sourceType === 'topic') {
    return (
      <div
        style={{
          display: isCompactLayout ? 'flex' : 'grid',
          flexDirection: isCompactLayout ? 'column' : undefined,
          gridTemplateRows: isCompactLayout ? undefined : 'auto minmax(0, 1fr)',
          height: isCompactLayout ? 'auto' : '100%',
          minHeight: 0,
          overflowY: isCompactLayout ? 'visible' : 'hidden',
        }}
      >
        {isCompactLayout ? (
          <div style={{ padding: '20px 22px 0', flexShrink: 0 }}>
            <div style={mobilePaperSwitcherStyle}>
              <button
                type="button"
                onClick={() => setMobileView('new')}
                style={{
                  ...mobilePaperSwitcherButtonStyle,
                  ...(mobileView === 'new' ? mobilePaperSwitcherButtonActiveStyle : null),
                }}
              >
                New Papers
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mobileView === 'previous' && activePaperId !== null) {
                    setActivePaperId(null);
                  } else {
                    setMobileView('previous');
                  }
                }}
                style={{
                  ...mobilePaperSwitcherButtonStyle,
                  ...(mobileView === 'previous' ? mobilePaperSwitcherButtonActiveStyle : null),
                }}
              >
                Previous Papers
              </button>
            </div>
          </div>
        ) : null}

        {!isCompactLayout || effectiveMobileView === 'new' ? (
          <div style={{ padding: '20px 22px 0', flexShrink: 0 }}>{renderTopicComposer()}</div>
        ) : null}

        {!isCompactLayout || effectiveMobileView === 'previous' ? (
          <div
            style={{
              padding: '20px 22px 22px',
              display: isCompactLayout ? 'flex' : 'grid',
              flexDirection: isCompactLayout ? 'column' : undefined,
              gridTemplateColumns: isCompactLayout ? undefined : '340px minmax(0, 1fr)',
              gridTemplateRows: isCompactLayout ? undefined : 'minmax(0, 1fr)',
              gap: '18px',
              height: isCompactLayout ? 'auto' : '100%',
              minHeight: 0,
              alignItems: isCompactLayout ? 'start' : 'stretch',
              overflowY: isCompactLayout ? 'visible' : 'hidden',
            }}
          >
            {!isCompactLayout || showCompactPreviousList ? renderPaperListPanel({ withHeading: false }) : null}
            {!isCompactLayout || showCompactPreviousPaper ? renderPaperPreviewPanel() : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: isCompactLayout ? '16px' : '22px',
        display: isCompactLayout ? 'flex' : 'grid',
        flexDirection: isCompactLayout ? 'column' : undefined,
        gridTemplateColumns: isCompactLayout ? undefined : '340px minmax(0, 1fr)',
        gridTemplateRows: isCompactLayout ? undefined : 'minmax(0, 1fr)',
        gap: '18px',
        height: isCompactLayout ? 'auto' : '100%',
        minHeight: 0,
        alignItems: isCompactLayout ? 'start' : 'stretch',
        overflowY: isCompactLayout ? 'visible' : 'hidden',
      }}
    >
      {shouldShowEmbeddedMobileSwitcher ? (
        <div style={mobilePaperSwitcherStyle}>
          <button
            type="button"
            onClick={() => setMobileView('new')}
            style={{
              ...mobilePaperSwitcherButtonStyle,
              ...(mobileView === 'new' ? mobilePaperSwitcherButtonActiveStyle : null),
            }}
          >
            New Papers
          </button>
          <button
            type="button"
            onClick={() => {
              if (mobileView === 'previous' && activePaperId !== null) {
                setActivePaperId(null);
              } else {
                setMobileView('previous');
              }
            }}
            style={{
              ...mobilePaperSwitcherButtonStyle,
              ...(mobileView === 'previous' ? mobilePaperSwitcherButtonActiveStyle : null),
            }}
          >
            Previous Papers
          </button>
        </div>
      ) : null}
      {!isCompactLayout || effectiveMobileView === 'new' || showCompactPreviousList ? (
        <div
          ref={compactListPanelRef}
          style={{
            ...panelStyle,
            height: isCompactLayout ? undefined : panelStyle.height,
            minHeight: isCompactLayout ? 'fit-content' : panelStyle.minHeight,
            alignSelf: isCompactLayout ? 'stretch' : undefined,
            overflow: isCompactLayout ? 'visible' : panelStyle.overflow,
            overflowY: isCompactLayout ? 'visible' : 'auto',
          }}
        >
        <h3 style={panelTitleStyle}>Generated from PDFs</h3>
        {shouldShowInlineComposer ? (
          <div style={promptBarShellStyle}>
            <div style={fieldStackStyle}>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                style={composerInputStyle}
              />
              <div
                style={{
                  ...stackedSelectRowStyle,
                  gridTemplateColumns: isCompactLayout ? '1fr' : '1fr 1fr',
                }}
              >
                {renderEducationLevelSelect()}
                {renderExamBoardSelect()}
              </div>
              <div
                style={{
                  ...actionRowStyle,
                  flexDirection: isCompactLayout ? 'column' : 'row',
                  alignItems: isCompactLayout ? 'stretch' : 'center',
                }}
              >
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Topic (optional)"
                  style={{ ...composerInputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerateDisabled}
                  className="app-button"
                  style={{
                    ...composerActionButtonStyle,
                    width: isCompactLayout ? '100%' : undefined,
                  }}
                >
                  {isLoading ? <Loader2 size={18} className="spin" /> : null}
                  <span>Generate Paper</span>
                </button>
              </div>
            </div>
            {statusText ? (
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.88rem',
                  padding: '2px 6px 0',
                }}
              >
                {statusText}
              </div>
            ) : null}
            {generationErrorMessage ? (
              <div style={inlineErrorCardStyle}>
                <div style={inlineErrorTitleStyle}>Generation failed</div>
                <div style={inlineErrorTextStyle}>{generationErrorMessage}</div>
                <button
                  type="button"
                  onClick={() => {
                    if (lastGenerationPayload) {
                      void handleGenerate(lastGenerationPayload);
                    }
                  }}
                  disabled={isLoading || !lastGenerationPayload}
                  className="outline-button"
                  style={inlineRetryButtonStyle}
                >
                  Retry generation
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Upload PDFs above, then review the generated papers here.
          </div>
        )}

        <div style={{ marginTop: '22px' }}>
          <div style={recentPapersLabelStyle}>RECENT PAPERS</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {papers.map((paper) => (
              <div
                key={paper.id}
                onClick={() => setActivePaperId(paper.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActivePaperId(paper.id);
                  }
                }}
                role="button"
                tabIndex={0}
                style={{
                  ...paperCardStyle,
                  border:
                    activePaper?.id === paper.id
                      ? '1px solid rgba(136, 104, 255, 0.45)'
                      : '1px solid var(--glass-border)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{getDisplayTitle(paper)}</div>
                  <div
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.84rem',
                      marginTop: '4px',
                    }}
                  >
                    {paper.examBoard} · {inferDisplaySubject(paper)} · {getDisplaySourceLabel(paper)} ·{' '}
                    <span
                      style={
                        paper.status === 'failed'
                          ? failedStatusPillStyle
                          : paper.status === 'generating'
                            ? generatingStatusPillStyle
                            : readyStatusPillStyle
                      }
                    >
                      {paper.status}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDelete(paper.id);
                  }}
                  className="ghost-button"
                  style={paperCardDeleteButtonStyle}
                  aria-label={`Delete ${getDisplayTitle(paper)}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
        </div>
      ) : null}

      {!isCompactLayout || showCompactPreviousPaper ? (
        <div
          ref={compactPaperPanelRef}
          style={{
            ...panelStyle,
            height: isCompactLayout ? undefined : panelStyle.height,
            minHeight: isCompactLayout ? 'fit-content' : panelStyle.minHeight,
            alignSelf: isCompactLayout ? 'stretch' : undefined,
            overflow: isCompactLayout ? 'visible' : panelStyle.overflow,
            overflowY: isCompactLayout ? 'visible' : 'auto',
          }}
        >
        {activePaper ? (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
                alignItems: isCompactLayout ? 'stretch' : 'flex-start',
                flexDirection: isCompactLayout ? 'column' : 'row',
                marginBottom: '18px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{getDisplayTitle(activePaper)}</div>
                <div style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
                  {inferDisplaySubject(activePaper)} · {activePaper.examBoard} · {activePaper.educationLevel} ·{' '}
                  {getDisplaySourceLabel(activePaper)}
                </div>
              </div>
              {isActivePaperReady ? (
                <button
                  type="button"
                  onClick={() => void handleDownload(activePaper.id)}
                  className="outline-button"
                  style={{ minHeight: '40px', width: isCompactLayout ? '100%' : undefined }}
                >
                  <Download size={16} />
                  <span>Download PDF</span>
                </button>
              ) : null}
            </div>
            {activePaper.status === 'generating' ? (
              <div style={paperStateStyle}>
                <Loader2 size={20} className="spin" />
                <div style={{ fontWeight: 800 }}>Generating question paper...</div>
                <div style={paperStateTextStyle}>
                  {sourceType === 'pdf'
                    ? 'Pluto is still processing the uploaded PDFs and drafting the paper. This panel will populate once the paper is ready.'
                    : 'Pluto is still extracting the format and drafting the paper. This panel will populate once the paper is ready.'}
                </div>
                <button
                  type="button"
                  onClick={() => void handleRetryActivePaper()}
                  disabled={isLoading}
                  className="outline-button"
                  style={inlineRetryButtonStyle}
                >
                  {sourceType === 'pdf' ? 'Upload PDFs again' : 'Try again'}
                </button>
              </div>
            ) : activePaper.status === 'failed' ? (
              <div style={paperStateStyle}>
                <div style={{ fontWeight: 800 }}>Generation failed</div>
                <div style={paperStateTextStyle}>{getDisplayFailureMessage(activePaper)}</div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => void handleRetryActivePaper()}
                    disabled={isLoading}
                    className="outline-button"
                    style={inlineRetryButtonStyle}
                  >
                    {sourceType === 'pdf' ? 'Upload PDFs again' : 'Retry generation'}
                  </button>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', alignSelf: 'center' }}>
                    {sourceType === 'pdf'
                      ? 'Delete this failed attempt if you no longer need it, then re-upload the PDFs above.'
                      : 'Or delete this failed attempt and start fresh.'}
                  </div>
                </div>
              </div>
            ) : isActivePaperReady ? (
              <div
                style={{
                  color: 'var(--text-primary)',
                  lineHeight: 1.65,
                  height: isCompactLayout ? 'auto' : '100%',
                  overflow: isCompactLayout ? 'visible' : 'hidden',
                  overflowY: isCompactLayout ? 'visible' : 'auto',
                  minWidth: 0,
                }}
              >
                <div style={{ marginBottom: '18px', fontWeight: 700 }}>
                  Time Allowed: {activePaper.format.duration} · Maximum Marks:{' '}
                  {activePaper.format.totalMarks}
                </div>
                {activePaper.format.sections.map((section) => (
                  <div key={section.name} style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '6px' }}>
                      {section.name} - {section.questionType}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      {section.instructions}
                    </div>
                    {activePaper.questions
                      .filter((question) => question.sectionName === section.name)
                      .map((question) => (
                        <div key={question.id} style={{ marginBottom: '12px' }}>
                          <div>
                            {question.questionNumber}. {question.text}{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>
                              [{question.marks}]
                            </span>
                          </div>
                          {question.options?.length ? (
                            <div
                              style={{
                                marginTop: '6px',
                                paddingLeft: '18px',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {question.options.map((option) => (
                                <div key={option}>{option}</div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                  </div>
                ))}
                {activePaper.webSearchSources?.length ? (
                  <div
                    style={{
                      marginTop: '18px',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      wordBreak: 'break-word',
                    }}
                  >
                    Sources: {activePaper.webSearchSources.join(', ')}
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={paperStateStyle}>
                <div style={{ fontWeight: 800 }}>Paper is not ready yet</div>
                <div style={paperStateTextStyle}>
                  This paper is still being prepared. Please check back in a moment.
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={emptyPreviewStateStyle}>
            <div style={emptyStateTitleStyle}>
              {sourceType === 'pdf' ? 'Your generated PDF paper will appear here' : 'Your next paper will appear here'}
            </div>
            <div style={emptyStateTextStyle}>
              {sourceType === 'pdf'
                ? 'Upload PDFs above, then open the generated paper here to review and download it.'
                : 'Generate a paper from the left panel and Pluto will open the finished paper here.'}
            </div>
            <button
              type="button"
              onClick={openGeneratorView}
              className="outline-button"
              style={emptyStateButtonStyle}
            >
              {sourceType === 'pdf' ? 'Go to upload' : 'Create paper'}
            </button>
          </div>
        )}
        </div>
      ) : null}
    </div>
  );
};

const panelStyle: CSSProperties = {
  background: 'var(--glass-bg-medium)',
  border: '1px solid var(--glass-border)',
  borderRadius: '24px',
  padding: '20px',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  minWidth: 0,
};

const panelTitleStyle: CSSProperties = {
  margin: '0 0 16px',
  fontSize: '1.1rem',
  color: 'var(--text-primary)',
};

const fieldStackStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
};

const promptBarShellStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
  background: 'var(--glass-bg-strong)',
  backdropFilter: 'blur(20px)',
  border: '1px solid var(--glass-border-strong)',
  padding: '10px',
  borderRadius: '28px',
  boxShadow: 'var(--glass-inner-glow), var(--glass-shadow-lg)',
};

const stackedSelectRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
};

const desktopComposerRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 1.1fr) minmax(150px, 0.9fr) minmax(140px, 0.85fr) minmax(220px, 1.3fr) auto',
  gap: '10px',
  alignItems: 'center',
};

const stackedInlineFieldStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
};

const composerInputStyle: CSSProperties = {
  minHeight: '46px',
  borderRadius: '18px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  color: 'var(--text-primary)',
  padding: '0 14px',
  width: '100%',
};

const composerActionButtonStyle: CSSProperties = {
  minHeight: '48px',
  justifyContent: 'center',
  borderRadius: '18px',
  flexShrink: 0,
};

const recentPapersLabelStyle: CSSProperties = {
  fontSize: '0.76rem',
  color: 'var(--text-secondary)',
  letterSpacing: '0.12em',
  fontWeight: 800,
  marginBottom: '10px',
};

const paperCardStyle: CSSProperties = {
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
  width: '100%',
  textAlign: 'left',
};

const paperCardSkeletonStyle: CSSProperties = {
  ...paperCardStyle,
  cursor: 'default',
  pointerEvents: 'none',
};

const paperStateStyle: CSSProperties = {
  minHeight: '260px',
  display: 'grid',
  placeItems: 'center',
  textAlign: 'center',
  gap: '10px',
};

const paperStateTextStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
  maxWidth: '520px',
};

const paperCardDeleteButtonStyle: CSSProperties = {
  width: '56px',
  height: '56px',
  minWidth: '56px',
  minHeight: '56px',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '16px',
};

const inlineErrorCardStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
  borderRadius: '20px',
  border: '1px solid color-mix(in srgb, rgba(198, 69, 83, 0.32) 78%, var(--glass-border))',
  background: 'color-mix(in srgb, rgba(198, 69, 83, 0.1) 68%, var(--glass-bg-subtle))',
  padding: '14px',
};

const inlineErrorTitleStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 800,
};

const inlineErrorTextStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  lineHeight: 1.55,
  fontSize: '0.92rem',
};

const inlineRetryButtonStyle: CSSProperties = {
  minHeight: '40px',
  justifyContent: 'center',
  borderRadius: '14px',
};

const skeletonLineStyle: CSSProperties = {
  height: '16px',
  borderRadius: '999px',
  background: 'linear-gradient(90deg, rgba(190, 200, 232, 0.24), rgba(255,255,255,0.5), rgba(190, 200, 232, 0.24))',
};

const emptyStateCardStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
  borderRadius: '20px',
  border: '1px dashed color-mix(in srgb, var(--primary) 24%, var(--glass-border))',
  background: 'color-mix(in srgb, var(--glass-bg-subtle) 90%, rgba(136, 104, 255, 0.04))',
  padding: '18px',
  textAlign: 'left',
};

const emptyStateTitleStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 800,
  fontSize: '1rem',
};

const emptyStateTextStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  lineHeight: 1.55,
  fontSize: '0.92rem',
};

const emptyStateButtonStyle: CSSProperties = {
  minHeight: '40px',
  justifyContent: 'center',
  borderRadius: '14px',
};

const emptyPreviewStateStyle: CSSProperties = {
  minHeight: '260px',
  display: 'grid',
  placeItems: 'center',
  textAlign: 'center',
  gap: '10px',
};

const failedStatusPillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: '999px',
  background: 'color-mix(in srgb, rgba(198, 69, 83, 0.14) 76%, var(--glass-bg))',
  color: 'color-mix(in srgb, #cf4860 86%, var(--text-primary))',
  fontWeight: 700,
  textTransform: 'capitalize',
};

const generatingStatusPillStyle: CSSProperties = {
  ...failedStatusPillStyle,
  background: 'color-mix(in srgb, rgba(109, 123, 255, 0.14) 76%, var(--glass-bg))',
  color: 'color-mix(in srgb, #5b67ff 86%, var(--text-primary))',
};

const readyStatusPillStyle: CSSProperties = {
  ...failedStatusPillStyle,
  background: 'color-mix(in srgb, rgba(58, 180, 123, 0.14) 76%, var(--glass-bg))',
  color: 'color-mix(in srgb, #2da871 86%, var(--text-primary))',
};

const mobilePaperSwitcherStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
};

const mobilePaperSwitcherButtonStyle: CSSProperties = {
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

const mobilePaperSwitcherButtonActiveStyle: CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--primary) 38%, var(--glass-border))',
  background: 'color-mix(in srgb, var(--primary) 14%, var(--glass-bg))',
  color: 'var(--text-primary)',
};
