import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES, type SubscriptionPlan } from '../config/plans.js';
import { assertAuth, getBootstrapIdentity } from '../lib/http.js';
import { getMeSnapshot } from '../services/firestoreRepo.js';
import {
  reconcileUsageTokens,
  releaseReservedUsageTokens,
  reserveUsageTokens,
} from '../services/firestoreRepo.js';
import {
  buildFlashcardMeteringPayload,
  deleteFlashcardSetForUser,
  generateFlashcardSetForUser,
  getDueCardsForUser,
  getFlashcardCardsForSet,
  getFlashcardSetsForUser,
  submitCardReviewForUser,
} from '../services/learning/flashcards.js';
import {
  buildPdfQuestionPaperMeteringPlan,
  buildQuestionPaperMeteringPlan,
  buildPdfTopicFromDigest,
  buildSourceContextFromDigest,
  buildSubjectFromDigest,
  deleteQuestionPaperForUser,
  extractPdfTextWithNovaLite,
  generateQuestionPaperForUser,
  generateQuestionPaperPdfForUser,
  inferSubjectFromText,
  listQuestionPapers,
  summarizePdfSourceMaterial,
} from '../services/learning/questionPapers.js';
import type { TokenUsage } from '../types/index.js';

const optionalRequestIdSchema = z.string().trim().min(8).max(200).optional();

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined) {
        return undefined;
      }
      return value;
    },
    z.string().trim().max(maxLength).optional()
  );

const requireLearningPlan = async (uid: string, request: CallableRequest<unknown>) => {
  const snapshot = await getMeSnapshot(uid, getBootstrapIdentity(request));
  if (!snapshot.planDefinition.learningFeaturesEnabled) {
    throw new HttpsError('permission-denied', 'Upgrade to Plus or Pro to use Pluto learning features.');
  }
  return snapshot.subscription.plan;
};

const resolveLearningRequestId = (payload: { requestId?: string }) =>
  payload.requestId && payload.requestId.trim().length > 0 ? payload.requestId : crypto.randomUUID();

const sumUsages = (...usages: Array<TokenUsage | null | undefined>): TokenUsage =>
  usages.reduce<TokenUsage>(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + (usage?.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (usage?.outputTokens ?? 0),
      totalTokens: acc.totalTokens + (usage?.totalTokens ?? 0),
      usageSource:
        acc.usageSource === 'estimated' || usage?.usageSource === 'estimated'
          ? 'estimated'
          : 'provider',
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      usageSource: 'provider',
    }
  );

const getDailyQuotaExceededMessage = (plan: SubscriptionPlan) => {
  if (plan === 'Pro') {
    return 'You reached the Pro daily token limit for today. Please wait for the 00:00 IST reset.';
  }

  return `You reached the ${plan} daily token limit for today. Upgrade to continue or wait for the 00:00 IST reset.`;
};

const runMeteredLearningGeneration = async <T>({
  uid,
  plan,
  reservedTokens,
  run,
}: {
  uid: string;
  plan: SubscriptionPlan;
  reservedTokens: number;
  run: () => Promise<{ result: T; usage: TokenUsage }>;
}) => {
  try {
    await reserveUsageTokens(uid, plan, reservedTokens);
  } catch (error) {
    if (error instanceof Error && error.message === 'TOKEN_QUOTA_EXCEEDED') {
      throw new HttpsError('resource-exhausted', getDailyQuotaExceededMessage(plan));
    }
    throw error;
  }

  try {
    const outcome = await run();
    try {
      await reconcileUsageTokens(uid, plan, reservedTokens, outcome.usage);
      return { ...outcome.result, usagePendingSync: false };
    } catch {
      await releaseReservedUsageTokens(uid, reservedTokens).catch(() => undefined);
      return { ...outcome.result, usagePendingSync: true };
    }
  } catch (error) {
    await releaseReservedUsageTokens(uid, reservedTokens).catch(() => undefined);
    throw error;
  }
};

const generateQuestionPaperSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  educationLevel: z.string().trim().min(1).max(80),
  examBoard: z.string().trim().min(1).max(120),
  topic: optionalTrimmedString(200),
  requestId: optionalRequestIdSchema,
});

const paperIdSchema = z.object({
  paperId: z.string().trim().min(1).max(200),
  requestId: optionalRequestIdSchema,
});

const generateFlashcardSetSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  subject: optionalTrimmedString(120),
  educationLevel: optionalTrimmedString(80),
  requestId: optionalRequestIdSchema,
});

const submitCardReviewSchema = z.object({
  setId: z.string().trim().min(1).max(200),
  cardId: z.string().trim().min(1).max(200),
  rating: z.enum(['easy', 'good', 'hard']),
  sessionId: z.string().trim().min(1).max(200),
  requestId: optionalRequestIdSchema,
});

const pdfAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(260),
  mimeType: z.literal('application/pdf'),
  sizeBytes: z.number().int().min(1).max(20 * 1024 * 1024),
  base64Data: z.string().trim().min(1),
});

const generatePaperFromPdfsSchema = z.object({
  pdfAttachments: z.array(pdfAttachmentSchema).min(1).max(8),
  educationLevel: z.string().trim().min(1).max(80),
  examBoard: z.string().trim().min(1).max(120),
  subject: optionalTrimmedString(120),
  requestId: optionalRequestIdSchema,
});

const getDueCardsSchema = z.object({
  setId: z.string().trim().min(1).max(200).optional(),
});

const deleteFlashcardSetSchema = z.object({
  setId: z.string().trim().min(1).max(200),
});

