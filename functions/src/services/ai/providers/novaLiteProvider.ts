import { env, requireEnv } from '../../../config/env.js';
import { buildEstimatedUsage, normalizeTokenUsage } from '../../tokenUsage.js';
import {
  buildContextSnapshotMessage,
  buildSystemInstruction,
  buildTurnSpecificInstruction,
  getHistoryText,
} from '../prompting.js';
import type { ProviderExecutor, ProviderRequest, ProviderResult } from '../providerTypes.js';
import type { AiHistoryMessage, AiInlineAttachment, ThreadContextSummary, TokenUsage } from '../../../types/index.js';

const DEFAULT_NOVA_LITE_MODEL_ID = 'apac.amazon.nova-lite-v1:0';

const getNovaApiKey = () =>
  env.bedrockApiKey ||
  process.env.AWS_BEARER_TOKEN_BEDROCK ||
  process.env.AMAZON_BEDROCK_API_KEY ||
  requireEnv('bedrockApiKey');

const getNovaLiteModelId = () => env.bedrockNovaLiteModelId || DEFAULT_NOVA_LITE_MODEL_ID;

const getNovaEndpoint = (modelId: string) =>
  `https://bedrock-runtime.${env.bedrockRegion}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;

const getMessageText = (message: AiHistoryMessage) => {
  const text = getHistoryText(message);
  const attachmentLines = message.parts
    .filter((part) => part.type === 'image' || part.type === 'file')
    .map((part) => `[Attachment: ${part.name}, ${part.mimeType}, ${part.sizeBytes} bytes]`);

  return [text, ...attachmentLines].filter(Boolean).join('\n\n').trim();
};

const normalizeHistory = (history: AiHistoryMessage[]) =>
  history
    .map((message) => ({
      role: message.role,
      content: getMessageText(message),
    }))
    .filter((message) => message.content.length > 0)
    .map((message) => ({
      role: message.role,
      content: [{ text: message.content }],
    }));

const sanitizeDocumentName = (name: string) => {
  const extensionStripped = name.replace(/\.[^.]+$/, '');
  const normalizedWhitespace = extensionStripped.replace(/\s+/g, ' ').trim();
  const sanitized = normalizedWhitespace
    .replace(/[^A-Za-z0-9 \-()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || 'Document';
};

const toDocumentFormat = (attachment: AiInlineAttachment) => ({
  format: 'pdf',
  name: sanitizeDocumentName(attachment.name),
  source: { bytes: attachment.base64Data },
});

const toImageFormat = (attachment: AiInlineAttachment) => {
  const subtype = attachment.mimeType.split('/')[1]?.toLowerCase() || 'png';
  const format = subtype === 'jpeg' ? 'jpg' : subtype;
  return {
    format,
    source: { bytes: attachment.base64Data },
  };
};

const buildUserContent = (request: ProviderRequest) => {
  const content: Array<Record<string, unknown>> = [];
  const prompt = request.prompt.trim();
  content.push({ text: prompt || 'Continue helping the student.' });

  for (const attachment of request.attachments) {
    if (attachment.mimeType === 'application/pdf') {
      content.push({ document: toDocumentFormat(attachment) });
      continue;
    }

    if (attachment.mimeType.startsWith('image/')) {
      content.push({ image: toImageFormat(attachment) });
    }
  }

  return content;
};

const buildNovaMessages = (request: ProviderRequest) => [
  ...normalizeHistory(request.history),
  {
    role: 'user',
    content: buildUserContent(request),
  },
];

const buildNovaSystemMessages = ({
  systemInstruction,
  contextSummary,
}: {
  systemInstruction: string;
  contextSummary?: ThreadContextSummary;
}) => {
  const messages = [{ text: systemInstruction }];

  if (contextSummary?.text.trim()) {
    messages.push({
      text: buildContextSnapshotMessage(contextSummary),
    });
  }

  return messages;
};

const extractConverseText = (response: unknown) => {
  if (!(typeof response === 'object' && response !== null)) {
    return '';
  }

  const output = (response as { output?: { message?: { content?: Array<{ text?: string }> } } }).output;
  const parts = output?.message?.content ?? [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
};

const extractUsage = (response: unknown): TokenUsage | null => {
  if (!(typeof response === 'object' && response !== null)) {
    return null;
  }

  const usage = (response as {
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  }).usage;

  return usage &&
    typeof usage.inputTokens === 'number' &&
    typeof usage.outputTokens === 'number' &&
    typeof usage.totalTokens === 'number'
    ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        usageSource: 'provider',
      }
    : null;
};

const callNovaLiteConverse = async ({
  request,
  systemInstruction,
  contextSummary,
  maxOutputTokens,
}: {
  request: ProviderRequest;
  systemInstruction: string;
  contextSummary?: ThreadContextSummary;
  maxOutputTokens: number;
}) => {
  const modelId = getNovaLiteModelId();
  const response = await fetch(getNovaEndpoint(modelId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getNovaApiKey().trim()}`,
    },
    body: JSON.stringify({
      system: buildNovaSystemMessages({ systemInstruction, contextSummary }),
      messages: buildNovaMessages(request),
      inferenceConfig: {
        maxTokens: maxOutputTokens,
      },
    }),
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(
      typeof (payload as { message?: unknown })?.message === 'string'
        ? (payload as { message: string }).message
        : `Nova Lite request failed with status ${response.status}.`
    );
    Object.assign(error, {
      status: response.status,
      code: typeof (payload as { __type?: unknown })?.__type === 'string' ? (payload as { __type: string }).__type : null,
      details: payload,
    });
    throw error;
  }

  return {
    modelId,
    payload,
  };
};

