import { sendEmail } from '../services/email.js';
import { subscriptionActivated } from '../services/emailTemplates.js';
const recipient = process.env.PLUTO_SMOKE_BILLING_EMAIL_RECIPIENT?.trim();
const run = async () => {
    if (!recipient) {
        console.log(JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'Set PLUTO_SMOKE_BILLING_EMAIL_RECIPIENT to run the billing email smoke test.',
        }, null, 2));
        return;
    }
    const sent = await sendEmail(recipient, 'Pluto billing smoke test', subscriptionActivated('Smoke Tester', 'Plus', new Date(Date.now() + 86_400_000).toISOString()));
    if (!sent) {
        throw new Error('Billing email smoke test did not send successfully.');
    }
    console.log(JSON.stringify({
        ok: true,
        recipient,
        template: 'subscriptionActivated',
    }, null, 2));
};
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
