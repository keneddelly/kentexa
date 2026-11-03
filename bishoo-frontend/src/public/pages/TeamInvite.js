/**
 * TeamInvite.js — the invited person's page (owner approved 2026-11-03).
 * URL: kentexa.com/?teamInvite=<token> (the owner sends it from their own WhatsApp/SMS), or the
 * in-app notification. Public: shows the business, the role and a masked number. Kubali needs
 * login with the invited number; a new person registers first and comes back here.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { savePosTeam } from '../../utils/posTeam';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const RED = '#b42318';
const GREEN = '#05603a';
const pill = (dark) => ({ height: 44, padding: '0 20px', borderRadius: 22, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });

export default function TeamInvite({ token, isLoggedIn, onNavigate }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve(api.get(`/team-invitations/${encodeURIComponent(token || '')}`))
      .then((r) => { if (alive) setView(r?.data || null); })
      .catch(() => { if (alive) setError('Mwaliko huu haupatikani. Muombe aliyekualika akutumie tena.'); });
    return () => { alive = false; };
  }, [token]);

  const answer = async (accept) => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; } // the URL keeps the token; login brings them back here
    setBusy(true); setError('');
    try {
      const r = await api.post(`/team-invitations/${encodeURIComponent(token)}/${accept ? 'accept' : 'decline'}`);
      setDone(r?.data?.status || (accept ? 'accepted' : 'declined'));
    } catch (e) {
      setError(e?.response?.data?.message || 'Imeshindikana. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const openPos = async () => {
    const r = await Promise.resolve(api.get('/team-invitations/workplaces')).catch(() => null);
    const place = (r?.data || []).find((w) => Number(w.commerceProfileId) === Number(view?.commerceProfileId)) || (r?.data || [])[0];
    if (place) savePosTeam(place);
    onNavigate('TeamPOS', place ? { posTeam: place } : null);
  };

  const shell = (children) => (
    <div style={{ minHeight: '100vh', background: '#fff', color: INK }}>
      <div data-testid="team-invite" style={{ padding: '32px 16px', maxWidth: 480, margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  );

  if (!view) return shell(error ? <p role="alert" style={{ color: RED, margin: 0 }}>{error}</p> : <p style={{ color: MUTED, margin: 0 }}>Inapakia…</p>);

  const head = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ width: 56, height: 56, borderRadius: 12, background: INK, color: '#fff', fontWeight: 800, fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {String(view.businessName || 'K').charAt(0).toUpperCase()}
      </span>
      <h1 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800 }}>{view.businessName}</h1>
      <p style={{ margin: 0, fontSize: 15, color: MUTED }}>Mwaliko kwa {view.name} ({view.phoneMasked})</p>
    </div>
  );

  if (done === 'accepted' || view.status === 'accepted') {
    return shell(<>
      {head}
      <p role="status" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: GREEN }}>Umejiunga na {view.businessName} kama {view.roleLabel}.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {view.pos && <button type="button" data-testid="team-invite-open-pos" style={pill(true)} onClick={openPos}>Fungua POS ya {view.businessName}</button>}
        <button type="button" style={pill(!view.pos)} onClick={() => onNavigate('Workspace')}>Nenda Kazi</button>
      </div>
    </>);
  }
  if (done === 'declined' || view.status !== 'pending') {
    return shell(<>{head}<p style={{ margin: 0, fontSize: 15, color: MUTED }}>{done === 'declined' ? 'Umekataa mwaliko huu.' : 'Mwaliko huu haupo tena.'}</p>
      <button type="button" style={pill(false)} onClick={() => onNavigate('Home')}>Nenda KenteXa</button></>);
  }
  return shell(<>
    {head}
    <div style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, padding: '14px 0', fontSize: 16, lineHeight: 1.5 }}>
      {view.businessName} imekualika kuwa <b>{view.roleLabel}</b>.
      {view.pos ? ' Utaweza kuuza kwenye POS ya duka hili, kwa jina lako.' : ''}
    </div>
    {error && <p role="alert" style={{ margin: 0, color: RED, fontSize: 14 }}>{error}</p>}
    {isLoggedIn ? (
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-testid="team-invite-accept" disabled={busy} style={pill(true)} onClick={() => answer(true)}>Kubali</button>
        <button type="button" data-testid="team-invite-decline" disabled={busy} style={pill(false)} onClick={() => answer(false)}>Kataa</button>
      </div>
    ) : (
      <>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Ingia kwa namba {view.phoneMasked}. Kama huna akaunti ya KenteXa, jisajili kwa namba hiyo kwanza; utarudi hapa.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={pill(true)} onClick={() => onNavigate('PublicLogin')}>Ingia</button>
          <button type="button" style={pill(false)} onClick={() => onNavigate('Register')}>Jisajili</button>
        </div>
      </>
    )}
  </>);
}
