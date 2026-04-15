import { logger } from 'firebase-functions';

export const logAiQuotaEvent = (payload: Record<string, unknown>) => {
  logger.info('ai_quota_event', {
    eventType: 'ai_quota_event',
    ...payload,
  });
};

export const logAiQuotaMetric = (
  metricName:
    | 'fallback_estimation_used'
    | 'reserved_actual_delta'
    | 'quota_rejection'
    | 'token_consumption_by_plan'
    | 'token_anomaly',
  payload: Record<string, unknown>
) => {
  logger.info('ai_quota_metric', {
    eventType: 'ai_quota_metric',
    metricName,
    ...payload,
  });
};
