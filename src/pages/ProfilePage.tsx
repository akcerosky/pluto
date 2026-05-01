import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GraduationCap, LogOut, Mail, Save, Target, User } from 'lucide-react';
import { useApp } from '../context/useApp';
import type { EducationLevel } from '../context/appContextTypes';
import { PLAN_CONFIGS, type SubscriptionPlan } from '../config/subscription';
import {
  billingCheckout,
  billingHistory,
  billingRequestRefund,
  billingSubscriptionCancel,
  billingSubscriptionGet,
  billingSubscriptionResume,
  billingVerifyPayment,
  meUpdateProfile,
} from '../lib/plutoApi';
import { RAZORPAY_KEY_ID } from '../config/billing';
import { runtimeLogger } from '../lib/runtimeLogger';
import { formatTokenCount, formatTokenUsageSummary } from '../lib/tokenQuota';
import { ThemeToggle } from '../components/ThemeToggle';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const OBJECTIVE_OPTIONS = [
  'General Learning',
  'Homework Help',
  'Exam Preparation',
  'Concept Mastery',
  'Assignment Support',
  'Professional Growth',
] as const;

const getFriendlyBillingMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'message' in error) {
    const message = String(error.message || '').trim();
    if (!message) return fallback;
    const normalized = message.toLowerCase();
    if (normalized === 'internal' || normalized.includes('internal error')) {
      return 'Something went wrong, please try again.';
    }
    return message;
  }
  return fallback;
};

const loadRazorpay = async () => {
  if (window.Razorpay) return true;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout.'));
    document.body.appendChild(script);
  });
  return Boolean(window.Razorpay);
};