export const isRetryableNovaLiteError = (error: unknown) => {
  if (!(typeof error === 'object' && error !== null)) {
    return false;
  }

  const status = typeof (error as { status?: unknown }).status === 'number' ? Number((error as { status: number }).status) : null;
  return status === 500 || status === 503;
};

export const generateNovaLiteResponse = async (request: ProviderRequest): Promise<ProviderResult> => {
  const startedAt = Date.now();
  const systemInstruction = buildSystemInstruction(
    request.educationLevel,
    request.mode,
    request.objective,
    request.plan
  );
  const turnSpecificInstruction = buildTurnSpecificInstruction({
    mode: request.mode,
    prompt: request.prompt,
    history: request.history,
  });

  const response = await callNovaLiteConverse({
    request,
    systemInstruction: [systemInstruction, turnSpecificInstruction].filter(Boolean).join('\n\n'),
    contextSummary: request.contextSummary,
    maxOutputTokens: request.maxOutputTokens,
  });
  const text = extractConverseText(response.payload).replace(/\r\n/g, '\n').trim();

  if (!text) {
    const error = new Error('Nova Lite returned an empty response.');
    Object.assign(error, { code: 'INVALID_RESPONSE' });
    throw error;
  }

  const estimatedUsage = buildEstimatedUsage({
    prompt: request.prompt,
    educationLevel: request.educationLevel,
    mode: request.mode,
    objective: request.objective,
    history: request.history,
    contextSummaryText: request.contextSummary?.text,
    answer: text,
  });
  const normalizedUsage = normalizeTokenUsage({
    providerUsage: extractUsage(response.payload),
    estimatedUsage,
    estimatedInputTokens: estimatedUsage.inputTokens,
    maxOutputTokens: request.maxOutputTokens,
  });

  return {
    text,
    contextSummary: request.contextSummary,
    usage: normalizedUsage.usage,
    usageAnomaly: normalizedUsage.anomalyReason,
    provider: 'nova-lite',
    modelId: response.modelId,
    modelUsed: 'nova-lite',
    latencyMs: Date.now() - startedAt,
  };
};

export const novaLiteProvider: ProviderExecutor = {
  provider: 'nova-lite',
  configuredModelId: getNovaLiteModelId(),
  configuredModelUsed: 'nova-lite',
  execute: generateNovaLiteResponse,
};
