import { adminDb } from '../lib/firebaseAdmin.js';
import { DEFAULT_PLAN, FREE_PREMIUM_MODE_DAILY_LIMIT, PLAN_DEFINITIONS, PRO_REFUND_DAILY_LIMIT, } from '../config/plans.js';
import { ABSOLUTE_MAX_DAILY_TOKEN_CEILING, estimateMessagesLeft } from './tokenUsage.js';
import { countIstCalendarDaysInclusive, getIstDayKey, getIstNow, getIstDateRangeInclusive, getLast30IstDayKeys, toIstIsoString, } from '../utils/time.js';
const userRoot = (uid) => adminDb.collection('users').doc(uid);
export const getUserDefaults = (uid, identity) => {
    const now = toIstIsoString(getIstNow());
    const email = identity?.email?.trim() || '';
    const name = identity?.name?.trim() || email.split('@')[0] || `User ${uid.slice(0, 6)}`;
    const avatar = identity?.avatar?.trim();
    return {
        profile: {
            name,
            email,
            educationLevel: 'High School',
            objective: 'General Learning',
            updatedAt: now,
            ...(avatar ? { avatar } : {}),
        },
        subscription: {
            plan: DEFAULT_PLAN,
            status: 'active',
            provider: 'free',
            endDate: null,
            cancelAtPeriodEnd: false,
            updatedAt: now,
        },
    };
};
export const ensureUserDocuments = async (uid, identity) => {
    const defaults = getUserDefaults(uid, identity);
    const profileRef = userRoot(uid).collection('profile').doc('main');
    const subscriptionPublicRef = userRoot(uid).collection('subscriptionPublic').doc('main');
    const subscriptionPrivateRef = userRoot(uid).collection('subscriptionPrivate').doc('main');
    const [profileSnap, subscriptionPublicSnap, subscriptionPrivateSnap] = await Promise.all([
        profileRef.get(),
        subscriptionPublicRef.get(),
        subscriptionPrivateRef.get(),
    ]);
    if (!profileSnap.exists) {
        await profileRef.set(defaults.profile);
    }
    if (!subscriptionPublicSnap.exists) {
        await subscriptionPublicRef.set(defaults.subscription);
    }
    if (!subscriptionPrivateSnap.exists) {
        const now = toIstIsoString(getIstNow());
        const privateDoc = {
            providerCustomerId: null,
            providerSubscriptionId: null,
            providerPaymentId: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            refundRequested: false,
            refundCompleted: false,
            updatedAt: now,
        };
        await subscriptionPrivateRef.set(privateDoc);
    }
};
export const getMeSnapshot = async (uid, identity) => {
    await ensureUserDocuments(uid, identity);
    const profileRef = userRoot(uid).collection('profile').doc('main');
    const subscriptionPublicRef = userRoot(uid).collection('subscriptionPublic').doc('main');
    const todayKey = getIstDayKey(getIstNow());
    const usageRef = userRoot(uid).collection('usageDaily').doc(todayKey);
    const [profileSnap, subscriptionSnap, usageSnap] = await Promise.all([
        profileRef.get(),
        subscriptionPublicRef.get(),
        usageRef.get(),
    ]);
    const profile = profileSnap.data();
    const subscription = subscriptionSnap.data();
    const usage = usageSnap.exists ? usageSnap.data() : null;
    const planDef = PLAN_DEFINITIONS[subscription.plan];
    const usageTodayTokens = usage?.totalTokensUsed ?? 0;
    const premiumModeCount = usage?.premiumModeCount ?? 0;
    const dailyTokenLimit = planDef.dailyTokenLimit;
    const remainingTodayTokens = Math.max(dailyTokenLimit - (usageTodayTokens + (usage?.reservedTokens ?? 0)), 0);
    const estimatedMessagesLeft = estimateMessagesLeft(subscription.plan, remainingTodayTokens);
    const freePremiumModesRemainingToday = subscription.plan === 'Free'
        ? Math.max(FREE_PREMIUM_MODE_DAILY_LIMIT - premiumModeCount, 0)
        : null;
    return {
        profile,
        subscription,
        usageTodayTokens,
        premiumModeCount,
        freePremiumModesRemainingToday,
        dailyTokenLimit,
        remainingTodayTokens,
        estimatedMessagesLeft,
        dayKey: todayKey,
        planDefinition: planDef,
    };
};
export const updateProfile = async (uid, data, identity) => {
    await ensureUserDocuments(uid, identity);
    const profileRef = userRoot(uid).collection('profile').doc('main');
    await profileRef.set({
        ...data,
        updatedAt: toIstIsoString(getIstNow()),
    }, { merge: true });
    const profileSnap = await profileRef.get();
    return profileSnap.data();
};
export const reserveUsageTokens = async (uid, plan, reservedTokens) => {
    const usageRef = userRoot(uid).collection('usageDaily').doc(getIstDayKey(getIstNow()));
    const now = toIstIsoString(getIstNow());
    const planDef = PLAN_DEFINITIONS[plan];
    await adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(usageRef);
        const data = snap.exists ? snap.data() : null;
        const totalTokensUsed = data?.totalTokensUsed ?? 0;
        const existingReserved = data?.reservedTokens ?? 0;
        const effectiveUsed = totalTokensUsed + existingReserved;
        const effectiveDailyLimit = Math.min(planDef.dailyTokenLimit, ABSOLUTE_MAX_DAILY_TOKEN_CEILING);
        if (effectiveUsed + reservedTokens > effectiveDailyLimit) {
            throw new Error('TOKEN_QUOTA_EXCEEDED');
        }
        transaction.set(usageRef, {
            count: data?.count ?? 0,
            premiumModeCount: data?.premiumModeCount ?? 0,
            inputTokensUsed: data?.inputTokensUsed ?? 0,
            outputTokensUsed: data?.outputTokensUsed ?? 0,
            totalTokensUsed,
            reservedTokens: existingReserved + reservedTokens,
            planSnapshot: plan,
            lastMessageAt: data?.lastMessageAt ?? now,
            updatedAt: now,
        }, { merge: true });
    });
};
export const releaseReservedUsageTokens = async (uid, reservedTokens) => {
    const usageRef = userRoot(uid).collection('usageDaily').doc(getIstDayKey(getIstNow()));
    const now = toIstIsoString(getIstNow());
    await adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(usageRef);
        const data = snap.exists ? snap.data() : null;
        const existingReserved = data?.reservedTokens ?? 0;
        transaction.set(usageRef, {
            reservedTokens: Math.max(existingReserved - reservedTokens, 0),
            updatedAt: now,
        }, { merge: true });
    });
};
export const reconcileUsageTokens = async (uid, plan, reservedTokens, usage, options) => {
    const usageRef = userRoot(uid).collection('usageDaily').doc(getIstDayKey(getIstNow()));
    const now = toIstIsoString(getIstNow());
    return adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(usageRef);
        const data = snap.exists ? snap.data() : null;
        const existingReserved = data?.reservedTokens ?? 0;
        const count = (data?.count ?? 0) + 1;
        const premiumModeCount = (data?.premiumModeCount ?? 0) + (options?.countsTowardPremiumModeLimit ? 1 : 0);
        const inputTokensUsed = (data?.inputTokensUsed ?? 0) + usage.inputTokens;
        const outputTokensUsed = (data?.outputTokensUsed ?? 0) + usage.outputTokens;
        const totalTokensUsed = (data?.totalTokensUsed ?? 0) + usage.totalTokens;
        const nextReservedTokens = Math.max(existingReserved - reservedTokens, 0);
        transaction.set(usageRef, {
            count,
            premiumModeCount,
            inputTokensUsed,
            outputTokensUsed,
            totalTokensUsed,
            reservedTokens: nextReservedTokens,
            planSnapshot: plan,
            lastMessageAt: now,
            updatedAt: now,
        }, { merge: true });
        const planDef = PLAN_DEFINITIONS[plan];
        const remainingTodayTokens = Math.max(planDef.dailyTokenLimit - (totalTokensUsed + nextReservedTokens), 0);
        return {
            usageTodayTokens: totalTokensUsed,
            dailyTokenLimit: planDef.dailyTokenLimit,
            remainingTodayTokens,
            estimatedMessagesLeft: estimateMessagesLeft(plan, remainingTodayTokens),
            premiumModeCount,
            freePremiumModesRemainingToday: plan === 'Free' ? Math.max(FREE_PREMIUM_MODE_DAILY_LIMIT - premiumModeCount, 0) : null,
        };
    });
};
export const getUsageHistory = async (uid) => {
    const keys = getLast30IstDayKeys(getIstNow());
    const docs = await Promise.all(keys.map((key) => userRoot(uid).collection('usageDaily').doc(key).get()));
    return keys.map((dateKey, index) => {
        const doc = docs[index];
        const data = doc.exists ? doc.data() : null;
        return {
            dateKey,
            count: data?.count ?? 0,
            premiumModeCount: data?.premiumModeCount ?? 0,
            inputTokensUsed: data?.inputTokensUsed ?? 0,
            outputTokensUsed: data?.outputTokensUsed ?? 0,
            totalTokensUsed: data?.totalTokensUsed ?? 0,
            planSnapshot: data?.planSnapshot ?? null,
        };
    });
};
export const createPaymentRecord = async (uid, paymentId, payload) => {
    await userRoot(uid).collection('payments').doc(paymentId).set(payload, { merge: true });
};
export const listPaymentHistory = async (uid) => {
    const snap = await userRoot(uid).collection('payments').orderBy('createdAt', 'desc').limit(30).get();
    return snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    }));
};
export const updateSubscriptionFromRazorpay = async (uid, data) => {
    const now = toIstIsoString(getIstNow());
    const subscriptionPublicRef = userRoot(uid).collection('subscriptionPublic').doc('main');
    const subscriptionPrivateRef = userRoot(uid).collection('subscriptionPrivate').doc('main');
    await Promise.all([
        subscriptionPublicRef.set({
            plan: data.plan,
            status: data.status,
            provider: data.plan === 'Free' ? 'free' : 'razorpay',
            endDate: data.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
            updatedAt: now,
        }, { merge: true }),
        subscriptionPrivateRef.set({
            providerSubscriptionId: data.subscriptionId,
            providerPaymentId: data.paymentId ?? null,
            currentPeriodStart: data.currentPeriodStart ?? null,
            currentPeriodEnd: data.currentPeriodEnd ?? null,
            updatedAt: now,
        }, { merge: true }),
    ]);
};
export const markRefundState = async (uid, paymentRecordId, state) => {
    const now = toIstIsoString(getIstNow());
    await Promise.all([
        userRoot(uid).collection('payments').doc(paymentRecordId).set({
            ...state,
            updatedAt: now,
        }, { merge: true }),
        userRoot(uid).collection('subscriptionPrivate').doc('main').set({
            refundRequested: state.refundRequested,
            refundCompleted: state.refundCompleted,
            updatedAt: now,
        }, { merge: true }),
    ]);
};
export const acquireBillingEventLock = async (uid, providerEventId, payload) => {
    const ref = userRoot(uid).collection('billingEvents').doc(providerEventId);
    const result = await adminDb.runTransaction(async (transaction) => {
        const existing = await transaction.get(ref);
        if (existing.exists) {
            return false;
        }
        transaction.set(ref, {
            processed: true,
            provider: payload.provider,
            eventType: payload.eventType,
            paymentRecordId: payload.paymentRecordId,
            processedAt: toIstIsoString(getIstNow()),
        });
        return true;
    });
    return result;
};
export const getSubscriptionPrivate = async (uid) => {
    await ensureUserDocuments(uid);
    const snap = await userRoot(uid).collection('subscriptionPrivate').doc('main').get();
    return snap.data();
};
export const getUserEmailContact = async (uid) => {
    await ensureUserDocuments(uid);
    const [profileSnap, privateSnap] = await Promise.all([
        userRoot(uid).collection('profile').doc('main').get(),
        userRoot(uid).collection('subscriptionPrivate').doc('main').get(),
    ]);
    const profile = profileSnap.exists ? profileSnap.data() : null;
    const privateData = privateSnap.exists
        ? privateSnap.data()
        : null;
    const email = privateData?.email?.trim() || profile?.email?.trim() || '';
    const name = privateData?.name?.trim() || profile?.name?.trim() || email.split('@')[0] || 'there';
    return {
        email,
        name,
    };
};
export const getPaymentRecord = async (uid, paymentRecordId) => {
    const snap = await userRoot(uid).collection('payments').doc(paymentRecordId).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() }) : null;
};
export const calculateRefundEligibility = async (uid, plan, activationDate) => {
    const now = getIstNow();
    const dayKeys = getIstDateRangeInclusive(activationDate, now);
    const docs = await Promise.all(dayKeys.map((key) => userRoot(uid).collection('usageDaily').doc(key).get()));
    const tokensUsed = docs.reduce((sum, doc) => {
        if (!doc.exists)
            return sum;
        const data = doc.data();
        if (typeof data.totalTokensUsed === 'number')
            return sum + data.totalTokensUsed;
        return sum + ((data.count ?? 0) * PLAN_DEFINITIONS[plan].averageTokensPerMessage);
    }, 0);
    const daysElapsed = countIstCalendarDaysInclusive(activationDate, now);
    const planDailyLimit = PLAN_DEFINITIONS[plan].dailyTokenLimit ?? PRO_REFUND_DAILY_LIMIT;
    const eligibleUsageCapacity = daysElapsed * planDailyLimit;
    const usageRatio = eligibleUsageCapacity === 0 ? 0 : tokensUsed / eligibleUsageCapacity;
    return { messagesUsed: tokensUsed, daysElapsed, eligibleUsageCapacity, usageRatio };
};
