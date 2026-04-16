import { Resend } from 'resend';
import { env } from '../config/env.js';
let resendClient = null;
const getResendClient = () => {
    const apiKey = env.resendApiKey?.trim();
    if (!apiKey)
        return null;
    if (!resendClient) {
        resendClient = new Resend(apiKey);
    }
    return resendClient;
};
export const sendEmail = async (to, subject, html) => {
    const from = env.resendFromEmail?.trim();
    const client = getResendClient();
    if (!to.trim()) {
        console.warn('Skipping email send because recipient email is missing.');
        return false;
    }
    if (!from) {
        console.warn('Skipping email send because RESEND_FROM_EMAIL is not configured.');
        return false;
    }
    if (!client) {
        console.warn('Skipping email send because RESEND_API_KEY is not configured.');
        return false;
    }
    try {
        await client.emails.send({
            from,
            to,
            subject,
            html,
        });
        return true;
    }
    catch (error) {
        console.error('Failed to send email with Resend.', {
            to,
            subject,
            error,
        });
        return false;
    }
};
