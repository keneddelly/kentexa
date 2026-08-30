/**
 * POS.js — BIS Local Shop POS
 *
 * Fast register screen for the physical shop. Search or scan a product,
 * build a cart, take payment, get a receipt — all against the same
 * unified Product/inventory the Kentexa online store and manual sales
 * already share (POST /sales -> InventoryService, one stock number).
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import FeatureTour from '../../onboarding/FeatureTour';
import TourTrigger from '../../onboarding/TourTrigger';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const GREEN = '#16A34A';
const fmt = n => Number(n || 0).toLocaleString();

const PAYMENT_METHODS = [
  { value: 'cash',         icon: '💵' },
  { value: 'mpesa',        icon: '📱' },
  { value: 'airtel_money', icon: '📱' },
  { value: 'tigo_pesa',    icon: '📱' },
  { value: 'halopesa',     icon: '📱' },
  { value: 'bank',         icon: '🏦' },
  { value: 'other',        icon: '💳' },
];

const inputStyle = { width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

const POS = ({ onNavigate, currentUser }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState('cart'); // 'cart' | 'payment' | 'receipt'
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState([]); // [{productId, name, sku, unitPrice, stock, quantity, lineDiscount}]
  const [error, setError] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isCod, setIsCod] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [collectingBalance, setCollectingBalance] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historySales, setHistorySales] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetailId, setHistoryDetailId] = useState(null);
  const [collectingHistoryId, setCollectingHistoryId] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    api.get('/products/my/products')
      .then(r => setProducts((r.data || []).filter(p => p.isActive && p.availableInStore !== false)))
      .catch(() => setError(t('pos.load_products_failed')))
      .finally(() => setLoading(false));
    searchRef.current?.focus();
  }, [t]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase() === q,
    ).slice(0, 12);
  }, [query, products]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        productId: product.id, name: product.name, sku: product.sku,
        unitPrice: Number(product.displayPrice || 0), stock: product.stock,
        quantity: 1, lineDiscount: 0,
      }];
    });
    setQuery('');
    searchRef.current?.focus();
  };

  // Barcode scanners type the code then send Enter — this catches that
  // without requiring a separate "scan mode" toggle.
  const handleSearchKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    if (results.length === 1) { addToCart(results[0]); return; }
    const code = query.trim();
    if (!code) return;
    try {
      const res = await api.get('/products/my/lookup', { params: { barcode: code, sku: code } });
      if (res.data) addToCart(res.data);
      else setError(t('pos.not_found', { code }));
    } catch { setError(t('pos.not_found', { code })); }
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const next = i.quantity + delta;
      return next <= 0 ? i : { ...i, quantity: Math.min(next, i.stock || next) };
    }));
  };
  const removeItem = (productId) => setCart(prev => prev.filter(i => i.productId !== productId));

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const lineDiscounts = cart.reduce((s, i) => s + Number(i.lineDiscount || 0), 0);
  const total = Math.max(0, subtotal - lineDiscounts - (Number(discountAmount) || 0));
  const paid = Number(amountPaid) || 0;
  const changeDue = paymentMethod === 'cash' ? Math.max(0, paid - total) : 0;

  const resetSale = () => {
    setCart([]); setDiscountAmount('0'); setAmountPaid(''); setCustomerName(''); setCustomerPhone('');
    setPaymentMethod('cash'); setIsCod(false); setReceipt(null); setStep('cart'); setError('');
    searchRef.current?.focus();
  };

  // Customer isn't taking the sale in person — hand off to the shipping
  // flow, pre-filled with what was actually sold so nothing gets retyped.
  // SellerShipment.js skips asking for payment again once it sees saleId
  // (the backend re-reads the Sale itself for the authoritative isCod/
  // balanceDue) — isCod/balanceDue are passed through here only so that
  // screen can show the right banner before the seller even submits.
  const handleShipIt = () => {
    onNavigate('SellerShipment', {
      name: receipt.customerName || '',
      phone: receipt.customerPhone || '',
      saleId: receipt.id,
      isCod: receipt.isCod || false,
      balanceDue: Number(receipt.balanceDue || 0),
      items: (receipt.items || []).map(i => ({
        name: i.productName, qty: i.quantity, price: Number(i.unitPrice),
        weight: 0, productId: i.productId, classifiedId: null, source: 'product',
      })),
    });
  };

  const handleConfirm = async () => {
    if (cart.length === 0) return;
    if (!isCod && paid < total) { setError(t('pos.insufficient_payment')); return; }
    if (isCod && !customerPhone.trim()) { setError(t('pos.cod_needs_phone')); return; }
    if (isCod && paid > total) { setError(t('pos.cod_overpaid')); return; }
    setSubmitting(true); setError('');
    try {
      const res = await api.post('/sales', {
        channel: 'local_pos',
        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, lineDiscount: i.lineDiscount || 0 })),
        discountAmount: Number(discountAmount) || 0,
        paymentMethod,
        amountPaid: paid,
        isCod,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
      });
      setReceipt(res.data);
      setStep('receipt');
    } catch (err) {
      setError(err?.response?.data?.message || t('pos.sale_failed'));
    } finally { setSubmitting(false); }
  };

  const handleCollectBalance = async () => {
    if (!receipt) return;
    setCollectingBalance(true); setError('');
    try {
      const res = await api.post(`/sales/${receipt.id}/collect-cod-balance`);
      setReceipt(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || t('pos.collect_balance_failed'));
    } finally { setCollectingBalance(false); }
  };

  // ── Sales history — GET /sales already returns the full Sale row
  // (items are eager on the entity), so no separate per-sale detail call
  // is needed just to render this. This was the one gap: the endpoint
  // existed server-side and was never called from anywhere in the UI, so
  // once a receipt screen was left behind there was no way back to it.
  const openHistory = async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const res = await api.get('/sales');
      setHistorySales(res.data || []);
    } catch { setHistorySales([]); }
    finally { setHistoryLoading(false); }
  };

  const handleCollectHistoryBalance = async (saleId) => {
    setCollectingHistoryId(saleId); setError('');
    try {
      const res = await api.post(`/sales/${saleId}/collect-cod-balance`);
      setHistorySales(prev => prev.map(s => s.id === saleId ? res.data : s));
    } catch (err) {
      setError(err?.response?.data?.message || t('pos.collect_balance_failed'));
    } finally { setCollectingHistoryId(null); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F8FAFC', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <BackBar title={t('pos.title')} onBack={() => step === 'cart' ? onNavigate('back') : setStep('cart')} top={0}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step === 'cart' && (
              <button onClick={openHistory}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: B, fontWeight: 700 }}>
                📜 {t('pos.history_button')}
              </button>
            )}
            <TourTrigger tourKey="pos_first_sale" />
          </div>
        } />
      <FeatureTour tourKey="pos_first_sale" autoStart />

      {error && (
        <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '10px 16px', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span>❌ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 'bold' }}>×</button>
        </div>
      )}

      {step === 'cart' && (
        <div style={{ flex: 1, padding: 14, maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {/* Search / scan */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input ref={searchRef} data-tour="pos-search" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('pos.search_placeholder')}
              style={{ ...inputStyle, fontSize: 15, padding: '13px 14px' }} />
            {results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: WH,
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, zIndex: 20, overflow: 'hidden' }}>
                {results.map(p => (
                  <div key={p.id} onClick={() => addToCart(p)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DK }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: GR }}>
                        {p.sku ? `SKU ${p.sku} · ` : ''}{t('pos.in_stock', { count: p.stock })}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: B }}>TZS {fmt(p.displayPrice)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: GR }}>{t('pos.loading')}</div>
          ) : cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: GR }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
              <div style={{ fontSize: 13 }}>{t('pos.empty_cart')}</div>
            </div>
          ) : (
            <div style={{ backgroundColor: WH, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 90 }}>
              {cart.map(item => (
                <div key={item.productId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: GR }}>TZS {fmt(item.unitPrice)} {t('pos.each')}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => updateQty(item.productId, -1)} style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid #E2E8F0', background: WH, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>−</button>
                    <span style={{ fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{item.quantity}</span>
                    <button onClick={() => updateQty(item.productId, 1)} style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid #E2E8F0', background: WH, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>+</button>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: DK, width: 80, textAlign: 'right' }}>TZS {fmt(item.unitPrice * item.quantity)}</div>
                  <button onClick={() => removeItem(item.productId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 16, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'cart' && cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: WH, borderTop: '1px solid #F1F5F9',
          padding: '14px 16px', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: GR, fontWeight: 700 }}>{t('pos.subtotal')}</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: DK }}>TZS {fmt(subtotal - lineDiscounts)}</span>
          </div>
          <button onClick={() => setStep('payment')} style={{ width: '100%', maxWidth: 560, margin: '0 auto', display: 'block',
            padding: '14px 0', background: `linear-gradient(135deg,${B},#7C3AED)`, color: WH, border: 'none',
            borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 900 }}>
            {t('pos.charge_button')}
          </button>
        </div>
      )}

      {step === 'payment' && (
        <div style={{ flex: 1, padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: GR }}>
              <span>{t('pos.subtotal')}</span><span>TZS {fmt(subtotal)}</span>
            </div>
            {lineDiscounts > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: GR }}>
                <span>{t('pos.line_discounts')}</span><span>− TZS {fmt(lineDiscounts)}</span>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: GR }}>{t('pos.overall_discount')}</label>
              <input type="number" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 8, borderTop: '1px solid #F1F5F9' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: DK }}>{t('pos.total')}</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: B }}>TZS {fmt(total)}</span>
            </div>
          </div>

          <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: DK, marginBottom: 10 }}>{t('pos.payment_method')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
              {PAYMENT_METHODS.map(m => (
                <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                  style={{ padding: '10px 4px', borderRadius: 10, border: `2px solid ${paymentMethod === m.value ? B : '#E2E8F0'}`,
                    backgroundColor: paymentMethod === m.value ? '#EFF6FF' : WH, cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: 16 }}>{m.icon}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: paymentMethod === m.value ? B : GR }}>{t(`pos.method_${m.value}`)}</div>
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: GR }}>{t('pos.amount_paid')}</label>
            <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
              placeholder={String(total)} style={{ ...inputStyle, fontSize: 16, fontWeight: 800 }} />
            {paymentMethod === 'cash' && paid > 0 && (
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: changeDue > 0 ? GREEN : GR }}>
                {t('pos.change_due')}: TZS {fmt(changeDue)}
              </div>
            )}
          </div>

          <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: DK, marginBottom: 10 }}>
              {isCod ? t('pos.customer_required_cod') : t('pos.customer_optional')}
            </div>
            <input placeholder={t('pos.customer_name_placeholder')} value={customerName}
              onChange={e => setCustomerName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
            <input placeholder={t('pos.customer_phone_placeholder')} value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)} style={inputStyle} />
          </div>

          <div onClick={() => setIsCod(!isCod)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
              backgroundColor: isCod ? '#EFF6FF' : WH, border: `2px solid ${isCod ? B : '#E2E8F0'}`, marginBottom: 14 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${isCod ? B : '#94A3B8'}`,
              backgroundColor: isCod ? B : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isCod && <span style={{ color: WH, fontSize: 12 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isCod ? B : DK }}>🚚 {t('pos.cod_toggle')}</div>
              <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>{t('pos.cod_toggle_sub')}</div>
            </div>
          </div>

          {isCod && paid < total && (
            <div style={{ backgroundColor: '#FEF9C3', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400E', fontWeight: 600 }}>
              {t('pos.cod_balance_notice', { amount: fmt(total - paid) })}
            </div>
          )}

          <button onClick={handleConfirm} disabled={submitting || (!isCod && paid < total)}
            style={{ width: '100%', padding: '15px 0', background: (submitting || (!isCod && paid < total)) ? '#94A3B8' : GREEN,
              color: WH, border: 'none', borderRadius: 14, cursor: (submitting || (!isCod && paid < total)) ? 'default' : 'pointer',
              fontSize: 15, fontWeight: 900 }}>
            {submitting ? t('pos.processing') : t('pos.confirm_sale')}
          </button>
        </div>
      )}

      {step === 'receipt' && receipt && (
        <div style={{ flex: 1, padding: 16, maxWidth: 420, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: WH, borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 32 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: DK, marginTop: 6 }}>
                {currentUser?.storeName || currentUser?.name}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: GR, marginTop: 2 }}>{receipt.receiptNumber}</div>
              <div style={{ fontSize: 11, color: GR }}>{new Date(receipt.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ borderTop: '1px dashed #E2E8F0', borderBottom: '1px dashed #E2E8F0', padding: '10px 0', marginBottom: 10 }}>
              {receipt.items?.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span style={{ color: DK }}>{item.quantity} × {item.productName}</span>
                  <span style={{ fontWeight: 700, color: DK }}>TZS {fmt(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            {Number(receipt.discountAmount) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GR, marginBottom: 4 }}>
                <span>{t('pos.discount')}</span><span>− TZS {fmt(receipt.discountAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, marginBottom: 10 }}>
              <span>{t('pos.total')}</span><span>TZS {fmt(receipt.total)}</span>
            </div>
            <div style={{ fontSize: 12, color: GR, display: 'flex', justifyContent: 'space-between' }}>
              <span>{t(`pos.method_${receipt.paymentMethod}`)}</span><span>TZS {fmt(receipt.amountPaid)}</span>
            </div>
            {Number(receipt.changeDue) > 0 && (
              <div style={{ fontSize: 12, color: GR, display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('pos.change_due')}</span><span>TZS {fmt(receipt.changeDue)}</span>
              </div>
            )}
            {receipt.isCod && Number(receipt.balanceDue) > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #E2E8F0', fontSize: 13, fontWeight: 800, color: '#EA580C', display: 'flex', justifyContent: 'space-between' }}>
                <span>🚚 {t('pos.balance_due')}</span><span>TZS {fmt(receipt.balanceDue)}</span>
              </div>
            )}
            {receipt.isCod && Number(receipt.balanceDue) <= 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #E2E8F0', fontSize: 12, fontWeight: 700, color: GREEN, textAlign: 'center' }}>
                ✅ {t('pos.balance_settled')}
              </div>
            )}
          </div>
          {receipt.isCod && Number(receipt.balanceDue) > 0 && (
            <button onClick={handleCollectBalance} disabled={collectingBalance} style={{ width: '100%', marginTop: 16, padding: '14px 0',
              background: collectingBalance ? '#94A3B8' : '#EA580C', color: WH, border: 'none',
              borderRadius: 14, cursor: collectingBalance ? 'default' : 'pointer', fontSize: 14, fontWeight: 900 }}>
              {collectingBalance ? t('pos.processing') : `💰 ${t('pos.collect_balance_button', { amount: fmt(receipt.balanceDue) })}`}
            </button>
          )}
          <button onClick={handleShipIt} style={{ width: '100%', marginTop: 16, padding: '14px 0',
            background: WH, color: B, border: `2px solid ${B}`,
            borderRadius: 14, cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
            {`🚚 ${t('pos.ship_it')}`}
          </button>
          <button onClick={resetSale} style={{ width: '100%', marginTop: 10, padding: '14px 0',
            background: `linear-gradient(135deg,${B},#7C3AED)`, color: WH, border: 'none',
            borderRadius: 14, cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
            {t('pos.new_sale')}
          </button>
        </div>
      )}

      {/* ── SALES HISTORY MODAL ── */}
      {showHistory && (
        <div onClick={() => { setShowHistory(false); setHistoryDetailId(null); }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: WH, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: DK }}>📜 {t('pos.history_title')}</div>
              <button onClick={() => { setShowHistory(false); setHistoryDetailId(null); }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: GR }}>×</button>
            </div>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: GR }}>{t('pos.loading')}</div>
            ) : historySales.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: GR }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🧾</div>
                {t('pos.history_empty')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historySales.map(sale => {
                  const isOpen = historyDetailId === sale.id;
                  const owesBalance = sale.isCod && Number(sale.balanceDue) > 0;
                  return (
                    <div key={sale.id} style={{ border: '1px solid #F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
                      <div onClick={() => setHistoryDetailId(isOpen ? null : sale.id)}
                        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                          backgroundColor: owesBalance ? '#EFF6FF' : '#F8FAFC' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: DK, fontFamily: 'monospace' }}>{sale.receiptNumber}</div>
                          <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>
                            {new Date(sale.createdAt).toLocaleDateString()} · {sale.customerName || t('pos.walk_in_customer')}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: DK }}>TZS {fmt(sale.total)}</div>
                          {owesBalance && (
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#EA580C' }}>🚚 {t('pos.balance_due')}: TZS {fmt(sale.balanceDue)}</div>
                          )}
                          {sale.status === 'voided' && (
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#DC2626' }}>{t('pos.voided_label')}</div>
                          )}
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '10px 14px 14px', borderTop: '1px dashed #E2E8F0' }}>
                          {sale.items?.map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                              <span style={{ color: DK }}>{item.quantity} × {item.productName}</span>
                              <span style={{ fontWeight: 700, color: DK }}>TZS {fmt(item.lineTotal)}</span>
                            </div>
                          ))}
                          {Number(sale.discountAmount) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GR, padding: '3px 0' }}>
                              <span>{t('pos.discount')}</span><span>− TZS {fmt(sale.discountAmount)}</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: DK, marginTop: 4, paddingTop: 6, borderTop: '1px dashed #E2E8F0' }}>
                            <span>{t('pos.total')}</span><span>TZS {fmt(sale.total)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GR, marginTop: 6 }}>
                            <span>{t(`pos.method_${sale.paymentMethod}`)}</span><span>TZS {fmt(sale.amountPaid)}</span>
                          </div>
                          {sale.customerPhone && (
                            <div style={{ fontSize: 11, color: GR, marginTop: 4 }}>📞 {sale.customerPhone}</div>
                          )}
                          {sale.shipmentTrackingNumber && (
                            <div style={{ fontSize: 11, color: B, marginTop: 4, fontFamily: 'monospace' }}>🔗 {sale.shipmentTrackingNumber}</div>
                          )}
                          {owesBalance && (
                            <button onClick={() => handleCollectHistoryBalance(sale.id)} disabled={collectingHistoryId === sale.id}
                              style={{ width: '100%', marginTop: 10, padding: '11px 0',
                                background: collectingHistoryId === sale.id ? '#94A3B8' : '#EA580C', color: WH, border: 'none',
                                borderRadius: 10, cursor: collectingHistoryId === sale.id ? 'default' : 'pointer', fontSize: 13, fontWeight: 800 }}>
                              {collectingHistoryId === sale.id ? t('pos.processing') : `💰 ${t('pos.collect_balance_button', { amount: fmt(sale.balanceDue) })}`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
