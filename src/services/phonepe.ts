import { BILLING_ENDPOINTS, type PaidSubscriptionPlan } from '../config/billing';

export interface CreatePhonePeSubscriptionRequest {
  userId: string;
  name: string;
  email: string;
  plan: PaidSubscriptionPlan;
  amountInr: number;
  redirectUrl: string;
}

export interface CreatePhonePeSubscriptionResponse {
  checkoutUrl: string;
  merchantOrderId: string;
}

export interface VerifyPhonePeSubscriptionRequest {
  merchantOrderId: string;
  transactionId?: string;
}

export interface VerifyPhonePeSubscriptionResponse {
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  plan?: PaidSubscriptionPlan;
  merchantOrderId: string;
}

async function ensureOk<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Billing API request failed.');
  }
  return response.json() as Promise<T>;
}

export async function createPhonePeSubscriptionCheckout(
  payload: CreatePhonePeSubscriptionRequest
): Promise<CreatePhonePeSubscriptionResponse> {
  const response = await fetch(BILLING_ENDPOINTS.createPhonePeSubscription, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return ensureOk<CreatePhonePeSubscriptionResponse>(response);
}

export async function verifyPhonePeSubscriptionPayment(
  payload: VerifyPhonePeSubscriptionRequest
): Promise<VerifyPhonePeSubscriptionResponse> {
  const response = await fetch(BILLING_ENDPOINTS.verifyPhonePePayment, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return ensureOk<VerifyPhonePeSubscriptionResponse>(response);
}

