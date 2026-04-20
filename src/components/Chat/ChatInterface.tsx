import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../../context/useApp';
import {
  createTextPart,
  getMessageText,
  type FilePart,
  type ImagePart,
  type Message,
  type MessagePart,
} from '../../types';
import {
  Send,
  Award,
  User,
  Sparkles,
  Rocket,
  Folder,
  ChevronDown,
  X,
  MessageSquare,
  FileEdit,
  Lock,
  Paperclip,
  Camera,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { ProjectsModal } from '../Modals/ProjectsModal';
import { ConversationalModeUI, HomeworkModeUI, ExamPrepUI } from '../Modes/ModeSpecializations';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { getPlutoResponse } from '../../hooks/useAI';
import { estimateInlineRequestBytes, fileToBase64, type InlineAttachmentInput } from '../../lib/attachments';
import { formatTokenCount, formatTokenUsageSummary } from '../../lib/tokenQuota';

interface ComposerAttachment {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'file';
  previewUrl: string | null;
}

const formatBytes = (value: number) => {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
};

const getAttachmentMetadata = (
  file: File
): { kind: 'image' | 'file'; mimeType: string } | null => {
  if (file.type.startsWith('image/')) {
    return { kind: 'image', mimeType: file.type };
  }

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return { kind: 'file', mimeType: 'application/pdf' };
  }

  return null;
};

const AttachmentChip = ({
  part,
  onRemove,
}: {
  part: ImagePart | FilePart;
  onRemove?: () => void;
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '12px',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.12)',
      fontSize: '0.85rem',
      lineHeight: 1.2,
      maxWidth: '100%',
    }}
  >
    {part.type === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />}
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '220px',
          fontWeight: 600,
        }}
      >
        {part.name}
      </span>
      <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>
        {part.type === 'image' ? 'Image' : 'PDF'} • {formatBytes(part.sizeBytes)}
      </span>
    </div>
    {onRemove ? (
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          padding: 0,
          marginLeft: '4px',
        }}
      >
        <X size={14} />
      </button>
    ) : null}
  </div>
);

