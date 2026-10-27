/**
 * HotelKitchen.js — the hotel's kitchen board (approved mockup "KenteXa Hoteli", board 4,
 * owner 2026-10-27). Built for a tablet on the kitchen wall, works on a phone too.
 *
 * Three columns: Mpya / Inapikwa / Tayari. A new order is accepted with the minutes the
 * kitchen chooses (that is what the customer sees), or rejected with a reason. A Lipa Namba
 * payment is confirmed only after the customer's screenshot arrives. A short sound plays when
 * a new order comes in. Figures at the top come from the hotel's own orders today.
 */
import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';
import { PageLoading } from '../components/Loading';
import { tzs, foodPaymentLine, minutesSince, FOOD_COLORS as C } from '../../utils/food';

const MINUTES = [10, 15, 20, 30, 45];
const REASONS = ['Chakula kimeisha', 'Jikoni kumejaa', 'Tumefunga kwa sasa'];

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18);
    });
  } catch { /* no sound on this device */ }
}

/** The Business this hotel screen works for: the route's, else the acting Business. Never a guess. */
export function hotelBusinessId(businessId, activeContext) {
  const id = Number(businessId || activeContext?.businessId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function NoHotel({ onNavigate, title }) {
  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title={title} top={0} />
      <div style={{ padding: '48px 24px', textAlign: 'center', color: C.muted, fontSize: 15, lineHeight: 1.5 }}>
        Fungua ukurasa huu kutoka kwenye biashara yako.
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => onNavigate('MyBusinesses')}
            style={{ height: 44, padding: '0 20px', borderRadius: 22, border: 'none', background: C.blue, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Biashara zangu
          </button>
        </div>
      </div>
    </div>
  );
}

function Ticket({ o, onStep, busy }) {
  const [minutes, setMinutes] = useState(20);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [payReject, setPayReject] = useState(false);
  const late = o.status === 'cooking' && o.acceptedAt && o.readyInMinutes
    && (Date.now() - new Date(o.acceptedAt).getTime()) / 60000 > o.readyInMinutes;
  let age = minutesSince(o.createdAt);
  if (o.status === 'cooking' && o.acceptedAt) age = `${minutesSince(o.acceptedAt).replace('sasa hivi', 'dk 0')} kati ya ${o.readyInMinutes}`;
  if (o.status === 'ready' && o.readyAt) age = `tayari ${minutesSince(o.readyAt)}`;
  const btn = (bg, color = '#fff', border = 'none') => ({
    height: 48, borderRadius: 24, border, background: bg, color, fontSize: 16, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', padding: '0 16px',
  });

  return (
    <article data-testid={`kitchen-ticket-${o.id}`} style={{ background: '#fff', borderRadius: 16, border: o.status === 'new' ? `2px solid ${C.blue}` : `1px solid ${C.line}`,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ padding: '4px 10px', borderRadius: 8, background: C.ink, color: '#fff', fontSize: 14, fontWeight: 800 }}>{o.place}</span>
        <span style={{ fontSize: 13, color: C.muted }}>{o.code}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: late ? C.red : C.muted }}>{age}</span>
      </div>
      {(o.items || []).map((i) => <div key={i.itemId} style={{ fontSize: 16, fontWeight: 600 }}>{i.qty} × {i.name}</div>)}
      {o.note && <div style={{ fontSize: 14, color: C.amber, background: C.amberSoft, padding: '8px 10px', borderRadius: 10 }}>{o.note}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: o.paymentStatus === 'proof_sent' ? C.amber : C.muted, fontWeight: o.paymentStatus === 'proof_sent' ? 700 : 400 }}>
          {foodPaymentLine(o, true)} · {tzs(o.total)}
        </span>
        {o.proofUrl && <a href={o.proofUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>Angalia picha</a>}
      </div>

      {o.paymentStatus === 'proof_sent' && (
        payReject ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input aria-label="Sababu ya kukataa malipo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mf. Kiasi hakijafika"
              style={{ height: 44, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0 12px', fontSize: 15, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btn('#fff', C.ink, `1px solid ${C.border}`)} onClick={() => setPayReject(false)}>Rudi</button>
              <button type="button" style={{ ...btn(C.red), flex: 1 }} disabled={busy || reason.trim().length < 2}
                onClick={() => onStep(o, 'reject-payment', { reason: reason.trim() })}>Kataa malipo</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn('#fff', C.red, `1px solid ${C.border}`)} onClick={() => { setReason(''); setPayReject(true); }}>Hayajafika</button>
            <button type="button" data-testid={`kitchen-confirm-pay-${o.id}`} style={{ ...btn(C.green), flex: 1 }} disabled={busy}
              onClick={() => onStep(o, 'confirm-payment')}>Thibitisha malipo</button>
          </div>
        )
      )}

      {o.status === 'new' && !rejecting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>Itakuwa tayari baada ya</span>
          <div role="radiogroup" aria-label="Dakika" style={{ display: 'grid', gridTemplateColumns: `repeat(${MINUTES.length}, minmax(0, 1fr))`, gap: 6 }}>
            {MINUTES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)}
                style={{ height: 44, borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', color: C.ink,
                  border: minutes === m ? `2px solid ${C.blue}` : `1px solid ${C.border}`, background: minutes === m ? C.blueSoft : '#fff' }}>dk {m}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn('#fff', C.red, `1px solid ${C.border}`)} onClick={() => { setReason(''); setRejecting(true); }}>Kataa</button>
            <button type="button" data-testid={`kitchen-accept-${o.id}`} style={{ ...btn(C.blue), flex: 1 }} disabled={busy}
              onClick={() => onStep(o, 'accept', { minutes })}>Pokea oda</button>
          </div>
        </div>
      )}
      {o.status === 'new' && rejecting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                style={{ height: 36, padding: '0 12px', borderRadius: 18, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', color: C.ink,
                  border: reason === r ? `2px solid ${C.blue}` : `1px solid ${C.border}`, background: '#fff' }}>{r}</button>
            ))}
          </div>
          <input aria-label="Sababu ya kukataa" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sababu kwa mteja"
            style={{ height: 44, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0 12px', fontSize: 15, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn('#fff', C.ink, `1px solid ${C.border}`)} onClick={() => setRejecting(false)}>Rudi</button>
            <button type="button" style={{ ...btn(C.red), flex: 1 }} disabled={busy || reason.trim().length < 2}
              onClick={() => onStep(o, 'reject', { reason: reason.trim() })}>Kataa oda</button>
          </div>
        </div>
      )}
      {o.status === 'cooking' && (
        <button type="button" data-testid={`kitchen-ready-${o.id}`} style={btn(C.green)} disabled={busy} onClick={() => onStep(o, 'ready')}>Tayari</button>
      )}
      {o.status === 'ready' && (
        <button type="button" data-testid={`kitchen-done-${o.id}`} style={btn(C.ink)} disabled={busy} onClick={() => onStep(o, 'done')}>
          {o.mode === 'pickup' ? 'Amechukua' : `Imefika ${o.placeType === 'room' ? 'chumbani' : 'mezani'}`}
        </button>
      )}
    </article>
  );
}

