const formatDate = (value) => {
    if (!value)
        return 'your current billing cycle end date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
    });
};
const formatAmount = (amount) => `INR ${amount}`;
const renderTemplate = ({ title, intro, body, footer = 'Thanks for learning with Pluto.', }) => `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#070814;font-family:Arial,sans-serif;color:#f8fafc;">
    <div style="max-width:620px;margin:0 auto;padding:32px 20px;">
      <div style="background:#111322;border:1px solid #272b45;border-radius:18px;padding:32px;">
        <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#7c3aed;color:#fff;font-weight:700;font-size:12px;letter-spacing:0.04em;">
          PLUTO
        </div>
        <h1 style="margin:20px 0 12px;font-size:28px;line-height:1.2;color:#ffffff;">${title}</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#d4d8f0;">${intro}</p>
        <div style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#e6e8f5;">
          ${body}
        </div>
        <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#a7afcb;">${footer}</p>
      </div>
    </div>
  </body>
</html>`;
export const subscriptionActivated = (name, plan, endDate) => renderTemplate({
    title: `${plan} is active`,
    intro: `Hi ${name}, welcome to Pluto ${plan}.`,
    body: `
      <p>Your subscription is now active.</p>
      <p><strong>Plan:</strong> ${plan}<br />
      <strong>Access until:</strong> ${formatDate(endDate)}</p>
      <p>You can jump back into Pluto anytime and keep learning.</p>
    `,
});
export const subscriptionCharged = (name, plan, amount, nextDate) => renderTemplate({
    title: `${plan} renewal confirmed`,
    intro: `Hi ${name}, your Pluto ${plan} renewal has been processed.`,
    body: `
      <p><strong>Amount charged:</strong> ${formatAmount(amount)}<br />
      <strong>Next billing date:</strong> ${formatDate(nextDate)}</p>
      <p>Your access continues without interruption.</p>
    `,
});
export const subscriptionCancelled = (name, plan, endDate) => renderTemplate({
    title: `${plan} cancellation confirmed`,
    intro: `Hi ${name}, your Pluto ${plan} auto-renewal has been cancelled.`,
    body: `
      <p>Your paid access will remain active until <strong>${formatDate(endDate)}</strong>.</p>
      <p>After that, Pluto will fall back to the Free plan unless you subscribe again.</p>
    `,
});
export const subscriptionPaused = (name, plan) => renderTemplate({
    title: `${plan} is paused`,
    intro: `Hi ${name}, your Pluto ${plan} subscription is now paused.`,
    body: `
      <p>Your subscription has been paused successfully.</p>
      <p>You can resume it later from Pluto when you're ready.</p>
    `,
});
export const subscriptionExpired = (name) => renderTemplate({
    title: 'Your paid access has ended',
    intro: `Hi ${name}, your Pluto paid subscription has ended.`,
    body: `
      <p>Your account is now back on the Free plan.</p>
      <p>If you want full access again, you can resubscribe anytime from Pluto.</p>
    `,
});
export const refundRequested = (name, plan, amount) => renderTemplate({
    title: 'Refund request received',
    intro: `Hi ${name}, we received your refund request for Pluto ${plan}.`,
    body: `
      <p><strong>Plan:</strong> ${plan}<br />
      <strong>Amount:</strong> ${formatAmount(amount)}</p>
      <p>We have recorded the refund request and will keep your billing state updated.</p>
    `,
});
