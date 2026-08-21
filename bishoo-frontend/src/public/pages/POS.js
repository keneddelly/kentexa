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
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
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
    setPaymentMethod('cash'); setReceipt(null); setStep('cart'); setError('');
    searchRef.current?.focus();
  };

  // Customer paid but isn't taking it in person — hand off to the shipping
  // flow, pre-filled with what was actually sold so nothing gets retyped.
  // Payment itself is already done; SellerShipment.js skips asking for it
  // again once it sees saleId.
  const handleShipIt = () => {
    onNavigate('SellerShipment', {
      name: receipt.customerName || '',
      phone: receipt.customerPhone || '',
      saleId: receipt.id,
      items: (receipt.items || []).map(i => ({
        name: i.productName, qty: i.quantity, price: Number(i.unitPrice),
        weight: 0, productId: i.productId, classifiedId: null, source: 'product',
      })),
    });
  };

  const handleConfirm = async () => {
    if (cart.length === 0) return;
    if (paid < total) { setError(t('pos.insufficient_payment')); return; }
    setSubmitting(true); setError('');
    try {
      const res = await api.post('/sales', {
        channel: 'local_pos',
        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, lineDiscount: i.lineDiscount || 0 })),
        discountAmount: Number(discountAmount) || 0,
        paymentMethod,
        amountPaid: paid,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
      });
      setReceipt(res.data);
      setStep('receipt');
    } catch (err) {
      setError(err?.response?.data?.message || t('pos.sale_failed'));
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F8FAFC', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <BackBar title={t('pos.title')} onBack={() => step === 'cart' ? onNavigate('back') : setStep('cart')} top={0} />

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
            <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
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
            <div style={{ fontSize: 12, fontWeight: 800, color: DK, marginBottom: 10 }}>{t('pos.customer_optional')}</div>
            <input placeholder={t('pos.customer_name_placeholder')} value={customerName}
              onChange={e => setCustomerName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
            <input placeholder={t('pos.customer_phone_placeholder')} value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)} style={inputStyle} />
          </div>

          <button onClick={handleConfirm} disabled={submitting || paid < total}
            style={{ width: '100%', padding: '15px 0', background: (submitting || paid < total) ? '#94A3B8' : GREEN,
              color: WH, border: 'none', borderRadius: 14, cursor: (submitting || paid < total) ? 'default' : 'pointer',
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
          </div>
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
    </div>
  );
};

export default POS;
