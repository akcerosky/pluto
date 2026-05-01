import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Rocket,
  Sparkles,
  BookOpen,
  Brain,
  Globe,
  Shield,
  ArrowRight,
  CheckCircle2,
  Menu,
  X,
} from 'lucide-react';
import { PLAN_CONFIGS } from '../config/subscription';
import { Link } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { formatTokenCount } from '../lib/tokenQuota';

export const LandingPage = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, currentPlan } = useApp();
  const primaryCtaTarget = user ? '/chat' : '/signup';
  const pricingCtaTarget = user ? '/profile' : '/signup';
  const visiblePlans = Object.values(PLAN_CONFIGS).filter((plan) => {
    if (!user) {
      return true;
    }

    if (currentPlan === 'Pro') {
      return plan.id === 'Pro';
    }

    if (currentPlan === 'Plus') {
      return plan.id !== 'Free';
    }

    return true;
  });

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="landing-page">
      <div className="stardust-wrapper">
        <div className="stardust" />
        <div className="stardust" style={{ animationDelay: '-50s', opacity: 0.55 }} />
      </div>

      <nav
        className="landing-nav"
        style={{
          padding: '20px 60px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'blur(40px)',
          borderBottom: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-inner-glow), var(--glass-shadow)',
        }}
      >
        <div
          className="landing-brand"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '1.6rem',
            fontWeight: '900',
            letterSpacing: '-0.04em',
          }}
        >
          <div
            className="landing-logo"
            style={{
              width: '36px',
              height: '36px',
              background: 'var(--glass-bg)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <Rocket size={20} color="var(--text-primary)" />
          </div>
          <span style={{ color: 'var(--text-primary)', fontWeight: '900' }}>PLUTO</span>
        </div>
        <button
          className="landing-menu-toggle mobile-only"
          type="button"
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsMobileMenuOpen((value) => !value)}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div
          className={`landing-nav-links ${isMobileMenuOpen ? 'mobile-open' : ''}`}
          style={{ display: 'flex', gap: '40px', alignItems: 'center' }}
        >
          <a href="#features" onClick={closeMobileMenu} className="landing-link">
            Features
          </a>
          <a href="#pricing" onClick={closeMobileMenu} className="landing-link">
            Pricing
          </a>
          <a href="#about" onClick={closeMobileMenu} className="landing-link">
            Adaptive Engine
          </a>
          <div className="landing-nav-separator" style={{ height: '24px', width: '1px', background: 'var(--border-color)' }} />
          <Link
            to={user ? '/chat' : '/login'}
            className="landing-login-link"
            onClick={closeMobileMenu}
            style={{ color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '700' }}
          >
            {user ? 'Open Pluto' : 'Login'}
          </Link>
          <Link
            to={primaryCtaTarget}
            className="marketing-button primary landing-signup-link"
            onClick={closeMobileMenu}
          >
            {user ? 'Go to Chat' : 'Start Free'}
          </Link>
        </div>
      </nav>

      <section
        className="landing-hero"
        style={{
          padding: '220px 40px 140px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          className="landing-hero-glow"
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100vw',
            minWidth: '100%',
            height: '100%',
            background: 'var(--hero-gradient)',
            opacity: 0.98,
            zIndex: -1,
            animation: 'gradientShift 18s ease infinite',
          }}
        />

        <motion.div
          className="landing-hero-copy"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 18px',
              background: 'var(--glass-bg)',
              borderRadius: '999px',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontWeight: '800',
              marginBottom: '32px',
              letterSpacing: '0.05em',
            }}
          >
            <Sparkles size={16} color="var(--mode-conversational)" />
            PREMIUM AI TUTORING
          </div>
          <h1
            style={{
              fontSize: 'clamp(3.8rem, 10vw, 7.3rem)',
              fontWeight: '950',
              lineHeight: 0.88,
              letterSpacing: '-0.07em',
              marginBottom: '28px',
              color: 'var(--text-primary)',
            }}
          >
            Learn with
            <br />
            cosmic clarity.
          </h1>
          <p
            style={{
              fontSize: '1.32rem',
              color: 'var(--text-secondary)',
              maxWidth: '760px',
              lineHeight: 1.65,
              margin: '0 auto 56px',
              textAlign: 'center',
              fontWeight: '500',
            }}
          >
            Pluto is a premium AI study workspace that adapts to your level, keeps context across threads, and helps
            you move from quick questions to deep mastery without losing your place.
          </p>
          <div className="landing-hero-actions" style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <Link to={primaryCtaTarget} className="marketing-button primary">
              {user ? 'Open Pluto' : 'Launch Journey'} <ArrowRight size={22} />
            </Link>
            <a href="#pricing" className="marketing-button secondary">
              View Plans
            </a>
          </div>
        </motion.div>
      </section>

      <section id="features" className="landing-section" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto 36px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, marginBottom: '14px' }}>
            Built for focused learning
          </h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: '62ch', margin: '0 auto' }}>
            Every surface is designed to keep momentum high, context intact, and the next step clear whether you are
            exploring, solving, or preparing under pressure.
          </p>
        </div>
        <div
          className="landing-feature-list"
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '24px',
          }}
        >
          <FeatureCard
            icon={<Brain size={32} color="var(--primary)" />}
            title="Adaptive Persona"
            description="Pluto shifts tone and depth for every learner, from friendly elementary support to rigorous professional reasoning."
          />
          <FeatureCard
            icon={<BookOpen size={32} color="var(--mode-homework)" />}
            title="Socratic Tutoring"
            description="Homework mode guides the next step without spoiling the solution, so understanding compounds instead of disappearing."
          />
          <FeatureCard
            icon={<Globe size={32} color="var(--mode-conversational)" />}
            title="Global Context"
            description="Persistent threads, projects, and study modes keep your learning state organized across subjects and sessions."
          />
          <FeatureCard
            icon={<Shield size={32} color="var(--success)" />}
            title="Safe and Focused"
            description="A calm workspace, reliable usage limits, and polished feedback loops keep the experience study-first, not attention-first."
          />
        </div>
      </section>

      <section id="pricing" className="landing-section landing-pricing" style={{ padding: '40px 40px 120px' }}>
        <div className="landing-section-inner" style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 900, marginBottom: '14px', textAlign: 'center' }}>
            Plans for every learner
          </h2>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: '0 auto 28px', maxWidth: '58ch' }}>
            Start free each day, then upgrade to Plus or Pro for larger token budgets and advanced learning modes.
          </p>
          <div className="landing-pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
            {visiblePlans.map((plan) => {
              const isCurrentPlan = user && plan.id === currentPlan;

              return (
                <motion.div
                  key={plan.id}
                  whileHover={{ y: -8 }}
                  className="surface-card pricing-card"
                  style={{
                    padding: '24px',
                    border: plan.id === 'Plus' ? '1px solid var(--primary-border)' : '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    background: plan.id === 'Plus'
                      ? 'color-mix(in srgb, rgba(108, 63, 197, 0.18) 78%, var(--glass-bg-strong))'
                      : 'var(--glass-bg)',
                    backdropFilter: 'blur(40px)',
                    boxShadow: 'var(--glass-inner-glow), var(--glass-shadow-lg)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{plan.id}</h3>
                    <div style={{ color: 'var(--price-accent)', fontWeight: 700 }}>{plan.price}</div>
                  </div>
                  <p style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{plan.tagLine}</p>
                  <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {plan.bullets.map((bullet) => (
                      <div key={bullet} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <CheckCircle2 size={14} color="var(--success)" />
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                    <Link
                      to={pricingCtaTarget}
                      className={isCurrentPlan ? 'secondary-button' : 'marketing-button primary'}
                      style={{
                        display: 'inline-flex',
                        justifyContent: 'center',
                        width: '100%',
                        minHeight: '46px',
                        textDecoration: 'none',
                        opacity: isCurrentPlan ? 0.82 : 1,
                      }}
                    >
                      {isCurrentPlan ? 'Current Plan' : `Subscribe ${plan.id}`}
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="surface-card pricing-table-card" style={{ marginTop: '18px', padding: '20px', overflowX: 'auto' }}>
            <div className="pricing-table" style={{ minWidth: '760px' }}>
              <div
                className="pricing-row pricing-row-heading"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--glass-border)',
                  fontWeight: 700,
                }}
              >
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>FEATURES</span>
                <span>Free</span>
                <span>Plus</span>
                <span>Pro</span>
              </div>
              <PricingRow
                label="Daily token quota"
                free={formatTokenCount(PLAN_CONFIGS.Free.dailyTokenLimit)}
                plus={formatTokenCount(PLAN_CONFIGS.Plus.dailyTokenLimit)}
                pro={formatTokenCount(PLAN_CONFIGS.Pro.dailyTokenLimit)}
              />
              <PricingRow label="Input length per prompt" free={`${PLAN_CONFIGS.Free.maxInputChars} chars`} plus={`${PLAN_CONFIGS.Plus.maxInputChars} chars`} pro={`${PLAN_CONFIGS.Pro.maxInputChars} chars`} />
              <PricingRow label="Learning modes" free="Conversational" plus="All modes" pro="All modes" />
              <PricingRow label="Projects" free={`${PLAN_CONFIGS.Free.maxProjects}`} plus={`${PLAN_CONFIGS.Plus.maxProjects}`} pro="Unlimited" />
              <PricingRow label="Context memory" free={`Summary + last ${PLAN_CONFIGS.Free.historyWindow}`} plus={`Summary + last ${PLAN_CONFIGS.Plus.historyWindow}`} pro={`Summary + last ${PLAN_CONFIGS.Pro.historyWindow}`} />
              <PricingRow label="Priority support" free="No" plus="Yes" pro="Yes" />
            </div>
          </div>
        </div>
      </section>

      <footer
        id="about"
        className="landing-footer"
        style={{ padding: '46px 40px', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}
      >
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          © 2026 AKCERO PRIVATE LIMITED. All rights reserved.
        </div>
        <div className="landing-footer-links" style={{ marginTop: '18px', display: 'flex', gap: '18px', justifyContent: 'center', flexWrap: 'wrap', fontSize: '0.84rem' }}>
          <Link to="/terms" style={footerLinkStyle}>Terms & Conditions</Link>
          <Link to="/privacy" style={footerLinkStyle}>Privacy Policy</Link>
          <Link to="/refund" style={footerLinkStyle}>Refund and Cancellation Policy</Link>
        </div>
        <div style={{ color: 'var(--text-secondary)', opacity: 0.8, fontSize: '0.82rem', marginTop: '8px' }}>
          Registered Business Name: AKCERO PRIVATE LIMITED
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <motion.div
    whileHover={{ y: -8 }}
    className="surface-card feature-card"
    style={{
      padding: '42px 34px',
      display: 'flex',
      flexDirection: 'column',
      gap: '22px',
      textAlign: 'left',
      flex: '1 1 320px',
      maxWidth: '380px',
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      boxShadow: 'var(--glass-inner-glow), var(--glass-shadow)',
      backdropFilter: 'blur(20px)',
    }}
  >
    <div
      style={{
        width: '64px',
        height: '64px',
        borderRadius: '18px',
        background: 'var(--glass-bg-medium)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {icon}
    </div>
    <h3 style={{ fontSize: '1.55rem', fontWeight: '800', letterSpacing: '-0.02em' }}>{title}</h3>
    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: '1.02rem' }}>{description}</p>
  </motion.div>
);

const PricingRow = ({ label, free, plus, pro }: { label: string; free: string; plus: string; pro: string }) => (
  <div className="pricing-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '11px 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.86rem' }}>
    <span className="pricing-feature-label" style={{ color: 'var(--text-secondary)' }}>{label}</span>
    <span data-plan="Free">{free}</span>
    <span data-plan="Plus">{plus}</span>
    <span data-plan="Pro">{pro}</span>
  </div>
);

const footerLinkStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  fontWeight: 600,
};
