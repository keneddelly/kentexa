/**
 * PosDebts.js — POS part 3 "Madeni" (owner approved 2026-11-03, design "KenteXa POS ya kisasa").
 *   Wateja        who owes the shop (POS sales on "Deni"), per customer, oldest receipts first;
 *                 "Pokea malipo" (cash or mobile money, part payments allowed); "Mkumbushe" opens the
 *                 shop's own WhatsApp or SMS with a polite message (owner choice: never KenteXa SMS).
 *   Ninadaiwa     what the shop owes its suppliers (goods received "bado sijamlipa"); "Lipa".
 * Every amount comes from GET /sales/pos/debts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const EDGE = '#cfd9de';
const BLUE = '#1d9bf0';
const RED = '#b42318';
const GREEN = '#05603a';
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const digits = (v) => String(v ?? '').replace(/[^\d]/g, '');
const pill = (dark, disabled) => ({ height: 40, padding: '0 16px', borderRadius: 20, border: dark ? 'none' : `1px solid ${EDGE}`, background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontSize: 14, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center' });
const input = { height: 40, padding: '0 12px', borderRadius: 8, border: `1px solid ${EDGE}`, fontSize: 16, fontFamily: 'inherit', color: INK, boxSizing: 'border-box', minWidth: 0 };
const METHODS = [['cash', 'Taslimu'], ['mpesa', 'M-Pesa'], ['tigo_pesa', 'Tigo Pesa'], ['airtel_money', 'Airtel Money'], ['halopesa', 'HaloPesa'], ['bank', 'Benki']];
const day = (d) => (d ? new Date(d).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' }) : '');

/** The shop's polite reminder: its name and the amount only. */
export const reminderText = (shopName, customerName, owed) =>
  `Habari ${String(customerName || '').split(' ')[0] || ''}, ${shopName || 'duka letu'} linakukumbusha deni la ${tzs(owed)}. Asante kwa kununua kwetu.`.replace(/\s+,/, ',');
export const waPhone = (phone) => {
  let d = digits(phone);
  if (d.startsWith('0')) d = `255${d.slice(1)}`;
  else if (d.length === 9) d = `255${d}`;
  return d.length >= 11 ? d : null;
};