export const ProfilePage = () => {
  const {
    user,
    applyServerSnapshot,
    updateUser,
    refreshServerState,
    currentPlan,
    isSubscriptionHydrated,
    usageTodayTokens,
    dailyTokenLimit,
    remainingTodayTokens,
    estimatedMessagesLeft,
    logout,
  } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [objective, setObjective] = useState(user?.objective || '');
  const [educationLevel, setEducationLevel] = useState<EducationLevel>(user?.educationLevel || 'High School');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [billingPlanLoading, setBillingPlanLoading] = useState<SubscriptionPlan | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'pending' | 'active' | 'cancelled' | 'paused' | 'expired'>('active');
  const [subscriptionProvider, setSubscriptionProvider] = useState<'free' | 'razorpay'>('free');
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    setName(user?.name || '');
    setObjective(user?.objective || '');
    setEducationLevel(user?.educationLevel || 'High School');
  }, [user]);

  useEffect(() => {
    const loadBillingState = async () => {
      try {
        const [subscription, paymentHistory] = await Promise.all([billingSubscriptionGet(), billingHistory()]);
        setSubscriptionStatus(subscription.subscription.status);
        setSubscriptionProvider(subscription.subscription.provider);
        setCancelAtPeriodEnd(subscription.subscription.cancelAtPeriodEnd);
        setEndDate(subscription.subscription.endDate);
        setHistory(paymentHistory.history);
        applyServerSnapshot({
          plan: subscription.subscription.plan,
          usageTodayTokens: subscription.usageTodayTokens,
          dailyTokenLimit: subscription.dailyTokenLimit,
          remainingTodayTokens: subscription.remainingTodayTokens,
          estimatedMessagesLeft: subscription.estimatedMessagesLeft,
          premiumModeCount: subscription.premiumModeCount,
          freePremiumModesRemainingToday: subscription.freePremiumModesRemainingToday,
        });
      } catch (error) {
        runtimeLogger.warn('Unable to load Pluto billing state.', error);
      }
    };

    void loadBillingState();
  }, [applyServerSnapshot]);

  const handleSave = async () => {
    setIsSaving(true);
    setBillingNotice(null);

    try {
      const response = await meUpdateProfile({
        name,
        objective,
        educationLevel,
      });
      updateUser({
        name: response.user.name,
        objective: response.user.objective,
        educationLevel: response.user.educationLevel as EducationLevel,
      });
      applyServerSnapshot({
        plan: response.subscription.plan,
        usageTodayTokens: response.usageTodayTokens,
        dailyTokenLimit: response.dailyTokenLimit,
        remainingTodayTokens: response.remainingTodayTokens,
        estimatedMessagesLeft: response.estimatedMessagesLeft,
        premiumModeCount: response.premiumModeCount,
        freePremiumModesRemainingToday: response.freePremiumModesRemainingToday,
        name: response.user.name,
        objective: response.user.objective,
        educationLevel: response.user.educationLevel,
        email: response.user.email,
        avatar: response.user.avatar,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (error) {
      setBillingNotice(getFriendlyBillingMessage(error, 'Unable to save profile changes.'));
    } finally {
      setIsSaving(false);
    }
  };

  const startPlanChange = async (planId: SubscriptionPlan) => {
    if (planId === 'Free') {
      setBillingNotice('Free remains available automatically if your paid access expires or is cancelled.');
      return;
    }

    if (!user) {
      setBillingNotice('Please login again to continue with Razorpay checkout.');
      return;
    }

    setBillingPlanLoading(planId);
    setBillingNotice(null);

    try {
      if (!RAZORPAY_KEY_ID) {
        throw new Error('VITE_RAZORPAY_KEY_ID is missing in the frontend environment.');
      }

      await loadRazorpay();
      const checkout = await billingCheckout({
        plan: planId,
        returnUrl: `${window.location.origin}/profile`,
      });

      if (!window.Razorpay) {
        throw new Error('Razorpay Checkout did not load correctly.');
      }

      const razorpay = new window.Razorpay({
        key: RAZORPAY_KEY_ID,
        subscription_id: checkout.subscriptionId,
        name: checkout.name,
        description: checkout.description,
        handler: async (response: Record<string, string>) => {
          const verification = await billingVerifyPayment({
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySubscriptionId: response.razorpay_subscription_id,
            razorpaySignature: response.razorpay_signature,
          });

          setBillingNotice(
            verification.requiresWebhookSync
              ? 'Payment captured. Pluto is waiting for Razorpay webhook sync.'
              : 'Payment successful. Your Pluto subscription is active.'
          );

          await refreshServerState();
          const subscription = await billingSubscriptionGet();
          setSubscriptionStatus(subscription.subscription.status);
          setSubscriptionProvider(subscription.subscription.provider);
          setCancelAtPeriodEnd(subscription.subscription.cancelAtPeriodEnd);
          setEndDate(subscription.subscription.endDate);
          applyServerSnapshot({
            plan: subscription.subscription.plan,
            usageTodayTokens: subscription.usageTodayTokens,
            dailyTokenLimit: subscription.dailyTokenLimit,
            remainingTodayTokens: subscription.remainingTodayTokens,
            estimatedMessagesLeft: subscription.estimatedMessagesLeft,
            premiumModeCount: subscription.premiumModeCount,
            freePremiumModesRemainingToday: subscription.freePremiumModesRemainingToday,
          });
        },
        prefill: checkout.prefill,
        notes: {
          plan: planId,
          source: 'pluto-profile',
        },
        modal: {
          ondismiss: () => setBillingNotice('Razorpay checkout was closed before payment completed.'),
        },
      });

      razorpay.open();
    } catch (error) {
      setBillingNotice(getFriendlyBillingMessage(error, 'Unable to initiate Razorpay checkout.'));
    } finally {
      setBillingPlanLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      const response = await billingSubscriptionCancel();
      setSubscriptionStatus(response.subscription.status);
      setSubscriptionProvider(response.subscription.provider);
      setCancelAtPeriodEnd(response.subscription.cancelAtPeriodEnd);
      setEndDate(response.subscription.endDate);
      setBillingNotice('Your Razorpay subscription has been set to cancel at the end of the current billing cycle.');
      await refreshServerState();
    } catch (error) {
      setBillingNotice(getFriendlyBillingMessage(error, 'Unable to cancel the Razorpay subscription.'));
    }
  };

  const handleResumeSubscription = async () => {
    try {
      const response = await billingSubscriptionResume();
      setSubscriptionStatus(response.subscription.status);
      setSubscriptionProvider(response.subscription.provider);
      setCancelAtPeriodEnd(response.subscription.cancelAtPeriodEnd);
      setEndDate(response.subscription.endDate);
      setBillingNotice('Your Razorpay subscription has resumed.');
      await refreshServerState();
    } catch (error) {
      setBillingNotice(getFriendlyBillingMessage(error, 'Unable to resume the Razorpay subscription.'));
    }
  };

  const handleRefund = async (paymentRecordId: string) => {
    try {
      await billingRequestRefund({ paymentRecordId });
      setBillingNotice('Refund requested successfully through Razorpay.');
      const paymentHistory = await billingHistory();
      setHistory(paymentHistory.history);
    } catch (error) {
      setBillingNotice(getFriendlyBillingMessage(error, 'Unable to request a refund for this payment.'));
    }
  };

  const planCards = useMemo(() => Object.values(PLAN_CONFIGS), []);

  return (
    <div className="profile-page" style={{ flex: 1, padding: '60px 40px', overflowY: 'auto' }}>
      <div className="profile-inner" style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '8px' }}>Profile Settings</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Manage your Pluto profile, billing, and learning preferences.
          </p>
        </header>

        <div style={{ display: 'grid', gap: '32px' }}>
          <section className="profile-section" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Theme</h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
                padding: '18px',
                borderRadius: '18px',
                border: '1px solid var(--card-border)',
                background: 'var(--surface-1)',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Appearance</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Switch between Pluto&apos;s refined dark and light surfaces.
                </p>
              </div>
              <ThemeToggle label="Toggle Pluto theme from settings" />
            </div>
          </section>

          <section className="profile-section" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Subscription</h2>
            <div style={{ marginBottom: '18px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {isSubscriptionHydrated ? (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>{currentPlan}</strong> plan active
                  {` • ${formatTokenCount(usageTodayTokens)}/${formatTokenCount(dailyTokenLimit)} tokens used today (${formatTokenUsageSummary(remainingTodayTokens, estimatedMessagesLeft)})`}
                </>
              ) : (
                'Syncing your subscription and usage...'
              )}
            </div>
            <p style={{ marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Status: <strong style={{ color: 'var(--text-primary)' }}>{subscriptionStatus}</strong>
              {endDate ? ` • Renews or ends on ${new Date(endDate).toLocaleString()}` : ''}
            </p>
            {subscriptionStatus === 'paused' && (
              <p style={{ marginBottom: '14px', color: 'var(--warning)', fontSize: '0.82rem' }}>
                Auto-renew is disabled. Pluto will fall back to Free when the current Razorpay cycle ends.
              </p>
            )}
            {billingNotice && (
              <div
                style={{
                  marginBottom: '14px',
                  color: 'var(--text-primary)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '0.85rem',
                }}
              >
                {billingNotice}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {planCards.map((plan) => {
                const isCurrent = plan.id === currentPlan;
                return (
                  <div
                    key={plan.id}
                    style={{
                      borderRadius: '16px',
                      border: isCurrent ? '1px solid var(--primary-border)' : '1px solid var(--card-border)',
                      background: isCurrent ? 'var(--primary-soft)' : 'var(--surface-1)',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      height: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{plan.id}</div>
                        <div style={{ fontSize: '0.8rem', color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {plan.tagLine}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--price-accent)' }}>{plan.price}</div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                      }}
                    >
                      {plan.bullets.map((bullet) => (
                        <div key={bullet} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={14} color="var(--success)" />
                          <span>{bullet}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => startPlanChange(plan.id)}
                      disabled={isCurrent || billingPlanLoading === plan.id}
                      style={{
                        ...primaryButtonStyle(isCurrent || billingPlanLoading === plan.id),
                        marginTop: 'auto',
                      }}
                    >
                      {isCurrent ? 'Current Plan' : billingPlanLoading === plan.id ? 'Opening Razorpay...' : `Subscribe ${plan.id}`}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '18px' }}>
              {subscriptionProvider === 'razorpay' && subscriptionStatus === 'active' && !cancelAtPeriodEnd && (
                <button onClick={handleCancelSubscription} style={mutedDangerButtonStyle}>
                  Cancel Renewal
                </button>
              )}
              {subscriptionProvider === 'razorpay' && subscriptionStatus === 'paused' && (
                <button onClick={handleResumeSubscription} style={resumeButtonStyle}>
                  Resume Renewal
                </button>
              )}
            </div>
          </section>

          <section className="profile-section" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Billing History</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              {history.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No Razorpay billing events recorded yet.</p>
              ) : (
                history.map((item) => {
                  const record = item as {
                    id: string;
                    plan?: string;
                    status?: string;
                    amountInr?: number;
                    createdAt?: string;
                    refundRequested?: boolean;
                    refundCompleted?: boolean;
                  };

                  return (
                    <div
                      key={record.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '16px',
                        alignItems: 'center',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1px solid var(--card-border)',
                        background: 'var(--surface-1)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{record.plan || 'Unknown plan'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {record.status || 'unknown'} • {record.amountInr ? `INR ${record.amountInr}` : 'Amount unavailable'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {record.createdAt ? new Date(record.createdAt).toLocaleString() : 'Timestamp unavailable'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRefund(record.id)}
                        disabled={record.refundRequested || record.refundCompleted}
                        style={secondaryButtonStyle}
                      >
                        {record.refundCompleted ? 'Refunded' : record.refundRequested ? 'Refund Pending' : 'Request Refund'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="profile-section" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Basic Information</h2>
            <div className="profile-grid" style={gridStyle}>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>DISPLAY NAME</label>
                <div style={inputContainerStyle}>
                  <User size={18} style={iconStyle} />
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={profileInputStyle} />
                </div>
              </div>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>EMAIL ADDRESS</label>
                <div style={inputContainerStyle}>
                  <Mail size={18} style={iconStyle} />
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    style={{ ...profileInputStyle, opacity: 0.5, cursor: 'not-allowed' }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="profile-section" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Learning Profile</h2>
            <div className="profile-grid" style={gridStyle}>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>EDUCATION LEVEL</label>
                <div style={inputContainerStyle}>
                  <GraduationCap size={18} style={iconStyle} />
                  <select
                    className="profile-select"
                    value={educationLevel}
                    onChange={(e) => setEducationLevel(e.target.value as EducationLevel)}
                    style={profileInputStyle}
                  >
                    <option value="Elementary" style={selectOptionStyle}>Elementary</option>
                    <option value="Middle School" style={selectOptionStyle}>Middle School</option>
                    <option value="High School" style={selectOptionStyle}>High School</option>
                    <option value="College/University" style={selectOptionStyle}>College/University</option>
                    <option value="Professional" style={selectOptionStyle}>Professional</option>
                  </select>
                </div>
              </div>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>LEARNING OBJECTIVE</label>
                <div style={inputContainerStyle}>
                  <Target size={18} style={iconStyle} />
                  <select
                    className="profile-select"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    style={profileInputStyle}
                  >
                    {OBJECTIVE_OPTIONS.map((option) => (
                      <option key={option} value={option} style={selectOptionStyle}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <div className="profile-actions" style={{ display: 'flex', gap: '16px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button onClick={handleSave} disabled={isSaving} style={primaryButtonStyle(isSaving)}>
              <Save size={18} />
              {isSaving ? 'Saving...' : isSaved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>

          <section className="profile-section" style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Danger Zone</h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
                padding: '18px',
                borderRadius: '18px',
                border: '1px solid color-mix(in srgb, var(--danger) 28%, var(--card-border))',
                background: 'color-mix(in srgb, var(--danger-soft) 58%, var(--surface-1))',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>Logout</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  End this Pluto session on this device.
                </p>
              </div>
              <button onClick={logout} style={dangerButtonStyle}>
              <LogOut size={18} />
                Logout Session
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const sectionStyle: React.CSSProperties = {
  background: 'var(--card-bg)',
  padding: '32px',
  borderRadius: '24px',
  border: '1px solid var(--card-border)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: '700',
  marginBottom: '24px',
  color: 'var(--text-primary)',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '24px',
};

const inputGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: '700',
  color: 'var(--text-secondary)',
};

const inputContainerStyle: React.CSSProperties = {
  position: 'relative',
};

const iconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '16px',
  top: '50%',
  transform: 'translateY(-50%)',
  opacity: 0.5,
};

const profileInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 14px 14px 48px',
  background: 'var(--input-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '12px',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  outline: 'none',
};

const primaryButtonStyle = (disabled?: boolean): React.CSSProperties => ({
  padding: '12px 24px',
  borderRadius: '12px',
  background: 'var(--primary)',
  color: 'var(--user-bubble-text)',
  border: 'none',
  fontWeight: '700',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.7 : 1,
});

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: '10px',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--card-border)',
  fontWeight: 600,
  cursor: 'pointer',
};

const mutedDangerButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  background: 'var(--danger-soft)',
  border: '1px solid color-mix(in srgb, var(--danger) 36%, transparent)',
  color: 'var(--danger)',
};

const resumeButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  background: 'var(--primary-soft)',
  border: '1px solid var(--primary-border)',
  color: 'var(--primary)',
};

const selectOptionStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  background: 'var(--card-bg)',
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderRadius: '12px',
  background: 'var(--danger-soft)',
  color: 'var(--danger)',
  border: '1px solid color-mix(in srgb, var(--danger) 36%, transparent)',
  fontWeight: '700',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

