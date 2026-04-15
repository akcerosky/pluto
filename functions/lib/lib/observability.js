import { logger } from 'firebase-functions';
export const logAiQuotaEvent = (payload) => {
    logger.info('ai_quota_event', {
        eventType: 'ai_quota_event',
        ...payload,
    });
};
export const logAiQuotaMetric = (metricName, payload) => {
    logger.info('ai_quota_metric', {
        eventType: 'ai_quota_metric',
        metricName,
        ...payload,
    });
};
