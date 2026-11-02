/**
 * PosSalesToShip.js — POS sales waiting to be sent, at the top of the seller's orders
 * (owner approved 2026-11-02: "the POS orders that need shipping are not seen on seller
 * orders"; choice "COD + marked Itatumwa"). Every pay-on-delivery sale and every sale
 * marked "Itatumwa kwa mteja" with no shipment yet; "Tuma" opens the send form already
 * filled, exactly like "Tuma mzigo kwa mteja" on the POS receipt. Nothing to send = hidden.
 *
 * PosSalesList (owner 2026-11-02: "all orders made should be seen on my orders even from
 * POS"): the "POS" view of Maagizo, every recent POS sale with how it was paid and whether
 * it was sent, is waiting to be sent, or was taken at the shop.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e6ebef';
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const when = (d) => (d ? new Date(d).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/** The send form's prefill for a sale (the same shape the POS receipt uses). */
export const shipPrefillFor = (s) => ({
  name: s.customerName || '', phone: s.customerPhone || '', saleId: s.id, isCod: !!s.isCod, balanceDue: Number(s.balanceDue || 0),
  items: (s.items || []).map((i) => ({ name: i.productName, qty: i.quantity, price: Number(i.unitPrice), weight: 0, productId: i.productId, classifiedId: null, source: 'product' })),
});

export default function PosSalesToShip({ onNavigate, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.resolve(api.get('/sales/to-ship')).then((r) => { if (alive) setRows(Array.isArray(r?.data) ? r.data : []); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  if (!rows.length) return null;
  return (
    <section data-testid="pos-to-ship" style={{ maxWidth: 720, margin: '0 auto', padding: '12px 16px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: MUTED, letterSpacing: '0.04em' }}>KUTOKA POS · INASUBIRI KUTUMWA ({rows.length})</div>
      {rows.map((s) => (
        <div key={s.id} data-testid={`pos-to-ship-${s.id}`}
          style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <strong style={{ fontSize: 15, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.customerName || 'Mteja'}{s.customerPhone ? ` · ${s.customerPhone}` : ''}
            </strong>
            <span style={{ fontSize: 13, color: MUTED }}>
              {s.receiptNumber} · {tzs(s.total)} · {s.isCod ? `Atalipa akipokea ${tzs(s.balanceDue)}` : 'Imelipwa'} · {when(s.createdAt)}
            </span>
          </div>
          <button type="button" data-testid={`pos-ship-${s.id}`} onClick={() => onNavigate('SellerShipment', shipPrefillFor(s))}
            style={{ flexShrink: 0, height: 36, padding: '0 16px', borderRadius: 18, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Tuma
          </button>
        </div>
      ))}
    </section>
  );
}

const paidLine = (s) => {
  const due = Number(s.balanceDue || 0);
  if (s.isCod) return due > 0 ? `Atalipa akipokea ${tzs(due)}` : 'Amelipa alipopokea';
  return due > 0 ? `Deni ${tzs(due)}` : 'Imelipwa';
};

/** Every recent POS sale (GET /sales) with its delivery state; waiting ones can be sent from here. */
export function PosSalesList({ onNavigate }) {
  const [rows, setRows] = useState(null);
  const [waiting, setWaiting] = useState(new Set());
  useEffect(() => {
    let alive = true;
    Promise.all([
      Promise.resolve(api.get('/sales', { params: { limit: 50 } })).then((r) => (Array.isArray(r?.data) ? r.data : [])).catch(() => []),
      Promise.resolve(api.get('/sales/to-ship')).then((r) => (Array.isArray(r?.data) ? r.data : [])).catch(() => []),
    ]).then(([all, toShip]) => {
      if (!alive) return;
      setRows(all);
      setWaiting(new Set(toShip.map((x) => Number(x.id))));
    });
    return () => { alive = false; };
  }, []);

  if (rows === null) return <div style={{ padding: '32px 16px', color: MUTED, fontSize: 15, textAlign: 'center' }}>Inapakia mauzo ya POS...</div>;
  if (!rows.length) return <div style={{ padding: '48px 24px', textAlign: 'center', color: MUTED, fontSize: 15 }}>Bado hakuna mauzo ya POS.</div>;
  return (
    <ul data-testid="pos-sales" style={{ listStyle: 'none', margin: 0, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((s) => {
        const voided = s.status === 'voided';
        const sent = !!s.shipmentTrackingNumber;
        const wait = !voided && !sent && waiting.has(Number(s.id));
        const state = voided ? 'Imefutwa' : sent ? `Imetumwa · ${s.shipmentTrackingNumber}` : wait ? 'Inasubiri kutumwa' : 'Amechukua dukani';
        return (
          <li key={s.id} data-testid={`pos-sale-${s.id}`}
            style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 12, opacity: voided ? 0.6 : 1 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 15, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.customerName || 'Mteja wa dukani'}</strong>
                <strong style={{ fontSize: 15, color: INK, whiteSpace: 'nowrap' }}>{tzs(s.total)}</strong>
              </div>
              <span style={{ fontSize: 13, color: MUTED }}>
                {(s.items || []).map((i) => `${i.productName}${Number(i.quantity) > 1 ? ` x${i.quantity}` : ''}`).join(', ') || s.receiptNumber}
              </span>
              <span style={{ fontSize: 13, color: wait ? '#b54708' : MUTED, fontWeight: wait ? 700 : 400 }}>
                {s.receiptNumber} · {paidLine(s)} · {state} · {when(s.createdAt)}
              </span>
            </div>
            {wait && (
              <button type="button" data-testid={`pos-sale-ship-${s.id}`} onClick={() => onNavigate('SellerShipment', shipPrefillFor(s))}
                style={{ flexShrink: 0, height: 36, padding: '0 16px', borderRadius: 18, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Tuma
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
