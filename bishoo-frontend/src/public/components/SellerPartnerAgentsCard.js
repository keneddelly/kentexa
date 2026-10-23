import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// Seller: invite the person who delivers for you to be your partner agent on KenteXa.
// The message goes from the seller's OWN WhatsApp or SMS, never KenteXa's SMS.
// The person is approved by KenteXa as a normal agent; your pickup jobs go to your
// partner agents first for a few minutes, then to every agent. Either side can stop.

const STATUS = {
  sent: ['Imetumwa', '#64748b'], opened: ['Amefungua kiungo', '#1d4ed8'],
  expired: ['Muda umekwisha', '#b91c1c'], ended: ['Imesitishwa', '#94a3b8'],
};
const AGENT = {
  approved: ['Wakala mshirika', '#15803d'], pending: ['Ombi la wakala linakaguliwa', '#b45309'],
  not_applied: ['Bado hajajaza ombi la wakala', '#b45309'], suspended: ['Wakala amesimamishwa', '#b91c1c'],
  rejected: ['Ombi la wakala limekataliwa', '#b91c1c'],
};
const inp = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, marginBottom: 8 };
const btn = (bg) => ({ flex: 1, minHeight: 44, borderRadius: 10, border: 'none', backgroundColor: bg, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' });

const SellerPartnerAgentsCard = () => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const [data, setData] = useState({ items: [], firstMinutes: 5 });
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(() => {
    api.get('/seller-agent-partners/mine')
      .then((r) => { setData(r.data || { items: [] }); setUnavailable(false); })
      .catch((e) => { if (e?.response?.status === 503) setUnavailable(true); });
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const send = async (channel) => {
    setBusy(true); setError(''); setSent(null);
    try {
      const { data: out } = await api.post('/seller-agent-partners/invite', { phone, name, channel });
      const url = channel === 'whatsapp' ? out.whatsappUrl : out.smsUrl;
      setSent({ channel, url });
      if (channel === 'whatsapp') window.open(url, '_blank', 'noopener');
      else window.location.href = url;
      setPhone(''); setName('');
      load();
    } catch (e) {
      setError(e?.response?.data?.message || 'Imeshindikana kutuma mwaliko.');
    } finally { setBusy(false); }
  };

  const end = async (item) => {
    const who = item.agent?.name || item.invitedName || item.invitedPhone;
    if (!window.confirm(item.status === 'accepted' ? `Sitisha ushirikiano na ${who}?` : `Futa mwaliko kwa ${who}?`)) return;
    try { await api.patch(`/seller-agent-partners/${item.id}/end`); load(); }
    catch (e) { setError(e?.response?.data?.message || 'Imeshindikana.'); }
  };

  const items = (data.items || []).filter((i) => i.status !== 'ended');
  const partners = items.filter((i) => i.status === 'accepted');

  return (
    <div data-testid="seller-partner-agents" style={{ backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: 16, marginBottom: 16 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🛵</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Wakala washirika</span>
          <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>Mwalike anayekusafirishia mizigo afanye kazi nawe KenteXa</span>
        </span>
        <span style={{ color: '#1d4ed8', fontWeight: 800 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {unavailable ? (
            <div style={{ fontSize: 13, color: '#b45309' }}>Huduma hii bado haijawashwa. Jaribu tena baadaye.</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 10, lineHeight: 1.5 }}>
                Mwaliko unatumwa kwa WhatsApp au SMS yako mwenyewe. Akikubali na KenteXa ikimkubali kama wakala,
                kazi zako za kuchukua mizigo zitamfikia yeye kwanza kwa dakika {data.firstMinutes ?? 5}, kisha kwa mawakala wote.
                Bado ni wakala huru, na mnaweza kusitisha wakati wowote.
              </div>
              <input type="tel" placeholder="Namba ya simu (mf. 0712345678)" value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} />
              <input type="text" placeholder="Jina (hiari)" value={name} onChange={(e) => setName(e.target.value)} style={inp} />
              {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c', marginBottom: 8 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={busy || !phone} onClick={() => send('whatsapp')} style={{ ...btn('#16a34a'), opacity: busy || !phone ? 0.6 : 1 }}>WhatsApp</button>
                <button type="button" disabled={busy || !phone} onClick={() => send('sms')} style={{ ...btn('#1d4ed8'), opacity: busy || !phone ? 0.6 : 1 }}>SMS yangu</button>
              </div>
              {sent && (
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  Haikufunguka? <a href={sent.url} target={sent.channel === 'whatsapp' ? '_blank' : undefined} rel="noopener noreferrer"
                    style={{ color: '#1d4ed8', fontWeight: 700 }}>{sent.channel === 'whatsapp' ? 'Fungua WhatsApp' : 'Fungua SMS'}</a>
                </div>
              )}

              {items.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 4 }}>
                    {partners.length ? `Washirika: ${partners.length}` : 'Mialiko'}
                  </div>
                  {items.map((item) => {
                    const [label, color] = item.status === 'accepted'
                      ? (AGENT[item.agent?.status] || AGENT.not_applied)
                      : (STATUS[item.status] || [item.status, '#64748b']);
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #e2e8f0', fontSize: 13 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.agent?.name || item.invitedName || item.invitedPhone}
                            {item.status === 'accepted' && item.agent?.status === 'approved' && (
                              <span style={{ fontWeight: 600, color: item.agent.online ? '#16a34a' : '#94a3b8' }}> · {item.agent.online ? 'yupo kazini' : 'hayupo kazini'}</span>
                            )}
                          </div>
                          <div style={{ color, fontWeight: 700, fontSize: 12 }}>{label}</div>
                        </div>
                        {item.status !== 'expired' && (
                          <button type="button" onClick={() => end(item)}
                            style={{ minHeight: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            {item.status === 'accepted' ? 'Sitisha' : 'Futa'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SellerPartnerAgentsCard;
