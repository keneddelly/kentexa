/**
 * MySeries.js — "Mfululizo wangu" (Topic Series #410 phase 5, owner 2026-11-17: "should be on").
 * A writer groups their own public posts into a series: create it, add their own posts as parts,
 * order them, publish. Who may: an account with a verified identity, or with at least 3 public
 * posts (the server decides; GET /series/my/status). Admin can still archive any series.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { SeriesEditor } from '../../admin/pages/AdminSeries';
import GetAppStrip from '../components/GetAppStrip';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const STATUS = { draft: 'Rasimu', published: 'Imechapishwa', archived: 'Imehifadhiwa' };

export default function MySeries({ onNavigate, isLoggedIn }) {
  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState(null);
  const [topics, setTopics] = useState([]);
  const [open, setOpen] = useState(null);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.resolve().then(() => api.get('/series/my/status')).then((r) => setStatus(r?.data || null)).catch(() => setStatus(null));
    Promise.resolve().then(() => api.get('/series/my/all')).then((r) => setRows(Array.isArray(r?.data) ? r.data : [])).catch(() => setRows([]));
  };
  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    load();
    Promise.resolve().then(() => api.get('/feed/topics')).then((r) => setTopics((Array.isArray(r?.data) ? r.data : []).map((t) => ({ ...t, active: true })))).catch(() => {});
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setBusy(true); setMsg('');
    try { const r = await api.post('/series/my', { title }); setTitle(''); setOpen(r.data.id); }
    catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana'); } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', minHeight: '100vh', background: '#fff', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>
      <div style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${LINE}` }}>
        <button type="button" onClick={() => (open ? (setOpen(null), load()) : onNavigate('back'))} aria-label="Rudi"
          style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <b style={{ fontSize: 17, color: INK }}>Mfululizo wangu</b>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {open ? (
          <SeriesEditor id={open} topics={topics} mine onBack={() => { setOpen(null); load(); }} />
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 15, color: MUTED, lineHeight: '21px' }}>
              Panga machapisho yako kuwa mfululizo: Sehemu 1, 2, 3… Wasomaji wanaufuata na wanapata taarifa ukiongeza sehemu mpya.
            </p>
            {status && !status.eligible && (
              <div data-testid="my-series-not-yet" style={{ background: '#fffbeb', color: '#92400e', borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: '20px' }}>
                Ili kuunda mfululizo: thibitisha kitambulisho chako, au chapisha angalau machapisho {status.need} ya wazi (umechapisha {status.posts}).
              </div>
            )}
            {status?.eligible && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Jina la mfululizo (mf. Biashara Ndogo, Hatua kwa Hatua)"
                  data-testid="my-series-title" style={{ flex: 1, minWidth: 220, padding: '10px 12px', borderRadius: 12, border: '1px solid #cfd9de', fontSize: 15, fontFamily: 'inherit' }} />
                <button type="button" disabled={busy || title.trim().length < 3} onClick={create} data-testid="my-series-create"
                  style={{ height: 42, padding: '0 18px', borderRadius: 21, border: 'none', background: INK, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>Unda</button>
              </div>
            )}
            {msg && <div role="status" style={{ fontSize: 14 }}>{msg}</div>}
            {rows === null && <div style={{ color: MUTED }}>Inapakia…</div>}
            {rows && rows.length === 0 && <div style={{ color: MUTED, fontSize: 14 }}>Bado huna mfululizo.</div>}
            {rows && rows.map((r) => (
              <button key={r.id} type="button" data-testid={`my-series-${r.id}`} onClick={() => setOpen(r.id)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
                <b style={{ fontSize: 16 }}>{r.title}</b>
                <span style={{ fontSize: 13, color: MUTED }}>{STATUS[r.status] || r.status} · Sehemu {r.episodes} · wafuasi {r.followers}</span>
              </button>
            ))}
          </>
        )}
      </div>
      <GetAppStrip text="Andika na panga mfululizo wako kwenye app ya KenteXa" />
    </div>
  );
}
