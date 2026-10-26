import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';

/**
 * Mtangazaji (owner 2026-10-26): the advertiser's own page - their registration link
 * to share, the people who joined through it, and the commission earned (unpaid and
 * paid). Commission is earned when a person they brought posts a first listing,
 * creates a business, opens an office or becomes a seller, each at KenteXa's rate.
 *
 * Not an advertiser yet: the same page is the application (self-service, owner
 * 2026-10-26). The person applies; KenteXa accepts (the link appears here) or
 * rejects with a reason (they may apply again).
 */
export const EVENT_LABEL = { first_listing: 'Tangazo la kwanza', business: 'Amefungua biashara', office: 'Amefungua ofisi', seller: 'Amekuwa muuzaji' };
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginBottom: 14 };

const field = { width: '100%', boxSizing: 'border-box', height: 48, border: '1px solid #cbd5e1', borderRadius: 12, padding: '0 12px', fontSize: 15, fontFamily: 'inherit', color: '#0f172a', background: '#ffffff' };
const label = { display: 'block', fontSize: 14, fontWeight: 700, color: '#334155', margin: '12px 0 6px' };

function Apply({ standing, currentUser, onApplied }) {
  const app = standing.application;
  const [form, setForm] = useState({ name: currentUser?.name || '', phone: currentUser?.phone || '', area: '', plan: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { const r = await api.post('/advertisers/apply', form); onApplied(r.data); }
    catch (x) { setErr(x?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
    finally { setBusy(false); }
  };

  if (!standing.ready) return <div style={card}>Maombi ya kuwa mtangazaji bado hayajafunguliwa. Jaribu tena baadaye.</div>;
  if (app?.status === 'pending') {
    return (
      <div style={card} data-testid="adv-pending">
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Ombi lako limepokelewa</div>
        <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.5 }}>KenteXa italiangalia. Likikubaliwa, kiungo chako kitaonekana hapa hapa.</div>
        <div style={{ fontSize: 14, marginTop: 10 }}>{app.name} · {app.phone}{app.area ? ` · ${app.area}` : ''}</div>
      </div>
    );
  }
  const can = form.name.trim().length >= 2 && !busy;
  return (
    <>
      {app?.status === 'rejected' && (
        <div role="status" style={{ ...card, borderColor: '#fecaca', background: '#fef2f2' }} data-testid="adv-rejected">
          <div style={{ fontWeight: 800, color: '#b91c1c', marginBottom: 4 }}>Ombi lako la awali halikukubaliwa</div>
          <div style={{ fontSize: 14 }}>{app.reason}</div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>Unaweza kurekebisha na kuomba tena.</div>
        </div>
      )}
      <div style={card}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Kuwa mtangazaji wa KenteXa</div>
        <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
          Unapata kiungo chako. Mtu akijiunga kupitia kiungo hicho, unalipwa kamisheni kila anapofanya hatua hizi (kila moja mara moja):
        </div>
        {Object.entries(EVENT_LABEL).map(([k, l]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}><span>{l}</span><strong>{tzs(standing.rates?.[k])}</strong></div>
        ))}
      </div>
      <form onSubmit={submit} style={card} aria-label="Omba kuwa mtangazaji">
        <label style={label} htmlFor="adv-name">Jina lako</label>
        <input id="adv-name" style={field} value={form.name} onChange={set('name')} maxLength={100} />
        <label style={label} htmlFor="adv-phone">Namba ya simu (utalipwa kupitia hii)</label>
        <input id="adv-phone" style={field} inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={set('phone')} />
        <label style={label} htmlFor="adv-area">Unafanyia kazi wapi?</label>
        <input id="adv-area" style={field} placeholder="mf. Mwanza mjini" value={form.area} onChange={set('area')} maxLength={120} />
        <label style={label} htmlFor="adv-plan">Utawaletaje watu? (si lazima)</label>
        <textarea id="adv-plan" style={{ ...field, height: 96, padding: 12, resize: 'vertical' }} placeholder="mf. WhatsApp, sokoni, kwa wafanyabiashara wa mtaa wangu" value={form.plan} onChange={set('plan')} maxLength={500} />
        {err && <div role="alert" style={{ color: '#b91c1c', fontSize: 14, marginTop: 10 }}>{err}</div>}
        <button type="submit" disabled={!can} style={{ width: '100%', height: 52, marginTop: 16, border: 0, borderRadius: 12, fontSize: 16, fontWeight: 800, fontFamily: 'inherit',
          background: can ? '#1d4ed8' : '#cbd5e1', color: can ? '#ffffff' : '#64748b', cursor: can ? 'pointer' : 'not-allowed' }}>
          {busy ? 'Inatuma...' : 'Tuma ombi'}</button>
      </form>
    </>
  );
}

