import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Sparkles, BookOpen, Brain, Globe, Shield, ArrowRight, CheckCircle2, Menu, X } from 'lucide-react';
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
    <div className="landing-page" style={{ 
      minHeight: '100vh', 
      background: 'var(--background)', 
      color: 'var(--foreground)',
      overflowX: 'hidden'
    }}>
      <div className="stardust-wrapper">
        <div className="stardust" style={{ opacity: 0.3 }}></div>
        <div className="stardust" style={{ animationDelay: '-50s', opacity: 0.2 }}></div>
      </div>

      {/* Navigation */}
      <nav className="landing-nav" style={{ 
        padding: '20px 60px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(5, 5, 20, 0.6)',
        backdropFilter: 'blur(30px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div className="landing-brand" style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.6rem', fontWeight: '900', letterSpacing: '-0.04em' }}>
          <div className="landing-logo" style={{ 
            width: '36px', 
            height: '36px', 
            background: 'linear-gradient(45deg, var(--primary), var(--secondary))', 
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 25px var(--primary-glow)'
          }}>
            <Rocket size={20} color="white" />
          </div>
          <span style={{ 
            background: 'linear-gradient(to right, #fff, #aaa)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent',
            fontWeight: '900'
          }}>PLUTO</span>
        </div>
        <button
          className="landing-menu-toggle mobile-only"
          type="button"
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsMobileMenuOpen((value) => !value)}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className={`landing-nav-links ${isMobileMenuOpen ? 'mobile-open' : ''}`} style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
          <a href="#features" onClick={closeMobileMenu} style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '500', transition: 'color 0.3s' }} onMouseOver={(e) => e.currentTarget.style.color = 'white'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}>Features</a>
          <a href="#pricing" onClick={closeMobileMenu} style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '500', transition: 'color 0.3s' }} onMouseOver={(e) => e.currentTarget.style.color = 'white'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}>Pricing</a>
          <a href="#about" onClick={closeMobileMenu} style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '500', transition: 'color 0.3s' }} onMouseOver={(e) => e.currentTarget.style.color = 'white'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}>Adaptive Engine</a>
          <div className="landing-nav-separator" style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <Link to={user ? '/chat' : '/login'} className="landing-login-link" onClick={closeMobileMenu} style={{ color: 'white', textDecoration: 'none', fontSize: '0.95rem', fontWeight: '600' }}>{user ? 'Open Pluto' : 'Login'}</Link>
          <Link to={primaryCtaTarget} className="hover-glow landing-signup-link" style={{ 
            color: 'white', 
            textDecoration: 'none', 
            fontSize: '0.95rem', 
            fontWeight: '700', 
            padding: '12px 28px', 
            borderRadius: '14px', 
            background: 'linear-gradient(45deg, var(--primary), #6a1b9a)',
            boxShadow: '0 10px 30px var(--primary-glow)',
            transition: 'all 0.3s ease'
          }} onClick={closeMobileMenu}>{user ? 'Go to Chat' : 'Sign Up'}</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="landing-hero" style={{ 
        padding: '220px 40px 140px', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        textAlign: 'center',
        position: 'relative'
      }}>
        {/* Glow Effects */}
        <div className="landing-hero-glow" style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '800px', background: 'radial-gradient(circle, rgba(138, 43, 226, 0.2) 0%, transparent 60%)', opacity: 0.4, zIndex: -1 }} />
        
        <motion.div
          className="landing-hero-copy"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '10px', 
            padding: '8px 20px', 
            background: 'rgba(138, 43, 226, 0.1)', 
            borderRadius: '100px', 
            border: '1px solid rgba(138, 43, 226, 0.3)',
            color: 'var(--primary)',
            fontSize: '0.85rem',
            fontWeight: '700',
            marginBottom: '32px',
            letterSpacing: '0.05em'
          }}>
            <Sparkles size={16} />
            PIVOTING THE FUTURE OF EDUCATION
          </div>
          <h1 style={{ 
            fontSize: 'clamp(3.5rem, 10vw, 7.5rem)', 
            fontWeight: '950', 
            lineHeight: 0.9, 
            letterSpacing: '-0.06em',
            marginBottom: '32px',
            background: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0.4) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            LIFELONG <br />
            <span style={{ 
              background: 'linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>LEARNING.</span>
          </h1>
          <p style={{ 
            fontSize: '1.4rem', 
            color: 'var(--text-secondary)', 
            maxWidth: '750px', 
            lineHeight: 1.6,
            margin: '0 auto 56px',
            textAlign: 'center',
            fontWeight: '400'
          }}>
            Pluto is your intelligent astronaut companion. Adapting its synthesis and persona in real-time to match your unique education level, from Elementary wonder to Professional mastery.
          </p>
          <div className="landing-hero-actions" style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
            <Link to={primaryCtaTarget} className="hover-glow" style={{ 
              padding: '18px 48px', 
              borderRadius: '16px', 
              background: 'var(--primary)', 
              color: 'white', 
              textDecoration: 'none',
              fontSize: '1.15rem',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'all 0.3s ease'
            }}>
              {user ? 'Open Pluto' : 'Launch Journey'} <ArrowRight size={22} />
            </Link>
            <a href="#features" style={{ 
              padding: '18px 48px', 
              borderRadius: '16px', 
              background: 'rgba(255, 255, 255, 0.03)', 
              color: 'white', 
              border: '1px solid rgba(255, 255, 255, 0.1)',
              textDecoration: 'none',
              fontSize: '1.15rem',
              fontWeight: '600',
              transition: 'all 0.3s ease'
            }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}>
              Explore Features
            </a>
          </div>
        </motion.div>
      </section>

      <section id="features" className="landing-section" style={{ padding: '100px 40px' }}>
        <div className="landing-feature-list" style={{ 
          maxWidth: '1200px', 
          margin: '0 auto', 
          display: 'flex', 
          flexWrap: 'wrap', 
          justifyContent: 'center', 
          gap: '32px' 
        }}>
          <FeatureCard 
            icon={<Brain size={32} color="var(--primary)" />}
            title="Adaptive Persona"
            description="Our engine shifts tone and complexity based on your level. A buddy for kids, a researcher for pros."
          />
          <FeatureCard 
            icon={<BookOpen size={32} color="var(--secondary)" />}
            title="Socratic Tutoring"
            description="Homework mode guides you to the answer without spoilers, building real solving skills."
          />
          <FeatureCard 
            icon={<Globe size={32} color="var(--accent)" />}
            title="Global Context"
            description="Understands international curricula and professional standards across 50+ subjects."
          />
          <FeatureCard 
            icon={<Shield size={32} color="#10b981" />}
            title="Safe & Focused"
            description="Distraction-free learning environment with zero data tracking for students."
          />
        </div>
      </section>

      <section id="pricing" className="landing-section landing-pricing" style={{ padding: '40px 40px 120px' }}>
        <div className="landing-section-inner" style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, marginBottom: '14px', textAlign: 'center' }}>Plans For Every Learner</h2>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '28px' }}>
            Start free each day, then upgrade to Plus or Pro for larger token budgets and advanced learning modes.
          </p>
          <div className="landing-pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {visiblePlans.map((plan) => {
              const isCurrentPlan = user && plan.id === currentPlan;
              return (
              <div
                key={plan.id}
                className="glass-card pricing-card"
                style={{
                  padding: '24px',
                  border: plan.id === 'Plus' ? '1px solid rgba(138, 43, 226, 0.55)' : '1px solid var(--glass-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{plan.id}</h3>
                  <div style={{ color: '#f59e0b', fontWeight: 700 }}>{plan.price}</div>
                </div>
                <p style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{plan.tagLine}</p>
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {plan.bullets.map((bullet) => (
                    <div key={bullet} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={14} color="#22c55e" />
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                  <Link
                    to={pricingCtaTarget}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      background: 'linear-gradient(45deg, var(--primary), #6a1b9a)',
                      border: 'none',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      opacity: isCurrentPlan ? 0.82 : 1,
                    }}
                  >
                    {isCurrentPlan ? 'Current Plan' : `Subscribe ${plan.id}`}
                  </Link>
                </div>
              </div>
            )})}
          </div>
          <div
            className="glass-card pricing-table-card"
            style={{
              marginTop: '18px',
              padding: '20px',
              overflowX: 'auto',
            }}
          >
            <div className="pricing-table" style={{ minWidth: '760px' }}>
              <div className="pricing-row pricing-row-heading" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 0', borderBottom: '1px solid var(--glass-border)', fontWeight: 700 }}>
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

      {/* Footer */}
      <footer className="landing-footer" style={{ padding: '46px 40px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
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
    whileHover={{ y: -10, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}
    className="glass-card feature-card"
    style={{ 
      padding: '48px 40px', 
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      textAlign: 'left',
      flex: '1 1 340px',
      maxWidth: '380px'
    }}
  >
    <div style={{ 
      width: '64px', 
      height: '64px', 
      borderRadius: '18px', 
      background: 'rgba(255,255,255,0.03)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      border: '1px solid var(--glass-border)',
      boxShadow: 'inset 0 0 10px rgba(255,255,255,0.05)'
    }}>
      {icon}
    </div>
    <h3 style={{ fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em' }}>{title}</h3>
    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '1.05rem' }}>{description}</p>
  </motion.div>
);

const PricingRow = ({ label, free, plus, pro }: { label: string; free: string; plus: string; pro: string }) => (
  <div className="pricing-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.86rem' }}>
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

