import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

/**
 * Admin: Waandishi (Writers programme #417 step B, owner approved 2026-11-18).
 *  Mialiko   add a writer by hand (name, email, topic, where their work is), review each one
 *            (Kubali / Kataa), see the email before sending, and send the chosen ones. Max 50 a day,
 *            only while WRITER_OUTREACH_ENABLED=true in Render. Nothing is ever sent by itself.
 *            Shows who joined and who published a first article.
 *  Wachangiaji Waanzilishi  give or remove the "Mchangiaji Mwanzilishi" label (it is not verification).
 */
const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const STATUS = {
  new: ['Mpya', '#f1f5f9', '#334155'],
  approved: ['Imekubaliwa', '#dbeafe', '#1e40af'],
  rejected: ['Imekataliwa', '#fee2e2', '#991b1b'],
  sent: ['Imetumwa', '#dcfce7', '#166534'],
  unsubscribed: ['Ameomba asitumiwe', '#fef3c7', '#92400e'],
};
const card = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10, border: '1px solid #cfd9de', fontSize: 14, fontFamily: 'inherit' };
const btn = (dark, busy) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });
const small = { height: 30, padding: '0 12px', borderRadius: 15, border: '1px solid #cfd9de', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 };
const err = (e, fallback = 'Imeshindikana') => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m || fallback);
};
const day = (d) => (d ? new Date(d).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' }) : '');
const Tag = ({ s }) => {
  const [t, bg, fg] = STATUS[s] || STATUS.new;
  return <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{t}</span>;
};
const Stat = ({ n, label }) => (
  <div style={{ flex: '1 1 110px', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px' }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: INK }}>{n}</div>
    <div style={{ fontSize: 13, color: MUTED }}>{label}</div>
  </div>
);

const EMPTY = { name: '', email: '', topic: '', source: '', note: '' };

function Invitations() {
  const [sum, setSum] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [picked, setPicked] = useState([]);
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.resolve().then(() => api.get('/writer-outreach/admin/summary')).then((r) => setSum(r?.data || null)).catch(() => setSum(null));
    Promise.resolve().then(() => api.get('/writer-outreach/admin', { params: filter ? { status: filter } : {} }))
      .then((r) => setRows(Array.isArray(r?.data) ? r.data : [])).catch(() => setRows([]));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg('');
    try { const r = await fn(); setMsg(typeof ok === 'function' ? ok(r?.data) : ok); load(); return true; } catch (e) { setMsg(err(e)); return false; } finally { setBusy(false); }
  };
  const add = () => run(() => api.post('/writer-outreach/admin', form), 'Ameongezwa. Mkague kabla ya kutuma.').then((ok) => { if (ok) setForm(EMPTY); });
  const review = (id, decision) => run(() => api.post(`/writer-outreach/admin/${id}/review`, { decision }), decision === 'approve' ? 'Amekubaliwa.' : 'Amekataliwa.');
  const send = () => run(() => api.post('/writer-outreach/admin/send', { ids: picked }),
    (d) => `Zimetumwa ${d?.sent || 0}. Zimeshindikana ${d?.failed || 0}. Zimerukwa ${d?.skipped || 0}. Zimebaki leo ${d?.left ?? 0}.`).then((ok) => { if (ok) setPicked([]); });
  const open = (id) => Promise.resolve().then(() => api.get(`/writer-outreach/admin/${id}/preview`)).then((r) => setPreview(r?.data || null)).catch((e) => setMsg(err(e)));

  const sendable = rows.filter((r) => r.status === 'approved');
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <>
      {sum && (
        <section style={card} data-testid="writers-summary">
          {!sum.ready && <div style={{ color: '#92400e', fontSize: 14 }}>Huduma inaandaliwa (migration bado haijaendeshwa).</div>}
          <div style={{ fontSize: 14, color: sum.enabled ? '#166534' : '#92400e', fontWeight: 700 }} data-testid="writers-switch">
            {sum.enabled ? `Kutuma kumewashwa. Leo: ${sum.sentToday} kati ya ${sum.cap}.` : 'Kutuma kumezimwa. Weka WRITER_OUTREACH_ENABLED=true kwenye Render ili kutuma.'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Stat n={sum.counts?.new || 0} label="Wanasubiri ukaguzi" />
            <Stat n={sum.counts?.approved || 0} label="Tayari kutumwa" />
            <Stat n={sum.counts?.sent || 0} label="Wametumiwa" />
            <Stat n={sum.joined || 0} label="Wamejiunga" />
            <Stat n={sum.wrote || 0} label="Wameandika makala" />
            <Stat n={sum.counts?.unsubscribed || 0} label="Wameomba wasitumiwe" />
          </div>
        </section>
      )}

      <section style={card}>
        <b style={{ fontSize: 16, color: INK }}>Ongeza mwandishi</b>
        <span style={{ fontSize: 13, color: MUTED }}>Ongeza tu watu ambao kazi yao ya uandishi iko wazi mtandaoni. Barua pepe iwe ile wanayoitangaza wenyewe.</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          <input style={input} placeholder="Jina" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="writer-name" />
          <input style={input} placeholder="Barua pepe" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="writer-email" />
          <input style={input} placeholder="Anaandika kuhusu (mf. fedha binafsi)" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <input style={input} placeholder="Kiungo cha kazi yake (https://...)" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        </div>
        <input style={input} placeholder="Maelezo kwa timu (hayatumwi)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <div><button type="button" style={btn(true, busy)} disabled={busy} onClick={add} data-testid="writer-add">Ongeza</button></div>
      </section>

      {msg && <div role="status" style={{ ...card, flexDirection: 'row', fontSize: 14, color: INK }}>{msg}</div>}

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16, color: INK }}>Orodha</b>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...input, width: 'auto' }}>
            <option value="">Wote</option>
            {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {sendable.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={small} onClick={() => setPicked(picked.length ? [] : sendable.map((r) => r.id))}>{picked.length ? 'Ondoa chaguo' : 'Chagua walio tayari'}</button>
            <button type="button" style={btn(true, busy || !picked.length || !sum?.enabled)} disabled={busy || !picked.length || !sum?.enabled} onClick={send} data-testid="writers-send">
              Tuma mialiko ({picked.length})
            </button>
          </div>
        )}
        {rows.length === 0 && <div style={{ color: MUTED, fontSize: 14 }}>Hakuna bado.</div>}
        {rows.map((r) => (
          <div key={r.id} data-testid="writer-row" style={{ borderTop: `1px solid ${LINE}`, paddingTop: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {r.status === 'approved' && (
              <input type="checkbox" aria-label={`Chagua ${r.name}`} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} style={{ marginTop: 4 }} />
            )}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ color: INK }}>{r.name}</b><Tag s={r.status} />
                {r.joined && <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>Amejiunga</span>}
                {r.wroteArticle && <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>Ameandika makala</span>}
              </div>
              <span style={{ fontSize: 13, color: MUTED, overflowWrap: 'anywhere' }}>{r.email}{r.topic ? ` · ${r.topic}` : ''}{r.sentAt ? ` · imetumwa ${day(r.sentAt)}` : ''}</span>
              {r.source && <a href={r.source} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#1d4ed8', overflowWrap: 'anywhere' }}>{r.source}</a>}
              {r.note && <span style={{ fontSize: 13, color: MUTED }}>{r.note}</span>}
              {r.sendError && <span style={{ fontSize: 13, color: '#991b1b' }}>{r.sendError}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" style={small} onClick={() => open(r.id)}>Ona barua</button>
              {['new', 'rejected'].includes(r.status) && <button type="button" style={small} disabled={busy} onClick={() => review(r.id, 'approve')}>Kubali</button>}
              {['new', 'approved'].includes(r.status) && <button type="button" style={small} disabled={busy} onClick={() => review(r.id, 'reject')}>Kataa</button>}
            </div>
          </div>
        ))}
      </section>

      {preview && (
        <section style={card} data-testid="writer-preview">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <b style={{ color: INK }}>Kichwa: {preview.subject}</b>
            <button type="button" style={small} onClick={() => setPreview(null)}>Funga</button>
          </div>
          <iframe title="Barua ya mwaliko" sandbox="" srcDoc={preview.html} style={{ width: '100%', height: 560, border: `1px solid ${LINE}`, borderRadius: 10 }} />
        </section>
      )}
    </>
  );
}

