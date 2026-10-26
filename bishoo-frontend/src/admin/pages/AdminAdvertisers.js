import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';
import { EVENT_LABEL } from '../../public/pages/MyAdvertising';

/**
 * Admin: advertisers KenteXa hires to bring users (owner 2026-10-26). Add an advertiser
 * (name, phone) to get their link; set the commission rate per event; see users brought
 * and commission owed; mark it paid after paying them by mobile money; stop a link.
 */
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

export default function AdminAdvertisers({ activePage, onNavigate, onLogout }) {
  const [data, setData] = useState(null);
  const [rates, setRates] = useState({});
  const [form, setForm] = useState({ name: '', phone: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [ratesSaved, setRatesSaved] = useState(false);
  const [confirmPay, setConfirmPay] = useState(null);
  const [copied, setCopied] = useState(null);

  const [apps, setApps] = useState([]);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const load = () => Promise.all([
    api.get('/advertisers').then((r) => { setData(r.data); setRates(r.data?.rates || {}); }),
    // Self-service applications (people who asked to become advertisers).
    api.get('/advertisers/applications').then((r) => setApps(r.data?.applications || [])).catch(() => setApps([])),
  ]).catch((e) => setMsg(e?.response?.data?.message || 'Imeshindikana kupakia'));
  useEffect(() => { load(); }, []);
  const run = async (fn, ok) => {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(ok); await load(); return true; } catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana'); return false; } finally { setBusy(false); }
  };
  const copy = (a) => {
    try { navigator.clipboard?.writeText(a.link); } catch (e) { /* clipboard blocked: the link is still shown */ }
    setCopied(a.id);
  };

  const card = { background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)', marginBottom: 16 };
  const input = { height: 40, border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', fontSize: 14 };
  const btnBase = { height: 40, padding: '0 14px', border: 0, borderRadius: 8, background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  // A disabled button must look disabled, otherwise it reads as "the button does not work".
  const btn = (bg = '#1d4ed8', off = false) => ({ ...btnBase, background: off ? '#cbd5e1' : bg, color: off ? '#64748b' : '#fff', cursor: off ? 'not-allowed' : 'pointer' });
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0' };
  const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily:'inherit' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>
        <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Watangazaji</h1>
        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>Kila mtangazaji ana kiungo chake. Anapata kamisheni mtu aliyemleta akifanya hatua hizi, kila moja mara moja.</p>
        {msg && <div role="status" style={{ ...card, padding: 10, fontSize: 13 }}>{msg}</div>}
        {data && !data.ready && <div style={card}>Matangazo yatawashwa baada ya migration 1793100000000 kufanyika.</div>}
        {data?.ready && (
          <>
            {apps.length > 0 && (
              <div style={{ ...card, border: '1px solid #bfdbfe' }} data-testid="adv-applications">
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Maombi mapya ({apps.length})</div>
                {apps.map((ap, i) => (
                  <div key={ap.id} data-testid={`adv-app-${ap.id}`} style={{ borderTop: i ? '1px solid #f1f5f9' : 0, padding: '10px 0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 260px', fontSize: 13 }}>
                      <strong style={{ fontSize: 14 }}>{ap.name}</strong> · {ap.phone}{ap.area ? ` · ${ap.area}` : ''}
                      {ap.plan && <div style={{ color: '#475569', marginTop: 2 }}>{ap.plan}</div>}
                      <div style={{ color: '#94a3b8', marginTop: 2 }}>{ap.createdAt ? new Date(ap.createdAt).toLocaleDateString('en-GB') : ''}</div>
                    </div>
                    {rejecting === ap.id ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input aria-label="Sababu ya kukataa" placeholder="Sababu (mwombaji ataiona)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...input, width: 240 }} />
                        <button style={btn('#b91c1c', busy || reason.trim().length < 3)} disabled={busy || reason.trim().length < 3}
                          onClick={async () => { if (await run(() => api.post(`/advertisers/applications/${ap.id}/reject`, { reason }), `Ombi la ${ap.name} limekataliwa.`)) { setRejecting(null); setReason(''); } }}>Kataa ombi</button>
                        <button style={btn('#475569', busy)} disabled={busy} onClick={() => { setRejecting(null); setReason(''); }}>Ghairi</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={btn('#15803d', busy)} disabled={busy}
                          onClick={() => run(() => api.post(`/advertisers/applications/${ap.id}/accept`), `${ap.name} amekubaliwa. Kiungo chake kipo kwenye jedwali hapa chini na kwenye ukurasa wake.`)}>Kubali</button>
                        <button style={btn('#475569', busy)} disabled={busy} onClick={() => { setRejecting(ap.id); setReason(''); }}>Kataa</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={card}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Kamisheni kwa kila hatua (TZS)</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {Object.entries(EVENT_LABEL).map(([k, l]) => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>{l}
                    <input aria-label={l} inputMode="numeric" value={rates[k] ?? 0} onChange={(e) => { setRatesSaved(false); setRates((r) => ({ ...r, [k]: e.target.value.replace(/[^0-9]/g, '') })); }} style={{ ...input, width: 130 }} />
                  </label>
                ))}
                <button style={btn('#1d4ed8', busy)} disabled={busy}
                  onClick={async () => { const ok = await run(() => api.put('/advertisers/rates', Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Number(v) || 0]))), 'Viwango vimehifadhiwa.'); setRatesSaved(ok); }}>
                  {busy ? 'Inahifadhi...' : 'Hifadhi'}</button>
                {ratesSaved && <span style={{ fontSize: 13, color: '#15803d', fontWeight: 700, alignSelf: 'center' }}>Imehifadhiwa</span>}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Kiwango kipya kinahusu kamisheni zinazopatikana kuanzia sasa.</div>
            </div>

            <div style={card}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Ongeza mtangazaji</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input aria-label="Jina" placeholder="Jina" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
                <input aria-label="Simu" placeholder="0712 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={input} />
                <button style={btn('#1d4ed8', busy || !form.name.trim() || !form.phone.trim())} disabled={busy || !form.name.trim() || !form.phone.trim()}
                  onClick={() => run(async () => { await api.post('/advertisers', form); setForm({ name: '', phone: '' }); }, 'Mtangazaji ameongezwa.')}>Ongeza</button>
              </div>
            </div>

            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Mtangazaji</th><th style={th}>Kiungo</th><th style={th}>Waliojiunga</th><th style={th}>Anadai</th><th style={th}>Amelipwa</th><th style={th}></th></tr></thead>
                <tbody>
                  {data.advertisers.map((a) => (
                    <tr key={a.id} data-testid={`adv-row-${a.id}`}>
                      <td style={td}><strong>{a.name}</strong><div style={{ color: '#64748b' }}>{a.phone}</div>{!a.active && <div style={{ color: '#b45309' }}>Kimesimamishwa</div>}</td>
                      <td style={{ ...td, wordBreak: 'break-all', maxWidth: 280 }}>
                        <div>{a.link}</div>
                        <button type="button" onClick={() => copy(a)} style={{ marginTop: 4, padding: 0, border: 0, background: 'none', color: '#1d4ed8', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {copied === a.id ? 'Kimenakiliwa' : 'Nakili kiungo'}</button>
                      </td>
                      <td style={td}>{a.users}</td>
                      <td style={td}><strong>{tzs(a.unpaid)}</strong></td>
                      <td style={td}>{tzs(a.paid)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {confirmPay === a.id ? (
                            <>
                              <button style={btn('#15803d', busy)} disabled={busy}
                                onClick={async () => { await run(() => api.post(`/advertisers/${a.id}/paid`), `Imewekwa: ${a.name} amelipwa ${tzs(a.unpaid)}.`); setConfirmPay(null); }}>Ndiyo, nimemlipa {tzs(a.unpaid)}</button>
                              <button style={btn('#475569', busy)} disabled={busy} onClick={() => setConfirmPay(null)}>Ghairi</button>
                            </>
                          ) : a.unpaid > 0 ? (
                            <button style={btn('#15803d', busy)} disabled={busy} onClick={() => setConfirmPay(a.id)}>Nimelipa</button>
                          ) : (
                            <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Hakuna deni</span>
                          )}
                          <button style={btn('#475569', busy)} disabled={busy}
                            onClick={() => run(() => api.patch(`/advertisers/${a.id}/active`, { active: !a.active }), a.active ? 'Kiungo kimesimamishwa.' : 'Kiungo kimewashwa.')}>{a.active ? 'Simamisha' : 'Washa'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!data.advertisers.length && <tr><td style={td} colSpan={6}>Bado hakuna mtangazaji.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