export default function MyAdvertising({ onNavigate, currentUser }) {
  const [data, setData] = useState(null);
  const [standing, setStanding] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.get('/advertisers/me').then((r) => setData(r.data)).catch((e) => {
      // Not an advertiser: show the application (or where it stands).
      api.get('/advertisers/application/me')
        .then((r) => setStanding(r.data))
        .catch(() => setError(e?.response?.data?.message || 'Haikupatikana.'));
    });
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.link); setCopied(true); } catch { setCopied(false); }
  };
  const share = data ? `https://wa.me/?text=${encodeURIComponent(`Jiunge na KenteXa: ${data.link}`)}` : '#';
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#0f172a' }}>
      <BackBar onBack={() => onNavigate('back')} title="Kiungo changu na kamisheni" top={0} />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px calc(124px + env(safe-area-inset-bottom, 0px))' }}>
        {error && <div role="alert" style={{ ...card, color: '#b91c1c' }}>{error}</div>}
        {!data && !standing && !error && <div style={{ fontSize: 14, color: '#475569' }}>Inapakia…</div>}
        {!data && standing && <Apply standing={standing} currentUser={currentUser} onApplied={(application) => setStanding((st) => ({ ...st, application }))} />}
        {data && (
          <>
            <div style={card} data-testid="adv-link">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>KIUNGO CHAKO</div>
              <div style={{ fontSize: 15, fontWeight: 700, wordBreak: 'break-all', marginBottom: 12 }}>{data.link}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={copy} style={{ flex: 1, height: 48, borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{copied ? 'Imenakiliwa' : 'Nakili'}</button>
                <a href={share} target="_blank" rel="noopener noreferrer" style={{ flex: 1, height: 48, borderRadius: 12, background: '#15803d', color: '#ffffff', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Tuma WhatsApp</a>
              </div>
              {!data.active && <div role="status" style={{ fontSize: 13, color: '#b45309', marginTop: 10 }}>Kiungo hiki kimesimamishwa na KenteXa.</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={card} data-testid="adv-unpaid"><div style={{ fontSize: 13, color: '#475569' }}>Unadai</div><div style={{ fontSize: 20, fontWeight: 800 }}>{tzs(data.unpaid)}</div></div>
              <div style={card} data-testid="adv-paid"><div style={{ fontSize: 13, color: '#475569' }}>Umelipwa</div><div style={{ fontSize: 20, fontWeight: 800 }}>{tzs(data.paid)}</div></div>
            </div>

            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>UNAPATA KWA KILA MTU ANAYE…</div>
              {Object.entries(EVENT_LABEL).map(([k, l]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}><span>{l}</span><strong>{tzs(data.rates?.[k])}</strong></div>
              ))}
            </div>

            <div style={card} data-testid="adv-users">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>WALIOJIUNGA ({data.users.length})</div>
              {!data.users.length && <div style={{ fontSize: 14, color: '#475569' }}>Bado hakuna. Tuma kiungo chako kwa watu.</div>}
              {data.users.map((u, i) => (
                <div key={i} style={{ borderTop: i ? '1px solid #f1f5f9' : 0, padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                    <strong>{u.name}</strong>
                    <span style={{ fontSize: 13, color: '#475569' }}>{u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-GB') : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    {(u.earned || []).length
                      ? u.earned.map((e) => `${EVENT_LABEL[e.event] || e.event} ${tzs(e.amount)}${e.status === 'paid' ? ' (imelipwa)' : ''}`).join(' · ')
                      : 'Bado hajafanya hatua inayolipa'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
