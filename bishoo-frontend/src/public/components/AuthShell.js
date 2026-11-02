/**
 * AuthShell.js — the shared look of the new login and signup pages (owner approved
 * 2026-11-02, sketch "New Login and Signup"): white column, KenteXa wordmark, big title,
 * outlined fields, black pill buttons, plain red error text, no emoji. The language
 * choice stays, small, at the bottom.
 */
import React, { useRef } from 'react';
import LanguageSwitcher from './LanguageSwitcher';

export const AUTH = Object.freeze({ INK: '#0f1419', MUTED: '#536471', LINE: '#cfd9de', BLUE: '#1d9bf0', RED: '#b42318', BG: '#ffffff' });

export function AuthShell({ title, subtitle, onLogo, children, footer }) {
  return (
    <div style={{ minHeight: '100vh', background: AUTH.BG, display: 'flex', justifyContent: 'center', boxSizing: 'border-box',
      padding: 'max(24px, env(safe-area-inset-top)) 16px 24px' }}>
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button type="button" onClick={onLogo} aria-label="KenteXa"
          style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Manrope, -apple-system, sans-serif',
            fontSize: 24, fontWeight: 900, color: AUTH.INK }}>
          Kente<span style={{ color: '#1d4ed8' }}>X</span>a
        </button>
        <h1 style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 800, color: AUTH.INK, lineHeight: 1.15 }}>{title}</h1>
        {subtitle && <p style={{ margin: 0, fontSize: 15, color: AUTH.MUTED, lineHeight: 1.45 }}>{subtitle}</p>}
        {children}
        <div style={{ flex: 1 }} />
        {footer}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}><LanguageSwitcher variant="dropdown" /></div>
      </div>
    </div>
  );
}

/** An outlined field with its label inside (Twitter style). */
export function AuthField({ label, value, onChange, type = 'text', inputMode, autoComplete, testId, maxLength, autoFocus }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, border: `1px solid ${AUTH.LINE}`, borderRadius: 6, padding: '8px 12px' }}>
      <span style={{ fontSize: 13, color: AUTH.MUTED }}>{label}</span>
      <input data-testid={testId} type={type} value={value} onChange={(e) => onChange(e.target.value)} inputMode={inputMode}
        autoComplete={autoComplete} maxLength={maxLength} autoFocus={autoFocus} aria-label={label}
        style={{ border: 'none', outline: 'none', padding: 0, fontSize: 17, color: AUTH.INK, background: 'transparent', fontFamily: 'inherit' }} />
    </label>
  );
}

export function AuthButton({ children, onClick, disabled, variant = 'dark', testId, type = 'button' }) {
  const dark = variant === 'dark';
  return (
    <button type={type} data-testid={testId} onClick={onClick} disabled={disabled}
      style={{ width: '100%', height: 46, borderRadius: 23, fontSize: 16, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
        border: dark ? 'none' : `1px solid ${AUTH.LINE}`, background: dark ? AUTH.INK : '#fff', color: dark ? '#fff' : AUTH.INK, opacity: disabled ? 0.55 : 1 }}>
      {children}
    </button>
  );
}

export const AuthLink = ({ children, onClick, testId }) => (
  <button type="button" data-testid={testId} onClick={onClick}
    style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, color: AUTH.BLUE, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
    {children}
  </button>
);

export const AuthError = ({ children }) => (children ? <p role="alert" style={{ margin: 0, fontSize: 14, color: AUTH.RED }}>{children}</p> : null);
export const AuthNote = ({ children }) => (children ? <p role="status" style={{ margin: 0, fontSize: 14, color: '#05603a' }}>{children}</p> : null);

export const AuthOr = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: AUTH.MUTED, fontSize: 14 }}>
    <span style={{ flex: 1, height: 1, background: '#eff3f4' }} />{children}<span style={{ flex: 1, height: 1, background: '#eff3f4' }} />
  </div>
);

/** Six boxes over one real input (paste and phone autofill still work). */
export function CodeBoxes({ value, onChange, label, testId = 'code-input' }) {
  const ref = useRef(null);
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6);
  return (
    <div style={{ position: 'relative' }} onClick={() => ref.current?.focus()}>
      <input ref={ref} data-testid={testId} aria-label={label} value={digits} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', fontSize: 16 }} />
      <div aria-hidden="true" style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ flex: 1, height: 52, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: AUTH.INK,
            border: `1px solid ${i === Math.min(digits.length, 5) ? AUTH.BLUE : AUTH.LINE}` }}>{digits[i] || ''}</span>
        ))}
      </div>
    </div>
  );
}

/** "0712 345 678" -> "255712345678"; anything with "@" is an email and is kept as typed. */
export const phoneForServer = (raw) => {
  const d = String(raw || '').replace(/\D/g, '');
  return d.startsWith('0') ? `255${d.slice(1)}` : d;
};
export const isEmail = (raw) => String(raw || '').includes('@');
