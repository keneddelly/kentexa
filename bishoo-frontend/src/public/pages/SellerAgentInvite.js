/**
 * SellerAgentInvite.js — join page for a seller's partner-agent invitation.
 * URL: kentexa.com/?agentInvite=<signed token> (sent by the seller's own WhatsApp or SMS).
 * Public: shows only which shop invites. Accepting needs login with the invited number.
 * The person is approved as a normal agent by KenteXa; they are never locked to the
 * seller and can leave at any time. Swahili, like the rest of the logistics pages.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const DARK = '#0f172a';
const GREY = '#475569';
const BLUE = '#1d4ed8';
const card = { backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 };
const button = { width: '100%', minHeight: 48, borderRadius: 12, border: 'none', backgroundColor: BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' };

const ERRORS = {
  403: 'Mwaliko huu ni kwa namba nyingine. Ingia kwa akaunti ya namba iliyoalikwa.',
  409: 'Mwaliko huu tayari umetumiwa na akaunti nyingine.',
  410: 'Kiungo hiki kimekwisha muda au kimesitishwa. Muombe muuzaji akutumie kingine.',
};

const DONE = {
  done: ['Umejiunga', 'Sasa wewe ni wakala mshirika wa duka hili. Kazi zao za kuchukua mizigo zitakufikia wewe kwanza.'],
  wait_approval: ['Umejiunga', 'Ombi lako la wakala linakaguliwa na KenteXa. Likikubaliwa, kazi za duka hili zitakufikia wewe kwanza.'],
};

const SellerAgentInvite = ({ token, isLoggedIn, onNavigate }) => {
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get(`/seller-agent-partners/link/${encodeURIComponent(token || '')}`)
      .then((r) => { if (alive) { setView(r.data); if (r.data?.status === 'accepted') setDone('done'); } })
      .catch((e) => { if (alive) setError(ERRORS[e?.response?.status] || 'Kiungo hiki si sahihi.'); });
    return () => { alive = false; };
  }, [token]);

  const join = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; } // the URL keeps the token; login brings them back here
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/seller-agent-partners/link/${encodeURIComponent(token)}/accept`);
      if (data?.next === 'apply') onNavigate('BecomeAgent');
      else setDone(data?.next || 'done');
    } catch (e) {
      setError(ERRORS[e?.response?.status] || e?.response?.data?.message || 'Imeshindikana. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const page = (children) => (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div data-testid="seller-agent-invite" style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }}>{children}</div>
    </div>
  );

  if (error && !view) {
    return page(
      <div role="alert" style={{ ...card, textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: DARK, margin: '0 0 8px' }}>Mwaliko haupatikani</h2>
        <p style={{ fontSize: 14, color: GREY, margin: 0, lineHeight: 1.5 }}>{error}</p>
      </div>,
    );
  }
  if (!view) return page(<div style={{ ...card, color: GREY, fontSize: 14 }}>Inapakia…</div>);

  const shop = view.shopName || 'Muuzaji';
  return page(
    <>
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 800, color: BLUE, textTransform: 'uppercase', marginBottom: 6 }}>Mwaliko wa wakala</div>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: DARK, margin: '0 0 6px', lineHeight: 1.3 }}>
          {shop} anakualika uwe wakala wake KenteXa
        </h1>
        <p style={{ fontSize: 14, color: GREY, margin: 0, lineHeight: 1.5 }}>
          Utapokea kwanza kazi za {shop} za kuchukua na kufikisha mizigo. Bado ni wakala huru: unaweza kufanya kazi za wengine na kuacha wakati wowote.
        </p>
      </div>
      {done ? (
        <div role="status" style={{ ...card, borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: DARK, marginBottom: 4 }}>{DONE[done]?.[0] || DONE.done[0]}</div>
          <div style={{ fontSize: 14, color: GREY, lineHeight: 1.5 }}>{DONE[done]?.[1] || DONE.done[1]}</div>
        </div>
      ) : (
        <div style={card}>
          {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>{error}</div>}
          <button type="button" onClick={join} disabled={busy} style={{ ...button, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Inashughulikia…' : 'Kubali na ujiunge kama wakala'}
          </button>
          <p style={{ fontSize: 12, color: GREY, margin: '10px 0 0', lineHeight: 1.5 }}>
            {isLoggedIn
              ? 'Kama bado si wakala, utaombwa kujaza ombi la wakala. KenteXa italikagua kama kawaida.'
              : 'Ingia kwanza kwa akaunti ya namba hii ya simu.'}
          </p>
        </div>
      )}
    </>,
  );
};

export default SellerAgentInvite;
