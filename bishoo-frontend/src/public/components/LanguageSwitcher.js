/**
 * LanguageSwitcher.js — shared language control, extracted from the
 * pattern Navbar.js already had inline (only rendered on 2 pages in the
 * whole app, neither the login page nor a settings page — see the
 * 2026-08-28 "language switch at login + settings" request). Reads/writes
 * the same `kentexa_lang` localStorage key i18n.js boots from, via
 * useTranslation()'s own `i18n` instance (not the `window.i18nInstance`
 * global App.js's one-time first-visit picker uses) — both approaches
 * change the same underlying instance, this is just the more idiomatic
 * one for a component that isn't App.js itself.
 *
 * variant="dropdown" — compact flag+code button that opens a small
 *   popover; for a persistent header control (PublicLogin.js).
 * variant="list" — a vertical list of full language rows, already
 *   expanded; for a settings-page section (MyProfile.js).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const LANGUAGES = [
  { code: 'en', label: 'English',   short: 'EN', flag: '🇬🇧' },
  { code: 'sw', label: 'Kiswahili', short: 'SW', flag: '🇹🇿' },
  { code: 'fr', label: 'Français',  short: 'FR', flag: '🇫🇷' },
];

const B = '#2563EB';

const LanguageSwitcher = ({ variant = 'dropdown', onChange }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  const changeLanguage = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('kentexa_lang', code);
    setOpen(false);
    onChange?.(code);
  };

  if (variant === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LANGUAGES.map(l => (
          <button key={l.code} onClick={() => changeLanguage(l.code)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: l.code === current.code ? `2px solid ${B}` : '1.5px solid #E2E8F0',
              backgroundColor: l.code === current.code ? '#EFF6FF' : '#fff',
              textAlign: 'left', width: '100%',
            }}>
            <span style={{ fontSize: 22 }}>{l.flag}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700,
              color: l.code === current.code ? B : '#1E293B' }}>{l.label}</span>
            {l.code === current.code && <span style={{ color: B, fontWeight: 900 }}>✓</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 100, cursor: 'pointer',
          border: '1.5px solid #E2E8F0', backgroundColor: '#fff',
          fontSize: 13, fontWeight: 800, color: '#1E293B',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
        <span style={{ fontSize: 16 }}>{current.flag}</span>
        {current.short}
        <span style={{ fontSize: 10, color: '#94A3B8' }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 999,
            backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            padding: 6, minWidth: 150,
          }}>
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => changeLanguage(l.code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  backgroundColor: l.code === current.code ? '#EFF6FF' : 'transparent',
                  fontSize: 13, fontWeight: 700,
                  color: l.code === current.code ? B : '#1E293B', textAlign: 'left',
                }}>
                <span style={{ fontSize: 16 }}>{l.flag}</span>
                {l.label}
                {l.code === current.code && <span style={{ marginLeft: 'auto', color: B }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageSwitcher;
