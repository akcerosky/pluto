import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../lib/firebaseAdmin.js';
import { DEFAULT_PLAN, PLAN_DEFINITIONS, PRO_REFUND_DAILY_LIMIT } from '../config/plans.js';
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
    const usageToday = usage?.count ?? 0;
    const dailyLimit = planDef.dailyLimit;
    const remainingToday = dailyLimit === null ? null : Math.max(dailyLimit - usageToday, 0);
    return {
        profile,
        subscription,
        usageToday,
        dailyLimit,
        remainingToday,
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
export const incrementUsage = async (uid, plan) => {
    const usageRef = userRoot(uid).collection('usageDaily').doc(getIstDayKey(getIstNow()));
    await usageRef.set({
        count: FieldValue.increment(1),
        planSnapshot: plan,
        lastMessageAt: toIstIsoString(getIstNow()),
        updatedAt: toIstIsoString(getIstNow()),
    }, { merge: true });
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
export const getPaymentRecord = async (uid, paymentRecordId) => {
    const snap = await userRoot(uid).collection('payments').doc(paymentRecordId).get();
    return snap.exists ? ({ id: snap.id, ...snap.data() }) : null;
};
export const calculateRefundEligibility = async (uid, plan, activationDate) => {
    const now = getIstNow();
    const dayKeys = getIstDateRangeInclusive(activationDate, now);
    const docs = await Promise.all(dayKeys.map((key) => userRoot(uid).collection('usageDaily').doc(key).get()));
    const messagesUsed = docs.reduce((sum, doc) => {
        if (!doc.exists)
            return sum;
        return sum + (doc.data().count ?? 0);
    }, 0);
    const daysElapsed = countIstCalendarDaysInclusive(activationDate, now);
    const planDailyLimit = PLAN_DEFINITIONS[plan].dailyLimit ?? PRO_REFUND_DAILY_LIMIT;
    const eligibleUsageCapacity = daysElapsed * planDailyLimit;
    const usageRatio = eligibleUsageCapacity === 0 ? 0 : messagesUsed / eligibleUsageCapacity;
    return { messagesUsed, daysElapsed, eligibleUsageCapacity, usageRatio };
};
