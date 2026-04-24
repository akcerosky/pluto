import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ID = 'pluto-ef61b';
const UID = 'EahOcjp4slbT6nj8YtgNktOySkD2';
const START_ISO = '2026-04-23T04:30:00Z';
const USD_TO_INR = 84.5;
const OUTPUT_CSV = 'aiChat_audit_2026-04-23.csv';
const OUTPUT_JSON = 'aiChat_audit_2026-04-23.json';

const FIREBASE_CONFIG_PATH = 'C:/Users/prave/.config/configstore/firebase-tools.json';
const LOGGING_ENDPOINT = `https://logging.googleapis.com/v2/entries:list`;
const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;
const START_MS = Date.parse(START_ISO);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readFirebaseToken = async () => {
  const raw = await fs.readFile(FIREBASE_CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const accessToken = parsed?.tokens?.access_token;
  if (!accessToken) {
    throw new Error(`No Firebase CLI access token found in ${FIREBASE_CONFIG_PATH}.`);
  }
  return accessToken;
};

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const parseFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) {
    return Array.isArray(value.arrayValue?.values)
      ? value.arrayValue.values.map((entry) => parseFirestoreValue(entry))
      : [];
  }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields ?? {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, entry]) => [key, parseFirestoreValue(entry)])
    );
  }
  return null;
};

const parseFirestoreDocument = (document) => {
  const fields = document?.fields ?? {};
  return {
    __name: document?.name ?? null,
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, parseFirestoreValue(value)])),
  };
};

