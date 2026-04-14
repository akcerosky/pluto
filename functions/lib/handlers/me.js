import { HttpsError } from 'firebase-functions/v2/https';
import { PLAN_DEFINITIONS } from '../config/plans.js';
import { assertAuth, getBootstrapIdentity } from '../lib/http.js';
import { getMeSnapshot, getUsageHistory, updateProfile } from '../services/firestoreRepo.js';
import { z } from 'zod';
const updateProfileSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    educationLevel: z.string().trim().min(1).max(80).optional(),
    objective: z.string().trim().min(1).max(200).optional(),
});
export const meGetHandler = async (request) => {
    const uid = assertAuth(request);
    const snapshot = await getMeSnapshot(uid, getBootstrapIdentity(request));
    return {
        user: {
            id: uid,
            ...snapshot.profile,
            plan: snapshot.subscription.plan,
        },
        subscription: snapshot.subscription,
        usageToday: snapshot.usageToday,
        dailyLimit: snapshot.dailyLimit,
        remainingToday: snapshot.remainingToday,
        planConfig: PLAN_DEFINITIONS[snapshot.subscription.plan],
    };
};
export const meUpdateProfileHandler = async (request) => {
    const uid = assertAuth(request);
    const payload = updateProfileSchema.parse(request.data ?? {});
    if (Object.keys(payload).length === 0) {
        throw new HttpsError('invalid-argument', 'At least one profile field must be supplied.');
    }
    const bootstrapIdentity = getBootstrapIdentity(request);
    const profile = await updateProfile(uid, payload, bootstrapIdentity);
    const snapshot = await getMeSnapshot(uid, bootstrapIdentity);
    return {
        user: {
            id: uid,
            ...profile,
            plan: snapshot.subscription.plan,
        },
        subscription: snapshot.subscription,
        usageToday: snapshot.usageToday,
        dailyLimit: snapshot.dailyLimit,
        remainingToday: snapshot.remainingToday,
        planConfig: PLAN_DEFINITIONS[snapshot.subscription.plan],
    };
};
export const meUsageHistoryHandler = async (request) => {
    const uid = assertAuth(request);
    await getMeSnapshot(uid, getBootstrapIdentity(request));
    return {
        history: await getUsageHistory(uid),
    };
};
