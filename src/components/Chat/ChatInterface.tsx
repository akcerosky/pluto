import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type Thread,
  type ThreadContextSummary,
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
  RotateCcw,
} from 'lucide-react';
import {
  LazyAssistantMessageContent,
  LazyConversationalModeUI,
  LazyExamPrepUI,
  LazyHomeworkModeUI,
  LazyProjectsModal,
} from './LazyModePanels';
import { getPlutoResponse } from '../../hooks/useAI';
import type { InlineAttachmentInput } from '../../lib/attachments';
import { runtimeLogger } from '../../lib/runtimeLogger';
import { formatTokenCount } from '../../lib/tokenQuota';

interface ComposerAttachment {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'file';
  previewUrl: string | null;
}

interface RetryState {
  attempt: number;
  totalRetries: number;
}

interface FailedRequestState {
  threadId: string;
  userMessageId: string;
  prompt: string;
  mode: 'Conversational' | 'Homework' | 'ExamPrep';
  history: Array<{ role: 'user' | 'assistant'; parts: MessagePart[] }>;
  contextSummary?: ThreadContextSummary;
  summaryCandidates: Array<{ role: 'user' | 'assistant'; parts: MessagePart[] }>;
  attachments: InlineAttachmentInput[];
  statusMessage?: string;
}

