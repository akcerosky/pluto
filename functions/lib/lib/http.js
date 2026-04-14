import { HttpsError } from 'firebase-functions/v2/https';
export const assertAuth = (request) => {
    if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'A signed-in Firebase user is required.');
    }
    return request.auth.uid;
};
export const assertAdmin = (request) => {
    const uid = assertAuth(request);
    if (request.auth?.token?.admin !== true) {
        throw new HttpsError('permission-denied', 'Admin access is required.');
    }
    return uid;
};
export const getRequestId = (payload) => {
    if (!payload.requestId || typeof payload.requestId !== 'string') {
        throw new HttpsError('invalid-argument', 'requestId is required.');
    }
    return payload.requestId;
};
export const getBootstrapIdentity = (request) => ({
    email: typeof request.auth?.token?.email === 'string' ? request.auth.token.email : null,
    name: typeof request.auth?.token?.name === 'string'
        ? request.auth.token.name
        : typeof request.auth?.token?.email === 'string'
            ? request.auth.token.email.split('@')[0]
            : null,
    avatar: typeof request.auth?.token?.picture === 'string' ? request.auth.token.picture : null,
});
