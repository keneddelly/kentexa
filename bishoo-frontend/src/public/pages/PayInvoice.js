import React, { useState } from 'react';

import api from '../../api/api';
import { useTranslation } from 'react-i18next';

const PayInvoice = ({ onNavigate, isLoggedIn, onLogout, userRole, prefilledOrderId, prefilledInvoiceNumber }) => {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod] = useState('selcom');
  const [payerPhone, setPayerPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const { t } = useTranslation();

  // Auto-lookup invoice when arriving from MyOrders with an orderId
  React.useEffect(() => {
    if (prefilledOrderId) {
      // Fetch invoice by orderId
      (async () => {
        try {
          const res = await api.get(`/invoices/order/${prefilledOrderId}`);
          if (res.data?.invoiceNumber) {
            setInvoiceNumber(res.data.invoiceNumber);
            setInvoice(res.data);
          }
        } catch {}
      })();
    }
  }, [prefilledOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-lookup when arriving from a classified-invoice chat message —
  // these carry a real invoiceNumber directly, no orderId translation needed.
  React.useEffect(() => {
    if (prefilledInvoiceNumber) {
      setInvoiceNumber(prefilledInvoiceNumber);
      (async () => {
        try {
          const res = await api.get(`/payments/lookup/${prefilledInvoiceNumber}`);
          setInvoice(res.data);
        } catch {}
      })();
    }
  }, [prefilledInvoiceNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLookup = async () => {
    if (!invoiceNumber.trim()) { setError(t('pay_invoice.find_invoice')); return; }
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      setLookupLoading(true);
      setError('');
      setInvoice(null);
      const res = await api.get(`/payments/lookup/${invoiceNumber.trim()}`);
      setInvoice(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || t('classifieds.no_listings'));
    } finally {
      setLookupLoading(false);
    }
  };

  const handlePay = async () => {
    if (!payerPhone.trim()) { setError(t('pay_invoice.your_phone')); return; }
    try {
      setPaying(true);
      setError('');
      const res = await api.post('/payments/invoice/pay', { invoiceNumber: invoice.invoiceNumber, phone: payerPhone.trim(), provider: paymentMethod });
      setPaymentPending(true);
      setTimeout(async () => {
        try {
          await api.post(`/payments/agent/mock-confirm/${res.data.providerRequestId}`);
          setPaymentSuccess({ invoiceNumber: invoice.invoiceNumber, amount: invoice.amount });
          setPaymentPending(false);
        } catch {
          setError(t('common.error'));
          setPaymentPending(false);
        }
      }, 4000);
    } catch (err) {
      setError(err?.response?.data?.message || t('common.error'));
    } finally {
      setPaying(false);
    }
  };

  if (paymentSuccess) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '36px 24px', textAlign: 'center', width: '100%', maxWidth: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '56px', marginBottom: '12px' }}>🎉</div>
            <h2 style={{ fontSize: '22px', fontWeight: '900', color: '#1e293b', marginBottom: '8px' }}>{t('pay_invoice.payment_success')}</h2>
            <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '14px' }}>{t('pay_invoice.confirmed')}</p>
            <div style={{ background: 'linear-gradient(135deg, #43e97b, #38f9d7)', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>{t('pay_invoice.invoice_no')}</div>
              <div style={{ fontSize: '16px', fontWeight: '900', color: '#fff', fontFamily: 'monospace', marginBottom: '8px' }}>{paymentSuccess.invoiceNumber}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>{t('checkout.amount_paid')}</div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: '#fff' }}>TZS {Number(paymentSuccess.amount).toLocaleString()}</div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => onNavigate('Home')} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>🏠 {t('pay_invoice.home')}</button>
              <button onClick={() => onNavigate('MyOrders')} style={{ flex: 1, background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>📋 {t('pay_invoice.my_orders')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>

      <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #7c3aed)', padding: '28px 16px', textAlign: 'center', position:'relative' }}>
        <button onClick={() => onNavigate('MyOrders')} style={{ position:'absolute', top:14, left:14,
          background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, padding:6, cursor:'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>💳</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#fff', margin: '0 0 6px' }}>{t('pay_invoice.title')}</h1>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>{t('pay_invoice.subtitle')}</p>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: '560px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold', fontSize: '16px' }}>×</button>
          </div>
        )}

        {!invoice && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', margin: '0 0 6px' }}>🔍 {t('pay_invoice.find_invoice')}</h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>{t('pay_invoice.find_desc')}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input placeholder={t('pay_invoice.placeholder')} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()}
                style={{ flex: 1, padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'monospace', minWidth: 0 }}
                onFocus={e => e.target.style.border = '2px solid #7c3aed'} onBlur={e => e.target.style.border = '2px solid #e2e8f0'} />
              <button onClick={handleLookup} disabled={lookupLoading} style={{ backgroundColor: '#7c3aed', color: '#fff', border: 'none', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: '800', fontSize: '14px', whiteSpace: 'nowrap' }}>
                {lookupLoading ? '⏳' : '🔍'}
              </button>
            </div>
            {!isLoggedIn && (
              <div style={{ backgroundColor: '#fef9c3', borderRadius: '10px', padding: '10px 14px', marginTop: '14px', fontSize: '12px', color: '#92400e' }}>
                ⚠️ {t('pay_invoice.login_required')} <span onClick={() => onNavigate('PublicLogin')} style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: '700' }}>{t('pay_invoice.login_link')}</span> {t('pay_invoice.login_suffix')}
              </div>
            )}
          </div>
        )}

        {invoice && !paymentPending && (
          <>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', margin: 0 }}>📄 {t('pay_invoice.invoice_details')}</h2>
                <button onClick={() => { setInvoice(null); setInvoiceNumber(''); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}>{t('pay_invoice.search_again')}</button>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #7c3aed)', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '3px' }}>{t('pay_invoice.amount_due')}</div>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: '#fff' }}>TZS {Number(invoice.amount).toLocaleString()}</div>
                </div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '8px', padding: '5px 12px', color: '#fff', fontSize: '11px', fontWeight: '700' }}>
                  {invoice.status?.toUpperCase()}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: t('pay_invoice.invoice_no'), value: invoice.invoiceNumber },
                  { label: t('pay_invoice.seller'),     value: invoice.sellerName || '—' },
                  { label: t('pay_invoice.product'),    value: invoice.productName || invoice.invoiceDescription || '—' },
                  { label: t('pay_invoice.due_date'),   value: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—' },
                ].map(item => (
                  <div key={item.label} style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginBottom: '2px' }}>{item.label}</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {(invoice.status === 'sent' || invoice.status === 'awaiting_payment' || invoice.status === 'payment_processing') && (
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', margin: '0 0 14px' }}>💳 {t('pay_invoice.pay_now')}</h2>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>{t('pay_invoice.your_phone')}</label>
                  <input placeholder="255712345678" value={payerPhone} onChange={e => setPayerPhone(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => e.target.style.border = '2px solid #7c3aed'} onBlur={e => e.target.style.border = '2px solid #e2e8f0'} />
                </div>
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🔒</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#166534' }}>{t('pay_invoice.secure_payment')}</div>
                    <div style={{ fontSize: '11px', color: '#166534' }}>{t('pay_invoice.networks')}</div>
                  </div>
                </div>
                <button onClick={handlePay} disabled={paying || !payerPhone.trim()}
                  style={{ width: '100%', background: paying || !payerPhone.trim() ? '#e2e8f0' : 'linear-gradient(135deg, #667eea, #764ba2)', color: paying || !payerPhone.trim() ? '#94a3b8' : '#fff', border: 'none', padding: '14px', borderRadius: '12px', cursor: paying || !payerPhone.trim() ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '900' }}>
                  {paying ? `⏳ ${t('pay_invoice.initiating')}` : `💳 ${t('pay_invoice.pay_button')} ${Number(invoice.amount).toLocaleString()}`}
                </button>
              </div>
            )}

            {invoice.status === 'paid' && (
              <div style={{ backgroundColor: '#dcfce7', borderRadius: '16px', padding: '20px', textAlign: 'center', border: '2px solid #86efac' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
                <h3 style={{ color: '#16a34a', fontWeight: '800', margin: '0 0 4px', fontSize: '15px' }}>{t('pay_invoice.already_paid')}</h3>
                <p style={{ color: '#166534', fontSize: '12px', margin: 0 }}>{t('pay_invoice.paid_success')}</p>
              </div>
            )}
          </>
        )}

        {paymentPending && invoice && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px 20px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>📱</div>
            <h2 style={{ fontSize: '18px', fontWeight: '900', color: '#1e293b', marginBottom: '8px' }}>{t('pay_invoice.check_phone')}</h2>
            <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>{t('pay_invoice.enter_pin')}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#7c3aed', opacity: 0.4 + i * 0.3 }} />)}
            </div>
          </div>
        )}

        {!invoice && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b', margin: '0 0 14px' }}>ℹ️ {t('pay_invoice.how_it_works')}</h3>
            {[t('pay_invoice.step1'), t('pay_invoice.step2'), t('pay_invoice.step3'), t('pay_invoice.step4')].map((text, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{['1️⃣','2️⃣','3️⃣','4️⃣'][i]}</span>
                <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: '1.6' }}>{text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ height: 90 }} />
    </div>
  );
};

export default PayInvoice;