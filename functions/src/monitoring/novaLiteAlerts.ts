/**
 * Nova Lite rollout alert runbook.
 *
 * These alert policies must be created manually in Google Cloud Logging /
 * Cloud Monitoring. They cannot be provisioned from this repository.
 *
 * Workflow:
 * 1. Create the logs-based metric from the exact filter below.
 * 2. For latency, create a logs-based distribution metric extracted from
 *    jsonPayload.latencyMs.
 * 3. Create a Cloud Monitoring alert policy on top of the metric using the
 *    documented window and threshold.
 */

export type NovaLiteAlertMetricType = 'logs-based counter' | 'logs-based distribution';

export interface NovaLiteAlertRunbookEntry {
  name: string;
  purpose: string;
  condition: string;
  filter: string;
  timeWindow: string;
  thresholdInterpretation: string;
  metricType: NovaLiteAlertMetricType;
  notes: string[];
}

const baseFunctionFilter =
  'resource.type="cloud_function" OR resource.type="cloud_run_revision"';

export const NOVA_LITE_ALERT_RUNBOOK: NovaLiteAlertRunbookEntry[] = [
  {
    name: 'Nova Lite success rate below 95%',
    purpose:
      'Detect attachment-path degradation when Nova Lite success volume drops relative to started attempts.',
    condition: 'Alert if success rate is below 95% over a 10 minute rolling window.',
    filter: `${baseFunctionFilter}
jsonPayload.eventType="nova_lite_success"`,
    timeWindow: '10 minutes',
    thresholdInterpretation:
      'Create two counter metrics: one for nova_lite_success and one for nova_lite_attempt_started. In Cloud Monitoring, alert when success_count / started_count < 0.95 over 10 minutes.',
    metricType: 'logs-based counter',
    notes: [
      'Success metric filter: resource + jsonPayload.eventType="nova_lite_success".',
      'Started metric filter: resource + jsonPayload.eventType="nova_lite_attempt_started".',
      'Use an MQL or ratio alert in Cloud Monitoring with 10 minute alignment.',
    ],
  },
  {
    name: 'Gemini fallback rate from Nova Lite above 10%',
    purpose:
      'Catch increased fallback churn before Nova Lite is trusted as the primary multimodal path.',
    condition: 'Alert if fallback rate is above 10% over a 10 minute rolling window.',
    filter: `${baseFunctionFilter}
jsonPayload.eventType="gemini_fallback_triggered_from_nova_lite"`,
    timeWindow: '10 minutes',
    thresholdInterpretation:
      'Create one counter metric for gemini_fallback_triggered_from_nova_lite and divide it by nova_lite_attempt_started count. Alert when fallback_count / started_count > 0.10.',
    metricType: 'logs-based counter',
    notes: [
      'Use the same started-attempt metric created for the success-rate alert.',
      'This alert should be ratio-based, not absolute count-based, so low-volume periods do not flap.',
    ],
  },
  {
    name: 'Nova Lite p95 latency above 30 seconds',
    purpose: 'Detect slow Nova Lite responses before they cascade into user-facing timeouts.',
    condition: 'Alert if p95 latency exceeds 30000 ms.',
    filter: `${baseFunctionFilter}
jsonPayload.eventType="nova_lite_success"
jsonPayload.latencyMs:*`,
    timeWindow: '10 minutes',
    thresholdInterpretation:
      'Create a logs-based distribution metric extracting jsonPayload.latencyMs, then alert when p95(latencyMs) > 30000 over the aligned window.',
    metricType: 'logs-based distribution',
    notes: [
      'In the distribution metric, set the value extractor to jsonPayload.latencyMs.',
      'Use a 10 minute rolling window with p95 alignment in Cloud Monitoring.',
    ],
  },
  {
    name: 'Nova Lite 5xx rate above 5%',
    purpose: 'Catch retryable provider/server-side instability quickly.',
    condition: 'Alert if Nova Lite 5xx failures exceed 5% of attempts over 5 minutes.',
    filter: `${baseFunctionFilter}
jsonPayload.eventType="nova_lite_failed"
jsonPayload.providerStatus>=500
jsonPayload.providerStatus<600`,
    timeWindow: '5 minutes',
    thresholdInterpretation:
      'Create a counter metric for nova_lite_failed filtered to providerStatus 5xx and divide it by nova_lite_attempt_started count. Alert when 5xx_failed_count / started_count > 0.05.',
    metricType: 'logs-based counter',
    notes: [
      'Use providerStatus filters exactly as above so only 5xx failures contribute.',
      'Prefer a 5 minute alignment to reduce time-to-detect for outages.',
    ],
  },
  {
    name: 'Provider usage anomaly count above 5 in 10 minutes',
    purpose:
      'Detect token-accounting drift when provider usage is missing and the fallback estimator is being used unusually often.',
    condition: 'Alert if usageAnomaly appears more than 5 times in a 10 minute window.',
    filter: `${baseFunctionFilter}
jsonPayload.eventType="nova_lite_success"
jsonPayload.usageAnomaly:*`,
    timeWindow: '10 minutes',
    thresholdInterpretation:
      'Create a counter metric on nova_lite_success entries where jsonPayload.usageAnomaly is present. Alert when count > 5 over 10 minutes.',
    metricType: 'logs-based counter',
    notes: [
      'This is an absolute-count alert because anomalies should be rare even at moderate traffic volumes.',
      'If volumes become very large later, consider converting this to a rate-based alert as well.',
    ],
  },
];
