/**
 * POS.js — the shop's till (approved mockup "KenteXa POS ya kisasa", boards 1 and 2;
 * owner 2026-10-27: "make it to allow even storing and use offline in desktop").
 *
 * Uza: product tiles with stock, categories, search or scan (a scanner types the code and
 * presses Enter), the customer on the cart, "Weka kando" to put a sale aside.
 * Lipa: split payment (e.g. cash + M-Pesa), "Deni" (the customer owes the rest), or pay on
 * delivery when the goods are shipped; the receipt carries the shop's name and the cashier,
 * and goes by SMS (sent by the server when there is a phone), WhatsApp or the printer.
 *
 * Offline: the products are kept on this computer (utils/posOffline). Without internet a
 * sale is saved here with its own id and the time it happened; it is sent by itself when the
 * internet is back, and the server records it once even if it is sent twice. Installed as an
 * app on the desktop, /pos opens even without internet (public/service-worker.js).
 * The same stock serves the KenteXa shop online and this till.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import FeatureTour from '../../onboarding/FeatureTour';
import TourTrigger from '../../onboarding/TourTrigger';
import { isAppleMobile } from '../utils/isAppleMobile';
import {
  newSaleId, saveSession, loadSession, saveCatalog, loadCatalog, takeFromCatalog,
  enqueueSale, listQueue, syncQueue, dropFailed, parkSale, listParked, unpark,
} from '../../utils/posOffline';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BORDER = '#cfd9de';
const BLUE = '#1d4ed8';
const BLUE_SOFT = '#eff6ff';
const GREEN = '#15803d';
const AMBER = '#b45309';
const RED = '#b91c1c';
const TINTS = ['#fef3c7', '#ecfccb', '#e0f2fe', '#fee2e2', '#ede9fe', '#ffedd5'];
const tzs = (n) => `TZS ${Math.round(Number(n || 0)).toLocaleString('en-US')}`;
const num = (v) => Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0);

export const POS_METHODS = [
  { value: 'cash', label: 'Taslimu' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'tigo_pesa', label: 'Mixx by Yas' },
  { value: 'halopesa', label: 'HaloPesa' },
  { value: 'bank', label: 'Benki' },
];
const methodLabel = (v) => POS_METHODS.find((m) => m.value === v)?.label || v;

/** What is paid, what is left, and the change, for the payment parts on the screen. */
export function payTotals(total, parts) {
  const paid = parts.reduce((s, p) => s + num(p.amount), 0);
  const cash = parts.filter((p) => p.method === 'cash').reduce((s, p) => s + num(p.amount), 0);
  const left = Math.max(0, total - paid);
  // Change only comes out of cash.
  const change = paid > total ? Math.min(cash, paid - total) : 0;
  return { paid, left, change, overNonCash: paid - total > cash };
}

/** The receipt text for WhatsApp (plain, short). */
export function receiptText(r) {
  const lines = [
    `${r.shopName}`,
    `Risiti ${r.receiptNumber}${r.cashier ? ` · ${r.cashier}` : ''}`,
    ...r.items.map((i) => `${i.quantity} x ${i.name}  ${Math.round(i.unitPrice * i.quantity).toLocaleString('en-US')}`),
    `JUMLA ${tzs(r.total)}`,
    ...r.payments.map((p) => `${methodLabel(p.method)} ${tzs(p.amount)}`),
  ];
  if (r.balanceDue > 0) lines.push(`Deni ${tzs(r.balanceDue)}`);
  if (r.change > 0) lines.push(`Chenji ${tzs(r.change)}`);
  lines.push('Asante.');
  return lines.join('\n');
}

const printCss = `@media print {
  body * { visibility: hidden !important; }
  #pos-receipt, #pos-receipt * { visibility: visible !important; }
  #pos-receipt { position: absolute; left: 0; top: 0; width: 58mm; border: none !important; font-size: 11px; }
  .pos-no-print { display: none !important; }
}`;

const chip = (on) => ({
  height: 38, padding: '0 16px', borderRadius: 19, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
  ...(on ? { background: INK, color: '#fff', border: 'none', fontWeight: 700 } : { background: '#fff', color: INK, border: `1px solid ${BORDER}`, fontWeight: 600 }),
});
const pill = { height: 40, padding: '0 14px', borderRadius: 20, border: `1px solid ${BORDER}`, background: '#fff', color: INK,
  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 };
