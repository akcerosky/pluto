import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import {
  deleteQuestionPaper,
  generateQuestionPaper,
  generateQuestionPaperPdf,
  getQuestionPapers,
} from '../lib/plutoApi';
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

  if (paper.sourceType === 'pdf' && hasBrokenInference) {
    return `${paper.educationLevel} ${paper.examBoard} ${inferDisplaySubject(paper)}`;
  }

  return cleanedTitle || `${paper.educationLevel} ${paper.examBoard} ${inferDisplaySubject(paper)}`;
};

const getDisplayFailureMessage = (paper: QuestionPaperDoc) => {
  const message = stripMarkdownNoise(paper.failureMessage || '');
  if (!message) {
    return 'This paper could not be generated. Please delete it and try again.';
  }
  if (/Cannot use "undefined" as a Firestore value/i.test(message)) {
    return 'This saved attempt failed before Pluto could finish building the paper. Please delete it and generate it again.';
  }
  if (/Question paper generation returned invalid JSON/i.test(message)) {
    return 'Pluto could not structure this paper correctly on that attempt. Please generate it again.';
  }
  return message;
};

export const QuestionPaperPage = ({
  sourceType = 'topic',
  refreshToken = 0,
  mobilePreviousPapersResetToken = 0,
}: {
  sourceType?: 'topic' | 'pdf';
  refreshToken?: number;
  mobilePreviousPapersResetToken?: number;
}) => {
  const [subject, setSubject] = useState('');
  const [educationLevel, setEducationLevel] = useState('Class 10');
  const [examBoard, setExamBoard] = useState('CBSE');
  const [topic, setTopic] = useState('');
  const [papers, setPapers] = useState<QuestionPaperDoc[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'new' | 'previous'>('new');
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false)
  );
  const compactListPanelRef = useRef<HTMLDivElement | null>(null);
  const compactPaperPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth < 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadPapers = useCallback(async () => {
    const response = await getQuestionPapers();
    setPapers(response.papers.filter((paper) => paper.sourceType === sourceType));
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

  const handleGenerate = async () => {
    setIsLoading(true);
    setStatusText('Searching exam format and generating questions...');
    try {
      const result = await generateQuestionPaper({
        subject,
        educationLevel,
        examBoard,
        topic: topic || undefined,
      });
      await loadPapers();
      setActivePaperId(result.paperId);
      if (isCompactLayout) {
        setMobileView('previous');
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
        overflowY: isCompactLayout ? 'auto' : 'hidden',
      }}
    >
      {isCompactLayout && sourceType === 'topic' ? (
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
            height: isCompactLayout ? 'auto' : panelStyle.height,
            overflow: isCompactLayout ? 'visible' : panelStyle.overflow,
            overflowY: isCompactLayout ? 'visible' : 'auto',
          }}
        >
        <h3 style={panelTitleStyle}>
          {sourceType === 'pdf' ? 'Generated from PDFs' : 'Question Paper Generator'}
        </h3>
        {sourceType === 'topic' ? (
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
                <select
                  value={educationLevel}
                  onChange={(event) => setEducationLevel(event.target.value)}
                  style={composerInputStyle}
                >
                  {[
                    'Class 6',
                    'Class 7',
                    'Class 8',
                    'Class 9',
                    'Class 10',
                    'Class 11',
                    'Class 12',
                    'Undergraduate',
                    'Postgraduate',
                  ].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
                <select
                  value={examBoard}
                  onChange={(event) => setExamBoard(event.target.value)}
                  style={composerInputStyle}
                >
                  {[
                    'CBSE',
                    'ICSE',
                    'IGCSE',
                    'IB',
                    'JEE Mains',
                    'JEE Advanced',
                    'NEET',
                    'UPSC',
                  ].map((board) => (
                    <option key={board} value={board}>
                      {board}
                    </option>
                  ))}
                </select>
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
                  disabled={isLoading || !subject.trim()}
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
                    {paper.examBoard} · {inferDisplaySubject(paper)} · {paper.status}
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
            height: isCompactLayout ? 'auto' : panelStyle.height,
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
                  {inferDisplaySubject(activePaper)} · {activePaper.examBoard} · {activePaper.educationLevel}
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
                  Pluto is still extracting the format and drafting the paper. This panel will populate once the
                  paper is ready.
                </div>
              </div>
            ) : activePaper.status === 'failed' ? (
              <div style={paperStateStyle}>
                <div style={{ fontWeight: 800 }}>Generation failed</div>
                <div style={paperStateTextStyle}>{getDisplayFailureMessage(activePaper)}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  Delete this attempt from the list and generate a fresh paper.
                </div>
              </div>
            ) : isActivePaperReady ? (
              <div
                style={{
                  color: 'var(--text-primary)',
                  lineHeight: 1.65,
                  overflowY: 'auto',
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

const mobilePaperSwitcherStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
};

const mobilePaperSwitcherButtonStyle: CSSProperties = {
  minHeight: '40px',
  borderRadius: '999px',
  border: '1px solid var(--glass-border)',
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
