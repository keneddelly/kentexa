import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

/**
 * Admin: Ada ya KenteXa payments (owner approved 2026-11-03). An ofisi, agent or seller pays
 * KenteXa's Lipa Namba and sends the screenshot; here admin opens the screenshot and confirms
 * (the debt goes down) or rejects with a reason (they are told and can send again).
 * Akaunti (owner approved 2026-11-17): everyone who uses KenteXa's paid work, what they did,
 * owe and paid, who is late, their monthly ankara, and "Mkumbushe" (once a day).
 * The fee settings screen comes later (admin last).
 */
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const WHO = { office: 'Ofisi', agent: 'Wakala', seller: 'Muuzaji' };
const when = (d) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00+03:00` : d).toLocaleDateString('en-GB') : '-');
const TAG = {
  paid: ['Imelipwa', '#dcfce7', '#166534'], late: ['Imechelewa', '#fee2e2', '#991b1b'],
  part: ['Imelipwa sehemu', '#fef3c7', '#92400e'], unpaid: ['Haijalipwa', '#e0f2fe', '#075985'],
  locked: ['Imefungwa', '#0f1419', '#ffffff'],
};
const Tag = ({ k }) => {
  const [t, bg, fg] = TAG[k] || TAG.unpaid;
  return <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{t}</span>;
};
const btnStyle = (dark, busy) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? '#0f1419' : '#fff',
  color: dark ? '#fff' : '#0f1419', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });
const cardStyle = { background: '#fff', border: '1px solid #eff3f4', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 };

/** One account: numbers, ankara (open one to see its jobs), payments, latest jobs, Mkumbushe. */
export function FeeAccount({ type, id, onBack }) {
  const [a, setA] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [inv, setInv] = useState(null);
  const load = () => Promise.resolve()
    .then(() => api.get(`/kentexa-fee/admin/accounts/${type}/${id}`))
    .then((r) => setA(r?.data || null))
    .catch((e) => setMsg(e?.response?.data?.message || 'Imeshindikana kupakia'));
  useEffect(() => { load(); }, [type, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const remind = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api.post(`/kentexa-fee/admin/accounts/${type}/${id}/remind`);
      setMsg(r?.data?.smsSent ? 'Kumbusho limetumwa (app na SMS)' : 'Kumbusho limetumwa kwenye app (SMS haikwenda)');
      await load();
    }
    catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana'); } finally { setBusy(false); }
  };
  const openInv = (invId) => {
    if (inv?.id === invId) { setInv(null); return; }
    setInv({ id: invId, data: null });
    Promise.resolve().then(() => api.get(`/kentexa-fee/admin/invoices/${invId}`))
      .then((r) => setInv({ id: invId, data: r?.data || null }))
      .catch(() => setInv({ id: invId, data: { jobs: [] } }));
  };
  const Line = ({ l, v }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '4px 0' }}><span style={{ color: '#536471' }}>{l}</span><b>{v}</b></div>
  );
  return (
    <div data-testid="fee-account" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" onClick={onBack} style={{ ...btnStyle(false), alignSelf: 'flex-start' }}>← Akaunti zote</button>
      {msg && <div role="status" style={{ fontSize: 14 }}>{msg}</div>}
      {!a && !msg && <div>Inapakia…</div>}
      {a && (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ fontSize: 18 }}>{WHO[a.accountType]}: {a.who || `#${a.accountId}`}</b>
              <span style={{ display: 'flex', gap: 6 }}>{a.locked && <Tag k="locked" />}{a.late ? <Tag k="late" /> : a.owed > 0 ? <Tag k="unpaid" /> : <Tag k="paid" />}</span>
            </div>
            {a.locked && <span data-testid="fee-account-locked" style={{ fontSize: 14, color: '#991b1b' }}>Kazi mpya zimesimama mpaka alipe (deni {tzs(a.lockAmount)}+ na siku 30+).</span>}
            {a.phone && <span style={{ fontSize: 14, color: '#536471' }}>Simu: {a.phone}</span>}
            <Line l="Deni la sasa" v={tzs(a.owed)} />
            {a.legacy > 0 && <Line l="Deni la zamani" v={tzs(a.legacy)} />}
            <Line l="Kazi zote" v={`${a.jobs} (bure ${a.free})`} />
            <Line l="Walichopata kupitia KenteXa" v={tzs(a.earned)} />
            <Line l="Ada zote" v={tzs(a.fees)} />
            <Line l="Kazi ya kwanza" v={when(a.firstJobAt)} />
            <Line l="Kumbusho la mwisho" v={a.lastRemindedAt ? when(a.lastRemindedAt) : 'Bado'} />
            {a.owed > 0 && <button type="button" data-testid="fee-remind" disabled={busy} onClick={remind} style={{ ...btnStyle(true, busy), alignSelf: 'flex-start' }}>Mkumbushe</button>}
          </div>
          <div style={cardStyle}>
            <b>Ankara</b>
            {a.invoices.length === 0 && <span style={{ fontSize: 14, color: '#536471' }}>Bado hakuna ankara. Ya kwanza inatolewa tarehe 1 mwezi ujao.</span>}
            {a.invoices.map((i) => (
              <div key={i.id} style={{ borderTop: '1px solid #eff3f4' }}>
                <button type="button" data-testid={`fee-admin-invoice-${i.id}`} onClick={() => openInv(i.id)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <span><b>{i.month}</b><span style={{ display: 'block', fontSize: 13, color: '#536471' }}>{i.number} · kazi {i.jobs} · mwisho {when(i.dueAt)}</span></span>
                  <span style={{ textAlign: 'right' }}><b>{tzs(i.amount)}</b><span style={{ display: 'block', marginTop: 4 }}><Tag k={i.status === 'paid' ? 'paid' : i.late ? 'late' : i.status} /></span>
                    {i.status === 'part' && <span style={{ display: 'block', fontSize: 12, color: '#536471' }}>imebaki {tzs(i.left)}</span>}</span>
                </button>
                {inv?.id === i.id && (
                  <div style={{ fontSize: 13, paddingBottom: 10 }}>
                    {!inv.data && 'Inapakia…'}
                    {inv.data?.jobs?.map((j) => (
                      <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#536471' }}>
                        <span>{when(j.doneAt)} · {j.sourceRef || `#${j.id}`} · {tzs(j.baseAmount)}</span><b style={{ color: '#0f1419' }}>{j.freeJob ? 'Bure' : tzs(j.fee)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={cardStyle}>
            <b>Malipo</b>
            {a.payments.length === 0 && <span style={{ fontSize: 14, color: '#536471' }}>Hajalipa bado.</span>}
            {a.payments.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, borderTop: '1px solid #eff3f4', paddingTop: 8 }}>
                <span>{when(p.createdAt)} · {{ waiting: 'Inasubiri', confirmed: 'Imethibitishwa', rejected: 'Imekataliwa' }[p.status] || p.status}
                  {p.reference ? ` · ${p.reference}` : ''}{p.proofUrl && <> · <a href={p.proofUrl} target="_blank" rel="noreferrer" style={{ color: '#1d9bf0' }}>picha</a></>}</span>
                <b>{tzs(p.amount)}</b>
              </div>
            ))}
          </div>
          {a.recent.length > 0 && (
            <div style={cardStyle}>
              <b>Kazi za karibuni</b>
              {a.recent.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#536471' }}>
                  <span>{when(r.doneAt)} · {r.sourceRef || `#${r.id}`} · {tzs(r.baseAmount)}</span><b style={{ color: '#0f1419' }}>{r.freeJob ? 'Bure' : tzs(r.fee)}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Everyone who uses KenteXa's paid work. */
export function FeeAccounts() {
  const [filter, setFilter] = useState('owing');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    setData(null); setMsg('');
    Promise.resolve().then(() => api.get('/kentexa-fee/admin/accounts', { params: { filter, q: q.trim() || undefined } }))
      .then((r) => setData(r?.data || { rows: [] }))
      .catch((e) => { setData({ rows: [] }); setMsg(e?.response?.data?.message || 'Imeshindikana kupakia'); });
  }, [filter, q]);
  if (open) return <FeeAccount type={open.type} id={open.id} onBack={() => setOpen(null)} />;
  const t = data?.totals;
  const Stat = ({ l, v, tone }) => (
    <div style={{ ...cardStyle, flex: '1 1 140px', gap: 2 }}><span style={{ fontSize: 13, color: '#536471' }}>{l}</span><b style={{ fontSize: 20, color: tone || '#0f1419' }}>{v}</b></div>
  );
  return (
    <div data-testid="fee-accounts" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {t && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Stat l="Wanaotumia" v={t.accounts} />
          <Stat l="Wanadaiwa" v={`${t.owing} · ${tzs(t.owed)}`} />
          <Stat l="Wamechelewa (siku 30+)" v={t.late} tone={t.late ? '#991b1b' : undefined} />
          <Stat l="Wamefungwa" v={t.locked || 0} tone={t.locked ? '#991b1b' : undefined} />
          <Stat l="Waliolipa jumla" v={tzs(t.paid)} tone="#166534" />
        </div>
      )}
      {data && data.invoicesOn === false && <div style={{ fontSize: 14, color: '#92400e' }}>Ankara zitaanza baada ya migration 1797000000000 kupita.</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['owing', 'Wanadaiwa'], ['late', 'Wamechelewa'], ['locked', 'Wamefungwa'], ['all', 'Wote']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} style={btnStyle(filter === k)}>{l}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tafuta jina au simu" data-testid="fee-accounts-search"
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 19, border: '1px solid #cfd9de', fontSize: 14, fontFamily: 'inherit' }} />
      </div>
      {msg && <div role="status" style={{ fontSize: 14 }}>{msg}</div>}
      {!data && <div>Inapakia…</div>}
      {data && data.rows.length === 0 && <div style={{ color: '#536471' }}>Hakuna akaunti hapa.</div>}
      {data?.rows?.map((r) => (
        <button key={`${r.accountType}-${r.accountId}`} type="button" data-testid={`fee-account-${r.accountType}-${r.accountId}`}
          onClick={() => setOpen({ type: r.accountType, id: r.accountId })} style={{ ...cardStyle, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%' }}>
            <b>{WHO[r.accountType] || r.accountType}: {r.who || `#${r.accountId}`}{r.phone ? ` · ${r.phone}` : ''}</b>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b>{tzs(r.owed)}</b>{r.locked && <Tag k="locked" />}{r.late ? <Tag k="late" /> : r.owed > 0 ? <Tag k="unpaid" /> : <Tag k="paid" />}</span>
          </div>
          <div style={{ fontSize: 13, color: '#536471' }}>
            Kazi {r.jobs} (mwezi huu {r.monthJobs}) · ada {tzs(r.fees)} · amelipa {tzs(r.paid)} · ankara {r.invoices}
            {r.waiting ? ` · malipo ${r.waiting} yanasubiri` : ''} · kazi ya mwisho {when(r.lastJobAt)}
          </div>
        </button>
      ))}
    </div>
  );
}

export default function AdminKentexaFees({ activePage, onNavigate, onLogout }) {
  const [tab, setTab] = useState('payments');
  const [status, setStatus] = useState('waiting');
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  const load = (st = status) => api.get('/kentexa-fee/admin/payments', { params: { status: st } })
    .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
    .catch((e) => { setRows([]); setMsg(e?.response?.data?.message || 'Imeshindikana kupakia'); });
  useEffect(() => { load(status); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id, decision) => {
    setBusy(true); setMsg('');
    try {
      await api.post(`/kentexa-fee/admin/payments/${id}/${decision}`, decision === 'reject' ? { reason } : {});
      setMsg(decision === 'confirm' ? 'Malipo yamethibitishwa' : 'Malipo yamekataliwa');
      setRejecting(null); setReason('');
      await load();
    } catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana'); } finally { setBusy(false); }
  };

  const card = { background: '#fff', border: '1px solid #eff3f4', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 };
  const btn = (dark) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? '#0f1419' : '#fff',
    color: dark ? '#fff' : '#0f1419', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f9f9' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Ada ya KenteXa</h1>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #cfd9de' }}>
          {[['payments', 'Malipo'], ['accounts', 'Akaunti']].map(([k, l]) => (
            <button key={k} type="button" data-testid={`fee-tab-${k}`} onClick={() => setTab(k)}
              style={{ border: 'none', background: 'none', padding: '10px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                color: tab === k ? '#0f1419' : '#536471', borderBottom: tab === k ? '3px solid #1d9bf0' : '3px solid transparent' }}>{l}</button>
          ))}
        </div>
        {tab === 'accounts' && <FeeAccounts />}
        {tab === 'payments' && (<>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['waiting', 'Yanasubiri'], ['confirmed', 'Yamethibitishwa'], ['rejected', 'Yamekataliwa']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStatus(k)} style={btn(status === k)}>{l}</button>
          ))}
        </div>
        {msg && <div role="status" style={{ fontSize: 14 }}>{msg}</div>}
        {rows === null && <div>Inapakia…</div>}
        {rows && rows.length === 0 && <div style={{ color: '#536471' }}>Hakuna malipo hapa.</div>}
        {rows && rows.map((p) => (
          <div key={p.id} style={card} data-testid={`fee-payment-${p.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <b>{WHO[p.accountType] || p.accountType}: {p.who || `#${p.accountId}`}{p.phone ? ` · ${p.phone}` : ''}</b>
              <b>{tzs(p.amount)}</b>
            </div>
            <div style={{ fontSize: 14, color: '#536471' }}>
              {new Date(p.createdAt).toLocaleString('en-GB')}{p.reference ? ` · Muamala ${p.reference}` : ''} · Deni la sasa {tzs(p.owed)}
              {p.reason ? ` · Sababu: ${p.reason}` : ''}
            </div>
            {p.proofUrl && <a href={p.proofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: '#1d9bf0', fontWeight: 700 }}>Fungua picha ya malipo</a>}
            {p.status === 'waiting' && rejecting !== p.id && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={busy} onClick={() => act(p.id, 'confirm')} style={btn(true)}>Thibitisha</button>
                <button type="button" disabled={busy} onClick={() => { setRejecting(p.id); setReason(''); }} style={btn(false)}>Kataa</button>
              </div>
            )}
            {rejecting === p.id && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sababu (mf. kiasi hakilingani)"
                  style={{ flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 8, border: '1px solid #cfd9de', fontSize: 14 }} />
                <button type="button" disabled={busy} onClick={() => act(p.id, 'reject')} style={btn(true)}>Kataa</button>
                <button type="button" onClick={() => setRejecting(null)} style={btn(false)}>Ghairi</button>
              </div>
            )}
          </div>
        ))}
        </>)}
      </main>
    </div>
  );
}
