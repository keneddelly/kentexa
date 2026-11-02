/**
 * ShehenaHandover.js — the shehena hand-over code (owner approved 2026-11-02, sketch
 * "Hand-over Codes"). One 6-digit code per dispatched shehena:
 *   ShehenaSent      sending office: its shehena on the way, with the code to write on the package;
 *   ShehenaIncoming  receiving office: type the code (or a reason) and every parcel arrives at once;
 *   ShehenaConfirm   transporter on KenteXa: type the code to confirm "Nimepokea shehena".
 * The server checks everything; nothing renders when there is nothing to show.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e6ebef';
const GREEN = '#05603a';

const card = { background: '#ffffff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 };
const input = { border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', color: INK, minWidth: 0 };
const btn = (on = true) => ({ border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, fontSize: 14, cursor: on ? 'pointer' : 'default',
  background: on ? INK : '#cfd9de', color: '#ffffff', fontFamily: 'inherit', whiteSpace: 'nowrap' });
const when = (d) => (d ? new Date(d).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const digitsOnly = (v) => String(v || '').replace(/\D/g, '').slice(0, 6);

/** Sending office: shehena still on the way, each with its code. */
export function ShehenaSent({ refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    api.get('/super-agents/shehena/sent').then((r) => { if (alive) setRows(Array.isArray(r.data) ? r.data : []); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  const onTheWay = rows.filter((s) => s.status === 'dispatched');
  if (!onTheWay.length) return null;
  return (
    <section data-testid="shehena-sent" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: MUTED, letterSpacing: '0.04em' }}>SHEHENA ZILIZO NJIANI ({onTheWay.length})</div>
      {onTheWay.map((s) => (
        <div key={s.id} style={card} data-testid={`shehena-sent-${s.id}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
            <strong style={{ fontSize: 15, color: INK }}>Kwenda {s.destinationCity} · vifurushi {s.totalParcels}</strong>
            <span style={{ fontSize: 12, color: MUTED }}>{when(s.dispatchTime)}</span>
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>Namba ya shehena (iandike kwenye mzigo)</div>
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 24, fontWeight: 800, letterSpacing: '0.18em', color: INK }}>{s.handoverCode}</div>
          <div style={{ fontSize: 13, color: s.transportConfirmedAt ? GREEN : MUTED }}>
            {s.transportConfirmedAt ? `Usafiri umethibitisha kupokea · ${when(s.transportConfirmedAt)}` : (s.transportCompany ? `Usafiri: ${s.transportCompany}` : 'Usafiri bado haujathibitisha')}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Receiving office: shehena on the way here; the code (or a reason) receives every parcel. */
export function ShehenaIncoming({ onReceived }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [code, setCode] = useState('');
  const [noCode, setNoCode] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const load = useCallback(() => {
    api.get('/super-agents/shehena/incoming').then((r) => setRows(Array.isArray(r.data) ? r.data : [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = (id) => { setOpen(id); setCode(''); setReason(''); setNoCode(false); setError(''); };
  const receive = async (s) => {
    setBusy(true); setError('');
    try {
      const r = await api.post(`/super-agents/shehena/${s.id}/receive`, noCode ? { reason } : { code });
      const skipped = Array.isArray(r.data?.skipped) ? r.data.skipped.length : 0;
      setDone(`Shehena kutoka ${s.fromOffice || s.originCity}: vifurushi ${r.data?.received ?? 0} vimepokelewa${skipped ? `, ${skipped} havikupokelewa (angalia kimoja kimoja)` : ''}.`);
      setOpen(null); load(); onReceived?.();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.');
    } finally { setBusy(false); }
  };

  if (!rows.length && !done) return null;
  return (
    <section data-testid="shehena-incoming" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: MUTED, letterSpacing: '0.04em' }}>SHEHENA ZINAZOKUJA ({rows.length})</div>
      {done && <div role="status" style={{ ...card, background: '#e7f6ee', borderColor: 'transparent', color: GREEN, fontSize: 14, fontWeight: 600 }}>{done}</div>}
      {rows.map((s) => (
        <div key={s.id} style={card} data-testid={`shehena-incoming-${s.id}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
            <strong style={{ fontSize: 15, color: INK }}>Kutoka {s.fromOffice || s.originCity} · vifurushi {s.totalParcels}</strong>
            <span style={{ fontSize: 12, color: MUTED }}>{when(s.dispatchTime)}</span>
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>
            {[s.transportCompany && `Usafiri: ${s.transportCompany}`, s.transportRef && `Rejea: ${s.transportRef}`, s.fromPhone && `Simu: ${s.fromPhone}`].filter(Boolean).join(' · ')}
          </div>
          {open !== s.id ? (
            <button type="button" data-testid={`shehena-open-${s.id}`} onClick={() => start(s.id)} style={{ ...btn(), alignSelf: 'flex-start' }}>Pokea shehena</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!noCode ? (
                <input data-testid="shehena-code" value={code} onChange={(e) => setCode(digitsOnly(e.target.value))} inputMode="numeric"
                  aria-label="Namba ya shehena" placeholder="Namba ya shehena (iko kwenye mzigo)" style={input} />
              ) : (
                <input data-testid="shehena-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))}
                  aria-label="Sababu" placeholder="Kwa nini huna namba? (mf. lebo imepotea)" style={input} />
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" data-testid="shehena-receive" disabled={busy || (noCode ? reason.trim().length < 5 : code.length !== 6)}
                  onClick={() => receive(s)} style={btn(!(busy || (noCode ? reason.trim().length < 5 : code.length !== 6)))}>
                  Pokea vifurushi vyote {s.totalParcels}
                </button>
                <button type="button" onClick={() => { setNoCode((v) => !v); setError(''); }}
                  style={{ border: 'none', background: 'none', color: '#2563eb', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {noCode ? 'Nina namba' : 'Sina namba'}
                </button>
              </div>
              {error && <div role="alert" style={{ fontSize: 13, color: '#b42318' }}>{error}</div>}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

/** Transporter on KenteXa: confirm taking a shehena with the code on the package. */
export function ShehenaConfirm({ shehena, onConfirmed }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!shehena || shehena.status !== 'dispatched') return null;
  if (shehena.transportConfirmedAt) {
    return <div data-testid={`shehena-confirmed-${shehena.id}`} style={{ fontSize: 13, color: GREEN, fontWeight: 600, marginTop: 6 }}>Umethibitisha kupokea shehena hii.</div>;
  }
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post(`/super-agents/shehena/as-transport/${shehena.id}/confirm`, { code });
      onConfirmed?.(shehena.id, r.data?.confirmedAt || new Date().toISOString());
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.');
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input data-testid={`transport-code-${shehena.id}`} value={code} onChange={(e) => setCode(digitsOnly(e.target.value))} inputMode="numeric"
          aria-label="Namba ya shehena" placeholder="Namba ya shehena" style={{ ...input, flex: 1 }} />
        <button type="button" data-testid={`transport-confirm-${shehena.id}`} disabled={busy || code.length !== 6} onClick={confirm} style={btn(!(busy || code.length !== 6))}>
          Nimepokea
        </button>
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: '#b42318' }}>{error}</div>}
    </div>
  );
}
