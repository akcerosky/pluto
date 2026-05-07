import { logger } from 'firebase-functions';
import { z } from 'zod';
import { adminDb } from '../../lib/firebaseAdmin.js';
import { estimateReservedTokens } from '../tokenUsage.js';
import { executeHybridAiRequest } from '../ai/orchestrator.js';
import { getIstDayKey, getIstNow } from '../../utils/time.js';
import { updateCardAfterReview } from './sm2.js';
const userRoot = (uid) => adminDb.collection('users').doc(uid);
const setCollection = (uid) => userRoot(uid).collection('flashcardSets');
const sessionCollection = (uid) => userRoot(uid).collection('flashcardSessions');
const flashcardStatsSchema = z.object({
    mastered: z.number().int().min(0),
    reviewing: z.number().int().min(0),
    learning: z.number().int().min(0),
    new: z.number().int().min(0),
    dueToday: z.number().int().min(0),
});
const flashcardCardDocSchema = z.object({
    id: z.string().trim().min(1).max(200),
    front: z.string().trim().min(1).max(5000),
    back: z.string().trim().min(1).max(8000),
    concept: z.string().trim().min(1).max(300),
    order: z.number().int().min(1),
    interval: z.number().int().min(0),
    easinessFactor: z.number().min(1.3).max(3.5),
    repetitions: z.number().int().min(0),
    nextReviewAt: z.string().datetime(),
    lastReviewedAt: z.string().datetime().optional(),
    lastRating: z.enum(['easy', 'good', 'hard']).optional(),
    masteryLevel: z.enum(['new', 'learning', 'reviewing', 'mastered']),
    timesReviewed: z.number().int().min(0),
    timesCorrect: z.number().int().min(0),
});
const flashcardSetDocSchema = z.object({
    id: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(300),
    subject: z.string().trim().min(1).max(120),
    topic: z.string().trim().min(1).max(200),
    educationLevel: z.string().trim().min(1).max(80).optional(),
    totalCards: z.number().int().min(1),
    createdAt: z.string().datetime(),
    lastReviewedAt: z.string().datetime().optional(),
    stats: flashcardStatsSchema,
});
const flashcardSessionDocSchema = z.object({
    id: z.string().trim().min(1).max(200),
    setId: z.string().trim().min(1).max(200),
    date: z.string().trim().min(1).max(40),
    startedAt: z.string().datetime(),
    cardsReviewed: z.number().int().min(0),
    ratings: z.object({
        easy: z.number().int().min(0),
        good: z.number().int().min(0),
        hard: z.number().int().min(0),
    }),
    durationSeconds: z.number().int().min(0),
    completedAt: z.string().datetime(),
});
const submitCardReviewInputSchema = z.object({
    uid: z.string().trim().min(1).max(200),
    setId: z.string().trim().min(1).max(200),
    cardId: z.string().trim().min(1).max(200),
    rating: z.enum(['easy', 'good', 'hard']),
    sessionId: z.string().trim().min(1).max(200),
    requestId: z.string().trim().min(1).max(200),
});
const flashcardGenerationResponseSchema = z.object({
    title: z.string().trim().min(1).max(300),
    subject: z.string().trim().min(1).max(120),
    cards: z.array(z.object({
        front: z.string().trim().min(1).max(5000),
        back: z.string().trim().min(1).max(8000),
        concept: z.string().trim().min(1).max(300),
        order: z.number().int().min(1).optional(),
    })).min(5).max(20),
});
const defaultStats = () => ({
    mastered: 0,
    reviewing: 0,
    learning: 0,
    new: 0,
    dueToday: 0,
});
const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
};
const extractJsonCandidate = (value) => {
    const trimmed = value.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1).trim();
    }
    return trimmed;
};
export const parseFlashcardGenerationResponse = (value) => {
    const direct = safeJsonParse(value);
    if (direct) {
        return direct;
    }
    return safeJsonParse(extractJsonCandidate(value));
};
export const buildGenerationPrompt = ({ topic, subject, educationLevel, }) => `
Generate flashcards for a student studying: "${topic}"
${subject ? `Subject: ${subject}` : ''}
${educationLevel ? `Education level: ${educationLevel}` : ''}

Create between 10 and 20 cards. Decide the count based on topic breadth.
Return ONLY valid JSON:
{
  "title": string,
  "subject": string,
  "cards": [
    { "front": string, "back": string, "concept": string, "order": number }
  ]
}

Do not include markdown fences, commentary, or any text before or after the JSON.`.trim();
export const buildFlashcardMeteringPayload = ({ topic, subject, educationLevel, plan, }) => {
    const meteringContext = {
        prompt: buildGenerationPrompt({ topic, subject, educationLevel }),
        educationLevel: educationLevel || 'High School',
        mode: 'Conversational',
        objective: `Generate a machine-readable flashcard set for ${topic}`,
        history: [],
        contextSummaryText: undefined,
    };
    const reservation = estimateReservedTokens({
        ...meteringContext,
        plan,
    });
    return {
        meteringContext,
        reservedTokens: reservation.reservedTokens,
    };
};
const computeStats = (cards) => {
    const now = Date.now();
    return cards.reduce((acc, card) => {
        acc[card.masteryLevel] += 1;
        if (new Date(card.nextReviewAt).getTime() <= now) {
            acc.dueToday += 1;
        }
        return acc;
    }, defaultStats());
};
export const generateFlashcardSetForUser = async ({ uid, topic, subject, educationLevel, plan, requestId, }) => {
    const startedAt = Date.now();
    logger.info('flashcard_set_generation_started', {
        eventType: 'flashcard_set_generation_started',
        requestId,
        uid,
        topic,
        subject: subject ?? null,
        educationLevel: educationLevel ?? null,
    });
    const response = await executeHybridAiRequest({
        prompt: buildGenerationPrompt({ topic, subject, educationLevel }),
        educationLevel: educationLevel || 'High School',
        mode: 'Conversational',
        objective: `Generate a machine-readable flashcard set for ${topic}`,
        plan,
        uid,
        requestId,
        history: [],
        summaryCandidates: [],
        attachments: [],
        maxOutputTokens: 2000,
    });
    const parsed = parseFlashcardGenerationResponse(response.text);
    const validatedGeneration = flashcardGenerationResponseSchema.safeParse(parsed);
    if (!validatedGeneration.success) {
        throw new Error('Flashcard generation returned invalid JSON.');
    }
    const setRef = setCollection(uid).doc();
    const nowIso = new Date().toISOString();
    const cards = validatedGeneration.data.cards.map((card, index) => flashcardCardDocSchema.parse({
        id: crypto.randomUUID(),
        front: card.front,
        back: card.back,
        concept: card.concept,
        order: card.order || index + 1,
        interval: 0,
        easinessFactor: 2.5,
        repetitions: 0,
        nextReviewAt: nowIso,
        masteryLevel: 'new',
        timesReviewed: 0,
        timesCorrect: 0,
    }));
    const setDoc = flashcardSetDocSchema.parse({
        id: setRef.id,
        title: validatedGeneration.data.title || topic,
        subject: validatedGeneration.data.subject || subject || 'General',
        topic,
        totalCards: cards.length,
        createdAt: nowIso,
        stats: computeStats(cards),
        ...(educationLevel ? { educationLevel } : {}),
    });
    const batch = adminDb.batch();
    batch.set(setRef, setDoc);
    for (const card of cards) {
        batch.set(setRef.collection('cards').doc(card.id), card);
    }
    await batch.commit();
    logger.info('flashcard_set_generation_completed', {
        eventType: 'flashcard_set_generation_completed',
        requestId,
        uid,
        topic,
        subject: setDoc.subject,
        educationLevel: setDoc.educationLevel ?? null,
        cardCount: cards.length,
        latencyMs: Date.now() - startedAt,
    });
    return { setId: setRef.id, usage: response.usage };
};
export const getFlashcardSetsForUser = async (uid) => {
    const snapshot = await setCollection(uid).orderBy('createdAt', 'desc').get();
    const sets = snapshot.docs.map((doc) => doc.data());
    const dueCount = sets.reduce((sum, set) => sum + (set.stats?.dueToday ?? 0), 0);
    return { sets, dueCount };
};
export const getDueCardsForUser = async (uid, setId) => {
    const nowIso = new Date().toISOString();
    if (setId) {
        const snapshot = await setCollection(uid)
            .doc(setId)
            .collection('cards')
            .where('nextReviewAt', '<=', nowIso)
            .orderBy('nextReviewAt', 'asc')
            .limit(20)
            .get();
        return {
            cards: snapshot.docs.map((doc) => doc.data()),
            session: {
                setId,
                date: getIstDayKey(getIstNow()),
            },
        };
    }
    const sets = await setCollection(uid).get();
    const cards = [];
    for (const setDoc of sets.docs) {
        const snapshot = await setDoc.ref
            .collection('cards')
            .where('nextReviewAt', '<=', nowIso)
            .orderBy('nextReviewAt', 'asc')
            .limit(20)
            .get();
        cards.push(...snapshot.docs.map((doc) => doc.data()));
        if (cards.length >= 20) {
            break;
        }
    }
    return {
        cards: cards.sort((left, right) => left.nextReviewAt.localeCompare(right.nextReviewAt)).slice(0, 20),
        session: {
            date: getIstDayKey(getIstNow()),
        },
    };
};
export const submitCardReviewForUser = async (input) => {
    const { uid, setId, cardId, rating, sessionId, requestId } = submitCardReviewInputSchema.parse(input);
    const setRef = setCollection(uid).doc(setId);
    const cardRef = setRef.collection('cards').doc(cardId);
    const sessionRef = sessionCollection(uid).doc(sessionId);
    const nowIso = new Date().toISOString();
    const result = await adminDb.runTransaction(async (transaction) => {
        const [cardSnap, setSnap, sessionSnap, cardsSnap] = await Promise.all([
            transaction.get(cardRef),
            transaction.get(setRef),
            transaction.get(sessionRef),
            transaction.get(setRef.collection('cards')),
        ]);
        if (!cardSnap.exists || !setSnap.exists) {
            throw new Error('Flashcard set or card not found.');
        }
        const updatedCard = flashcardCardDocSchema.parse(updateCardAfterReview(cardSnap.data(), rating, nowIso));
        const cards = cardsSnap.docs.map((doc) => doc.id === cardId ? updatedCard : flashcardCardDocSchema.parse(doc.data()));
        const stats = flashcardStatsSchema.parse(computeStats(cards));
        transaction.set(cardRef, updatedCard);
        transaction.set(setRef, flashcardSetDocSchema.partial().parse({
            stats,
            lastReviewedAt: nowIso,
        }), { merge: true });
        const currentSession = sessionSnap.exists
            ? flashcardSessionDocSchema.parse(sessionSnap.data())
            : flashcardSessionDocSchema.parse({
                id: sessionId,
                setId,
                date: getIstDayKey(getIstNow()),
                startedAt: nowIso,
                cardsReviewed: 0,
                ratings: { easy: 0, good: 0, hard: 0 },
                durationSeconds: 0,
                completedAt: nowIso,
            });
        const durationMs = Math.max(0, new Date(nowIso).getTime() - new Date(currentSession.startedAt).getTime());
        const nextSession = flashcardSessionDocSchema.parse({
            ...currentSession,
            cardsReviewed: currentSession.cardsReviewed + 1,
            ratings: {
                ...currentSession.ratings,
                [rating]: currentSession.ratings[rating] + 1,
            },
            durationSeconds: Math.round(durationMs / 1000),
            completedAt: nowIso,
        });
        transaction.set(sessionRef, nextSession, { merge: true });
        return {
            card: updatedCard,
            stats,
            sessionSummary: {
                cardsReviewed: nextSession.cardsReviewed,
                easyCount: nextSession.ratings.easy,
                goodCount: nextSession.ratings.good,
                hardCount: nextSession.ratings.hard,
                durationMs,
            },
        };
    });
    logger.info('review_session_completed', {
        eventType: 'review_session_completed',
        requestId,
        uid,
        setId,
        sessionId,
        cardsReviewed: result.sessionSummary.cardsReviewed,
        easyCount: result.sessionSummary.easyCount,
        goodCount: result.sessionSummary.goodCount,
        hardCount: result.sessionSummary.hardCount,
        durationMs: result.sessionSummary.durationMs,
    });
    return {
        card: result.card,
        stats: result.stats,
    };
};
export const deleteFlashcardSetForUser = async (uid, setId) => {
    await adminDb.recursiveDelete(setCollection(uid).doc(setId));
    return { ok: true };
};
export const getFlashcardCardsForSet = async (uid, setId) => {
    const snapshot = await setCollection(uid).doc(setId).collection('cards').orderBy('order', 'asc').get();
    return snapshot.docs.map((doc) => doc.data());
};
