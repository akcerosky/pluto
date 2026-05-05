import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { fileToBase64 } from '../lib/attachments';
import { generatePaperFromPdfs } from '../lib/plutoApi';
import { QuestionPaperPage } from './QuestionPaperPage';

export const PdfQuestionPaperPage = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [educationLevel, setEducationLevel] = useState('Class 10');
  const [examBoard, setExamBoard] = useState('CBSE');
  const [subject, setSubject] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [mobileView, setMobileView] = useState<'new' | 'previous'>('new');
  const [mobilePreviousPapersResetToken, setMobilePreviousPapersResetToken] = useState(0);
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 900 : false)
  );

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth < 900);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalSizeMb = useMemo(
    () => (files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(2),
    [files]
  );

  const handleUpload = async () => {
    setIsUploading(true);
    setErrorMessage(null);
    setStatusMessage('Extracting your PDFs and generating a paper...');
    try {
      const pdfAttachments = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          mimeType: 'application/pdf' as const,
          sizeBytes: file.size,
          base64Data: await fileToBase64(file),
        }))
      );
      await generatePaperFromPdfs({
        pdfAttachments,
        educationLevel,
        examBoard,
        subject: subject || undefined,
      });
      setFiles([]);
      setRefreshToken((current) => current + 1);
      if (isCompactLayout) {
        setMobileView('previous');
      }
      setStatusMessage('Question paper generated. Check the generated papers list below.');
    } catch (error) {
      const fallbackMessage = 'PDF generation failed. Please try again in a moment.';
      const extractedMessage =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : fallbackMessage;
      setErrorMessage(extractedMessage || fallbackMessage);
      setStatusMessage(null);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      style={{
        display: isCompactLayout ? 'flex' : 'grid',
        flexDirection: isCompactLayout ? 'column' : undefined,
        gridTemplateRows: isCompactLayout ? undefined : 'auto minmax(0, 1fr)',
        height: isCompactLayout ? 'auto' : '100%',
        minHeight: 0,
        overflowY: isCompactLayout ? 'auto' : 'hidden',
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
                gridTemplateColumns: isCompactLayout ? '1fr' : '1.2fr 0.8fr 0.8fr 1fr auto',
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
              <select value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)} style={pdfComposerInputStyle}>
                {['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12', 'Undergraduate', 'Postgraduate'].map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
              <select value={examBoard} onChange={(event) => setExamBoard(event.target.value)} style={pdfComposerInputStyle}>
                {['CBSE', 'ICSE', 'IGCSE', 'IB', 'JEE Mains', 'JEE Advanced', 'NEET', 'UPSC'].map((board) => (
                  <option key={board} value={board}>{board}</option>
                ))}
              </select>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject (optional)" style={pdfComposerInputStyle} />
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={isUploading || files.length === 0}
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
              <div
                style={{
                  marginTop: '12px',
                  color: 'var(--error, #c64d5f)',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                }}
              >
                {errorMessage}
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
  borderColor: 'color-mix(in srgb, var(--primary) 38%, var(--glass-border))',
  background: 'color-mix(in srgb, var(--primary) 14%, var(--glass-bg))',
  color: 'var(--text-primary)',
};
