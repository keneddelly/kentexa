/**
 * PosToday.js — POS part 2 (owner approved 2026-11-03, design "KenteXa POS ya kisasa",
 * board "Zamu"): Leo, Matumizi and Funga zamu, opened from the till's "Leo" button.
 *   Leo        today's POS sales: total, receipts, by payment method, profit on goods, best sellers.
 *   Matumizi   "+ Matumizi" records an expense with its reason (cash ones come off the drawer).
 *   Zamu       open with the starting cash; closing shows what the drawer should hold, takes the
 *              counted cash and shows the difference; the owner gets the report in the app.
 * Every number comes from the server (GET /sales/pos/today).
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const EDGE = '#cfd9de';
const GREEN = '#05603a';
const RED = '#b42318';
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const digits = (v) => String(v ?? '').replace(/[^\d]/g, '');
const METHOD = { cash: 'Taslimu', mpesa: 'M-Pesa', tigo_pesa: 'Tigo Pesa', airtel_money: 'Airtel Money', halopesa: 'HaloPesa', bank: 'Benki', other: 'Nyingine', deni: 'Deni' };

const pill = (dark, disabled) => ({ height: 44, padding: '0 18px', borderRadius: 22, border: dark ? 'none' : `1px solid ${EDGE}`, background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit' });
const input = { height: 44, padding: '0 12px', borderRadius: 8, border: `1px solid ${EDGE}`, fontSize: 16, fontFamily: 'inherit', color: INK, boxSizing: 'border-box', minWidth: 0 };
const Row = ({ label, value, strong, tone }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${LINE}`, fontSize: strong ? 16 : 15 }}>
    <span style={{ color: strong ? INK : MUTED, fontWeight: strong ? 700 : 400 }}>{label}</span>
    <span style={{ fontWeight: strong ? 800 : 700, color: tone || INK }}>{value}</span>
  </div>
);

export default function PosToday({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expReason, setExpReason] = useState('');
  const [addingExp, setAddingExp] = useState(false);
  const [float, setFloat] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [closed, setClosed] = useState(null);

  const load = useCallback(() => {
    Promise.resolve(api.get('/sales/pos/today')).then((r) => setData(r?.data || null))
      .catch((e) => setError(e?.response?.data?.message || 'Haikupakia. Jaribu tena.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); load(); } catch (e) { setError(e?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); } finally { setBusy(false); }
  };
  const addExpense = () => run(async () => {
    await api.post('/sales/pos/expenses', { amount: Number(digits(expAmount)), reason: expReason.trim() });
    setExpAmount(''); setExpReason(''); setAddingExp(false);
  });
  const openShift = () => run(async () => { await api.post('/sales/pos/shifts/open', { openingFloat: Number(digits(float) || 0) }); setFloat(''); setClosed(null); });
  const closeShift = () => run(async () => {
    const r = await api.post('/sales/pos/shifts/close', { countedCash: Number(digits(counted)), note: note.trim() || undefined });
    setClosed(r?.data || null); setCounted(''); setNote('');
  });

  const shift = data?.shift;
  const countedNum = digits(counted) === '' ? null : Number(digits(counted));
  const liveDiff = shift && countedNum != null ? countedNum - shift.expected : null;
  const diffText = (d) => (d === 0 ? 'Sawa kabisa' : d < 0 ? `Pungufu ${tzs(-d)}` : `Ziada ${tzs(d)}`);

  return (
    <div role="dialog" aria-label="Leo na zamu" data-testid="pos-today"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,20,25,0.4)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 520, height: '100%', overflowY: 'auto', background: '#fff', color: INK, boxSizing: 'border-box',
        padding: '16px max(16px, env(safe-area-inset-right)) 32px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Leo</h2>
          <button type="button" onClick={onClose} style={pill(false)}>Funga</button>
        </div>
        {error && <p role="alert" style={{ margin: 0, color: RED, fontSize: 14 }}>{error}</p>}
        {!data ? <p style={{ margin: 0, color: MUTED }}>Inapakia…</p> : (
          <>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 14, color: MUTED }}>Mauzo leo · risiti {data.receipts}</span>
              <span data-testid="pos-today-total" style={{ fontSize: 32, fontWeight: 800 }}>{tzs(data.total)}</span>
              {data.profit != null && <span style={{ fontSize: 14, color: GREEN, fontWeight: 700 }}>Faida ya bidhaa: {tzs(data.profit)}</span>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {Object.entries(data.byMethod || {}).map(([m, a]) => (
                  <span key={m} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '6px 10px', fontSize: 14 }}>
                    <b>{METHOD[m] || m}</b> {tzs(a)}
                  </span>
                ))}
              </div>
            </section>

            {data.ready && (
              <section style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Matumizi ya leo</h3>
                  {!addingExp && <button type="button" data-testid="pos-add-expense" onClick={() => setAddingExp(true)} style={{ ...pill(false), height: 36 }}>+ Matumizi</button>}
                </div>
                {addingExp && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input aria-label="Matumizi ya nini" placeholder="Ya nini? mf. usafiri wa mzigo" value={expReason} onChange={(e) => setExpReason(e.target.value)} style={{ ...input, flex: '2 1 180px' }} />
                    <input aria-label="Kiasi" inputMode="numeric" placeholder="Kiasi" value={expAmount ? Number(digits(expAmount)).toLocaleString('en-US') : ''}
                      onChange={(e) => setExpAmount(digits(e.target.value))} style={{ ...input, flex: '1 1 110px' }} />
                    <button type="button" onClick={addExpense} disabled={busy} style={pill(true, busy)}>Weka</button>
                    <button type="button" onClick={() => setAddingExp(false)} style={pill(false)}>Ghairi</button>
                  </div>
                )}
                {data.expenses.length === 0 ? <span style={{ fontSize: 14, color: MUTED }}>Hakuna matumizi leo.</span>
                  : data.expenses.map((e) => <Row key={e.id} label={e.reason} value={tzs(e.amount)} />)}
              </section>
            )}

            {data.ready && (
              <section data-testid="pos-shift" style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Zamu yako</h3>
                {closed && (
                  <div data-testid="pos-shift-closed" style={{ background: closed.difference === 0 ? '#ecfdf3' : '#fffbeb', borderRadius: 12, padding: 12, fontSize: 15 }}>
                    Zamu imefungwa. Droo: {tzs(closed.expected)}, umehesabu {tzs(closed.counted)}. <b>{diffText(closed.difference)}</b>. Ripoti imetumwa kwa mmiliki.
                  </div>
                )}
                {!shift ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input aria-label="Pesa ya kuanzia" inputMode="numeric" placeholder="Pesa ya kuanzia kwenye droo" value={float ? Number(digits(float)).toLocaleString('en-US') : ''}
                      onChange={(e) => setFloat(digits(e.target.value))} style={{ ...input, flex: '1 1 200px' }} />
                    <button type="button" data-testid="pos-open-shift" onClick={openShift} disabled={busy} style={pill(true, busy)}>Fungua zamu</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <Row label="Pesa ya kuanzia" value={tzs(shift.openingFloat)} />
                      <Row label="+ Taslimu ya mauzo" value={tzs(shift.cashSales)} />
                      {shift.cashDebtPayments > 0 && <Row label="+ Madeni yaliyolipwa kwa taslimu" value={tzs(shift.cashDebtPayments)} />}
                      <Row label="− Matumizi" value={tzs(shift.cashExpenses)} />
                      <Row label="Droo inatakiwa kuwa na" value={tzs(shift.expected)} strong />
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600 }}>
                      Umehesabu taslimu kiasi gani?
                      <input data-testid="pos-counted" inputMode="numeric" value={counted ? Number(digits(counted)).toLocaleString('en-US') : ''}
                        onChange={(e) => setCounted(digits(e.target.value))} style={input} />
                    </label>
                    {liveDiff != null && (
                      <span data-testid="pos-diff" style={{ fontSize: 15, fontWeight: 700, color: liveDiff === 0 ? GREEN : RED }}>{diffText(liveDiff)}</span>
                    )}
                    {liveDiff != null && liveDiff !== 0 && (
                      <input aria-label="Maelezo" placeholder="Maelezo (si lazima)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} style={input} />
                    )}
                    <button type="button" data-testid="pos-close-shift" onClick={closeShift} disabled={busy || countedNum == null} style={pill(true, busy || countedNum == null)}>
                      Funga zamu na tuma ripoti kwa mmiliki
                    </button>
                  </>
                )}
              </section>
            )}

            {data.top?.length > 0 && (
              <section style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Zinazouzwa zaidi leo</h3>
                {data.top.map((t) => <Row key={t.name} label={t.name} value={t.qty} />)}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
