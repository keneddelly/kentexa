import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Landing Localization L2 — the public product-education body of Welcome.js.
 * Split into its own file so Welcome.js's hero stays small and this stays
 * independently testable per-section (see LandingEducation.test.js).
 *
 * Every claim here was checked against the currently deployed app before
 * being written (identity verification, Super Agent/hub logistics, tracking
 * numbers, POS, escrow-style buyer protection, commission-on-product-price
 * — all already live and already described to users on the existing
 * HowItWorks.js page, whose copy this deliberately stays consistent with
 * rather than re-describing differently). Nothing here claims a capability
 * that isn't actually usable today — e.g. no "cargo/freight" mention (that
 * BusinessCapability tile is still "coming soon" per context/
 * capabilityTiles.js), no "every seller is verified" (only that identity
 * verification is REQUIRED before a seller can list — become_seller.js's
 * own identity_required_title gate), no guaranteed nationwide delivery.
 *
 * Campaign intent (utils/campaignIntent.js) is read ONCE by Welcome.js and
 * passed down as a prop — it only reorders which feature card leads in
 * FeatureGrid (§14: "changes emphasis, not overall feature availability").
 * Every section always renders regardless of intent.
 */

const FEATURES = ['sell', 'service', 'classifieds', 'moments'];

// campaignIntent.js's ALLOWED_INTENTS ('service' | 'classified' | 'seller')
// don't spell the same as this file's own feature keys ('classifieds' has a
// trailing s, 'seller' isn't a feature at all — 'sell' is) — map explicitly
// rather than string-massaging the intent value, which silently produced no
// reordering at all for intent=classified until a test caught it.
const INTENT_TO_FEATURE = { seller: 'sell', service: 'service', classified: 'classifieds' };

const cardStyle = {
  backgroundColor: '#fff', borderRadius: 16, padding: '20px 18px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #eef2f7',
};
const sectionHeading = {
  fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '0 0 6px',
  fontFamily: 'Manrope,sans-serif', textAlign: 'center',
};
const sectionBody = {
  fontSize: 14, color: '#64748b', margin: '0 0 20px', lineHeight: 1.6,
  textAlign: 'center', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto',
};
// boxSizing is load-bearing, not decorative: width:100% + padding under the
// default content-box model adds the padding ON TOP of 100%, overflowing
// the viewport by exactly 2x the horizontal padding (32px, found via a real
// headless-Chromium layout check — jsdom/RTL tests can't catch this class
// of bug, only actual layout can) — border-box keeps padding inside 100%.
const sectionWrap = { width: '100%', maxWidth: 720, margin: '0 auto', padding: '40px 16px', boxSizing: 'border-box' };