const input = { height: 46, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '0 12px', fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' };

const POS = ({ onNavigate, currentUser, activeProfileId, activeContext, offlineBoot = false, canInstallKentexa, onInstallKentexa }) => {
  const session = useMemo(() => loadSession(), []);
  const shopName = activeContext?.displayName || currentUser?.storeName || currentUser?.name || session?.shopName || 'Duka';
  const cashier = currentUser?.name || session?.cashier || '';
  const [online, setOnline] = useState(() => !offlineBoot && (typeof navigator === 'undefined' || navigator.onLine !== false));
  const [products, setProducts] = useState([]);
  const [catalogAt, setCatalogAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [showCustomer, setShowCustomer] = useState(false);
  const [discount, setDiscount] = useState('');
  const [step, setStep] = useState('cart'); // cart | pay | receipt
  const [parts, setParts] = useState([{ method: 'cash', amount: '' }]);
  const [credit, setCredit] = useState(false);
  const [cod, setCod] = useState(false);
  const [saleId, setSaleId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [queue, setQueue] = useState({ waiting: 0, failed: [] });
  const [parked, setParked] = useState([]);
  const [showParked, setShowParked] = useState(false);
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState(null);
  const syncing = useRef(false);
  const searchRef = useRef(null);

  const isSameTill = useCallback((entry) => !!activeContext
    && Number(entry.userId) === Number(activeContext.userId)
    && Number(entry.accountRoleId) === Number(activeContext.accountRoleId), [activeContext]);

  const refreshQueue = useCallback(async () => {
    const q = await listQueue().catch(() => []);
    setQueue({ waiting: q.filter((e) => e.status !== 'failed').length, failed: q.filter((e) => e.status === 'failed') });
    return q;
  }, []);

  const sendQueue = useCallback(async () => {
    if (syncing.current || !activeContext || offlineBoot) return;
    syncing.current = true;
    try {
      const res = await syncQueue({ post: (body) => api.post('/sales', body), isSameTill });
      if (res.sent) setNotice(`Mauzo ${res.sent} yaliyofanyika bila mtandao yametumwa.`);
      if (res.stoppedOffline) setOnline(false);
    } finally {
      syncing.current = false;
      refreshQueue();
    }
  }, [activeContext, offlineBoot, isSameTill, refreshQueue]);

  // Products: from the server when online (and kept here), else the copy on this computer.
  useEffect(() => {
    let alive = true;
    const fromCache = async () => {
      const c = await loadCatalog().catch(() => ({ products: [] }));
      if (!alive) return;
      setProducts(c.products || []);
      setCatalogAt(c.savedAt);
    };
    (async () => {
      if (online && !offlineBoot) {
        try {
          const r = await api.get('/products/my/products', { params: activeProfileId ? { commerceProfileId: activeProfileId } : {} });
          const list = (r.data || []).filter((p) => p.isActive && p.availableInStore !== false).map((p) => ({
            id: p.id, name: p.name, sku: p.sku || null, barcode: p.barcode || null, category: p.category || p.subcategory || null,
            price: Number(p.displayPrice || 0), stock: Number(p.stock || 0), image: (p.images && p.images[0]) || p.image || null,
          }));
          if (!alive) return;
          setProducts(list);
          setCatalogAt(new Date().toISOString());
          saveCatalog(list).catch(() => {});
          if (activeContext) {
            saveSession({ userId: activeContext.userId, accountRoleId: activeContext.accountRoleId, shopName, cashier });
          }
        } catch (err) {
          if (!err?.response) setOnline(false);
          await fromCache();
        }
      } else {
        await fromCache();
      }
      if (alive) setLoading(false);
    })();
    refreshQueue();
    listParked().then(setParked).catch(() => {});
    if (!isAppleMobile()) searchRef.current?.focus();
    return () => { alive = false; };
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Today's total (online) and sending waiting sales when the internet is back.
  useEffect(() => {
    if (!online || offlineBoot) return undefined;
    Promise.resolve(api.get('/sales/dashboard')).then((r) => setToday(r?.data?.today?.total ?? null)).catch(() => {});
    sendQueue();
    const t = setInterval(sendQueue, 30000);
    return () => clearInterval(t);
  }, [online, offlineBoot, sendQueue]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const cats = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].slice(0, 8), [products]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (!cat || p.category === cat)
      && (!q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q)).slice(0, 60);
  }, [products, query, cat]);

  const addToCart = (p) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.productId === p.id);
      if (ex) return prev.map((i) => (i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { productId: p.id, name: p.name, unitPrice: p.price, stock: p.stock, quantity: 1 }];
    });
    setQuery('');
    if (!isAppleMobile()) searchRef.current?.focus();
  };
  const setQty = (id, q) => setCart((prev) => (q <= 0 ? prev.filter((i) => i.productId !== id) : prev.map((i) => (i.productId === id ? { ...i, quantity: q } : i))));

  // A scanner types the code and presses Enter.
  const onSearchKey = async (e) => {
    if (e.key !== 'Enter') return;
    const code = query.trim().toLowerCase();
    if (!code) return;
    const exact = products.find((p) => p.barcode?.toLowerCase() === code || p.sku?.toLowerCase() === code);
    if (exact) { addToCart(exact); return; }
    if (shown.length === 1) { addToCart(shown[0]); return; }
    if (online) {
      try {
        const r = await api.get('/products/my/lookup', { params: { barcode: query.trim(), sku: query.trim() } });
        if (r.data) { addToCart({ id: r.data.id, name: r.data.name, price: Number(r.data.displayPrice || 0), stock: Number(r.data.stock || 0) }); return; }
      } catch { /* not found below */ }
    }
    setError(`Bidhaa "${query.trim()}" haikupatikana.`);
  };

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const total = Math.max(0, subtotal - num(discount));
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const totals = payTotals(total, parts);

  const startPay = () => {
    if (!cart.length) return;
    setSaleId(newSaleId());
    setParts([{ method: 'cash', amount: String(total) }]);
    setCredit(false); setCod(false); setError('');
    setStep('pay');
  };
  const resetSale = () => {
    setCart([]); setCustomer({ name: '', phone: '' }); setDiscount(''); setParts([{ method: 'cash', amount: '' }]);
    setCredit(false); setCod(false); setReceipt(null); setSaleId(null); setStep('cart'); setError('');
    if (!isAppleMobile()) searchRef.current?.focus();
  };

  const parkNow = async () => {
    if (!cart.length) return;
    await parkSale({ id: newSaleId(), at: new Date().toISOString(), cart, customer, discount });
    setParked(await listParked());
    resetSale();
    setNotice('Mauzo yamewekwa kando.');
  };
  const resume = async (p) => {
    setCart(p.cart || []); setCustomer(p.customer || { name: '', phone: '' }); setDiscount(p.discount || '');
    await unpark(p.id);
    setParked(await listParked());
    setShowParked(false);
  };

  const confirm = async () => {
    setError('');
    const paidParts = parts.filter((p) => num(p.amount) > 0).map((p) => ({ method: p.method, amount: num(p.amount), ...(p.reference ? { reference: p.reference } : {}) }));
    const owes = credit || cod;
    if (owes && (!customer.name.trim() || !customer.phone.trim())) { setError('Deni na kulipa ukipokea vinahitaji jina na simu ya mteja.'); setShowCustomer(true); return; }
    if (!owes && totals.left > 0) { setError(`Bado ${tzs(totals.left)}. Ongeza malipo au chagua Deni.`); return; }
    if (owes && totals.left <= 0) { setError('Amelipa yote: hakuna deni.'); return; }
    if (totals.overNonCash) { setError('Kiasi cha simu au benki kimezidi jumla.'); return; }
    const amountPaid = Math.min(totals.paid, total);
    // The server keeps the parts as paid; change given back is not part of the payment.
    const payments = totals.change > 0
      ? paidParts.map((p) => (p.method === 'cash' ? { ...p, amount: p.amount - totals.change } : p)).filter((p) => p.amount > 0)
      : paidParts;
    const body = {
      channel: 'local_pos', clientSaleId: saleId,
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, lineDiscount: 0 })),
      discountAmount: num(discount),
      paymentMethod: payments[0]?.method || 'cash', amountPaid,
      ...(payments.length ? { payments } : {}),
      ...(credit ? { credit: true } : {}), ...(cod ? { isCod: true } : {}),
      customerName: customer.name.trim() || undefined, customerPhone: customer.phone.trim() || undefined,
    };
    const local = {
      shopName, cashier, items: cart, total, payments, change: totals.change,
      balanceDue: owes ? total - amountPaid : 0, customer, at: new Date().toISOString(),
    };
    const keepOffline = async () => {
      const soldAt = new Date().toISOString();
      await enqueueSale({ clientSaleId: saleId, createdAt: soldAt, body: { ...body, soldAt },
        userId: activeContext?.userId ?? session?.userId, accountRoleId: activeContext?.accountRoleId ?? session?.accountRoleId,
        summary: { total, items: count, customer: customer.name || null } });
      await takeFromCatalog(cart).catch(() => {});
      const c = await loadCatalog().catch(() => null);
      if (c?.products) setProducts(c.products);
      await refreshQueue();
      setReceipt({ ...local, receiptNumber: `NJE-${saleId.slice(0, 6).toUpperCase()}`, offline: true });
      setStep('receipt');
    };
    setSubmitting(true);
    try {
      if (!online || offlineBoot) { await keepOffline(); return; }
      const r = await api.post('/sales', body);
      await takeFromCatalog(cart).catch(() => {});
      setProducts((prev) => prev.map((p) => {
        const l = cart.find((i) => i.productId === p.id);
        return l ? { ...p, stock: Math.max(0, p.stock - l.quantity) } : p;
      }));
      setReceipt({ ...local, receiptNumber: r.data?.receiptNumber, server: r.data, balanceDue: Number(r.data?.balanceDue ?? local.balanceDue) });
      setStep('receipt');
      setToday((t) => (t == null ? t : t + total));
    } catch (err) {
      if (!err?.response) { setOnline(false); await keepOffline(); return; }
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'Mauzo hayakukamilika. Jaribu tena.');
    } finally { setSubmitting(false); }
  };

  const collectBalance = async () => {
    if (!receipt?.server?.id) return;
    try {
      const r = await api.post(`/sales/${receipt.server.id}/collect-cod-balance`);
      setReceipt((x) => ({ ...x, server: r.data, balanceDue: 0 }));
    } catch (err) { setError(err?.response?.data?.message || 'Imeshindikana kupokea salio.'); }
  };
  const shipIt = () => {
    const s = receipt?.server;
    if (!s) return;
    onNavigate('SellerShipment', {
      name: s.customerName || '', phone: s.customerPhone || '', saleId: s.id, isCod: !!s.isCod, balanceDue: Number(s.balanceDue || 0),
      items: (s.items || []).map((i) => ({ name: i.productName, qty: i.quantity, price: Number(i.unitPrice), weight: 0, productId: i.productId, classifiedId: null, source: 'product' })),
    });
  };
  const openHistory = async () => {
    setHistory({ loading: true, rows: [] });
    try { const r = await api.get('/sales'); setHistory({ loading: false, rows: r.data || [] }); } catch { setHistory({ loading: false, rows: [] }); }
  };

  const waPhone = (customer.phone || '').replace(/\D/g, '').replace(/^0/, '255');

  return (
    <div style={{ minHeight: '100vh', background: '#f7f9f9', color: INK, display: 'flex', flexDirection: 'column' }}>
      <style>{printCss}</style>
      <div className="pos-no-print">
        <BackBar title={shopName} onBack={() => (step === 'cart' ? onNavigate('back') : setStep('cart'))} top={0}
          right={offlineBoot ? null : <TourTrigger tourKey="pos_first_sale" />} />
      </div>
      {/* Opened without internet the till runs on its own, outside the app's providers. */}
      {!offlineBoot && <FeatureTour tourKey="pos_first_sale" autoStart />}

      <header className="pos-no-print" style={{ background: '#fff', borderBottom: `1px solid ${LINE}`, padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span data-testid="pos-network" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: online && !offlineBoot ? GREEN : AMBER }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: online && !offlineBoot ? GREEN : AMBER }} />
          {online && !offlineBoot ? 'Mtandao upo' : 'Hakuna mtandao: mauzo yanahifadhiwa kwenye kompyuta hii'}
        </span>
        {queue.waiting > 0 && (
          <button type="button" data-testid="pos-queue" onClick={sendQueue} disabled={!online || offlineBoot} style={{ ...pill, borderColor: AMBER, color: AMBER }}>
            Mauzo {queue.waiting} yanasubiri kutumwa{online && !offlineBoot ? ' · Tuma sasa' : ''}
          </button>
        )}
        {queue.failed.length > 0 && <span style={{ fontSize: 13, color: RED, fontWeight: 700 }}>Mauzo {queue.failed.length} yamekataliwa (angalia chini)</span>}
        <span style={{ flex: 1 }} />
        {today != null && <span style={{ ...pill, cursor: 'default' }}>Leo · {tzs(today)}</span>}
        {online && !offlineBoot && <button type="button" style={pill} onClick={openHistory}>Historia</button>}
        {online && !offlineBoot && <button type="button" style={pill} onClick={() => onNavigate('SellerProducts')}>Stoo</button>}
        {canInstallKentexa && <button type="button" style={{ ...pill, borderColor: BLUE, color: BLUE }} onClick={onInstallKentexa}>Weka kwenye kompyuta</button>}
      </header>

      {(error || notice) && (
        <div className="pos-no-print" role={error ? 'alert' : 'status'} style={{ margin: '10px 16px 0', padding: '10px 14px', borderRadius: 12, fontSize: 14,
          background: error ? '#fef2f2' : '#ecfdf3', color: error ? RED : '#166534', display: 'flex', gap: 10 }}>
          <span style={{ flex: 1 }}>{error || notice}</span>
          <button type="button" aria-label="Funga" onClick={() => { setError(''); setNotice(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit' }}>×</button>
        </div>
      )}
      {queue.failed.length > 0 && (
        <div className="pos-no-print" style={{ margin: '10px 16px 0', padding: 12, borderRadius: 12, background: '#fef2f2', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {queue.failed.map((f) => (
            <div key={f.clientSaleId} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <span style={{ flex: 1 }}>{tzs(f.summary?.total)} · {new Date(f.createdAt).toLocaleString('sw-TZ')} · {f.error}</span>
              <button type="button" style={pill} onClick={async () => { await dropFailed(f.clientSaleId); refreshQueue(); }}>Ondoa</button>
            </div>
          ))}
        </div>
      )}

      {step === 'cart' && (
        <div className="pos-no-print" style={{ flex: 1, display: 'flex', flexWrap: 'wrap', minHeight: 0 }}>
          <section style={{ flex: '999 1 560px', minWidth: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input ref={searchRef} data-tour="pos-search" data-testid="pos-search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey}
              placeholder="Tafuta bidhaa au piga barcode" aria-label="Tafuta bidhaa au piga barcode"
              style={{ ...input, height: 48, borderRadius: 24, padding: '0 18px', background: '#fff', width: '100%' }} />
            {cats.length > 1 && (
              <nav style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                <button type="button" style={chip(!cat)} onClick={() => setCat('')}>Zote</button>
                {cats.map((c) => <button key={c} type="button" style={chip(cat === c)} onClick={() => setCat(c)}>{c}</button>)}
              </nav>
            )}
            {loading && <div style={{ color: MUTED, padding: 24 }}>Inapakia bidhaa</div>}
            {!loading && products.length === 0 && (
              <div style={{ color: MUTED, padding: 24, lineHeight: 1.5 }}>
                {online && !offlineBoot ? 'Bado huna bidhaa za kuuza dukani. Ongeza bidhaa kwenye Stoo.' : 'Hakuna bidhaa zilizohifadhiwa kwenye kompyuta hii. Fungua POS ikiwa na mtandao mara moja.'}
              </div>
            )}
            {(!online || offlineBoot) && catalogAt && <span style={{ fontSize: 12, color: MUTED }}>Bidhaa na idadi kama zilivyokuwa {new Date(catalogAt).toLocaleString('sw-TZ')}</span>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {shown.map((p, i) => (
                <button key={p.id} type="button" data-testid={`pos-product-${p.id}`} onClick={() => addToCart(p)}
                  style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left',
                    cursor: 'pointer', fontFamily: 'inherit', color: INK, minHeight: 132 }}>
                  {p.image
                    ? <img src={p.image} alt="" style={{ height: 56, width: '100%', objectFit: 'cover', borderRadius: 10 }} />
                    : <span style={{ height: 56, borderRadius: 10, background: TINTS[i % TINTS.length] }} />}
                  <strong style={{ fontSize: 14, lineHeight: 1.25 }}>{p.name}</strong>
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <strong style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{tzs(p.price)}</strong>
                    <span style={{ fontSize: 12, fontWeight: 700, color: p.stock <= 0 ? RED : p.stock <= 5 ? AMBER : MUTED }}>
                      {p.stock <= 0 ? 'Imeisha' : p.stock <= 5 ? `Zimebaki ${p.stock}` : p.stock}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <aside style={{ flex: '1 1 360px', maxWidth: '100%', background: '#fff', borderLeft: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {showCustomer || customer.name || customer.phone ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input aria-label="Jina la mteja" placeholder="Jina la mteja" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} style={{ ...input, flex: 1, minWidth: 0 }} />
                  <input aria-label="Simu ya mteja" placeholder="Simu" type="tel" value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} style={{ ...input, width: 130 }} />
                </div>
              ) : (
                <button type="button" style={{ ...pill, alignSelf: 'flex-start' }} onClick={() => setShowCustomer(true)}>+ Mteja (si lazima)</button>
              )}
            </div>
            <div data-testid="pos-cart" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px', minHeight: 120 }}>
              {cart.length === 0 && <div style={{ color: MUTED, padding: '24px 0', fontSize: 14 }}>Gusa bidhaa kuongeza kwenye mauzo.</div>}
              {cart.map((l) => (
                <div key={l.productId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong style={{ fontSize: 14 }}>{l.name}</strong>
                    <span style={{ fontSize: 13, color: MUTED }}>{tzs(l.unitPrice)} kila moja</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', border: `1px solid ${BORDER}`, borderRadius: 20, height: 40 }}>
                    <button type="button" aria-label={`Punguza ${l.name}`} onClick={() => setQty(l.productId, l.quantity - 1)} style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>−</button>
                    <strong style={{ minWidth: 18, textAlign: 'center' }}>{l.quantity}</strong>
                    <button type="button" aria-label={`Ongeza ${l.name}`} onClick={() => setQty(l.productId, l.quantity + 1)} style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>+</button>
                  </span>
                  <strong style={{ width: 84, textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{Math.round(l.unitPrice * l.quantity).toLocaleString('en-US')}</strong>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input aria-label="Punguzo" placeholder="Punguzo" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ ...input, height: 40, width: 110 }} />
                <button type="button" data-testid="pos-park" style={pill} onClick={parkNow} disabled={!cart.length}>Weka kando</button>
                {parked.length > 0 && <button type="button" data-testid="pos-parked" style={pill} onClick={() => setShowParked((v) => !v)}>Kando · {parked.length}</button>}
              </div>
              {showParked && parked.map((p) => (
                <button key={p.id} type="button" onClick={() => resume(p)} style={{ ...pill, justifyContent: 'space-between', width: '100%' }}>
                  <span>{p.customer?.name || 'Mteja'} · vitu {(p.cart || []).reduce((s, i) => s + i.quantity, 0)}</span>
                  <span>{new Date(p.at).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 15, color: MUTED }}>Jumla · vitu {count}</span>
                <strong data-testid="pos-total" style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums' }}>{tzs(total)}</strong>
              </div>
              <button type="button" data-testid="pos-pay" onClick={startPay} disabled={!cart.length}
                style={{ height: 60, borderRadius: 30, border: 'none', background: cart.length ? BLUE : '#94a3b8', color: '#fff', fontSize: 19, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Lipa {tzs(total)}
              </button>
            </div>
          </aside>
        </div>
      )}

      {step === 'pay' && (
        <div className="pos-no-print" style={{ maxWidth: 520, width: '100%', margin: '0 auto', padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 14, color: MUTED }}>{customer.name || 'Mteja'} · vitu {count}</span>
          <strong data-testid="pos-due" style={{ fontSize: 40, fontVariantNumeric: 'tabular-nums' }}>{tzs(total)}</strong>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Amelipaje</span>
          {parts.map((p, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: `2px solid ${BLUE}`, borderRadius: 14, background: BLUE_SOFT, flexWrap: 'wrap' }}>
              <select aria-label="Njia ya kulipa" value={p.method} onChange={(e) => setParts((ps) => ps.map((x, i) => (i === idx ? { ...x, method: e.target.value } : x)))}
                style={{ ...input, flex: 1, minWidth: 120, background: '#fff' }}>
                {POS_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <input aria-label={`Kiasi ${idx + 1}`} data-testid={`pos-amount-${idx}`} inputMode="numeric" value={p.amount}
                onChange={(e) => setParts((ps) => ps.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))}
                style={{ ...input, width: 130, textAlign: 'right', fontSize: 18 }} />
              {p.method !== 'cash' && (
                <input aria-label="Namba ya muamala" placeholder="Namba ya muamala (si lazima)" value={p.reference || ''}
                  onChange={(e) => setParts((ps) => ps.map((x, i) => (i === idx ? { ...x, reference: e.target.value } : x)))}
                  style={{ ...input, width: '100%', height: 40 }} />
              )}
              {parts.length > 1 && <button type="button" aria-label="Ondoa njia hii" onClick={() => setParts((ps) => ps.filter((_, i) => i !== idx))} style={{ ...pill, height: 36 }}>×</button>}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" data-testid="pos-add-method" style={pill}
              onClick={() => setParts((ps) => [...ps, { method: ps.some((x) => x.method === 'mpesa') ? 'airtel_money' : 'mpesa', amount: String(Math.max(0, totals.left)) }])}>+ Njia nyingine</button>
            <button type="button" data-testid="pos-credit" aria-pressed={credit} onClick={() => { setCredit((v) => !v); setCod(false); }}
              style={{ ...pill, ...(credit ? { borderColor: AMBER, color: AMBER, background: '#fffbeb' } : {}) }}>Deni</button>
            <button type="button" aria-pressed={cod} onClick={() => { setCod((v) => !v); setCredit(false); }}
              style={{ ...pill, ...(cod ? { borderColor: BLUE, color: BLUE, background: BLUE_SOFT } : {}) }}>Atalipa akipokea mzigo</button>
          </div>
          {(credit || cod) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input aria-label="Jina la mteja" placeholder="Jina la mteja" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} style={{ ...input, flex: 1, minWidth: 0 }} />
              <input aria-label="Simu ya mteja" placeholder="Simu" type="tel" value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} style={{ ...input, width: 140 }} />
            </div>
          )}
          <div data-testid="pos-pay-state" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14,
            background: totals.left > 0 ? (credit || cod ? '#fffbeb' : '#fef2f2') : '#ecfdf3', color: totals.left > 0 ? (credit || cod ? AMBER : RED) : '#166534', fontWeight: 700, fontSize: 15 }}>
            <span>{totals.left > 0 ? (credit ? `Deni ${tzs(totals.left)}` : cod ? `Atalipa akipokea ${tzs(totals.left)}` : `Bado ${tzs(totals.left)}`) : 'Imelipwa yote'}</span>
            <span>Chenji {tzs(totals.change)}</span>
          </div>
          {!online || offlineBoot ? <span style={{ fontSize: 13, color: AMBER }}>Hakuna mtandao: mauzo yatahifadhiwa hapa na kutumwa mtandao ukirudi.</span> : null}
          <button type="button" data-testid="pos-confirm" onClick={confirm} disabled={submitting}
            style={{ height: 58, borderRadius: 29, border: 'none', background: BLUE, color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {submitting ? 'Inahifadhi' : 'Kamilisha mauzo'}
          </button>
          <button type="button" style={{ ...pill, alignSelf: 'flex-start' }} onClick={() => setStep('cart')}>Rudi kwenye mauzo</button>
        </div>
      )}

      {step === 'receipt' && receipt && (
        <div style={{ maxWidth: 520, width: '100%', margin: '0 auto', padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong className="pos-no-print" style={{ fontSize: 22 }}>{receipt.offline ? 'Imehifadhiwa kwenye kompyuta hii' : 'Mauzo yamekamilika'}</strong>
          {receipt.offline && <span className="pos-no-print" style={{ fontSize: 14, color: AMBER }}>Yatatumwa yenyewe mtandao ukirudi. Namba ya risiti ya KenteXa itatoka hapo.</span>}
          <section id="pos-receipt" data-testid="pos-receipt" style={{ padding: 14, border: `1px dashed ${BORDER}`, borderRadius: 14, background: '#fff', display: 'flex', flexDirection: 'column', gap: 4,
            fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace", fontSize: 13 }}>
            <strong style={{ fontSize: 16, textAlign: 'center', fontFamily: 'inherit' }}>{receipt.shopName}</strong>
            <span style={{ textAlign: 'center', color: MUTED }}>Risiti {receipt.receiptNumber} · {new Date(receipt.at).toLocaleString('sw-TZ')}{receipt.cashier ? ` · ${receipt.cashier}` : ''}</span>
            <span style={{ borderTop: `1px dashed ${BORDER}`, margin: '4px 0' }} />
            {receipt.items.map((i) => (
              <span key={i.productId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{i.quantity} x {i.name}</span><span>{Math.round(i.unitPrice * i.quantity).toLocaleString('en-US')}</span></span>
            ))}
            <span style={{ borderTop: `1px dashed ${BORDER}`, margin: '4px 0' }} />
            <span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>JUMLA</span><span>{Math.round(receipt.total).toLocaleString('en-US')}</span></span>
            {receipt.payments.map((p, i) => (
              <span key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{methodLabel(p.method)}</span><span>{Math.round(p.amount).toLocaleString('en-US')}</span></span>
            ))}
            {receipt.change > 0 && <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Chenji</span><span>{Math.round(receipt.change).toLocaleString('en-US')}</span></span>}
            {receipt.balanceDue > 0 && <span style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Deni</span><span>{Math.round(receipt.balanceDue).toLocaleString('en-US')}</span></span>}
            <span style={{ borderTop: `1px dashed ${BORDER}`, margin: '4px 0' }} />
            <span style={{ textAlign: 'center' }}>Asante kwa kununua {receipt.shopName}. Tufuate kwenye KenteXa.</span>
          </section>
          <div className="pos-no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <button type="button" style={{ ...pill, justifyContent: 'center' }} onClick={() => window.print()}>Chapisha</button>
            <a style={{ ...pill, justifyContent: 'center', textDecoration: 'none' }} target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(receiptText(receipt))}`}>WhatsApp</a>
            <span style={{ ...pill, justifyContent: 'center', cursor: 'default', color: MUTED }}>
              {receipt.offline ? 'SMS mtandao ukirudi' : customer.phone ? 'SMS imetumwa' : 'SMS: hakuna simu'}
            </span>
          </div>
          {receipt.server && Number(receipt.balanceDue) > 0 && (
            <button type="button" className="pos-no-print" style={pill} onClick={collectBalance}>Amelipa salio {tzs(receipt.balanceDue)}</button>
          )}
          {receipt.server && <button type="button" className="pos-no-print" style={pill} onClick={shipIt}>Tuma mzigo kwa mteja</button>}
          <button type="button" data-testid="pos-new-sale" className="pos-no-print" onClick={resetSale}
            style={{ height: 56, borderRadius: 28, border: 'none', background: BLUE, color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            Mauzo mapya
          </button>
        </div>
      )}

      {history && (
        <div className="pos-no-print" role="dialog" aria-label="Historia ya mauzo" style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,25,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 50 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 17 }}>Historia ya mauzo</strong>
              <button type="button" aria-label="Funga" style={pill} onClick={() => setHistory(null)}>×</button>
            </div>
            {history.loading && <div style={{ color: MUTED }}>Inapakia</div>}
            {history.rows.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong>{s.receiptNumber}</strong>
                  <span style={{ color: MUTED }}>{new Date(s.createdAt).toLocaleString('sw-TZ')} · {s.customerName || 'Mteja'}{s.status === 'voided' ? ' · imefutwa' : ''}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <strong>{tzs(s.total)}</strong>
                  {Number(s.balanceDue) > 0 && <span style={{ display: 'block', color: AMBER }}>Salio {tzs(s.balanceDue)}</span>}
                </span>
              </div>
            ))}
            {!history.loading && history.rows.length === 0 && <div style={{ color: MUTED }}>Bado hakuna mauzo.</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
