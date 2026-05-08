import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { fileToBase64 } from '../lib/attachments';
import {
  DEFAULT_ACADEMIC_SELECTION,
  getResolvedAcademicSelection,
} from '../lib/questionPaperFormOptions';
import { normalizeLearningErrorMessage } from '../lib/learningUi';
import { generatePaperFromPdfs } from '../lib/plutoApi';
import { QuestionPaperPage } from './QuestionPaperPage';
import { CascadingAcademicSelector } from '../components/Learning/CascadingAcademicSelector';

const PDF_GENERATION_PROGRESS_MESSAGES = [
  'Extracting text from PDFs...',
  'Analysing content...',
  'Researching exam format...',
  'Generating questions...',
  'Finalising paper...',
] as const;

const PDF_GENERATION_PROGRESS_INTERVAL_MS = 8_000;

export const PdfQuestionPaperPage = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [academicSelection, setAcademicSelection] = useState(DEFAULT_ACADEMIC_SELECTION);
  const [subject, setSubject] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [progressStepIndex, setProgressStepIndex] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastUploadRequest, setLastUploadRequest] = useState<{
    files: File[];
    educationLevel: string;
    examBoard: string;
    subject?: string;
  } | null>(null);
  const [mobileView, setMobileView] = useState<'new' | 'previous'>('new');
  const [mobilePreviousPapersResetToken, setMobilePreviousPapersResetToken] = useState(0);
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 900 : false)
  );
  const progressIntervalRef = useRef<number | null>(null);

  const clearProgressInterval = () => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth < 900);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(
    () => () => {
      clearProgressInterval();
    },
    []
  );

  useEffect(() => {
    if (!isUploading) {
      clearProgressInterval();
      return;
    }

    setStatusMessage(PDF_GENERATION_PROGRESS_MESSAGES[0]);
    setProgressStepIndex(0);
    clearProgressInterval();
    progressIntervalRef.current = window.setInterval(() => {
      setProgressStepIndex((current) =>
        Math.min(current + 1, PDF_GENERATION_PROGRESS_MESSAGES.length - 1)
      );
    }, PDF_GENERATION_PROGRESS_INTERVAL_MS);

    return () => {
      clearProgressInterval();
    };
  }, [isUploading]);

  useEffect(() => {
    if (!isUploading) {
      return;
    }
    setStatusMessage(PDF_GENERATION_PROGRESS_MESSAGES[progressStepIndex]);
  }, [isUploading, progressStepIndex]);

  const totalSizeMb = useMemo(
    () => (files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(2),
    [files]
  );
  const resolvedAcademicSelection = getResolvedAcademicSelection(academicSelection);
  const isGenerateDisabled =
    isUploading ||
    files.length === 0 ||
    !resolvedAcademicSelection.isComplete;

  const extractUploadErrorMessage = (error: unknown) => {
    return normalizeLearningErrorMessage({
      error,
      fallback: 'PDF generation failed before Pluto could finish building the paper. Please try again.',
    });
  };

  const handleUpload = async (overrideRequest?: {
    files: File[];
    educationLevel: string;
    examBoard: string;
    subject?: string;
  }) => {
    const request = overrideRequest ?? {
      files,
      educationLevel: resolvedAcademicSelection.educationLevel,
      examBoard: resolvedAcademicSelection.examBoard,
      subject: subject.trim() || undefined,
    };

    setLastUploadRequest(request);
    setIsUploading(true);
    setProgressStepIndex(0);
    setErrorMessage(null);
    setStatusMessage(PDF_GENERATION_PROGRESS_MESSAGES[0]);
    try {
      const pdfAttachments = await Promise.all(
        request.files.map(async (file) => ({
          name: file.name,
          mimeType: 'application/pdf' as const,
          sizeBytes: file.size,
          base64Data: await fileToBase64(file),
        }))
      );
      await generatePaperFromPdfs({
        pdfAttachments,
        educationLevel: request.educationLevel,
        examBoard: request.examBoard,
        subject: request.subject,
      });
      setFiles([]);
      setRefreshToken((current) => current + 1);
      if (isCompactLayout) {
        setMobileView('previous');
      }
      setStatusMessage('Question paper generated. Check the generated papers list below.');
    } catch (error) {
      setErrorMessage(extractUploadErrorMessage(error));
      setStatusMessage(null);
      setRefreshToken((current) => current + 1);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRequestNewGeneration = () => {
    setMobileView('new');
    setErrorMessage(null);
    setStatusMessage(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

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
                if (mobileView === 'previous') {
                  setMobilePreviousPapersResetToken((current) => current + 1);
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
      {!isCompactLayout || mobileView === 'new' ? (
        <div style={{ padding: '20px 22px 0', flexShrink: 0 }}>
          <div
            style={{
              ...pdfPromptBarStyle,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isCompactLayout ? '1fr' : 'minmax(180px, 1fr) minmax(440px, 2fr) minmax(160px, 0.85fr) minmax(150px, 0.7fr)',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <label
                style={{
                  minHeight: isCompactLayout ? '52px' : '46px',
                  borderRadius: '18px',
                  border: '1px dashed color-mix(in srgb, var(--primary) 42%, var(--glass-border))',
                  background: 'var(--glass-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '0 14px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <UploadCloud size={18} />
                <span>{files.length ? `${files.length} PDF(s) selected` : 'Choose PDFs'}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                  style={{ display: 'none' }}
                />
              </label>
              <div style={{ minWidth: 0 }}>
                <CascadingAcademicSelector
                  selection={academicSelection}
                  onChange={setAcademicSelection}
                />
              </div>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject (optional)" style={pdfComposerInputStyle} />
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={isGenerateDisabled}
                className="app-button"
                style={{
                  ...pdfActionButtonStyle,
                  width: isCompactLayout ? '100%' : undefined,
                }}
              >
                {isUploading ? <Loader2 size={16} className="spin" /> : null}
                <span>Generate</span>
              </button>
            </div>
            {files.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
                {files.map((file) => (
                  <div key={file.name} style={fileChipStyle}>
                    <span>{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                    <button type="button" onClick={() => setFiles((current) => current.filter((item) => item.name !== file.name))} className="ghost-button">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <div style={{ ...fileChipStyle, color: Number(totalSizeMb) > 7 ? 'var(--warning)' : 'var(--text-secondary)' }}>
                  Total: {totalSizeMb} MB
                </div>
              </div>
            ) : null}
            {statusMessage ? (
              <div style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {statusMessage}
              </div>
            ) : null}
            {errorMessage ? (
              <div style={pdfErrorCardStyle}>
                <div style={pdfErrorTitleStyle}>Generation failed</div>
                <div style={pdfErrorTextStyle}>{errorMessage}</div>
                <button
                  type="button"
                  onClick={() => {
                    if (lastUploadRequest) {
                      void handleUpload(lastUploadRequest);
                    }
                  }}
                  disabled={isUploading || !lastUploadRequest}
                  className="outline-button"
                  style={pdfRetryButtonStyle}
                >
                  Retry generation
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {!isCompactLayout || mobileView === 'previous' ? (
        <QuestionPaperPage
          sourceType="pdf"
          refreshToken={refreshToken}
          mobilePreviousPapersResetToken={mobilePreviousPapersResetToken}
          onRequestNewGeneration={handleRequestNewGeneration}
        />
      ) : null}
    </div>
  );
};

const pdfPromptBarStyle: CSSProperties = {
  borderRadius: '28px',
  border: '1px solid var(--glass-border-strong)',
  background: 'var(--glass-bg-strong)',
  backdropFilter: 'blur(20px)',
  padding: '10px',
  boxShadow: 'var(--glass-inner-glow), var(--glass-shadow-lg)',
};

const pdfComposerInputStyle: CSSProperties = {
  minHeight: '46px',
  borderRadius: '18px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  color: 'var(--text-primary)',
  padding: '0 14px',
};

const pdfActionButtonStyle: CSSProperties = {
  borderRadius: '18px',
  minHeight: '48px',
  justifyContent: 'center',
};

const fileChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '999px',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg-subtle)',
  padding: '8px 12px',
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
  border: '1px solid color-mix(in srgb, var(--primary) 38%, var(--glass-border))',
  background: 'color-mix(in srgb, var(--primary) 14%, var(--glass-bg))',
  color: 'var(--text-primary)',
};

const pdfErrorCardStyle: CSSProperties = {
  marginTop: '12px',
  display: 'grid',
  gap: '10px',
  borderRadius: '20px',
  border: '1px solid color-mix(in srgb, rgba(198, 69, 83, 0.32) 78%, var(--glass-border))',
  background: 'color-mix(in srgb, rgba(198, 69, 83, 0.1) 68%, var(--glass-bg-subtle))',
  padding: '14px',
};

const pdfErrorTitleStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 800,
};

const pdfErrorTextStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.9rem',
  lineHeight: 1.55,
};

const pdfRetryButtonStyle: CSSProperties = {
  minHeight: '40px',
  borderRadius: '14px',
  justifyContent: 'center',
};