const StepList = ({ steps, color = '#1d4ed8' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    {steps.map((step, i) => (
      <div key={i} style={{ display: 'flex', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: color, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>
            {i + 1}
          </div>
          {i < steps.length - 1 && <div style={{ width: 2, flex: 1, backgroundColor: '#e2e8f0', margin: '4px 0', minHeight: 12 }} />}
        </div>
        <div style={{ paddingBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>{step.title}</div>
          {step.desc && <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{step.desc}</div>}
        </div>
      </div>
    ))}
  </div>
);

const LandingEducation = ({ intent, onNavigate }) => {
  const { t } = useTranslation();

  // §14: intent only reorders which card LEADS — all four always render.
  const leadFeature = INTENT_TO_FEATURE[intent];
  const orderedFeatures = leadFeature ? [leadFeature, ...FEATURES.filter((f) => f !== leadFeature)] : FEATURES;

  const featureCopy = {
    sell: { title: t('landing.features.sell_title'), desc: t('landing.features.sell_desc'), icon: '🏪' },
    service: { title: t('landing.features.service_title'), desc: t('landing.features.service_desc'), icon: '🛠️' },
    classifieds: { title: t('landing.features.classifieds_title'), desc: t('landing.features.classifieds_desc'), icon: '📋' },
    moments: { title: t('landing.features.moments_title'), desc: t('landing.features.moments_desc'), icon: '⚡' },
  };

  const whatIsChips = [
    t('landing.what_is.chip_discover'), t('landing.what_is.chip_sell'), t('landing.what_is.chip_service'),
    t('landing.what_is.chip_classifieds'), t('landing.what_is.chip_moments'), t('landing.what_is.chip_communicate'),
  ];

  const businessSteps = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`landing.business.step${n}_title`), desc: t(`landing.business.step${n}_desc`),
  }));

  const howItWorksSteps = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`landing.how_it_works.step${n}_title`), desc: t(`landing.how_it_works.step${n}_desc`),
  }));

  const afterSignupPaths = [
    { key: 'sell', title: t('landing.after_signup.path_sell_title'), steps: [t('landing.after_signup.path_sell_step1'), t('landing.after_signup.path_sell_step2'), t('landing.after_signup.path_sell_step3')] },
    { key: 'service', title: t('landing.after_signup.path_service_title'), steps: [t('landing.after_signup.path_service_step1'), t('landing.after_signup.path_service_step2')] },
    { key: 'classified', title: t('landing.after_signup.path_classified_title'), steps: [t('landing.after_signup.path_classified_step1')] },
    { key: 'buy', title: t('landing.after_signup.path_buy_title'), steps: [t('landing.after_signup.path_buy_step1')] },
    { key: 'business', title: t('landing.after_signup.path_business_title'), steps: [t('landing.after_signup.path_business_step1'), t('landing.after_signup.path_business_step2')] },
  ];

  const momentsExamples = [1, 2, 3, 4, 5].map((n) => t(`landing.moments.example${n}`));

  const logisticsFlow = [1, 2, 3, 4, 5, 6].map((n) => t(`landing.logistics.flow_step${n}`));

  const trustPoints = [1, 2, 3, 4, 5].map((n) => t(`landing.trust.point${n}`));

  return (
    <div style={{ backgroundColor: '#fff' }}>

      {/* ── What is Kentexa? ── */}
      <section style={sectionWrap} aria-label={t('landing.what_is.heading')}>
        <h2 style={sectionHeading}>{t('landing.what_is.heading')}</h2>
        <p style={sectionBody}>{t('landing.what_is.body')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {whatIsChips.map((chip) => (
            <span key={chip} style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700,
              padding: '8px 14px', borderRadius: 100, border: '1px solid #dbeafe' }}>
              {chip}
            </span>
          ))}
        </div>
      </section>

      {/* ── What can you do on Kentexa? ── */}
      <section style={{ ...sectionWrap, backgroundColor: '#f8fafc', maxWidth: 'none', padding: '40px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={sectionHeading}>{t('landing.features.heading')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 20 }}>
            {orderedFeatures.map((key) => (
              <div key={key} style={cardStyle}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{featureCopy[key].icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{featureCopy[key].title}</div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{featureCopy[key].desc}</div>
              </div>
            ))}
          </div>
          {/* Moments flow — kept inside this section, right under its card, so
              the "how a Moment turns into action" idea sits next to the card
              that introduces Moments in the first place. */}
          <div style={{ ...cardStyle, marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {['moment', 'discovery', 'profile', 'action'].map((step, i, arr) => (
              <React.Fragment key={step}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: 8 }}>
                  {t(`landing.features.moments_flow_${step}`)}
                </span>
                {i < arr.length - 1 && <span style={{ color: '#94a3b8', fontSize: 14 }}>→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── Running a Business on Kentexa ── */}
      <section style={sectionWrap} aria-label={t('landing.business.heading')}>
        <h2 style={sectionHeading}>{t('landing.business.heading')}</h2>
        <p style={sectionBody}>{t('landing.business.intro')}</p>
        <div style={cardStyle}>
          <StepList steps={businessSteps} color="#16a34a" />
        </div>
      </section>

      {/* ── Personal Classified vs Business Selling ── */}
      <section style={{ ...sectionWrap, backgroundColor: '#f8fafc', maxWidth: 'none' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={sectionHeading}>{t('landing.personal_vs_business.heading')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginTop: 20 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🙋</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{t('landing.personal_vs_business.personal_title')}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 8 }}>{t('landing.personal_vs_business.personal_desc')}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{t('landing.personal_vs_business.personal_example')}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🏪</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{t('landing.personal_vs_business.business_title')}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 8 }}>{t('landing.personal_vs_business.business_desc')}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{t('landing.personal_vs_business.business_example')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How Kentexa Works (landing preview — full walkthrough lives on
          the existing HowItWorks.js page; this deliberately doesn't
          duplicate its role-by-role depth) ── */}
      <section id="how-it-works" style={sectionWrap} aria-label={t('landing.how_it_works.heading')}>
        <h2 style={sectionHeading}>{t('landing.how_it_works.heading')}</h2>
        <p style={sectionBody}>{t('landing.how_it_works.subheading')}</p>
        <div style={cardStyle}>
          <StepList steps={howItWorksSteps} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => onNavigate('HowItWorks')}
            style={{ background: 'none', border: '2px solid #1d4ed8', color: '#1d4ed8', borderRadius: 12,
              padding: '10px 20px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            {t('landing.how_it_works.cta_full')}
          </button>
        </div>
      </section>

      {/* ── After you sign up ── */}
      <section style={{ ...sectionWrap, backgroundColor: '#eff6ff', maxWidth: 'none' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={sectionHeading}>{t('landing.after_signup.heading')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 20 }}>
            {afterSignupPaths.map((path) => (
              <div key={path.key} style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8', marginBottom: 10 }}>{path.title}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  {path.steps.map((step, i, arr) => (
                    <React.Fragment key={step}>
                      <span style={{ fontSize: 12, color: '#475569' }}>{step}</span>
                      {i < arr.length - 1 && <span style={{ color: '#94a3b8' }}>→</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button onClick={() => onNavigate('Register')}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none',
                borderRadius: 12, padding: '14px 28px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(29,78,216,0.35)' }}>
              {t('welcome.create_account_button')}
            </button>
          </div>
        </div>
      </section>

      {/* ── Moments ── */}
      <section style={sectionWrap} aria-label={t('landing.moments.heading')}>
        <h2 style={sectionHeading}>{t('landing.moments.heading')}</h2>
        <p style={sectionBody}>{t('landing.moments.body')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {momentsExamples.map((ex) => (
            <span key={ex} style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 700,
              padding: '8px 14px', borderRadius: 100, border: '1px solid #fde68a' }}>
              ⚡ {ex}
            </span>
          ))}
        </div>
      </section>

      {/* ── Logistics + Super Agent ── */}
      <section style={{ ...sectionWrap, backgroundColor: '#f8fafc', maxWidth: 'none' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={sectionHeading}>{t('landing.logistics.heading')}</h2>
          <p style={sectionBody}>{t('landing.logistics.body')}</p>
          <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
            {logisticsFlow.map((step, i, arr) => (
              <React.Fragment key={step}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: 8 }}>
                  {step}
                </span>
                {i < arr.length - 1 && <span style={{ color: '#94a3b8', fontSize: 14 }}>→</span>}
              </React.Fragment>
            ))}
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{t('landing.logistics.super_agent_title')}</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{t('landing.logistics.super_agent_desc')}</div>
          </div>
        </div>
      </section>

      {/* ── Tracking ── */}
      <section style={sectionWrap} aria-label={t('landing.tracking.heading')}>
        <h2 style={sectionHeading}>{t('landing.tracking.heading')}</h2>
        <p style={sectionBody}>{t('landing.tracking.body')}</p>
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => onNavigate('TrackParcel')}
            style={{ background: 'none', border: '2px solid #1d4ed8', color: '#1d4ed8', borderRadius: 12,
              padding: '10px 20px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            {t('landing.tracking.cta')}
          </button>
        </div>
      </section>

      {/* ── POS / business tools ── */}
      <section style={{ ...sectionWrap, backgroundColor: '#f8fafc', maxWidth: 'none' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={sectionHeading}>{t('landing.pos.heading')}</h2>
          <p style={{ ...sectionBody, margin: 0 }}>{t('landing.pos.body')}</p>
        </div>
      </section>

      {/* ── Trust ── */}
      <section style={sectionWrap} aria-label={t('landing.trust.heading')}>
        <h2 style={sectionHeading}>{t('landing.trust.heading')}</h2>
        <div style={{ ...cardStyle, maxWidth: 480, margin: '20px auto 0', textAlign: 'left' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {trustPoints.map((point, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 15, flexShrink: 0, color: '#16a34a', fontWeight: 900, marginTop: 1 }}>✓</span>
                <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ ...sectionWrap, background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', maxWidth: 'none', textAlign: 'center' }}>
        <h2 style={{ ...sectionHeading, color: '#fff' }}>{t('landing.final_cta.heading')}</h2>
        <p style={{ ...sectionBody, color: 'rgba(255,255,255,0.8)' }}>{t('landing.final_cta.desc')}</p>
        <button onClick={() => onNavigate('Register')}
          style={{ backgroundColor: '#fff', color: '#1d4ed8', border: 'none', borderRadius: 12,
            padding: '15px 32px', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
          {t('welcome.create_account_button')}
        </button>
      </section>
    </div>
  );
};

export default LandingEducation;
