import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { EducationLevel } from '../context/AppContext';
import { User, Mail, GraduationCap, Target, Save, LogOut, CheckCircle2 } from 'lucide-react';
import { PLAN_CONFIGS, type SubscriptionPlan } from '../config/subscription';
import { PHONEPE_RETURN_PARAM, type PaidSubscriptionPlan } from '../config/billing';
import {
  createPhonePeSubscriptionCheckout,
  verifyPhonePeSubscriptionPayment,
} from '../services/phonepe';

export const ProfilePage = () => {
  const { user, updateUser, setPlan, currentPlan, usageToday, dailyLimit, remainingToday, logout } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [objective, setObjective] = useState(user?.objective || '');
  const [educationLevel, setEducationLevel] = useState(user?.educationLevel || 'High School');
  const [isSaved, setIsSaved] = useState(false);
  const [billingPlanLoading, setBillingPlanLoading] = useState<SubscriptionPlan | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  const handleSave = () => {
    updateUser({ name, objective, educationLevel: educationLevel as any });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const plans = Object.values(PLAN_CONFIGS);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(PHONEPE_RETURN_PARAM) !== '1') return;

    const merchantOrderId = params.get('merchantOrderId');
    const transactionId = params.get('transactionId') || undefined;
    const plan = params.get('plan') as PaidSubscriptionPlan | null;

    if (!merchantOrderId || !plan) {
      setBillingNotice('PhonePe returned incomplete data. Please try again.');
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const verification = await verifyPhonePeSubscriptionPayment({
          merchantOrderId,
          transactionId,
        });

        if (cancelled) return;

        if (verification.status === 'SUCCESS') {
          setPlan(plan);
          setBillingNotice(`Payment successful. ${plan} plan is now active.`);
        } else if (verification.status === 'PENDING') {
          setBillingNotice('Payment is pending with PhonePe. We will activate your plan once confirmed.');
        } else {
          setBillingNotice('Payment failed. Please retry the subscription.');
        }
      } catch (error: any) {
        setBillingNotice(
          error?.message ||
            'Unable to verify payment right now. Please retry in a moment.'
        );
      } finally {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete(PHONEPE_RETURN_PARAM);
        cleanUrl.searchParams.delete('merchantOrderId');
        cleanUrl.searchParams.delete('transactionId');
        cleanUrl.searchParams.delete('plan');
        window.history.replaceState({}, '', cleanUrl.toString());
      }
    };

    void verify();

    return () => {
      cancelled = true;
    };
  }, [setPlan]);

  const startPlanChange = async (planId: SubscriptionPlan) => {
    if (planId === currentPlan) return;
    setBillingNotice(null);

    if (planId === 'Free') {
      setPlan('Free');
      setBillingNotice('Switched to Free plan.');
      return;
    }

    if (!user) {
      setBillingNotice('Please login again to continue with subscription checkout.');
      return;
    }

    setBillingPlanLoading(planId);
    try {
      const amountInr = PLAN_CONFIGS[planId].priceInrMonthly;
      const returnUrl = new URL('/profile', window.location.origin);
      returnUrl.searchParams.set(PHONEPE_RETURN_PARAM, '1');
      returnUrl.searchParams.set('plan', planId);

      const checkout = await createPhonePeSubscriptionCheckout({
        userId: user.id,
        name: user.name,
        email: user.email,
        plan: planId,
        amountInr,
        redirectUrl: returnUrl.toString(),
      });

      window.location.href = checkout.checkoutUrl;
    } catch (error: any) {
      setBillingNotice(
        error?.message ||
          'Unable to initiate PhonePe checkout. Verify backend billing setup.'
      );
    } finally {
      setBillingPlanLoading(null);
    }
  };

  return (
    <div style={{ flex: 1, padding: '60px 40px', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '8px' }}>Profile Settings</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage your astronaut profile, learning preferences, and plan.</p>
        </header>

        <div style={{ display: 'grid', gap: '32px' }}>
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Subscription</h3>
            <div style={{ marginBottom: '18px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <strong style={{ color: 'white' }}>{currentPlan}</strong> plan active
              {dailyLimit === null ? ' • Unlimited daily usage' : ` • ${usageToday}/${dailyLimit} used today (${remainingToday} left)`}
            </div>
            <p style={{ marginBottom: '14px', color: '#fbbf24', fontSize: '0.82rem' }}>
              Paid plan upgrades now route via PhonePe checkout.
            </p>
            {billingNotice && (
              <div style={{ marginBottom: '14px', color: '#f8fafc', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '10px 12px', fontSize: '0.85rem' }}>
                {billingNotice}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {plans.map((plan) => {
                const isCurrent = plan.id === currentPlan;
                return (
                  <div
                    key={plan.id}
                    style={{
                      borderRadius: '16px',
                      border: isCurrent ? '1px solid rgba(138, 43, 226, 0.65)' : '1px solid var(--card-border)',
                      background: isCurrent ? 'rgba(138, 43, 226, 0.1)' : 'rgba(255,255,255,0.02)',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{plan.id}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{plan.tagLine}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: '#f59e0b' }}>{plan.price}</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {plan.bullets.map((bullet) => (
                        <div key={bullet} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={14} color="#22c55e" />
                          <span>{bullet}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => startPlanChange(plan.id as SubscriptionPlan)}
                      disabled={isCurrent || billingPlanLoading === plan.id}
                      style={{
                        marginTop: '8px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: isCurrent ? '1px solid rgba(255,255,255,0.1)' : 'none',
                        background: isCurrent ? 'rgba(255,255,255,0.08)' : 'var(--primary)',
                        color: 'white',
                        fontWeight: 700,
                        cursor: isCurrent ? 'not-allowed' : 'pointer',
                        opacity: isCurrent ? 0.75 : 1,
                      }}
                    >
                      {isCurrent
                        ? 'Current Plan'
                        : billingPlanLoading === plan.id
                        ? 'Redirecting...'
                        : plan.id === 'Free'
                        ? 'Switch to Free'
                        : `Subscribe ${plan.id} with PhonePe`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Basic Information</h3>
            <div style={gridStyle}>
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
                  <input type="email" value={user?.email || ''} disabled style={{ ...profileInputStyle, opacity: 0.5, cursor: 'not-allowed' }} />
                </div>
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Learning Profile</h3>
            <div style={gridStyle}>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>EDUCATION LEVEL</label>
                <div style={inputContainerStyle}>
                  <GraduationCap size={18} style={iconStyle} />
                  <select value={educationLevel} onChange={(e) => setEducationLevel(e.target.value as EducationLevel)} style={profileInputStyle}>
                    <option value="Elementary">Elementary</option>
                    <option value="Middle School">Middle School</option>
                    <option value="High School">High School</option>
                    <option value="College/University">College/University</option>
                    <option value="Professional">Professional</option>
                  </select>
                </div>
              </div>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>LEARNING OBJECTIVE</label>
                <div style={inputContainerStyle}>
                  <Target size={18} style={iconStyle} />
                  <input type="text" value={objective} onChange={(e) => setObjective(e.target.value)} style={profileInputStyle} />
                </div>
              </div>
            </div>
          </section>

          <div style={{ display: 'flex', gap: '16px', marginTop: '20px' }}>
            <button
              onClick={handleSave}
              style={{
                padding: '12px 32px',
                borderRadius: '12px',
                background: isSaved ? '#10b981' : 'var(--primary)',
                color: 'white',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.3s',
              }}
            >
              <Save size={18} />
              {isSaved ? 'Saved!' : 'Save Changes'}
            </button>
            <button
              onClick={logout}
              style={{
                padding: '12px 32px',
                borderRadius: '12px',
                background: 'rgba(255, 68, 68, 0.1)',
                color: '#ff4444',
                border: '1px solid #ff4444',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <LogOut size={18} />
              Logout Session
            </button>
          </div>
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
  color: 'var(--primary)',
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
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--card-border)',
  borderRadius: '12px',
  color: 'white',
  fontSize: '0.95rem',
  outline: 'none',
};