interface ActiveRequestState {
  threadId: string;
  userMessageId: string;
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

const SUMMARY_TRIGGER_OLDER_MESSAGE_COUNT = 10;
const SUMMARY_CANDIDATE_MESSAGE_LIMIT = 20;
const LARGE_PDF_WARNING_BYTES = 4 * 1024 * 1024;

const getSummaryPayload = (
  thread: Thread,
  historyWindow: number,
  pendingMessages: Message[] = []
) => {
  const allMessages = [...thread.messages, ...pendingMessages];
  const summarizedMessageCount = thread.contextSummary?.summarizedMessageCount ?? 0;
  const olderBoundary = Math.max(0, allMessages.length - historyWindow);
  const unsummarizedOlderCount = Math.max(0, olderBoundary - summarizedMessageCount);

  if (unsummarizedOlderCount < SUMMARY_TRIGGER_OLDER_MESSAGE_COUNT) {
    return {
      contextSummary: thread.contextSummary,
      summaryCandidates: [] as Array<{ role: 'user' | 'assistant'; parts: MessagePart[] }>,
    };
  }

  return {
    contextSummary: thread.contextSummary,
    summaryCandidates: allMessages
      .slice(summarizedMessageCount, summarizedMessageCount + Math.min(unsummarizedOlderCount, SUMMARY_CANDIDATE_MESSAGE_LIMIT))
      .map((message) => ({ role: message.role, parts: message.parts })),
  };
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
    hasOlderActiveThreadMessages,
    isActiveThreadMessagesLoading,
    loadOlderActiveThreadMessages,
    projects,
    activeProjectId,
    setActiveProjectId,
    currentPlan,
    planConfig,
    isSubscriptionHydrated,
    freePremiumModesRemainingToday,
    remainingTodayTokens,
    canSendMessage,
    canUseMode,
    applyServerSnapshot,
    updateThread,
  } = useApp();

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const assignedProject = projects.find((p) => p.id === activeThread?.projectId);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isComposerActive, setIsComposerActive] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [retryDotCount, setRetryDotCount] = useState(1);
  const [failedRequest, setFailedRequest] = useState<FailedRequestState | null>(null);
  const [activeRequest, setActiveRequest] = useState<ActiveRequestState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const footerInteractiveRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const previousLastMessageIdRef = useRef<string | null>(null);
  const shouldForceRenderError =
    import.meta.env.VITE_SMOKE_TESTS === 'true' &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('plutoThrowChatError') === '1';

  const composerHasContent = input.trim().length > 0 || attachments.length > 0;

  if (shouldForceRenderError) {
    throw new Error('Pluto smoke test forced ChatInterface render error.');
  }

  const releaseAttachmentPreview = (attachment: ComposerAttachment) => {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  };

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updateViewportMode = () => {
      setIsCompactViewport(window.innerWidth <= 640);
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    return () => window.removeEventListener('resize', updateViewportMode);
  }, []);

  useEffect(() => {
    if (!planNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setPlanNotice((current) => (current === planNotice ? null : current));
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [planNotice]);

  useEffect(() => {
    if (retryState === null) {
      setRetryDotCount(1);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setRetryDotCount((current) => (current >= 3 ? 1 : current + 1));
    }, 420);

    return () => window.clearInterval(intervalId);
  }, [retryState]);

  useEffect(
    () => () => {
      attachmentsRef.current.forEach((attachment) => releaseAttachmentPreview(attachment));
    },
    []
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const currentLastMessageId = activeThread?.messages.at(-1)?.id ?? null;
    const shouldScroll =
      previousLastMessageIdRef.current === null ||
      currentLastMessageId !== previousLastMessageIdRef.current ||
      isLoading;

    previousLastMessageIdRef.current = currentLastMessageId;

    if (shouldScroll) {
      scrollToBottom();
    }
  }, [activeThread?.messages, isLoading]);

  useEffect(() => {
    const currentMessagesContainer = messagesContainerRef.current;
    if (!currentMessagesContainer) {
      return undefined;
    }

    const handleLoadOlderOnScroll = () => {
      if (
        currentMessagesContainer.scrollTop <= 60 &&
        hasOlderActiveThreadMessages &&
        !isActiveThreadMessagesLoading
      ) {
        loadOlderActiveThreadMessages();
      }
    };

    currentMessagesContainer.addEventListener('scroll', handleLoadOlderOnScroll, { passive: true });
    return () =>
      currentMessagesContainer.removeEventListener('scroll', handleLoadOlderOnScroll);
  }, [
    hasOlderActiveThreadMessages,
    isActiveThreadMessagesLoading,
    loadOlderActiveThreadMessages,
  ]);

  useEffect(() => {
    const hidePanel = () => setIsComposerActive(false);
    const currentMessagesContainer = messagesContainerRef.current;

    window.addEventListener('scroll', hidePanel, { passive: true });
    currentMessagesContainer?.addEventListener('scroll', hidePanel, { passive: true });

    return () => {
      window.removeEventListener('scroll', hidePanel);
      currentMessagesContainer?.removeEventListener('scroll', hidePanel);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!footerInteractiveRef.current?.contains(event.target as Node)) {
        setIsComposerActive(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

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
      const largePdfIncluded = nextAttachments.some(
        (attachment) =>
          attachment.kind === 'file' &&
          attachment.mimeType === 'application/pdf' &&
          attachment.sizeBytes > LARGE_PDF_WARNING_BYTES
      );
      setPlanNotice(
        largePdfIncluded ? 'Large PDFs take longer time, please be patient.' : null
      );
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

  const requestRetryLabel =
    retryState !== null
      ? `Retrying ${retryState.attempt}/${retryState.totalRetries}${'.'.repeat(retryDotCount)}`
      : null;

  const getChatErrorCode = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  const getChatErrorMessage = (error: unknown) =>
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message)
      : 'Pluto hit a temporary problem. You can retry this request.';

  const isTransientProcessingError = (error: unknown) => {
    const code = getChatErrorCode(error);
    return code === 'functions/already-exists' || code === 'functions/deadline-exceeded';
  };

  const isBlockedPromptError = (error: unknown) => getChatErrorCode(error) === 'functions/permission-denied';

  const isPlutoErrorBubble = (message: Message) =>
    message.role === 'assistant' &&
    /^(Pluto Error:|Error:)/i.test(getMessageText(message));

  const updateThreadMessages = useCallback((
    threadId: string,
    updater: (messages: Message[]) => Message[]
  ) => {
    const targetThread = threads.find((thread) => thread.id === threadId);
    if (!targetThread) {
      return;
    }

    updateThread(threadId, {
      messages: updater(targetThread.messages),
    });
  }, [threads, updateThread]);

  useEffect(() => {
    if (!failedRequest) {
      return;
    }

    const thread = threads.find((candidate) => candidate.id === failedRequest.threadId);
    if (!thread) {
      return;
    }

    const userMessageIndex = thread.messages.findIndex((message) => message.id === failedRequest.userMessageId);
    if (userMessageIndex < 0) {
      return;
    }

    const realAssistantReply = thread.messages
      .slice(userMessageIndex + 1)
      .find((message) => message.role === 'assistant' && !isPlutoErrorBubble(message));

    if (!realAssistantReply) {
      return;
    }

    setFailedRequest((current) =>
      current?.userMessageId === failedRequest.userMessageId ? null : current
    );
  }, [failedRequest, threads]);

  const visibleMessages = useMemo(
    () => {
      const filteredMessages = activeThread?.messages.filter((message) => !isPlutoErrorBubble(message)) ?? [];
      return Array.from(
        filteredMessages.reduce<Map<string, Message>>((acc, message) => {
          acc.set(message.id, message);
          return acc;
        }, new Map()).values()
      ).sort((left, right) => left.timestamp - right.timestamp);
    },
    [activeThread]
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
              data-testid="mode-exploration-button"
              whileHover={{ y: -5, background: 'rgba(138, 43, 226, 0.1)' }}
              onClick={() => createThread('Conversational', activeProjectId || undefined)}
              style={modeCardStyle}
            >
              <MessageSquare size={28} />
              <span>Exploration</span>
            </motion.button>
            <motion.button
              data-testid="mode-homework-button"
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
              data-testid="mode-examprep-button"
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

  const submitAiRequest = async ({
    threadId,
    userMessageId,
    existingErrorMessageId,
    prompt,
    mode,
    history,
    contextSummary,
    summaryCandidates,
    inlineAttachments,
  }: {
    threadId: string;
    userMessageId: string;
    existingErrorMessageId?: string | null;
    prompt: string;
    mode: 'Conversational' | 'Homework' | 'ExamPrep';
    history: Array<{ role: 'user' | 'assistant'; parts: MessagePart[] }>;
    contextSummary?: ThreadContextSummary;
    summaryCandidates: Array<{ role: 'user' | 'assistant'; parts: MessagePart[] }>;
    inlineAttachments: InlineAttachmentInput[];
  }) => {
    setIsLoading(true);
    setRetryState(null);
    setActiveRequest({ threadId, userMessageId });
    setFailedRequest((current) =>
      current?.userMessageId === userMessageId ? null : current
    );

    if (existingErrorMessageId) {
      updateThreadMessages(threadId, (messages) =>
        messages.filter((message) => message.id !== existingErrorMessageId)
      );
    }

      try {
        const aiResponse = await getPlutoResponse(
          threadId,
          prompt,
          user?.educationLevel || 'High School',
          mode,
          user?.objective || 'General Learning',
        history,
        contextSummary,
        summaryCandidates,
        inlineAttachments,
        {
          onRetrying: ({ attempt, totalRetries }) => {
            setRetryState({ attempt, totalRetries });
          },
        }
      );

      setRetryState(null);

      applyServerSnapshot({
        plan: aiResponse.subscription.plan,
        usageTodayTokens: aiResponse.usageTodayTokens,
        dailyTokenLimit: aiResponse.dailyTokenLimit,
        remainingTodayTokens: aiResponse.remainingTodayTokens,
        estimatedMessagesLeft: aiResponse.estimatedMessagesLeft,
        premiumModeCount: aiResponse.premiumModeCount,
        freePremiumModesRemainingToday: aiResponse.freePremiumModesRemainingToday,
      });

      if (aiResponse.contextSummary) {
        updateThread(threadId, {
          contextSummary: aiResponse.contextSummary,
        });
      }

      const assistantMsg: Message = {
        id: aiResponse.assistantMessageId,
        role: 'assistant',
        parts: [createTextPart(aiResponse.answer)],
        mode,
        timestamp: aiResponse.assistantTimestamp,
      };
      addMessageToThread(threadId, assistantMsg, {
        persist: false,
        retainUntilHydrated: true,
      });
    } catch (error: unknown) {
      setRetryState(null);
      runtimeLogger.warn('AI request failed.', error, {
        mode: activeThread.mode,
        threadId: activeThread.id,
      });
      if (isBlockedPromptError(error)) {
        const refusalMsg: Message = {
          id: `${userMessageId}-refusal`,
          role: 'assistant',
          parts: [createTextPart(getChatErrorMessage(error))],
          mode,
          timestamp: Date.now(),
        };
        addMessageToThread(threadId, refusalMsg);
        setFailedRequest((current) =>
          current?.userMessageId === userMessageId ? null : current
        );
        return;
      }
      const transientProcessingError = isTransientProcessingError(error);
      setFailedRequest({
        threadId,
        userMessageId,
        prompt,
        mode,
        history,
        contextSummary,
        summaryCandidates,
        attachments: inlineAttachments,
        statusMessage: transientProcessingError
          ? 'PLUTO IS GENERATING...'
          : getChatErrorMessage(error),
      });
    } finally {
      setRetryState(null);
      setActiveRequest(null);
      setIsLoading(false);
    }
  };

  const handleRetryFailedRequest = async () => {
    if (!failedRequest || isLoading) {
      return;
    }

    await submitAiRequest({
      threadId: failedRequest.threadId,
      userMessageId: failedRequest.userMessageId,
      prompt: failedRequest.prompt,
      mode: failedRequest.mode,
      history: failedRequest.history,
      contextSummary: failedRequest.contextSummary,
      summaryCandidates: failedRequest.summaryCandidates,
      inlineAttachments: failedRequest.attachments,
    });
  };

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

    let inlineAttachments: InlineAttachmentInput[] = [];
    if (attachments.length > 0) {
      const { estimateInlineRequestBytes, fileToBase64 } = await import('../../lib/attachments');

      inlineAttachments = await Promise.all(
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
    const { contextSummary, summaryCandidates } = getSummaryPayload(
      activeThread,
      planConfig.historyWindow,
      [userMsg]
    );

    await submitAiRequest({
      threadId: activeThread.id,
      userMessageId: userMsg.id,
      prompt: trimmedInput,
      mode: activeThread.mode,
      history,
      contextSummary,
      summaryCandidates,
      inlineAttachments,
    });
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
    setIsComposerActive(true);
    textareaRef.current?.focus();
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
        <div className="chat-header-main" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
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
          <div
            className="chat-status-pills"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginLeft: 'auto',
              justifyContent: 'flex-end',
              flexShrink: 0,
            }}
          >
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
        </div>
      </header>

      <div ref={messagesContainerRef} className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {visibleMessages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.5 }}>
            <Sparkles size={48} color="var(--primary)" />
            <p>Starting a new {activeThread.mode} session...</p>
          </div>
        )}

        {visibleMessages.map((msg) => {
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
              style={{
                display: 'flex',
                gap: msg.role === 'user' ? '10px' : '16px',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                padding: '0 20px',
              }}
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
                style={{
                  width: 'fit-content',
                  maxWidth: '75%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  className="markdown-content chat-bubble"
                  style={{
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
                    width: 'fit-content',
                    maxWidth: '100%',
                  }}
                >
                  {textContent ? (
                    <Suspense fallback={<div style={{ whiteSpace: 'pre-wrap' }}>{textContent}</div>}>
                      <LazyAssistantMessageContent text={textContent} />
                    </Suspense>
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
                {msg.role === 'user' && failedRequest?.userMessageId === msg.id ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '8px',
                      }}
                    >
                      {failedRequest.statusMessage && failedRequest.statusMessage !== 'PLUTO IS GENERATING...' ? (
                        <div
                          style={{
                            color: 'var(--text-secondary)',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            opacity: 0.85,
                          }}
                        >
                          {failedRequest.statusMessage}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleRetryFailedRequest()}
                        disabled={isLoading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          border: '1px solid rgba(255,255,255,0.14)',
                          background: 'rgba(255,255,255,0.05)',
                          color: 'var(--text-secondary)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: isLoading ? 'default' : 'pointer',
                          opacity: isLoading ? 0.5 : 1,
                        }}
                      >
                        <RotateCcw size={14} />
                        Retry Request
                      </button>
                    </div>
                  </div>
                ) : null}
                {msg.role === 'user' && activeRequest?.userMessageId === msg.id ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px 2px',
                        color: 'var(--text-secondary)',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        opacity: 0.85,
                      }}
                    >
                      <RotateCcw size={13} />
                      <span>{requestRetryLabel ?? 'Sending...'}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          );
        })}
        {(isLoading || Boolean(failedRequest?.statusMessage)) && (
          <motion.div className="chat-message-row chat-message-row-assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '0 20px' }}>
            <div className="animate-thinking" style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--card-border)' }}>
              <Sparkles size={18} color="var(--primary)" />
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '500', letterSpacing: '0.5px' }}>
              {requestRetryLabel ?? failedRequest?.statusMessage ?? 'PLUTO IS GENERATING...'}
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="chat-footer" style={{ padding: '24px 20px 8px', width: '100%', maxWidth: '850px', margin: '0 auto', zIndex: 10 }}>
        <div
          ref={footerInteractiveRef}
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          onMouseLeave={() => setIsComposerActive(false)}
        >
          {isComposerActive ? (
            <motion.div
              className="chat-mode-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ padding: '0 12px', opacity: 0.92 }}
            >
              <Suspense fallback={null}>
                {activeThread.mode === 'Conversational' && <LazyConversationalModeUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
                {activeThread.mode === 'Homework' && <LazyHomeworkModeUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
                {activeThread.mode === 'ExamPrep' && <LazyExamPrepUI educationLevel={user?.educationLevel || 'High School'} onActionClick={handleQuickAction} />}
              </Suspense>
            </motion.div>
          ) : null}

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
              marginTop: isComposerActive ? '8px' : 0,
            }}
            onMouseEnter={() => setIsComposerActive(true)}
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
              data-testid="chat-composer-input"
              ref={textareaRef}
              className="chat-textarea"
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => setIsComposerActive(true)}
              onClick={() => setIsComposerActive(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={isCompactViewport ? `Ask in ${activeThread.mode}...` : `Ask anything in ${activeThread.mode}...`}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: '44px',
                background: 'none',
                border: 'none',
                color: 'white',
                padding: '14px',
                fontSize: '1rem',
                lineHeight: 1.45,
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                maxHeight: '200px',
              }}
            />
            <motion.button
              data-testid="chat-send-button"
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
          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.6, marginTop: '0', paddingBottom: '0', lineHeight: 1.2 }}>
            Pluto Intelligence may be wrong. Verification recommended.
          </p>
        </div>
      </footer>

      <Suspense fallback={null}>
        <LazyProjectsModal isOpen={isProjectsOpen} onClose={() => setIsProjectsOpen(false)} activeThreadId={activeThreadId} />
      </Suspense>
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