export const ChatInterface = () => {
  const {
    user,
    threads,
    activeThreadId,
    addMessageToThread,
    createThread,
    projects,
    activeProjectId,
    setActiveProjectId,
    currentPlan,
    planConfig,
    isSubscriptionHydrated,
    freePremiumModesRemainingToday,
    remainingTodayTokens,
    estimatedMessagesLeft,
    canSendMessage,
    canUseMode,
    applyServerSnapshot,
  } = useApp();

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const assignedProject = projects.find((p) => p.id === activeThread?.projectId);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);

  const composerHasContent = input.trim().length > 0 || attachments.length > 0;

  const releaseAttachmentPreview = (attachment: ComposerAttachment) => {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  };

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      attachmentsRef.current.forEach((attachment) => releaseAttachmentPreview(attachment));
    },
    []
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [activeThread?.messages, isLoading]);

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const next = current.filter((attachment) => attachment.id !== attachmentId);
      const removed = current.find((attachment) => attachment.id === attachmentId);
      if (removed) {
        releaseAttachmentPreview(removed);
      }
      return next;
    });
  };

  const clearAttachments = () => {
    setAttachments((current) => {
      current.forEach((attachment) => releaseAttachmentPreview(attachment));
      return [];
    });
  };

  const validateAttachment = (file: File) => {
    if (!planConfig.attachmentsEnabled) {
      return `${currentPlan} does not include attachment support. Upgrade to continue.`;
    }

    const metadata = getAttachmentMetadata(file);
    if (!metadata) {
      return 'Only images and PDFs are supported in Pluto attachments.';
    }

    if (metadata.kind === 'image' && !planConfig.allowedAttachmentKinds.includes('image')) {
      return `${currentPlan} supports PDFs only through Pro.`;
    }

    if (metadata.kind === 'file' && !planConfig.allowedAttachmentKinds.includes('pdf')) {
      return `${currentPlan} supports PDF attachments only on Pro.`;
    }

    if (file.size > planConfig.maxAttachmentBytes) {
      return `This file exceeds the ${currentPlan} attachment limit of ${formatBytes(planConfig.maxAttachmentBytes)}.`;
    }

    return null;
  };

  const appendFiles = (fileList: FileList | null) => {
    if (!fileList?.length) {
      return;
    }

    const nextAttachments: ComposerAttachment[] = [];
    for (const file of Array.from(fileList)) {
      const validationError = validateAttachment(file);
      if (validationError) {
        setPlanNotice(validationError);
        continue;
      }

      const metadata = getAttachmentMetadata(file);
      if (!metadata) {
        continue;
      }

      nextAttachments.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        mimeType: metadata.mimeType,
        sizeBytes: file.size,
        kind: metadata.kind,
        previewUrl: metadata.kind === 'image' ? URL.createObjectURL(file) : null,
      });
    }

    if (nextAttachments.length > 0) {
      setPlanNotice(null);
      setAttachments((current) => [...current, ...nextAttachments]);
    }
  };

  const handleAttachmentSelection = (event: ChangeEvent<HTMLInputElement>) => {
    appendFiles(event.target.files);
    event.target.value = '';
  };

  const openFilePicker = () => {
    if (!planConfig.attachmentsEnabled) {
      setPlanNotice(`${currentPlan} does not include attachment support. Upgrade to continue.`);
      return;
    }

    fileInputRef.current?.click();
  };

  const openCameraPicker = () => {
    if (!planConfig.attachmentsEnabled) {
      setPlanNotice(`${currentPlan} does not include attachment support. Upgrade to continue.`);
      return;
    }

    cameraInputRef.current?.click();
  };

  const attachmentParts = useMemo<MessagePart[]>(
    () =>
      attachments.map((attachment) => ({
        type: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
    [attachments]
  );

  if (!activeThread) {
    return (
      <div className="chat-empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="glass-card chat-empty-card"
          style={{ padding: '60px 40px', maxWidth: '600px' }}
        >
          <motion.div
            animate={{
              y: [0, -10, 0],
              filter: ['drop-shadow(0 0 10px var(--primary-glow))', 'drop-shadow(0 0 25px var(--primary-glow))', 'drop-shadow(0 0 10px var(--primary-glow))'],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: '100px',
              height: '100px',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              borderRadius: '30px',
              margin: '0 auto 32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
          >
            <Rocket size={50} color="white" />
          </motion.div>
          <h2 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '16px', letterSpacing: '-1px' }}>Welcome back, Astronaut.</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '40px' }}>
            Ready to continue your learning journey? Select a past conversation or start a new one to begin.
          </p>
          <div className="chat-empty-modes" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
            <motion.button
              whileHover={{ y: -5, background: 'rgba(138, 43, 226, 0.1)' }}
              onClick={() => createThread('Conversational', activeProjectId || undefined)}
              style={modeCardStyle}
            >
              <MessageSquare size={28} />
              <span>Exploration</span>
            </motion.button>
            <motion.button
              whileHover={{ y: -5, background: 'rgba(0, 210, 255, 0.1)' }}
              onClick={() =>
                canUseMode('Homework')
                  ? createThread('Homework', activeProjectId || undefined)
                  : setPlanNotice(
                      currentPlan === 'Free'
                        ? 'Upgrade required. Free plan includes 3 Homework / Exam Prep uses per day.'
                        : 'Homework mode is available on Plus and Pro plans.'
                    )
              }
              style={{ ...modeCardStyle, borderColor: 'rgba(0, 210, 255, 0.3)', color: 'var(--secondary)' }}
            >
              <FileEdit size={28} />
              <span>
                {currentPlan === 'Free'
                  ? `Homework (${freePremiumModesRemainingToday ?? 0} left)`
                  : canUseMode('Homework')
                    ? 'Homework'
                    : 'Homework (Plus)'}
              </span>
            </motion.button>
            <motion.button
              whileHover={{ y: -5, background: 'rgba(255, 0, 193, 0.1)' }}
              onClick={() =>
                canUseMode('ExamPrep')
                  ? createThread('ExamPrep', activeProjectId || undefined)
                  : setPlanNotice(
                      currentPlan === 'Free'
                        ? 'Upgrade required. Free plan includes 3 Homework / Exam Prep uses per day.'
                        : 'Exam Prep mode is available on Plus and Pro plans.'
                    )
              }
              style={{ ...modeCardStyle, borderColor: 'rgba(255, 0, 193, 0.3)', color: 'var(--accent)' }}
            >
              <Award size={28} />
              <span>
                {currentPlan === 'Free'
                  ? `Exam Prep (${freePremiumModesRemainingToday ?? 0} left)`
                  : canUseMode('ExamPrep')
                    ? 'Exam Prep'
                    : 'Exam Prep (Plus)'}
              </span>
            </motion.button>
          </div>
          {planNotice && <p style={{ marginTop: '18px', color: '#fbbf24', fontSize: '0.9rem' }}>{planNotice}</p>}
          {activeProjectId && (
            <button
              onClick={() => setActiveProjectId(null)}
              style={{ marginTop: '32px', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <X size={14} /> Clear project focus ({projects.find((p) => p.id === activeProjectId)?.name})
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  const handleSend = async () => {
    if (!composerHasContent || isLoading) return;

    const trimmedInput = input.trim();
    const access = canSendMessage(trimmedInput, activeThread.mode, {
      hasAttachments: attachments.length > 0,
    });
    if (!access.ok) {
      setPlanNotice(access.reason || 'Upgrade required to continue.');
      const blockedMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        parts: [
          createTextPart(
            `## Upgrade Required\n\n${access.reason}\n\nSwitch to **Plus** or **Pro** from Profile to continue.`
          ),
        ],
        mode: activeThread.mode,
        timestamp: Date.now(),
      };
      addMessageToThread(activeThread.id, blockedMsg);
      return;
    }

    setIsLoading(true);

    try {
      const inlineAttachments: InlineAttachmentInput[] = await Promise.all(
        attachments.map(async (attachment) => ({
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          base64Data: await fileToBase64(attachment.file),
        }))
      );

      const inlinePayloadBytes = estimateInlineRequestBytes({
        prompt: trimmedInput,
        attachments: inlineAttachments,
      });

      if (inlinePayloadBytes > planConfig.maxTotalAttachmentPayloadBytes) {
        setPlanNotice(
          'Attachments are too large to send inline. Reduce the number or size of files so the total request stays under 8 MB.'
        );
        return;
      }

      setPlanNotice(null);

      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        parts: [
          ...(trimmedInput ? [createTextPart(trimmedInput)] : []),
          ...attachmentParts,
        ],
        mode: activeThread.mode,
        timestamp: Date.now(),
      };

      addMessageToThread(activeThread.id, userMsg);
      setInput('');
      clearAttachments();

      const history = activeThread.messages
        .slice(-planConfig.historyWindow)
        .map((message) => ({ role: message.role, parts: message.parts }));

      const aiResponse = await getPlutoResponse(
        trimmedInput,
        user?.educationLevel || 'High School',
        activeThread.mode,
        user?.objective || 'General Learning',
        history,
        inlineAttachments
      );

      applyServerSnapshot({
        plan: aiResponse.subscription.plan,
        usageTodayTokens: aiResponse.usageTodayTokens,
        dailyTokenLimit: aiResponse.dailyTokenLimit,
        remainingTodayTokens: aiResponse.remainingTodayTokens,
        estimatedMessagesLeft: aiResponse.estimatedMessagesLeft,
        premiumModeCount: aiResponse.premiumModeCount,
        freePremiumModesRemainingToday: aiResponse.freePremiumModesRemainingToday,
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        parts: [createTextPart(aiResponse.answer)],
        mode: activeThread.mode,
        timestamp: Date.now(),
      };
      addMessageToThread(activeThread.id, assistantMsg);
    } catch (error: unknown) {
      console.error('AI Error:', error);
      const errorText = `Pluto Error: ${error instanceof Error ? error.message : 'Gravity glitch detected.'}`;

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        parts: [createTextPart(errorText)],
        mode: activeThread.mode,
        timestamp: Date.now(),
      };
      addMessageToThread(activeThread.id, errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const modeIcons = {
    Conversational: <MessageSquare size={18} />,
    Homework: <FileEdit size={18} />,
    ExamPrep: <Award size={18} />,
  };

  const handleQuickAction = (action: string) => {
    let prompt = action;
    if (action.includes('story')) prompt = "Tell me a fun story about what we're learning!";
    else if (action.includes('why')) prompt = 'Why is this important to know?';
    else if (action.includes('riddle')) prompt = 'Give me a learning riddle!';
    else if (action.includes('Guide me step by step')) prompt = 'Guide me step by step instead of giving the final answer.';
    else if (action.includes('Socratic walkthrough')) prompt = 'Use a Socratic walkthrough to help me reason this out.';
    else if (action.includes('Give an analogy')) prompt = 'Explain this with an analogy for my level.';
    else if (action.includes('Real-world example')) prompt = 'Give me a real-world example that makes this concept easier to understand.';
    else if (action.includes('Connect ideas')) prompt = 'Connect this concept to related ideas I should know.';
    else if (action.includes('Identify the approach')) prompt = 'Do not solve it fully. Identify the approach I should use first.';
    else if (action.includes('Check my next step')) prompt = 'Check whether my next step is correct and guide me forward.';
    else if (action.includes('Hint only')) prompt = 'Give me one short hint only. Do not give the final answer.';
    else if (action.includes('Quick quiz')) prompt = 'Give me a short quiz on this topic with answers after I try.';
    else if (action.includes('Flashcard drill')) prompt = 'Quiz me in flashcard style on the key ideas.';
    else if (action.includes('Mock test strategy')) prompt = 'Give me mock test strategy and common mistakes to avoid.';
    else if (action.includes('Mock exam')) prompt = 'Generate a mock exam-style practice set for this topic.';
    else if (action.includes('Common traps')) prompt = 'Show me the most common traps and mistakes for this topic.';
    setInput(prompt);
  };

  return (
    <div className="chat-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>
      <header
        className="chat-header"
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--card-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(10, 11, 22, 0.4)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="chat-header-main" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="chat-thread-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ color: 'var(--primary)' }}>{modeIcons[activeThread.mode]}</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', letterSpacing: '-0.02em' }}>{activeThread.title}</h3>
          </div>
          <div className="chat-header-divider" style={{ width: '1px', height: '20px', background: 'var(--card-border)' }} />
          <motion.button
            className="chat-project-button"
            whileHover={{ background: 'rgba(255,255,255,0.05)' }}
            onClick={() => setIsProjectsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '10px',
              border: '1px solid var(--card-border)',
              background: 'transparent',
              cursor: 'pointer',
              color: assignedProject ? 'white' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            <Folder size={14} color={assignedProject?.color || 'currentColor'} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{assignedProject?.name || 'No Project'}</span>
            <ChevronDown size={14} opacity={0.5} />
          </motion.button>
        </div>

        <div className="chat-status-pills" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="chat-status-pill" style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#f59e0b', fontWeight: '700', letterSpacing: '0.5px' }}>
            {isSubscriptionHydrated ? currentPlan.toUpperCase() : 'LOADING'}
          </div>
          <div className="chat-status-pill" style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '0.5px' }}>
            {isSubscriptionHydrated ? `${formatTokenCount(remainingTodayTokens)} TOKENS LEFT` : 'SYNCING TOKENS'}
          </div>
          <div className="chat-status-pill" style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontWeight: '700', letterSpacing: '0.5px' }}>
            {activeThread.mode.toUpperCase()}
          </div>
        </div>
      </header>

      <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {activeThread.messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.5 }}>
            <Sparkles size={48} color="var(--primary)" />
            <p>Starting a new {activeThread.mode} session...</p>
          </div>
        )}

        {activeThread.messages.map((msg) => {
          const textContent = getMessageText(msg);
          const fileParts = msg.parts.filter(
            (part): part is ImagePart | FilePart => part.type === 'image' || part.type === 'file'
          );

          return (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              key={msg.id}
              className={`chat-message-row ${msg.role === 'user' ? 'chat-message-row-user' : 'chat-message-row-assistant'}`}
              style={{ display: 'flex', gap: '16px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start', padding: '0 20px' }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '12px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, var(--primary), #6a1b9a)' : 'linear-gradient(135deg, #1a1a3a, #050515)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  border: '1px solid var(--card-border)',
                }}
              >
                {msg.role === 'user' ? <User size={18} color="white" /> : <Rocket size={18} color="var(--secondary)" />}
              </div>

              <div
                className="markdown-content chat-bubble"
                style={{
                  maxWidth: '75%',
                  padding: '18px 24px',
                  borderRadius: msg.role === 'user' ? '24px 4px 24px 24px' : '4px 24px 24px 24px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, var(--primary), #4a148c)' : 'var(--surface-1)',
                  backdropFilter: msg.role === 'assistant' ? 'blur(10px)' : 'none',
                  color: 'white',
                  border: '1px solid var(--card-border)',
                  lineHeight: 1.7,
                  fontSize: '1rem',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                  position: 'relative',
                }}
              >
                {textContent ? (
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {textContent}
                  </ReactMarkdown>
                ) : null}
                {fileParts.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: textContent ? '16px' : 0 }}>
                    {fileParts.map((part, index) => (
                      <AttachmentChip
                        key={`${part.name}-${part.sizeBytes}-${index}`}
                        part={part}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </motion.div>
          );
        })}
        {isLoading && (
          <motion.div className="chat-message-row chat-message-row-assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '0 20px' }}>
            <div className="animate-thinking" style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--card-border)' }}>
              <Sparkles size={18} color="var(--primary)" />
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '500', letterSpacing: '0.5px' }}>PLUTO IS COMPOSING...</div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="chat-footer" style={{ padding: '24px 20px', width: '100%', maxWidth: '850px', margin: '0 auto', zIndex: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <motion.div className="chat-mode-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '0 12px' }}>
            {activeThread.mode === 'Conversational' && <ConversationalModeUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
            {activeThread.mode === 'Homework' && <HomeworkModeUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
            {activeThread.mode === 'ExamPrep' && <ExamPrepUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
          </motion.div>

          {attachments.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '0 12px' }}>
              {attachments.map((attachment, index) => (
                <AttachmentChip
                  key={`${attachment.name}-${attachment.sizeBytes}-${index}`}
                  part={attachmentParts[index] as ImagePart | FilePart}
                  onRemove={() => removeAttachment(attachment.id)}
                />
              ))}
            </div>
          ) : null}

          <div
            className="chat-composer"
            style={{
              display: 'flex',
              gap: '12px',
              background: 'rgba(10, 10, 26, 0.7)',
              backdropFilter: 'blur(24px)',
              border: '1px solid var(--glass-border)',
              padding: '10px',
              borderRadius: '20px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5), var(--glass-inner-glow)',
              alignItems: 'flex-end',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={handleAttachmentSelection}
              style={{ display: 'none' }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAttachmentSelection}
              style={{ display: 'none' }}
            />

            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={openFilePicker}
              disabled={isLoading}
              style={composerIconButtonStyle}
            >
              <Paperclip size={18} />
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={openCameraPicker}
              disabled={isLoading}
              style={composerIconButtonStyle}
            >
              <Camera size={18} />
            </motion.button>

            <textarea
              className="chat-textarea"
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Ask anything in ${activeThread.mode}...`}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: 'white',
                padding: '14px',
                fontSize: '1rem',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                maxHeight: '200px',
              }}
            />
            <motion.button
              className="chat-send-button"
              whileHover={{ scale: 1.05, background: 'var(--secondary)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => void handleSend()}
              disabled={isLoading || !composerHasContent}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                opacity: isLoading || !composerHasContent ? 0.3 : 1,
                boxShadow: '0 4px 15px var(--primary-glow)',
                flexShrink: 0,
              }}
            >
              <Send size={20} />
            </motion.button>
          </div>
          {planNotice ? (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: '#fbbf24' }}>{planNotice}</div>
          ) : null}
          {isSubscriptionHydrated && !canUseMode(activeThread.mode) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#fbbf24', fontSize: '0.8rem' }}>
              <Lock size={14} />
              <span>This mode is locked on {currentPlan}. Upgrade to Plus or Pro.</span>
            </div>
          )}
          <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.85 }}>
            {isSubscriptionHydrated
              ? `${currentPlan} plan: ${formatTokenUsageSummary(remainingTodayTokens, estimatedMessagesLeft)}.`
              : 'Syncing your Pluto plan and usage...'}
          </p>
          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
            Pluto Intelligence may be wrong. Verification recommended.
          </p>
        </div>
      </footer>

      <ProjectsModal isOpen={isProjectsOpen} onClose={() => setIsProjectsOpen(false)} activeThreadId={activeThreadId} />
    </div>
  );
};

const composerIconButtonStyle: CSSProperties = {
  width: '44px',
  height: '44px',
  borderRadius: '14px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--card-border)',
  color: 'white',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const modeCardStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--primary-glow)',
  color: 'var(--primary)',
  borderRadius: '16px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  width: '140px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontSize: '0.9rem',
  fontWeight: '700',
};