const firestoreRunQuery = async (token, structuredQuery) => {
  const response = await fetch(`${FIRESTORE_ROOT}/documents:runQuery`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ structuredQuery }),
  });

  if (!response.ok) {
    throw new Error(`Firestore runQuery failed: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();
  return rows
    .filter((row) => row.document)
    .map((row) => parseFirestoreDocument(row.document));
};

const firestoreGetDocument = async (token, documentPath) => {
  const response = await fetch(`${FIRESTORE_ROOT}/documents/${documentPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Firestore getDocument failed for ${documentPath}: ${response.status} ${await response.text()}`);
  }

  const document = await response.json();
  return parseFirestoreDocument(document);
};

const listLogEntries = async (token, filter, pageSize = 100) => {
  const entries = [];
  let pageToken = undefined;

  do {
    const response = await fetch(LOGGING_ENDPOINT, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        resourceNames: [`projects/${PROJECT_ID}`],
        filter,
        orderBy: 'timestamp asc',
        pageSize,
        ...(pageToken ? { pageToken } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Logging entries:list failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    entries.push(...(payload.entries ?? []));
    pageToken = payload.nextPageToken;
    if (pageToken) {
      await sleep(100);
    }
  } while (pageToken);

  return entries;
};

const toIst = (valueMs) => {
  if (!Number.isFinite(valueMs)) return null;
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(valueMs)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} IST`;
};

const getEntryPayload = (entry) => entry.jsonPayload ?? null;

const getEntryTimestampMs = (entry) => {
  const candidate = entry.timestamp ?? entry.receiveTimestamp;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : null;
};

const flattenMessages = (appState) => {
  const threads = Array.isArray(appState?.threads) ? appState.threads : [];
  const flattened = [];
  for (const thread of threads) {
    const threadId = thread?.id ?? null;
    const messages = Array.isArray(thread?.messages) ? thread.messages : [];
    for (const message of messages) {
      const text = Array.isArray(message?.parts)
        ? message.parts
            .filter((part) => part?.type === 'text' && typeof part?.text === 'string')
            .map((part) => part.text)
            .join('\n\n')
            .trim()
        : '';
      flattened.push({
        threadId,
        threadTitle: thread?.title ?? null,
        threadContextSummary: thread?.contextSummary?.text ?? null,
        id: message?.id ?? null,
        role: message?.role ?? null,
        mode: message?.mode ?? null,
        timestamp: typeof message?.timestamp === 'number' ? message.timestamp : null,
        text,
      });
    }
  }
  return flattened
    .filter((message) => Number.isFinite(message.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
};

const pickMatchedMessages = ({ request, appMessages, responseAnswer }) => {
  const requestCreatedAt = Number.isFinite(request.createdAt) ? request.createdAt : null;
  const requestUpdatedAt = Number.isFinite(request.updatedAt) ? request.updatedAt : requestCreatedAt;
  const answer = typeof responseAnswer === 'string' ? responseAnswer.trim() : '';

  let assistantMatch = null;
  if (answer) {
    const exactAssistantMatches = appMessages.filter(
      (message) => message.role === 'assistant' && message.text.trim() === answer
    );
    if (exactAssistantMatches.length > 0) {
      assistantMatch = exactAssistantMatches.sort((a, b) => {
        const aDelta = Math.abs((a.timestamp ?? 0) - (requestUpdatedAt ?? 0));
        const bDelta = Math.abs((b.timestamp ?? 0) - (requestUpdatedAt ?? 0));
        return aDelta - bDelta;
      })[0];
    }
  }

  if (!assistantMatch && requestUpdatedAt !== null) {
    assistantMatch = appMessages
      .filter(
        (message) =>
          message.role === 'assistant' &&
          message.timestamp >= requestCreatedAt - 30_000 &&
          message.timestamp <= requestUpdatedAt + 5 * 60_000
      )
      .sort((a, b) => Math.abs(a.timestamp - requestUpdatedAt) - Math.abs(b.timestamp - requestUpdatedAt))[0] ?? null;
  }

  let userMatch = null;
  if (assistantMatch) {
    userMatch = appMessages
      .filter(
        (message) =>
          message.role === 'user' &&
          message.threadId === assistantMatch.threadId &&
          message.timestamp <= assistantMatch.timestamp
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
  }

  if (!userMatch && requestCreatedAt !== null) {
    userMatch = appMessages
      .filter(
        (message) =>
          message.role === 'user' &&
          message.timestamp >= requestCreatedAt - 5 * 60_000 &&
          message.timestamp <= requestCreatedAt + 60_000
      )
      .sort((a, b) => Math.abs(a.timestamp - requestCreatedAt) - Math.abs(b.timestamp - requestCreatedAt))[0] ?? null;
  }

  const threadContextSummary =
    assistantMatch?.threadContextSummary ??
    userMatch?.threadContextSummary ??
    null;

  return {
    requestMessage: userMatch?.text ?? null,
    modelResponse: answer || assistantMatch?.text || null,
    summarySent: threadContextSummary,
    matchedThreadId: assistantMatch?.threadId ?? userMatch?.threadId ?? null,
  };
};

const costRatesUsdPerMillion = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.5-flash-preview-09-2025': { input: 0.30, output: 2.50 },
  'amazon.nova-micro-v1:0': { input: 0.035, output: 0.14 },
  'apac.amazon.nova-micro-v1:0': { input: 0.035, output: 0.14 },
  'nova-micro': { input: 0.035, output: 0.14 },
};

const computeCostsInr = ({ modelUsed, inputTokens, outputTokens }) => {
  const pricing = costRatesUsdPerMillion[modelUsed] ?? null;
  if (!pricing) {
    return {
      totalInputTokenCostINR: null,
      totalOutputTokenCostINR: null,
      totalCostINR: null,
    };
  }

  const inputUsd = (Number(inputTokens || 0) / 1_000_000) * pricing.input;
  const outputUsd = (Number(outputTokens || 0) / 1_000_000) * pricing.output;
  const totalInputTokenCostINR = Number((inputUsd * USD_TO_INR).toFixed(6));
  const totalOutputTokenCostINR = Number((outputUsd * USD_TO_INR).toFixed(6));
  return {
    totalInputTokenCostINR,
    totalOutputTokenCostINR,
    totalCostINR: Number((totalInputTokenCostINR + totalOutputTokenCostINR).toFixed(6)),
  };
};

const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
};

const buildSummaryRow = (rows) => {
  const sum = (selector) =>
    rows.reduce((acc, row) => acc + (Number.isFinite(Number(selector(row))) ? Number(selector(row)) : 0), 0);
  const avg = (selector) => {
    const values = rows
      .map((row) => Number(selector(row)))
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) return null;
    return Number((values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(6));
  };

  return {
    timestamp_ist: 'SUMMARY',
    requestId: `count=${rows.length}`,
    responseTimeSec: avg((row) => row.responseTimeSec),
    status: '',
    modelUsed: '',
    estimatedInputTokens: sum((row) => row.estimatedInputTokens),
    providerInputTokens: sum((row) => row.providerInputTokens),
    outputTokens: sum((row) => row.outputTokens),
    totalTokens: sum((row) => row.totalTokens),
    promptTokens: sum((row) => row.promptTokens),
    historyTokens: sum((row) => row.historyTokens),
    summaryTokens: sum((row) => row.summaryTokens),
    sentHistoryMessageCount: avg((row) => row.sentHistoryMessageCount),
    trimmedHistoryCount: sum((row) => row.trimmedHistoryCount),
    summaryCandidateCount: sum((row) => row.summaryCandidateCount),
    hasContextSummary: '',
    attachmentCount: sum((row) => row.attachmentCount),
    providerStatus: '',
    failureType: '',
    attempt: avg((row) => row.attempt),
    nextRetryDelayMs: '',
    totalInputTokenCostINR: Number(sum((row) => row.totalInputTokenCostINR).toFixed(6)),
    totalOutputTokenCostINR: Number(sum((row) => row.totalOutputTokenCostINR).toFixed(6)),
    totalCostINR: Number(sum((row) => row.totalCostINR).toFixed(6)),
  };
};

const getLogValue = (entries, eventType) =>
  entries
    .map((entry) => getEntryPayload(entry))
    .find((payload) => payload?.eventType === eventType) ?? null;

const getLogValues = (entries, eventType) =>
  entries
    .map((entry) => getEntryPayload(entry))
    .filter((payload) => payload?.eventType === eventType);

const getLatestLogValue = (entries, eventType) => {
  const matched = entries.filter((entry) => getEntryPayload(entry)?.eventType === eventType);
  if (matched.length === 0) return null;
  return getEntryPayload(matched[matched.length - 1]);
};

const main = async () => {
  const token = await readFirebaseToken();

  const cacheDocs = await firestoreRunQuery(token, {
    from: [{ collectionId: 'aiRequestCache' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'uid' },
        op: 'EQUAL',
        value: { stringValue: UID },
      },
    },
  });

  const requests = cacheDocs
    .filter((doc) => Number(doc.updatedAt) >= START_MS || Number(doc.createdAt) >= START_MS)
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));

  const appState = await firestoreGetDocument(token, `users/${UID}/appState/main`);
  const gemini503Window = await firestoreGetDocument(token, 'aiMonitoring/gemini503Window');
  const appMessages = flattenMessages(appState);

  const broaderGemini503Logs = await listLogEntries(
    token,
    `timestamp >= "${START_ISO}" AND jsonPayload.eventType="gemini_generate_content_failed"`
  );
  const gemini503SpikeLogs = await listLogEntries(
    token,
    `timestamp >= "${START_ISO}" AND jsonPayload.eventType="gemini_503_spike_detected"`
  );
  const flashLiteLogs = await listLogEntries(
    token,
    `timestamp >= "${START_ISO}" AND (jsonPayload.model="gemini-2.5-flash-lite" OR textPayload:"gemini-2.5-flash-lite" OR jsonPayload.modelUsed="flash-lite")`
  );

  const requestRows = [];
  const jsonRequests = [];
  const requestLogsById = {};

  for (const request of requests) {
    const requestId = request.requestId;
    const entries = await listLogEntries(
      token,
      `timestamp >= "${START_ISO}" AND jsonPayload.requestId="${requestId}"`
    );
    requestLogsById[requestId] = entries;

    const inputFit = getLogValue(entries, 'ai_input_context_fit');
    const completion = getLatestLogValue(entries, 'ai_request_completed');
    const modelFailure = getLatestLogValue(entries, 'ai_model_request_failed');
    const attemptFailures = getLogValues(entries, 'ai_attempt_finished').filter(
      (payload) => payload?.outcome === 'failure'
    );
    const attemptSuccess = getLogValues(entries, 'ai_attempt_finished').find(
      (payload) => payload?.outcome === 'success'
    );
    const route = getLogValue(entries, 'ai_route_selected');
    const geminiFailure = getLatestLogValue(entries, 'gemini_generate_content_failed');

    const responseUsage = request?.response?.usage ?? null;
    const responseAnswer = request?.response?.answer ?? null;
    const modelId =
      completion?.finalModelId ??
      attemptSuccess?.modelId ??
      geminiFailure?.model ??
      request?.response?.modelUsed ??
      null;
    const modelUsed = request?.response?.modelUsed ?? modelId;

    const responseTimeSecFromLogs =
      Number.isFinite(Number(completion?.totalLatencyMs))
        ? Number((Number(completion.totalLatencyMs) / 1000).toFixed(3))
        : null;
    const responseTimeSecFromCache =
      Number.isFinite(Number(request.updatedAt)) && Number.isFinite(Number(request.createdAt))
        ? Number(((Number(request.updatedAt) - Number(request.createdAt)) / 1000).toFixed(3))
        : null;
    const responseTimeSec = responseTimeSecFromLogs ?? responseTimeSecFromCache;

    const providerInputTokens =
      responseUsage?.usageSource === 'provider'
        ? Number(responseUsage.inputTokens)
        : attemptSuccess?.inputTokens ?? null;
    const outputTokens = responseUsage?.outputTokens ?? attemptSuccess?.outputTokens ?? null;
    const totalTokens = responseUsage?.totalTokens ?? attemptSuccess?.totalTokens ?? null;
    const estimatedInputTokens = inputFit?.inputTokens ?? request?.response?.usage?.inputTokens ?? null;

    const failureAttempt = attemptFailures.at(-1) ?? null;
    const attempt = failureAttempt?.attemptNumber ?? attemptSuccess?.attemptNumber ?? null;
    const nextRetryDelayMs =
      failureAttempt?.provider === 'nova-micro' && failureAttempt?.retryEligible === true
        ? { 1: 1000, 2: 2000 }[Number(failureAttempt.attemptNumber)] ?? null
        : null;
    const providerStatus =
      modelFailure?.providerStatus ??
      failureAttempt?.providerStatus ??
      geminiFailure?.providerStatus ??
      null;
    const failureType =
      request.failureType ??
      (providerStatus === 503 || providerStatus === 500 ? 'transient' : null);

    const matchedMessages = pickMatchedMessages({
      request,
      appMessages,
      responseAnswer,
    });

    const hasContextSummary = Boolean(inputFit?.hasContextSummary);
    const summarySent = hasContextSummary ? matchedMessages.summarySent : null;
    const historyRequestIds = [];

    const costs = computeCostsInr({
      modelUsed,
      inputTokens: providerInputTokens ?? estimatedInputTokens,
      outputTokens,
    });

    const record = {
      timestamp_ist: toIst(Number(request.createdAt) || Number(request.updatedAt)),
      requestId,
      responseTimeSec,
      status: request.status ?? null,
      modelUsed,
      requestMessage: matchedMessages.requestMessage,
      modelResponse: responseAnswer ?? matchedMessages.modelResponse,
      summarySent,
      historyRequestIds,
      estimatedInputTokens,
      providerInputTokens,
      outputTokens,
      totalTokens,
      promptTokens: inputFit?.promptTokens ?? null,
      historyTokens: inputFit?.historyTokens ?? null,
      summaryTokens: inputFit?.summaryTokens ?? null,
      sentHistoryMessageCount: inputFit?.sentHistoryMessageCount ?? null,
      trimmedHistoryCount: inputFit?.trimmedHistoryCount ?? null,
      summaryCandidateCount: inputFit?.summaryCandidateCount ?? null,
      hasContextSummary,
      attachmentCount: route?.attachmentCount ?? modelFailure?.attachmentCount ?? 0,
      providerStatus,
      failureType,
      attempt,
      nextRetryDelayMs,
      totalInputTokenCostINR: costs.totalInputTokenCostINR,
      totalOutputTokenCostINR: costs.totalOutputTokenCostINR,
      totalCostINR: costs.totalCostINR,
      firestore: request,
      logs: entries,
    };

    requestRows.push({
      timestamp_ist: record.timestamp_ist,
      requestId: record.requestId,
      responseTimeSec: record.responseTimeSec,
      status: record.status,
      modelUsed: record.modelUsed,
      estimatedInputTokens: record.estimatedInputTokens,
      providerInputTokens: record.providerInputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      promptTokens: record.promptTokens,
      historyTokens: record.historyTokens,
      summaryTokens: record.summaryTokens,
      sentHistoryMessageCount: record.sentHistoryMessageCount,
      trimmedHistoryCount: record.trimmedHistoryCount,
      summaryCandidateCount: record.summaryCandidateCount,
      hasContextSummary: record.hasContextSummary,
      attachmentCount: record.attachmentCount,
      providerStatus: record.providerStatus,
      failureType: record.failureType,
      attempt: record.attempt,
      nextRetryDelayMs: record.nextRetryDelayMs,
      totalInputTokenCostINR: record.totalInputTokenCostINR,
      totalOutputTokenCostINR: record.totalOutputTokenCostINR,
      totalCostINR: record.totalCostINR,
    });

    jsonRequests.push({
      timestamp_ist: record.timestamp_ist,
      requestId: record.requestId,
      responseTimeSec: record.responseTimeSec,
      status: record.status,
      modelUsed: record.modelUsed,
      requestMessage: record.requestMessage,
      modelResponse: record.modelResponse,
      summarySent: record.summarySent,
      historyRequestIds: record.historyRequestIds,
      estimatedInputTokens: record.estimatedInputTokens,
      providerInputTokens: record.providerInputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      promptTokens: record.promptTokens,
      historyTokens: record.historyTokens,
      summaryTokens: record.summaryTokens,
      sentHistoryMessageCount: record.sentHistoryMessageCount,
      trimmedHistoryCount: record.trimmedHistoryCount,
      summaryCandidateCount: record.summaryCandidateCount,
      hasContextSummary: record.hasContextSummary,
      attachmentCount: record.attachmentCount,
      providerStatus: record.providerStatus,
      failureType: record.failureType,
      attempt: record.attempt,
      nextRetryDelayMs: record.nextRetryDelayMs,
      totalInputTokenCostINR: record.totalInputTokenCostINR,
      totalOutputTokenCostINR: record.totalOutputTokenCostINR,
      totalCostINR: record.totalCostINR,
    });
  }

  const csvColumns = [
    'timestamp_ist',
    'requestId',
    'responseTimeSec',
    'status',
    'modelUsed',
    'estimatedInputTokens',
    'providerInputTokens',
    'outputTokens',
    'totalTokens',
    'promptTokens',
    'historyTokens',
    'summaryTokens',
    'sentHistoryMessageCount',
    'trimmedHistoryCount',
    'summaryCandidateCount',
    'hasContextSummary',
    'attachmentCount',
    'providerStatus',
    'failureType',
    'attempt',
    'nextRetryDelayMs',
    'totalInputTokenCostINR',
    'totalOutputTokenCostINR',
    'totalCostINR',
  ];

  const summaryRow = buildSummaryRow(requestRows);
  const csv = [
    csvColumns.join(','),
    ...requestRows.map((row) => csvColumns.map((column) => escapeCsv(row[column])).join(',')),
    csvColumns.map((column) => escapeCsv(summaryRow[column])).join(','),
  ].join('\n');

  const outputJson = {
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    uid: UID,
    startIso: START_ISO,
    usdToInr: USD_TO_INR,
    requestCount: jsonRequests.length,
    summary: summaryRow,
    gemini503Window,
    gemini503SpikeLogs,
    flashLiteLogsCount: flashLiteLogs.length,
    broaderGemini503FailureCount: broaderGemini503Logs.length,
    requests: jsonRequests,
    requestLogsById,
  };

  await fs.writeFile(path.join(process.cwd(), OUTPUT_CSV), csv, 'utf8');
  await fs.writeFile(path.join(process.cwd(), OUTPUT_JSON), JSON.stringify(outputJson, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        requestCount: jsonRequests.length,
        outputCsv: path.join(process.cwd(), OUTPUT_CSV),
        outputJson: path.join(process.cwd(), OUTPUT_JSON),
        gemini503Window,
        flashLiteLogsCount: flashLiteLogs.length,
        broaderGemini503FailureCount: broaderGemini503Logs.length,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
