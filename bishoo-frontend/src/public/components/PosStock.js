/**
 * PosStock.js — POS part 3 "Stoo" (owner approved 2026-11-03, design "KenteXa POS ya kisasa").
 *   Pokea mzigo   the supplier, the items (search or barcode) with quantity and cost price; stock
 *                 goes up and the cost price is kept; "Bado sijamlipa msambazaji" makes a supplier
 *                 debt (shown in Madeni).
 *   Hesabu stoo   type the real count; the difference is saved with a reason.
 *   Zinakaribia kuisha   items running low, with what sold in 7 days.
 * One stock for the till and the online shop (the server changes it through InventoryService).
 */
import React, { useEffect, useMemo, useState } from 'react';
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
const pill = (dark, disabled) => ({ height: 44, padding: '0 18px', borderRadius: 22, border: dark ? 'none' : `1px solid ${EDGE}`, background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit' });
const input = { height: 44, padding: '0 12px', borderRadius: 8, border: `1px solid ${EDGE}`, fontSize: 16, fontFamily: 'inherit', color: INK, boxSizing: 'border-box', minWidth: 0, width: '100%' };

/** Search by name, SKU or barcode (a scanner types the code and presses Enter). */
export const findProducts = (products, q) => {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  return (products || []).filter((p) => String(p.name || '').toLowerCase().includes(s) || String(p.sku || '').toLowerCase() === s || String(p.barcode || '') === s).slice(0, 8);
};

export default function PosStock({ products = [], onClose, onStockChanged }) {
  const [tab, setTab] = useState('receive');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  // Pokea mzigo
  const [supplier, setSupplier] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState('');
  const [unpaid, setUnpaid] = useState(false);
  // Hesabu stoo
  const [counts, setCounts] = useState({});
  const [reason, setReason] = useState('');
  const [cq, setCq] = useState('');

  const load = () => Promise.resolve(api.get('/sales/pos/stock')).then((r) => setInfo(r?.data || null)).catch(() => setInfo(null));
  useEffect(() => { load(); }, []);

  const hits = useMemo(() => findProducts(products, q), [products, q]);
  const addLine = (p) => {
    setLines((cur) => (cur.some((l) => l.productId === p.id) ? cur : [...cur, { productId: p.id, name: p.name, qty: '1', unitCost: p.costPrice ? String(Math.round(p.costPrice)) : '' }]));
    setQ('');
  };
  const total = lines.reduce((t, l) => t + (Number(digits(l.qty)) || 0) * (Number(digits(l.unitCost)) || 0), 0);

  const receive = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      const items = lines.map((l) => ({ productId: l.productId, qty: Number(digits(l.qty)), unitCost: Number(digits(l.unitCost)) || 0 }));
      await api.post('/sales/pos/stock/receive', { supplierName: supplier.trim() || undefined, supplierPhone: supplierPhone.trim() || undefined, items, unpaid });
      onStockChanged?.(items.map((i) => ({ productId: i.productId, delta: i.qty })));
      setDone(`Mzigo umeongezwa kwenye stoo (${tzs(total)}).${unpaid ? ' Deni la msambazaji limewekwa kwenye Madeni.' : ''}`);
      setLines([]); setUnpaid(false); load();
    } catch (e) { setError(e?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); } finally { setBusy(false); }
  };

  const countList = useMemo(() => {
    const s = cq.trim().toLowerCase();
    return (products || []).filter((p) => !s || String(p.name || '').toLowerCase().includes(s) || String(p.barcode || '') === s).slice(0, 60);
  }, [products, cq]);
  const changed = Object.entries(counts).filter(([id, v]) => v !== '' && Number(v) !== Number(products.find((p) => String(p.id) === id)?.stock));
  const saveCount = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      const items = changed.map(([id, v]) => ({ productId: Number(id), counted: Number(v) }));
      const r = await api.post('/sales/pos/stock/count', { items, reason: reason.trim() });
      onStockChanged?.(items.map((i) => ({ productId: i.productId, stock: i.counted })));
      setDone(`Stoo imesahihishwa: bidhaa ${r?.data?.changed ?? items.length}.`);
      setCounts({}); setReason(''); load();
    } catch (e) { setError(e?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); } finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-label="Stoo" data-testid="pos-stock"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,20,25,0.4)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 560, height: '100%', overflowY: 'auto', background: '#fff', color: INK, boxSizing: 'border-box',
        padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Stoo</h2>
          <button type="button" onClick={onClose} style={pill(false)}>Funga</button>
        </div>
        {info && !info.ready && <p style={{ margin: 0, color: MUTED }}>Stoo bado haijawashwa.</p>}
        <nav role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}` }}>
          {[['receive', 'Pokea mzigo'], ['count', 'Hesabu stoo'], ['low', `Zinakaribia kuisha${info?.low?.length ? ` ${info.low.length}` : ''}`]].map(([k, l]) => {
            const on = tab === k;
            return (
              <button key={k} type="button" role="tab" aria-selected={on} onClick={() => { setTab(k); setError(''); setDone(''); }}
                style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0 0', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', fontSize: 14, fontWeight: on ? 800 : 600, color: on ? INK : MUTED }}>
                {l}<span style={{ marginTop: 10, height: 4, width: 40, borderRadius: 2, background: on ? BLUE : 'transparent' }} />
              </button>
            );
          })}
        </nav>
        {error && <p role="alert" style={{ margin: 0, color: RED, fontSize: 14 }}>{error}</p>}
        {done && <p role="status" style={{ margin: 0, color: GREEN, fontSize: 14, fontWeight: 700 }}>{done}</p>}

        {tab === 'receive' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input aria-label="Msambazaji" list="pos-suppliers" placeholder="Msambazaji (mf. Bakhresa)" value={supplier} onChange={(e) => setSupplier(e.target.value)} style={input} />
            <datalist id="pos-suppliers">{(info?.suppliers || []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
            <input aria-label="Simu ya msambazaji" inputMode="tel" placeholder="Simu ya msambazaji (si lazima)" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} style={input} />
            <input aria-label="Tafuta bidhaa" data-testid="stock-search" placeholder="+ Piga barcode au tafuta bidhaa" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); addLine(hits[0]); } }} style={input} />
            {hits.length > 0 && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12 }}>
                {hits.map((p) => (
                  <button key={p.id} type="button" data-testid={`stock-hit-${p.id}`} onClick={() => addLine(p)}
                    style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '10px 12px', border: 'none', borderBottom: `1px solid ${LINE}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, color: INK }}>
                    <span>{p.name}</span><span style={{ color: MUTED }}>Ipo {p.stock}</span>
                  </button>
                ))}
              </div>
            )}
            {lines.map((l, i) => (
              <div key={l.productId} data-testid={`stock-line-${l.productId}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1.3fr) auto', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                <input aria-label={`Idadi ya ${l.name}`} inputMode="numeric" value={l.qty} onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, qty: digits(e.target.value) } : x)))} style={input} />
                <input aria-label={`Bei ya kununua ${l.name}`} inputMode="numeric" placeholder="Bei ya kununua" value={l.unitCost ? Number(l.unitCost).toLocaleString('en-US') : ''}
                  onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, unitCost: digits(e.target.value) } : x)))} style={input} />
                <button type="button" aria-label={`Ondoa ${l.name}`} onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))} style={{ ...pill(false), height: 36, padding: '0 12px' }}>×</button>
              </div>
            ))}
            {lines.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
                  <span>Jumla ya mzigo</span><span data-testid="stock-total">{tzs(total)}</span>
                </div>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}>
                  <input type="checkbox" checked={unpaid} disabled={!supplier.trim()} onChange={(e) => setUnpaid(e.target.checked)} />
                  Bado sijamlipa msambazaji (deni langu)
                </label>
                <button type="button" data-testid="stock-receive" onClick={receive} disabled={busy || lines.some((l) => !(Number(l.qty) > 0))} style={pill(true, busy)}>Ongeza kwenye stoo</button>
              </>
            )}
          </section>
        )}

        {tab === 'count' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input aria-label="Tafuta bidhaa ya kuhesabu" placeholder="Tafuta bidhaa" value={cq} onChange={(e) => setCq(e.target.value)} style={input} />
            {countList.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${LINE}` }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{p.name}<span style={{ color: MUTED }}> · imeandikwa {p.stock}</span></span>
                <input aria-label={`Umehesabu ${p.name}`} inputMode="numeric" placeholder="Umehesabu" value={counts[p.id] ?? ''}
                  onChange={(e) => setCounts((c) => ({ ...c, [p.id]: digits(e.target.value) }))} style={{ ...input, width: 110 }} />
              </div>
            ))}
            {changed.length > 0 && (
              <>
                <input aria-label="Sababu ya tofauti" placeholder="Sababu ya tofauti (mf. zimeharibika, hesabu ya mwezi)" value={reason} onChange={(e) => setReason(e.target.value)} style={input} />
                <button type="button" data-testid="stock-count-save" onClick={saveCount} disabled={busy} style={pill(true, busy)}>Hifadhi hesabu ({changed.length})</button>
              </>
            )}
          </section>
        )}

        {tab === 'low' && (
          <section style={{ display: 'flex', flexDirection: 'column' }}>
            {!info?.low?.length ? <p style={{ margin: 0, color: MUTED }}>Hakuna bidhaa inayokaribia kuisha.</p> : info.low.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: `1px solid ${LINE}`, fontSize: 15 }}>
                <span>{p.name}<span style={{ color: MUTED }}> · zimeuzwa {p.sold7} wiki hii</span></span>
                <b style={{ color: p.stock === 0 ? RED : INK }}>Zimebaki {p.stock}</b>
              </div>
            ))}
          </section>
        )}
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Stoo ni moja kwa duka na KenteXa: bidhaa ikiuzwa mtandaoni au kaunta, idadi inapungua mahali pamoja.</p>
      </div>
    </div>
  );
}
