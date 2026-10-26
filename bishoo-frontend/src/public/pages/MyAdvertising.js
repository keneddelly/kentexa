import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';

/**
 * Mtangazaji (owner 2026-10-26): the advertiser's own page - their registration link
 * to share, the people who joined through it, and the commission earned (unpaid and
 * paid). Commission is earned when a person they brought posts a first listing,
 * creates a business, opens an office or becomes a seller, each at KenteXa's rate.
 */
export const EVENT_LABEL = { first_listing: 'Tangazo la kwanza', business: 'Amefungua biashara', office: 'Amefungua ofisi', seller: 'Amekuwa muuzaji' };
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginBottom: 14 };

export default function MyAdvertising({ onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.get('/advertisers/me').then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.message || 'Haikupatikana.'));
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.link); setCopied(true); } catch { setCopied(false); }
  };
  const share = data ? `https://wa.me/?text=${encodeURIComponent(`Jiunge na KenteXa: ${data.link}`)}` : '#';
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#0f172a' }}>
      <BackBar onBack={() => onNavigate('back')} title="Matangazo yangu" top={0} />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px calc(124px + env(safe-area-inset-bottom, 0px))' }}>
        {error && <div role="alert" style={{ ...card, color: '#b91c1c' }}>{error}</div>}
        {!data && !error && <div style={{ fontSize: 14, color: '#475569' }}>Inapakia…</div>}
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
