/**
 * ApplyKit.js — the shared new look of the "open / apply" pages (owner 2026-11-02:
 * "business page, applications for agent / office / sell are all old ... continue"):
 * Fungua biashara, Kuwa muuzaji, Kuwa wakala, Fungua ofisi, Msafirishaji and the role list.
 * Same look as the new login and Home: white page, big title, outlined fields with the label
 * above, ink chips and pill buttons, plain red errors, benefits as plain rows. No emoji,
 * no gradients. Presentation only: every page keeps its own logic and server calls.
 */
import React from 'react';
import BackBar from './BackBar';

export const K = Object.freeze({ INK: '#0f1419', MUTED: '#536471', LINE: '#eff3f4', EDGE: '#cfd9de', BLUE: '#1d9bf0', RED: '#b42318', GREEN: '#05603a' });

export const inputStyle = {
  width: '100%', padding: '11px 12px', borderRadius: 8, border: `1px solid ${K.EDGE}`, fontSize: 16,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', color: K.INK, background: '#fff',
};

export function ApplyPage({ title, desc, onBack, backTitle, children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: K.INK }}>
      <BackBar onBack={onBack} title={backTitle} top={0} />
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '8px 16px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {(title || desc) && (
          <header style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8 }}>
            {title && <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.2, textWrap: 'balance' }}>{title}</h1>}
            {desc && <p style={{ margin: 0, fontSize: 15, color: K.MUTED, lineHeight: 1.45 }}>{desc}</p>}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}

export const Section = ({ title, children, testId }) => (
  <section data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${K.LINE}`, paddingTop: 16 }}>
    {title && <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>}
    {children}
  </section>
);

export const Field = ({ label, hint, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 14, fontWeight: 600, color: K.INK }}>
    {label}
    {children}
    {hint && <span style={{ fontSize: 13, fontWeight: 400, color: K.MUTED }}>{hint}</span>}
  </label>
);

export const chipStyle = (on) => ({
  padding: '8px 13px', borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? K.INK : K.EDGE}`, background: on ? K.INK : '#fff', color: on ? '#fff' : K.INK,
});

export const pillStyle = (dark = true, disabled = false) => ({
  width: '100%', height: 48, borderRadius: 24, fontSize: 16, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
  border: dark ? 'none' : `1px solid ${K.EDGE}`, background: dark ? K.INK : '#fff', color: dark ? '#fff' : K.INK, opacity: disabled ? 0.55 : 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box',
});

export const ErrorText = ({ children }) => (children ? <p role="alert" style={{ margin: 0, color: K.RED, fontSize: 14 }}>{children}</p> : null);

export const Note = ({ tone = 'grey', children }) => {
  const c = { grey: ['#f7f9f9', K.INK], green: ['#ecfdf3', K.GREEN], amber: ['#fffbeb', '#92400e'], blue: ['#eff6ff', '#1e40af'] }[tone] || ['#f7f9f9', K.INK];
  return <div style={{ background: c[0], color: c[1], borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.45 }}>{children}</div>;
};

/** Benefits / steps as plain rows: a small number, a bold line, a muted line. */
export const InfoRows = ({ items }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {items.map((it, i) => (
      <div key={it.title || i} style={{ display: 'flex', gap: 12 }}>
        <span style={{ width: 26, height: 26, borderRadius: 13, background: '#f7f9f9', fontWeight: 800, fontSize: 13, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 15 }}>{it.title}</b>
          {it.desc && <span style={{ fontSize: 14, color: K.MUTED, lineHeight: 1.4 }}>{it.desc}</span>}
        </span>
      </div>
    ))}
  </div>
);

/** Remove emoji left in older translated texts (presentation only). */
export const noEmoji = (s) => String(s ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