export default function HotelKitchen({ businessId: routeBusinessId, activeContext, onNavigate, isLoggedIn }) {
  const businessId = hotelBusinessId(routeBusinessId, activeContext);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seen = useRef(null);

  const load = () => api.get(`/food/hotel/${businessId}/kitchen`)
    .then((r) => {
      const newIds = (r.data?.orders || []).filter((o) => o.status === 'new').map((o) => o.id);
      if (seen.current && newIds.some((id) => !seen.current.has(id))) beep();
      seen.current = new Set(newIds);
      setData(r.data); setLoadError('');
    })
    .catch((err) => setLoadError(err?.response?.data?.message || 'Imeshindikana kupakia oda.'));

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return undefined; }
    if (!businessId) return undefined;
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!businessId) return <NoHotel onNavigate={onNavigate} title="Oda za jikoni" />;
  if (loadError && !data) return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title="Oda za jikoni" top={0} />
      <div role="alert" style={{ padding: '48px 24px', textAlign: 'center', color: C.muted, fontSize: 15 }}>{loadError}</div>
    </div>
  );
  if (!data) return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title="Oda za jikoni" top={0} />
      <PageLoading label="Inapakia oda" />
    </div>
  );

  const step = async (o, action, body = {}) => {
    setBusy(true); setError('');
    try {
      const r = await api.post(`/food/hotel/${businessId}/orders/${o.id}/${action}`, body);
      setData((d) => ({ ...d, orders: d.orders.map((x) => (x.id === o.id ? { ...x, ...r.data } : x)) }));
      load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.');
    } finally { setBusy(false); }
  };
  const toggleAccepting = async () => {
    setBusy(true); setError('');
    try {
      await api.patch(`/food/hotel/${businessId}/settings`, { acceptingOrders: !data.acceptingOrders });
      setData((d) => ({ ...d, acceptingOrders: !d.acceptingOrders }));
    } catch (err) { setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); } finally { setBusy(false); }
  };

  const open = (data.orders || []).filter((o) => ['new', 'cooking', 'ready'].includes(o.status));
  const cols = [
    { key: 'new', title: 'Mpya', color: C.blue },
    { key: 'cooking', title: 'Inapikwa', color: '#b45309' },
    { key: 'ready', title: 'Tayari', color: C.green },
  ];
  const tiles = [
    ['Oda leo', String(data.today.orders)],
    ['Mauzo leo', tzs(data.today.sales)],
    ['Malipo ya kuthibitisha', String(data.today.toConfirm)],
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f7f9f9', color: C.ink }}>
      <BackBar onBack={() => onNavigate('back')} title="Oda za jikoni" top={0}
        right={(
          <button type="button" onClick={() => onNavigate('HotelMenuManager', { businessId })}
            style={{ height: 36, padding: '0 14px', borderRadius: 18, border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Menyu yangu
          </button>
        )} />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
        <section style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <strong style={{ fontSize: 20, marginRight: 'auto' }}>{data.hotel?.name}</strong>
          {tiles.map(([label, value]) => (
            <span key={label} style={{ padding: '8px 14px', borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
              <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
            </span>
          ))}
          <button type="button" data-testid="kitchen-accepting" onClick={toggleAccepting} disabled={busy}
            style={{ height: 44, padding: '0 18px', borderRadius: 22, border: 'none', background: data.acceptingOrders ? C.green : '#64748b', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: '#fff' }} />
            {data.acceptingOrders ? 'Tunapokea oda' : 'Hatupokei oda'}
          </button>
        </section>
        {error && <div role="alert" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: '#fef2f2', color: C.red, fontSize: 14 }}>{error}</div>}
        {!data.hasMenu && (
          <div style={{ marginBottom: 16, padding: 16, borderRadius: 16, background: C.amberSoft, fontSize: 15, lineHeight: 1.45 }}>
            Weka menyu yako kwanza ili wateja waagize.{' '}
            <button type="button" onClick={() => onNavigate('HotelMenuManager', { businessId })}
              style={{ background: 'none', border: 'none', color: C.blue, fontWeight: 700, fontSize: 15, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Weka menyu</button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {cols.map((c) => {
            const list = open.filter((o) => o.status === c.key);
            return (
              <section key={c.key} data-testid={`kitchen-col-${c.key}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: c.color }} />
                  <strong style={{ fontSize: 17 }}>{c.title}</strong>
                  <span style={{ fontSize: 15, color: C.muted, fontWeight: 700 }}>{list.length}</span>
                </div>
                {list.length === 0 && <div style={{ fontSize: 14, color: C.muted, padding: '8px 0' }}>Hakuna</div>}
                {list.map((o) => <Ticket key={o.id} o={o} onStep={step} busy={busy} />)}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
