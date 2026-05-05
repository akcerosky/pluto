import { adminDb } from '../../lib/firebaseAdmin.js';
import { executeHybridAiRequest } from '../ai/orchestrator.js';
import { getIstDayKey, getIstNow } from '../../utils/time.js';
import { updateCardAfterReview } from './sm2.js';
const userRoot = (uid) => adminDb.collection('users').doc(uid);
const setCollection = (uid) => userRoot(uid).collection('flashcardSets');
const sessionCollection = (uid) => userRoot(uid).collection('flashcardSessions');
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
const buildGenerationPrompt = ({ topic, subject, educationLevel, }) => `
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
export const generateFlashcardSetForUser = async ({ uid, topic, subject, educationLevel, plan, }) => {
    const response = await executeHybridAiRequest({
        prompt: buildGenerationPrompt({ topic, subject, educationLevel }),
        educationLevel: educationLevel || 'High School',
        mode: 'Conversational',
        objective: `Generate a machine-readable flashcard set for ${topic}`,
        plan,
        uid,
        history: [],
        summaryCandidates: [],
        attachments: [],
        maxOutputTokens: 2000,
    });
    const parsed = parseFlashcardGenerationResponse(response.text);
    if (!parsed?.cards?.length) {
        throw new Error('Flashcard generation returned invalid JSON.');
    }
    const setRef = setCollection(uid).doc();
    const nowIso = new Date().toISOString();
    const cards = parsed.cards.map((card, index) => ({
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
    const setDoc = {
        id: setRef.id,
        title: parsed.title || topic,
        subject: parsed.subject || subject || 'General',
        topic,
        totalCards: cards.length,
        createdAt: nowIso,
        stats: computeStats(cards),
        ...(educationLevel ? { educationLevel } : {}),
    };
    const batch = adminDb.batch();
    batch.set(setRef, setDoc);
    for (const card of cards) {
        batch.set(setRef.collection('cards').doc(card.id), card);
    }
    await batch.commit();
    return { setId: setRef.id };
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
export const submitCardReviewForUser = async ({ uid, setId, cardId, rating, sessionId, }) => {
    const setRef = setCollection(uid).doc(setId);
    const cardRef = setRef.collection('cards').doc(cardId);
    const sessionRef = sessionCollection(uid).doc(sessionId);
    const nowIso = new Date().toISOString();
    return adminDb.runTransaction(async (transaction) => {
        const [cardSnap, setSnap, sessionSnap, cardsSnap] = await Promise.all([
            transaction.get(cardRef),
            transaction.get(setRef),
            transaction.get(sessionRef),
            transaction.get(setRef.collection('cards')),
        ]);
        if (!cardSnap.exists || !setSnap.exists) {
            throw new Error('Flashcard set or card not found.');
        }
        const updatedCard = updateCardAfterReview(cardSnap.data(), rating, nowIso);
        const cards = cardsSnap.docs.map((doc) => doc.id === cardId ? updatedCard : doc.data());
        const stats = computeStats(cards);
        transaction.set(cardRef, updatedCard);
        transaction.set(setRef, {
            stats,
            lastReviewedAt: nowIso,
        }, { merge: true });
        const currentSession = sessionSnap.exists
            ? sessionSnap.data()
            : {
                id: sessionId,
                setId,
                date: getIstDayKey(getIstNow()),
                cardsReviewed: 0,
                ratings: { easy: 0, good: 0, hard: 0 },
                durationSeconds: 0,
                completedAt: nowIso,
            };
        transaction.set(sessionRef, {
            ...currentSession,
            cardsReviewed: currentSession.cardsReviewed + 1,
            ratings: {
                ...currentSession.ratings,
                [rating]: currentSession.ratings[rating] + 1,
            },
            completedAt: nowIso,
        }, { merge: true });
        return {
            card: updatedCard,
            stats,
        };
    });
};
export const deleteFlashcardSetForUser = async (uid, setId) => {
    await adminDb.recursiveDelete(setCollection(uid).doc(setId));
    return { ok: true };
};
export const getFlashcardCardsForSet = async (uid, setId) => {
    const snapshot = await setCollection(uid).doc(setId).collection('cards').orderBy('order', 'asc').get();
    return snapshot.docs.map((doc) => doc.data());
};