function Founding() {
  const [rows, setRows] = useState([]);
  const [username, setUsername] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => Promise.resolve().then(() => api.get('/writer-outreach/admin/founding'))
    .then((r) => setRows(Array.isArray(r?.data) ? r.data : [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const run = async (fn, ok) => {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(ok); load(); return true; } catch (e) { setMsg(err(e)); return false; } finally { setBusy(false); }
  };
  return (
    <section style={card}>
      <b style={{ fontSize: 16, color: INK }}>Mchangiaji Mwanzilishi</b>
      <span style={{ fontSize: 13, color: MUTED }}>Lebo hii ni ya waandishi wa mwanzo wanaochangia vizuri. Si uthibitisho wa utambulisho.</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...input, flex: '1 1 180px' }} placeholder="@jina la mtumiaji" value={username} onChange={(e) => setUsername(e.target.value)} data-testid="founding-username" />
        <input style={{ ...input, flex: '2 1 220px' }} placeholder="Sababu (hiari)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" style={btn(true, busy)} disabled={busy} data-testid="founding-add"
          onClick={() => run(() => api.post('/writer-outreach/admin/founding', { username, note }), 'Lebo imewekwa.').then((ok) => { if (ok) { setUsername(''); setNote(''); } })}>Weka lebo</button>
      </div>
      {msg && <div role="status" style={{ fontSize: 14, color: INK }}>{msg}</div>}
      {rows.length === 0 && <div style={{ color: MUTED, fontSize: 14 }}>Bado hakuna.</div>}
      {rows.map((r) => (
        <div key={r.userId} style={{ borderTop: `1px solid ${LINE}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <b style={{ color: INK }}>{r.name || (r.username ? `@${r.username}` : `#${r.userId}`)}</b>
            <span style={{ fontSize: 13, color: MUTED }}>{r.username ? `@${r.username} · ` : ''}tangu {day(r.createdAt)}{r.note ? ` · ${r.note}` : ''}</span>
          </span>
          <button type="button" style={small} disabled={busy} onClick={() => run(() => api.post(`/writer-outreach/admin/founding/${r.userId}/remove`), 'Lebo imeondolewa.')}>Ondoa</button>
        </div>
      ))}
    </section>
  );
}

export default function AdminWriters({ activePage, onNavigate, onLogout }) {
  const [tab, setTab] = useState('invite');
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f9f9' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: INK }}>Waandishi</h1>
        <div style={{ display: 'flex', borderBottom: '1px solid #cfd9de' }}>
          {[['invite', 'Mialiko'], ['founding', 'Wachangiaji Waanzilishi']].map(([k, l]) => (
            <button key={k} type="button" data-testid={`admin-writers-tab-${k}`} onClick={() => setTab(k)}
              style={{ border: 'none', background: 'none', padding: '10px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                color: tab === k ? INK : MUTED, borderBottom: tab === k ? '3px solid #1d9bf0' : '3px solid transparent' }}>{l}</button>
          ))}
        </div>
        {tab === 'invite' ? <Invitations /> : <Founding />}
      </main>
    </div>
  );
}
