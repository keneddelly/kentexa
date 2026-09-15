import React from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import LandingEducation from '../components/landing/LandingEducation';
import { getIntent } from '../../utils/campaignIntent';

// The auth-first entry screen — App.js's `case 'Home':` renders this instead
// of HomeFeed for a logged-out visitor. Pure routing into the existing
// PublicLogin.js/Register.js pages, no auth logic of its own.
//
// Landing Localization L1 (§6, §13): this is Kentexa's actual public landing
// page today, so it's where the language selector and campaign-intent-aware
// hero copy belong — not HomeFeed.js, which only ever renders for an
// authenticated visitor now. Intent customizes COPY only (via translation
// keys, never a hardcoded per-language sentence); it does not change either
// button's destination — both still go to Register/PublicLogin regardless
// of intent, since the intent-specific *destination* is realized once,
// post-auth, in App.js's handleLoginSuccess (see utils/campaignIntent.js).
//
// Landing Localization L2: the hero above the fold is unchanged in spirit
// (same primary/secondary buttons, same destinations) but now sits inside
// its own full-height section, with LandingEducation.js's product-education
// body scrolling in below it — the full "what is Kentexa, what can I do,
// how does it work, what do I do after signup" story the L2 mission asked
// for, without turning intent into a fork into separate landing pages (see
// LandingEducation.js's own header comment for how intent is scoped there).
const Welcome = ({ onNavigate }) => {
  const { t } = useTranslation();
  // Non-destructive read — Welcome may render this hero many times before
  // the visitor acts, and the intent must still be there for Register/Login
  // and for the post-auth redirect afterwards, so nothing here consumes it.
  const intent = getIntent();
  const headlineKey    = intent ? `welcome.intent.${intent}.headline`    : 'welcome.headline';
  const subheadlineKey = intent ? `welcome.intent.${intent}.subheadline` : 'welcome.subheadline';
  const ctaKey          = intent ? `welcome.intent.${intent}.cta`         : 'welcome.create_account_button';

  const btnPrimary = {
    width: '100%', padding: 15,
    background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 15, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(29,78,216,0.35)',
  };

  const btnSecondary = {
    width: '100%', padding: 15,
    backgroundColor: '#fff', color: '#1d4ed8',
    border: '2px solid #dbeafe', borderRadius: 12,
    fontSize: 15, fontWeight: 800, cursor: 'pointer',
  };

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ backgroundColor: '#f0f4ff', fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      <div style={{ position: 'fixed', top: 'max(16px, env(safe-area-inset-top))', right: 16, zIndex: 10 }}>
        <LanguageSwitcher variant="dropdown" />
      </div>

      {/* Hero — its own full-height screen, exactly as before L2 (same
          buttons, same destinations); only addition is the secondary
          "See how Kentexa works" discovery action below the primary pair. */}
      <div style={{ minHeight: '100vh', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px', paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>

        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 28 }}>

          {/* Logo + icon badge — same treatment used across Navbar/Sidebar/PublicLogin */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 64, height: 64, backgroundColor: '#1d4ed8', borderRadius: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(29,78,216,0.4)' }}>
              <svg width="36" height="36" viewBox="0 0 22 22" fill="none">
                <path d="M2 2 L7 8 L11 5 L11 20 L5 14 Z" fill="white"/>
                <path d="M20 2 L15 8 L11 5 L11 20 L17 14 Z" fill="#60a5fa"/>
                <circle cx="7.5" cy="9.5" r="1" fill="#0f172a"/>
                <circle cx="14.5" cy="9.5" r="1" fill="#0f172a"/>
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
              <span style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
              <span style={{ fontSize: 34, fontWeight: 900, color: '#1d4ed8', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
            </div>
          </div>

          {/* Pitch */}
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '0 0 8px', lineHeight: 1.3 }}>
              {t(headlineKey)}
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
              {t(subheadlineKey)}
            </p>
          </div>

          {/* Actions */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => onNavigate('Register')} style={btnPrimary}>
              {t(ctaKey)}
            </button>
            <button onClick={() => onNavigate('PublicLogin')} style={btnSecondary}>
              {t('welcome.log_in_button')}
            </button>
          </div>

          {/* L2 §2: secondary discovery action — scrolls into the education
              body below rather than navigating anywhere, so a curious
              (not-yet-ready-to-sign-up) visitor has somewhere to go. */}
          <button onClick={scrollToHowItWorks}
            style={{ background: 'none', border: 'none', color: '#1d4ed8', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', padding: '4px 0' }}>
            {t('welcome.discover_more_button')}
          </button>

          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
            {t('welcome.made_in_tanzania')}
          </div>
        </div>
      </div>

      <LandingEducation intent={intent} onNavigate={onNavigate} />
    </div>
  );
};

export default Welcome;
