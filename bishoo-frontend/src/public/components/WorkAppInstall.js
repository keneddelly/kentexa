/**
 * WorkAppInstall.js — "Weka kwenye simu yako" card on the till and the ofisi desk
 * (owner 2026-11-03: "make it easy for even Ofisi/pos user to install it on their phone because they use it daily").
 *   Android / computer with Chrome's offer  one tap "Weka" opens the device's own install box.
 *   iPhone Safari                           Apple allows no one-tap install: 3 short steps.
 *   iPhone other browser, WhatsApp/Instagram cannot install: "Fungua kwenye Chrome/Safari" + copy link.
 *   Android without the offer               Chrome menu steps.
 * Never shown inside the installed app; "Baadaye" hides it for 7 days.
 */
import React, { useState } from 'react';
import { WORK_APPS } from '../../utils/posApp';

const INK = '#0f1419';
const MUTED = '#536471';
const EDGE = '#cfd9de';
const DAY = 86400000;
const keyFor = (kind) => `kx_workapp_later_${kind}`;
const laterRecently = (kind) => {
  try { return Date.now() - Number(localStorage.getItem(keyFor(kind)) || 0) < 7 * DAY; } catch { return false; }
};
const pill = (dark) => ({ height: 36, padding: '0 16px', borderRadius: 18, border: dark ? 'none' : `1px solid ${EDGE}`, background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-3px' }}>
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

/** Which help the device needs. */
export const installMode = (env = {}, ready = false) => {
  if (env.standalone) return 'none';
  if (env.inApp) return 'open-browser';
  if (env.ios) return env.safari ? 'ios-steps' : 'open-safari';
  if (ready) return 'prompt';
  if (env.mobile) return 'android-steps';
  return 'none';
};

export default function WorkAppInstall({ kind, env, ready, canInstall = true, onInstall, style }) {
  const app = WORK_APPS[kind];
  const [hidden, setHidden] = useState(() => laterRecently(kind));
  const [copied, setCopied] = useState(false);
  const mode = installMode(env, ready);
  // canInstall turns false once this phone has installed KenteXa (the 'appinstalled' event).
  if (!app || hidden || mode === 'none' || (env?.mobile && !canInstall)) return null;
  const where = env?.mobile ? 'simu yako' : 'kompyuta';
  const later = () => { try { localStorage.setItem(keyFor(kind), String(Date.now())); } catch { /* private mode */ } setHidden(true); };
  const copy = () => {
    const url = `${window.location.origin}${app.path}`;
    Promise.resolve(navigator.clipboard?.writeText(url)).then(() => setCopied(true)).catch(() => setCopied(false));
  };
  const steps = mode === 'ios-steps'
    ? [<>Bonyeza alama ya Share <ShareIcon /> chini ya Safari.</>, <>Chagua <b>Add to Home Screen</b>.</>, <>Bonyeza <b>Add</b>.</>]
    : mode === 'android-steps'
      ? [<>Bonyeza <b>⋮</b> juu kulia ya Chrome.</>, <>Chagua <b>Install app</b> au <b>Add to Home screen</b>.</>, <>Bonyeza <b>Install</b>.</>]
      : null;

  return (
    <section data-testid={`work-app-install-${kind}`} aria-label={`Weka ${app.name}`}
      style={{ margin: '10px 16px 0', padding: '12px 14px', borderRadius: 16, border: `1px solid ${EDGE}`, background: '#fff', color: INK,
        display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <img src={app.icon} alt="" width="44" height="44" style={{ borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <b style={{ fontSize: 15 }}>Weka {app.name} kwenye {where}</b>
          <div style={{ fontSize: 13, color: MUTED }}>Fungua kwa kubofya mara moja, bila kutafuta.</div>
        </div>
        {mode === 'prompt' && <button type="button" data-testid="work-app-install-go" style={pill(true)} onClick={onInstall}>Weka</button>}
        <button type="button" style={pill(false)} onClick={later}>Baadaye</button>
      </div>
      {steps && (
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {(mode === 'open-browser' || mode === 'open-safari') && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
          <span style={{ flex: '1 1 200px' }}>
            {mode === 'open-safari' ? 'Kwenye iPhone, fungua ukurasa huu kwenye Safari, kisha uweke.' : `Fungua ukurasa huu kwenye ${env?.ios ? 'Safari' : 'Chrome'}, kisha uweke.`}
          </span>
          <button type="button" data-testid="work-app-install-copy" style={pill(false)} onClick={copy}>{copied ? 'Link imenakiliwa' : 'Nakili link'}</button>
        </div>
      )}
    </section>
  );
}