export default function PosDebts({ onClose, shopName }) {
  const [tab, setTab] = useState('customers');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const load = useCallback(() => Promise.resolve(api.get('/sales/pos/debts')).then((r) => setData(r?.data || null))
    .catch((e) => setError(e?.response?.data?.message || 'Haikupakia. Jaribu tena.')), []);
  useEffect(() => { load(); }, [load]);

  const pay = async (kind, target) => {
    setBusy(true); setError(''); setDone('');
    try {
      const body = kind === 'customer' ? { customerKey: target.key, amount: Number(digits(amount)), method } : { supplierId: target.id, amount: Number(digits(amount)), method };
      const r = await api.post(`/sales/pos/debts/${kind}`, body);
      setDone(`Malipo ya ${tzs(r?.data?.paid)} yamepokelewa.${r?.data?.left > 0 ? ` Limebaki ${tzs(r.data.left)}.` : ' Deni limekwisha.'}`);
      setOpen(null); setAmount(''); load();
    } catch (e) { setError(e?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); } finally { setBusy(false); }
  };

  const payForm = (kind, target) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
      <input aria-label="Kiasi kilicholipwa" inputMode="numeric" placeholder="Kiasi" value={amount ? Number(digits(amount)).toLocaleString('en-US') : ''}
        onChange={(e) => setAmount(digits(e.target.value))} style={{ ...input, flex: '1 1 120px' }} />
      <select aria-label="Njia ya malipo" value={method} onChange={(e) => setMethod(e.target.value)} style={{ ...input, flex: '1 1 120px' }}>
        {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <button type="button" data-testid={`debt-pay-${kind}`} disabled={busy || !digits(amount)} onClick={() => pay(kind, target)} style={pill(true, busy || !digits(amount))}>
        {kind === 'customer' ? 'Pokea malipo' : 'Lipa'}
      </button>
    </div>
  );

  return (
    <div role="dialog" aria-label="Madeni" data-testid="pos-debts"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,20,25,0.4)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 560, height: '100%', overflowY: 'auto', background: '#fff', color: INK, boxSizing: 'border-box',
        padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Madeni</h2>
          <button type="button" onClick={onClose} style={pill(false)}>Funga</button>
        </div>
        {data && !data.ready && <p style={{ margin: 0, color: MUTED }}>Madeni bado hayajawashwa.</p>}
        <nav role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}` }}>
          {[['customers', `Wateja wanadaiwa${data ? ` · ${tzs(data.customerTotal)}` : ''}`], ['suppliers', `Ninadaiwa${data ? ` · ${tzs(data.supplierTotal)}` : ''}`]].map(([k, l]) => {
            const on = tab === k;
            return (
              <button key={k} type="button" role="tab" aria-selected={on} onClick={() => { setTab(k); setOpen(null); setDone(''); setError(''); }}
                style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0 0', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', fontSize: 14, fontWeight: on ? 800 : 600, color: on ? INK : MUTED }}>
                {l}<span style={{ marginTop: 10, height: 4, width: 40, borderRadius: 2, background: on ? BLUE : 'transparent' }} />
              </button>
            );
          })}
        </nav>
        {error && <p role="alert" style={{ margin: 0, color: RED, fontSize: 14 }}>{error}</p>}
        {done && <p role="status" style={{ margin: 0, color: GREEN, fontSize: 14, fontWeight: 700 }}>{done}</p>}
        {!data ? <p style={{ margin: 0, color: MUTED }}>Inapakia…</p> : tab === 'customers' ? (
          data.customers.length === 0 ? <p style={{ margin: 0, color: MUTED }}>Hakuna mteja anayedaiwa.</p> : data.customers.map((c) => {
            const isOpen = open === c.key;
            const wa = waPhone(c.phone);
            const text = encodeURIComponent(reminderText(shopName, c.name, c.owed));
            return (
              <div key={c.key} data-testid={`debt-customer-${c.key}`} style={{ borderBottom: `1px solid ${LINE}`, paddingBottom: 12 }}>
                <button type="button" onClick={() => { setOpen(isOpen ? null : c.key); setAmount(''); setDone(''); }}
                  style={{ display: 'flex', gap: 12, width: '100%', border: 'none', background: 'none', padding: '8px 0', cursor: 'pointer', fontFamily: 'inherit', color: INK, textAlign: 'left' }}>
                  <span style={{ width: 40, height: 40, borderRadius: 20, background: '#f7f9f9', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {String(c.name || 'M').charAt(0).toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <b style={{ fontSize: 15 }}>{c.name}</b>
                    <span style={{ fontSize: 13, color: MUTED }}>{[c.phone, `risiti ${c.sales.length} za deni`, `tangu ${day(c.since)}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  <b style={{ fontSize: 15, color: RED, flexShrink: 0 }}>{tzs(c.owed)}</b>
                </button>
                {isOpen && (
                  <div style={{ paddingLeft: 52 }}>
                    {c.sales.map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0', color: MUTED }}>
                        <span>{day(s.at)} · {s.receiptNumber}</span><span style={{ color: INK, fontWeight: 700 }}>{tzs(s.balanceDue)}</span>
                      </div>
                    ))}
                    {payForm('customer', c)}
                    {c.phone && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {wa && <a href={`https://wa.me/${wa}?text=${text}`} target="_blank" rel="noreferrer" style={pill(false)}>Mkumbushe (WhatsApp)</a>}
                        <a href={`sms:${digits(c.phone)}?body=${text}`} style={pill(false)}>Mkumbushe (SMS yako)</a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          data.suppliers.length === 0 ? <p style={{ margin: 0, color: MUTED }}>Hudaiwi na msambazaji yeyote.</p> : data.suppliers.map((s) => (
            <div key={s.id} data-testid={`debt-supplier-${s.id}`} style={{ borderBottom: `1px solid ${LINE}`, paddingBottom: 12 }}>
              <button type="button" onClick={() => { setOpen(open === `s${s.id}` ? null : `s${s.id}`); setAmount(''); setDone(''); }}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', border: 'none', background: 'none', padding: '8px 0', cursor: 'pointer', fontFamily: 'inherit', color: INK, fontSize: 15 }}>
                <span style={{ textAlign: 'left' }}><b>{s.name}</b>{s.phone ? <span style={{ color: MUTED }}> · {s.phone}</span> : null}</span>
                <b>{tzs(s.owed)}</b>
              </button>
              {open === `s${s.id}` && payForm('supplier', s)}
            </div>
          ))
        )}
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Ujumbe wa kukumbusha unaonyesha jina la duka lako na kiasi tu, kwa heshima. Unatumwa kwa WhatsApp au SMS yako.</p>
      </div>
    </div>
  );
}
