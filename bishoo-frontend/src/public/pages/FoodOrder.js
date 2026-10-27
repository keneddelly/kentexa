/**
 * FoodOrder.js — a customer's food order at a hotel (approved mockup "KenteXa Hoteli", board 3,
 * owner 2026-10-27). With no orderId it lists the customer's food orders.
 *
 * The steps come from the hotel's kitchen; the waiting time shown is the one the hotel chose
 * when it accepted the order (KenteXa never guesses it). A Lipa Namba order shows the hotel's
 * number and takes the payment screenshot here; the hotel confirms it.
 */
import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';
import { PageLoading } from '../components/Loading';
import { ProofUpload } from '../components/DirectPayment';
import { tzs, foodStatusTitle, foodPaymentLine, FOOD_COLORS as C } from '../../utils/food';

const OPEN = ['new', 'cooking', 'ready'];
const time = (at) => (at ? new Date(at).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : '');

function Step({ state, title, at, last }) {
  const done = state === 'done';
  const now = state === 'now';
  return (
    <li style={{ display: 'flex', gap: 14 }}>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {done ? (
          <span style={{ width: 28, height: 28, borderRadius: 14, background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
          </span>
        ) : now ? (
          <span style={{ width: 28, height: 28, borderRadius: 14, background: C.blue, boxShadow: '0 0 0 5px #dbeafe' }} />
        ) : (
          <span style={{ width: 28, height: 28, borderRadius: 14, border: `3px solid ${C.border}`, boxSizing: 'border-box' }} />
        )}
        {!last && <span style={{ width: 3, height: 30, background: done ? C.green : C.border }} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', paddingTop: 4 }}>
        <strong style={{ fontSize: 15, color: done || now ? C.ink : C.muted }}>{title}</strong>
        {at && <span style={{ fontSize: 13, color: C.muted }}>{time(at)}</span>}
      </span>
    </li>
  );
}

function OrdersList({ onNavigate }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/food/orders/mine').then((r) => setRows(r.data || [])).catch(() => setRows([])); }, []);
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: C.ink }}>
      <BackBar onBack={() => onNavigate('back')} title="Oda za chakula" top={0} />
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {rows === null && <PageLoading label="Inapakia oda zako" />}
        {rows && rows.length === 0 && <div style={{ padding: '48px 24px', textAlign: 'center', color: C.muted, fontSize: 15 }}>Bado hujaagiza chakula.</div>}
        {(rows || []).map((o) => (
          <button key={o.id} type="button" data-testid={`food-order-row-${o.id}`} onClick={() => onNavigate(`FoodOrder-${o.id}`)}
            style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', border: 'none', borderBottom: `1px solid ${C.line}`,
              background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: C.ink }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ fontSize: 15 }}>{o.hotelName}</strong>
              <span style={{ fontSize: 13, color: C.muted }}>{o.code} · {o.place} · {foodStatusTitle(o)}</span>
            </span>
            <strong style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{tzs(o.total)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FoodOrder({ orderId, onNavigate, isLoggedIn }) {
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  const load = () => api.get(`/food/orders/${orderId}`)
    .then((r) => { setOrder(r.data); setLoadError(''); })
    .catch((err) => setLoadError(err?.response?.data?.message || 'Oda haikupatikana.'));

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return undefined; }
    if (!orderId) return undefined;
    load();
    return () => clearInterval(timer.current);
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the kitchen while the order is open.
  useEffect(() => {
    clearInterval(timer.current);
    if (order && OPEN.includes(order.status)) timer.current = setInterval(load, 20000);
    return () => clearInterval(timer.current);
  }, [order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!orderId) return <OrdersList onNavigate={onNavigate} />;
  if (loadError) return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title="Oda" top={0} />
      <div role="alert" style={{ padding: '48px 24px', textAlign: 'center', color: C.muted, fontSize: 15 }}>{loadError}</div>
    </div>
  );
  if (!order) return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <BackBar onBack={() => onNavigate('back')} title="Oda" top={0} />
      <PageLoading label="Inapakia oda" />
    </div>
  );

  const hotel = order.hotel || {};
  const sendProof = async () => {
    if (!proof?.proofId) return;
    setBusy(true); setError('');
    try {
      const r = await api.post(`/food/orders/${order.id}/lipa-proof`, { proofRef: proof.proofId });
      setOrder((o) => ({ ...o, ...r.data }));
      setProof(null);
    } catch (err) { setError(err?.response?.data?.message || 'Picha haikutumwa. Jaribu tena.'); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true); setError('');
    try { const r = await api.post(`/food/orders/${order.id}/cancel`); setOrder((o) => ({ ...o, ...r.data })); }
    catch (err) { setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); } finally { setBusy(false); }
  };

  const ended = ['rejected', 'cancelled'].includes(order.status);
  const rank = { new: 0, cooking: 1, ready: 2, done: 3 }[order.status] ?? -1;
  const st = (i) => (rank > i || order.status === 'done' ? 'done' : rank === i ? 'now' : 'todo');
  const lastTitle = order.mode === 'pickup' ? 'Umechukua chakula'
    : order.mode === 'delivery' ? 'Umeletewa na wakala' : `Umeletewa ${order.placeType === 'room' ? 'chumbani' : 'mezani'}`;
  const isDelivery = order.mode === 'delivery';
  const toPay = Number(order.total || 0) + (isDelivery ? Number(order.deliveryFee || 0) : 0);
  const needsProof = order.paymentMethod === 'lipa_namba' && ['pending', 'rejected'].includes(order.paymentStatus) && !ended;

  let sub = null;
  if (order.status === 'new') sub = 'Jikoni wataona oda yako sasa hivi.';
  if (order.status === 'cooking' && order.readyInMinutes) sub = `Jikoni wamesema: tayari baada ya dakika ${order.readyInMinutes}.`;
  if (order.status === 'ready') sub = order.mode === 'pickup' ? 'Pita hotelini kuchukua.' : isDelivery ? 'Wakala anakileta. Mlipe ukipokea.' : `Kinaletwa ${order.place}.`;
  if (order.status === 'rejected') sub = order.rejectReason;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: C.ink, paddingBottom: 32 }}>
      <BackBar onBack={() => onNavigate('back')} title={`Oda ${order.code}`} top={0} />
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <section style={{ padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 14, color: C.muted }}>{hotel.name} · {isDelivery ? 'Letewa' : order.place}</span>
          <strong data-testid="food-status" style={{ fontSize: 30, lineHeight: 1.15, color: order.status === 'rejected' ? C.red : C.ink }}>{foodStatusTitle(order)}</strong>
          {sub && <span style={{ fontSize: 16 }}>{sub}</span>}
          {order.status === 'cooking' && order.readyInMinutes && <span style={{ fontSize: 13, color: C.muted }}>Muda huu umewekwa na hoteli ilipopokea oda.</span>}
        </section>

        {!ended && (
          <ol style={{ listStyle: 'none', margin: 0, padding: '0 16px 20px' }}>
            <Step state={st(0)} title="Oda imetumwa" at={order.createdAt} />
            <Step state={st(1)} title="Inapikwa" at={order.acceptedAt} />
            <Step state={st(2)} title="Tayari" at={order.readyAt} />
            <Step state={order.status === 'done' ? 'done' : 'todo'} title={lastTitle} at={order.doneAt} last />
          </ol>
        )}

        {isDelivery && (
          <section data-testid="food-delivery-box" style={{ margin: '0 16px 12px', padding: 16, borderRadius: 16, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>Inaletwa</span>
            <strong style={{ fontSize: 15 }}>{order.deliveryAddress}</strong>
            <span style={{ fontSize: 14, color: C.muted }}>Usafiri {tzs(order.deliveryFee)} · bei ya KenteXa</span>
            {order.trackingNumber && (
              <button type="button" onClick={() => onNavigate(`TrackParcel-${order.trackingNumber}`)}
                style={{ alignSelf: 'flex-start', height: 40, padding: '0 16px', borderRadius: 20, border: `1px solid ${C.border}`, background: '#fff', color: C.ink,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Fuatilia wakala · {order.trackingNumber}</button>
            )}
            {!order.trackingNumber && order.status === 'cooking' && <span style={{ fontSize: 13, color: C.muted }}>Tunamtafuta wakala wa karibu.</span>}
          </section>
        )}

        <section data-testid="food-payment" style={{ margin: '0 16px', padding: 16, borderRadius: 16, background: needsProof ? '#f7f9f9' : C.amberSoft, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>Malipo</span>
          <strong style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{tzs(toPay)}</strong>
          {isDelivery && <span style={{ fontSize: 13, color: C.muted }}>Chakula {tzs(order.total)} + usafiri {tzs(order.deliveryFee)}</span>}
          <span style={{ fontSize: 14, color: C.muted }}>{foodPaymentLine(order, false)}</span>
          {order.paymentStatus === 'rejected' && order.paymentNote && <span style={{ fontSize: 14, color: C.red }}>{order.paymentNote}</span>}
          {needsProof && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Lipa Namba ya {hotel.name}</span>
              <strong data-testid="food-lipa-namba" style={{ fontSize: 28, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>{order.lipaNamba || '—'}</strong>
              {order.lipaNambaName && <span style={{ fontSize: 14 }}>{order.lipaNambaName}</span>}
              <ProofUpload value={proof?.preview} onChange={setProof} testId="food-proof" />
              <button type="button" onClick={sendProof} disabled={!proof?.proofId || busy}
                style={{ height: 48, borderRadius: 24, border: 'none', background: proof?.proofId ? C.blue : '#94a3b8', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Tuma picha ya malipo
              </button>
            </div>
          )}
        </section>

        <section style={{ padding: '20px 16px 0' }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>Ulichoagiza</span>
          {(order.items || []).map((i) => (
            <div key={i.itemId} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.line}`, fontSize: 15 }}>
              <span>{i.qty} × {i.name}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{tzs(i.price * i.qty)}</span>
            </div>
          ))}
          {order.note && <div style={{ paddingTop: 10, fontSize: 14, color: C.muted }}>Maelekezo: {order.note}</div>}
        </section>

        {error && <div role="alert" style={{ padding: '12px 16px 0', fontSize: 14, color: C.red }}>{error}</div>}

        <div style={{ padding: '20px 16px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hotel.ownerId && (
            <button type="button" onClick={() => onNavigate(`MessageSeller-${hotel.ownerId}`, hotel.commerceProfileId ? { commerceProfileId: hotel.commerceProfileId } : undefined)}
              style={{ flex: 1, height: 48, borderRadius: 24, border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Ujumbe</button>
          )}
          {hotel.phone && (
            <a href={`tel:${hotel.phone}`} style={{ flex: 1, height: 48, borderRadius: 24, border: `1px solid ${C.border}`, color: C.ink, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>Piga simu</a>
          )}
          {order.status === 'new' && (
            <button type="button" data-testid="food-cancel" onClick={cancel} disabled={busy}
              style={{ flex: 1, height: 48, borderRadius: 24, border: `1px solid ${C.border}`, background: '#fff', color: C.red, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Ghairi oda</button>
          )}
        </div>

        <section style={{ margin: '24px 16px 0', padding: 16, borderRadius: 16, border: `1px solid ${C.line}`, display: 'flex', gap: 12, alignItems: 'center' }}>
          {hotel.logo
            ? <img src={hotel.logo} alt="" style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover' }} />
            : <span style={{ width: 44, height: 44, borderRadius: 22, background: '#7c2d12', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
                {String(hotel.name || 'H').charAt(0).toUpperCase()}</span>}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <strong style={{ fontSize: 15 }}>{hotel.name}</strong>
            <span style={{ fontSize: 13, color: C.muted }}>Agiza tena au tembelea ukurasa wa hoteli</span>
          </span>
          <button type="button" onClick={() => onNavigate(`HotelMenu-${order.businessId}`)}
            style={{ height: 40, padding: '0 16px', borderRadius: 20, background: C.ink, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Menyu</button>
        </section>
      </div>
    </div>
  );
}
