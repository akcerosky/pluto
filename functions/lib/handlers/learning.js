import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES } from '../config/plans.js';
import { assertAuth, getBootstrapIdentity } from '../lib/http.js';
import { getMeSnapshot } from '../services/firestoreRepo.js';
import { deleteFlashcardSetForUser, generateFlashcardSetForUser, getDueCardsForUser, getFlashcardCardsForSet, getFlashcardSetsForUser, submitCardReviewForUser, } from '../services/learning/flashcards.js';
import { buildPdfTopicFromDigest, buildSourceContextFromDigest, buildSubjectFromDigest, deleteQuestionPaperForUser, extractPdfTextWithNovaLite, generateQuestionPaperForUser, generateQuestionPaperPdfForUser, inferSubjectFromText, listQuestionPapers, summarizePdfSourceMaterial, } from '../services/learning/questionPapers.js';
const optionalTrimmedString = (maxLength) => z.preprocess((value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    return value;
}, z.string().trim().max(maxLength).optional());
const requireLearningPlan = async (uid, request) => {
    const snapshot = await getMeSnapshot(uid, getBootstrapIdentity(request));
    if (!snapshot.planDefinition.learningFeaturesEnabled) {
        throw new HttpsError('permission-denied', 'Upgrade to Plus or Pro to use Pluto learning features.');
    }
    return snapshot.subscription.plan;
};
const generateQuestionPaperSchema = z.object({
    subject: z.string().trim().min(1).max(120),
    educationLevel: z.string().trim().min(1).max(80),
    examBoard: z.string().trim().min(1).max(120),
    topic: optionalTrimmedString(200),
});
const paperIdSchema = z.object({
    paperId: z.string().trim().min(1).max(200),
});
const generateFlashcardSetSchema = z.object({
    topic: z.string().trim().min(1).max(200),
    subject: optionalTrimmedString(120),
    educationLevel: optionalTrimmedString(80),
});
const submitCardReviewSchema = z.object({
    setId: z.string().trim().min(1).max(200),
    cardId: z.string().trim().min(1).max(200),
    rating: z.enum(['easy', 'good', 'hard']),
    sessionId: z.string().trim().min(1).max(200),
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
});
const getDueCardsSchema = z.object({
    setId: z.string().trim().min(1).max(200).optional(),
});
const deleteFlashcardSetSchema = z.object({
    setId: z.string().trim().min(1).max(200),
});
export const generateQuestionPaperHandler = async (request) => {
    const uid = assertAuth(request);
    const plan = await requireLearningPlan(uid, request);
    const payload = generateQuestionPaperSchema.parse(request.data ?? {});
    const paper = await generateQuestionPaperForUser({
        uid,
        subject: payload.subject,
        educationLevel: payload.educationLevel,
        examBoard: payload.examBoard,
        topic: payload.topic,
        plan,
        sourceType: 'topic',
    });
    return { paperId: paper.id };
};
export const getQuestionPapersHandler = async (request) => {
    const uid = assertAuth(request);
    await requireLearningPlan(uid, request);
    return listQuestionPapers(uid);
};
export const deleteQuestionPaperHandler = async (request) => {
    const uid = assertAuth(request);
    await requireLearningPlan(uid, request);
    const payload = paperIdSchema.parse(request.data ?? {});
    return deleteQuestionPaperForUser(uid, payload.paperId);
};
export const generateQuestionPaperPdfHandler = async (request) => {
    const uid = assertAuth(request);
    await requireLearningPlan(uid, request);
    const payload = paperIdSchema.parse(request.data ?? {});
    return generateQuestionPaperPdfForUser(uid, payload.paperId);
};
export const generateFlashcardSetHandler = async (request) => {
    const uid = assertAuth(request);
    const plan = await requireLearningPlan(uid, request);
    const payload = generateFlashcardSetSchema.parse(request.data ?? {});
    return generateFlashcardSetForUser({
        uid,
        topic: payload.topic,
        subject: payload.subject,
        educationLevel: payload.educationLevel,
        plan,
    });
};
export const getFlashcardSetsHandler = async (request) => {
    const uid = assertAuth(request);
    await requireLearningPlan(uid, request);
    return getFlashcardSetsForUser(uid);
};
export const getDueCardsHandler = async (request) => {
    const uid = assertAuth(request);
    await requireLearningPlan(uid, request);
    const payload = getDueCardsSchema.parse(request.data ?? {});
    return getDueCardsForUser(uid, payload.setId);
};
export const submitCardReviewHandler = async (request) => {
    const uid = assertAuth(request);
    await requireLearningPlan(uid, request);
    const payload = submitCardReviewSchema.parse(request.data ?? {});
    return submitCardReviewForUser({ uid, ...payload });
};
export const deleteFlashcardSetHandler = async (request) => {
    const uid = assertAuth(request);
    await requireLearningPlan(uid, request);
    const payload = deleteFlashcardSetSchema.parse(request.data ?? {});
    return deleteFlashcardSetForUser(uid, payload.setId);
};
export const getFlashcardCardsHandler = async (request) => {
    const uid = assertAuth(request);
    await requireLearningPlan(uid, request);
    const payload = deleteFlashcardSetSchema.parse(request.data ?? {});
    return { cards: await getFlashcardCardsForSet(uid, payload.setId) };
};
export const generatePaperFromPdfsHandler = async (request) => {
    const uid = assertAuth(request);
    const plan = await requireLearningPlan(uid, request);
    const payload = generatePaperFromPdfsSchema.parse(request.data ?? {});
    const inlineBytes = Buffer.byteLength(JSON.stringify(payload.pdfAttachments), 'utf8');
    if (inlineBytes > INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES) {
        throw new HttpsError('invalid-argument', 'Attachments are too large to process together. Keep total size under 8 MB.');
    }
    const extractedText = await extractPdfTextWithNovaLite({
        uid,
        plan,
        educationLevel: payload.educationLevel,
        examBoard: payload.examBoard,
        pdfAttachments: payload.pdfAttachments,
    });
    const sourceDigest = await summarizePdfSourceMaterial({
        uid,
        plan,
        educationLevel: payload.educationLevel,
        examBoard: payload.examBoard,
        extractedText,
    });
    const subject = payload.subject ||
        buildSubjectFromDigest(sourceDigest) ||
        (await inferSubjectFromText({
            uid,
            plan,
            educationLevel: payload.educationLevel,
            extractedText,
        }));
    const paper = await generateQuestionPaperForUser({
        uid,
        subject,
        educationLevel: payload.educationLevel,
        examBoard: payload.examBoard,
        plan,
        sourceType: 'pdf',
        sourcePdfNames: payload.pdfAttachments.map((attachment) => attachment.name),
        sourcePdfTextLength: extractedText.length,
        topic: buildPdfTopicFromDigest(sourceDigest),
        sourceContext: buildSourceContextFromDigest(sourceDigest, extractedText),
    });
    return { paperId: paper.id };
};
