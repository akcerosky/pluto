import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { verifyCheckoutSignature, verifyRazorpayWebhookSignature } from './razorpay.js';
test('verifyRazorpayWebhookSignature accepts valid signatures', () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';
    const body = JSON.stringify({ event: 'subscription.activated' });
    const signature = crypto.createHmac('sha256', 'webhook-secret').update(body).digest('hex');
    assert.equal(verifyRazorpayWebhookSignature(body, signature), true);
});
test('verifyCheckoutSignature accepts valid checkout signatures', () => {
    process.env.RAZORPAY_KEY_SECRET = 'checkout-secret';
    const payload = {
        razorpayPaymentId: 'pay_123',
        razorpaySubscriptionId: 'sub_123',
        razorpaySignature: crypto
            .createHmac('sha256', 'checkout-secret')
            .update('pay_123|sub_123')
            .digest('hex'),
    };
    assert.equal(verifyCheckoutSignature(payload), true);
});