export const generateQuestionPaperHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const plan = await requireLearningPlan(uid, request);
  const payload = generateQuestionPaperSchema.parse(request.data ?? {});
  const requestId = resolveLearningRequestId(payload);
  const metering = buildQuestionPaperMeteringPlan({ plan });
  return runMeteredLearningGeneration({
    uid,
    plan,
    reservedTokens: metering.reservedTokens,
    run: async () => {
      const generated = await generateQuestionPaperForUser({
        uid,
        subject: payload.subject,
        educationLevel: payload.educationLevel,
        examBoard: payload.examBoard,
        topic: payload.topic,
        plan,
        sourceType: 'topic',
        requestId,
      });
      return {
        result: { paperId: generated.paper.id },
        usage: generated.usage,
      };
    },
  });
};

export const getQuestionPapersHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  await requireLearningPlan(uid, request);
  return listQuestionPapers(uid);
};

export const deleteQuestionPaperHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  await requireLearningPlan(uid, request);
  const payload = paperIdSchema.parse(request.data ?? {});
  return deleteQuestionPaperForUser(uid, payload.paperId);
};

export const generateQuestionPaperPdfHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  await requireLearningPlan(uid, request);
  const payload = paperIdSchema.parse(request.data ?? {});
  return generateQuestionPaperPdfForUser({
    uid,
    paperId: payload.paperId,
    requestId: resolveLearningRequestId(payload),
  });
};

export const generateFlashcardSetHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const plan = await requireLearningPlan(uid, request);
  const payload = generateFlashcardSetSchema.parse(request.data ?? {});
  const requestId = resolveLearningRequestId(payload);
  const metering = buildFlashcardMeteringPayload({
    topic: payload.topic,
    subject: payload.subject,
    educationLevel: payload.educationLevel,
    plan,
  });
  return runMeteredLearningGeneration({
    uid,
    plan,
    reservedTokens: metering.reservedTokens,
    run: async () => {
      const generated = await generateFlashcardSetForUser({
        uid,
        topic: payload.topic,
        subject: payload.subject,
        educationLevel: payload.educationLevel,
        plan,
        requestId,
      });
      return {
        result: { setId: generated.setId },
        usage: generated.usage,
      };
    },
  });
};

export const getFlashcardSetsHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  await requireLearningPlan(uid, request);
  return getFlashcardSetsForUser(uid);
};

export const getDueCardsHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  await requireLearningPlan(uid, request);
  const payload = getDueCardsSchema.parse(request.data ?? {});
  return getDueCardsForUser(uid, payload.setId);
};

export const submitCardReviewHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  await requireLearningPlan(uid, request);
  const payload = submitCardReviewSchema.parse(request.data ?? {});
  return submitCardReviewForUser({
    uid,
    ...payload,
    requestId: resolveLearningRequestId(payload),
  });
};

export const deleteFlashcardSetHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  await requireLearningPlan(uid, request);
  const payload = deleteFlashcardSetSchema.parse(request.data ?? {});
  return deleteFlashcardSetForUser(uid, payload.setId);
};

export const getFlashcardCardsHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  await requireLearningPlan(uid, request);
  const payload = deleteFlashcardSetSchema.parse(request.data ?? {});
  return { cards: await getFlashcardCardsForSet(uid, payload.setId) };
};

export const generatePaperFromPdfsHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const plan = await requireLearningPlan(uid, request);
  const payload = generatePaperFromPdfsSchema.parse(request.data ?? {});
  const requestId = resolveLearningRequestId(payload);
  const inlineBytes = Buffer.byteLength(JSON.stringify(payload.pdfAttachments), 'utf8');
  if (inlineBytes > INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES) {
    throw new HttpsError('invalid-argument', 'Attachments are too large to process together. Keep total size under 8 MB.');
  }
  const metering = buildPdfQuestionPaperMeteringPlan({
    plan,
    educationLevel: payload.educationLevel,
    examBoard: payload.examBoard,
    pdfAttachments: payload.pdfAttachments,
  });
  return runMeteredLearningGeneration({
    uid,
    plan,
    reservedTokens: metering.reservedTokens,
    run: async () => {
      const extracted = await extractPdfTextWithNovaLite({
        uid,
        plan,
        educationLevel: payload.educationLevel,
        examBoard: payload.examBoard,
        pdfAttachments: payload.pdfAttachments,
        requestId,
      });
      const sourceDigestResult = await summarizePdfSourceMaterial({
        uid,
        plan,
        educationLevel: payload.educationLevel,
        examBoard: payload.examBoard,
        extractedText: extracted.text,
        requestId,
      });
      const inferredSubjectResult =
        payload.subject || buildSubjectFromDigest(sourceDigestResult.digest)
          ? null
          : await inferSubjectFromText({
              uid,
              plan,
              educationLevel: payload.educationLevel,
              extractedText: extracted.text,
              requestId,
            });

      const subject =
        payload.subject ||
        buildSubjectFromDigest(sourceDigestResult.digest) ||
        inferredSubjectResult?.subject ||
        'General Studies';

      const generated = await generateQuestionPaperForUser({
        uid,
        subject,
        educationLevel: payload.educationLevel,
        examBoard: payload.examBoard,
        plan,
        sourceType: 'pdf',
        sourcePdfNames: payload.pdfAttachments.map((attachment) => attachment.name),
        sourcePdfTextLength: extracted.text.length,
        topic: buildPdfTopicFromDigest(sourceDigestResult.digest),
        sourceContext: buildSourceContextFromDigest(sourceDigestResult.digest, extracted.text),
        requestId,
      });

      return {
        result: { paperId: generated.paper.id },
        usage: sumUsages(
          extracted.usage,
          sourceDigestResult.usage,
          inferredSubjectResult?.usage,
          generated.usage
        ),
      };
    },
  });
};
