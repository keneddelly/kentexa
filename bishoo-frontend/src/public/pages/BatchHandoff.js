import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const DATE_LOCALES = { en: 'en-US', sw: 'sw-TZ', fr: 'fr-FR' };

/**
 * BatchHandoff — Seller assigns their order to today's KenteXa batch van.
 * Also allows offline order creation (walk-in cash sales).
 *
 * Accessed from SellerOrders when order has shippingMethod === 'kentexa_delivery'
 * or from SellerDashboard "+ Ongeza Agizo la Mkono" button.
 *
 * Route: onNavigate('BatchHandoff') or onNavigate(`BatchHandoff-${orderId}`)
 */

const BatchHandoff = ({ onNavigate, isLoggedIn, onLogout, userRole, orderId: propOrderId }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = DATE_LOCALES[i18n.language] || 'en-US';
  const [mode, setMode] = useState(propOrderId ? 'assign' : 'choose'); // 'choose'|'assign'|'offline'
  const [orderId, setOrderId] = useState(propOrderId ? String(propOrderId) : '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Offline order form
  const [offlineForm, setOfflineForm] = useState({
    productName: '', amount: '', buyerName: '', buyerPhone: '',
    deliveryAddress: '', quantity: 1, notes: '',
  });

  const showErr = (msg) => setError(msg);

  const handleAssignOrder = async () => {
    if (!orderId.trim()) { showErr(t('batch_handoff.order_number_required')); return; }
    try {
      setLoading(true); setError('');
      const res = await api.post(`/daily-batches/assign/${orderId.trim()}`);
      setResult(res.data);
    } catch (err) {
      showErr(err?.response?.data?.message || t('batch_handoff.assign_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineOrder = async () => {
    const { productName, amount, buyerName, buyerPhone, deliveryAddress } = offlineForm;
    if (!productName.trim() || !amount || !buyerName.trim() || !buyerPhone.trim() || !deliveryAddress.trim()) {
      showErr(t('batch_handoff.fill_required_fields')); return;
    }
    try {
      setLoading(true); setError('');
      const res = await api.post('/daily-batches/offline-order', {
        ...offlineForm,
        amount: Number(offlineForm.amount),
        quantity: Number(offlineForm.quantity) || 1,
      });
      setResult(res.data);
    } catch (err) {
      showErr(err?.response?.data?.message || t('batch_handoff.create_failed'));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '2px solid #e2e8f0', fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  // ── Success result ──────────────────────────────────────────────
  if (result) {
    // Already assigned — show info without confusion
    const isAlready = result.alreadyAssigned;
    const eta = result.estimatedArrival ? new Date(result.estimatedArrival) : null;
    const cutoff = result.cutoffTime ? new Date(result.cutoffTime) : null;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
        <Navbar currentPage="BatchHandoff" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
        <div style={{ flex: 1, padding: 16, maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', marginTop: 20 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>{isAlready ? '✅' : '🎉'}</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 6 }}>
              {isAlready ? t('batch_handoff.already_scheduled_title') : t('batch_handoff.success_title')}
            </h2>
            {isAlready && (
              <div style={{ backgroundColor: '#dbeafe', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                {t('batch_handoff.already_scheduled_notice')}
              </div>
            )}
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>{result.message}</p>

            <div style={{ backgroundColor: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'left' }}>
              {[
                { label: t('batch_handoff.label_tracking_number'), value: result.trackingNumber, mono: true },
                { label: t('batch_handoff.label_delivery_zone'), value: result.zoneName },
                { label: t('batch_handoff.label_zone_agent'), value: result.zoneAgent || '—' },
                { label: t('batch_handoff.label_van_date'), value: result.runDate ? new Date(result.runDate).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' }) : '—' },
                { label: t('batch_handoff.label_cutoff_time'), value: cutoff ? cutoff.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : '—' },
                { label: t('batch_handoff.label_eta'), value: eta ? eta.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : '—' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', fontFamily: item.mono ? 'monospace' : 'inherit' }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: '#92400e', textAlign: 'left', fontWeight: 600 }}>
              {t('batch_handoff.cutoff_warning', { time: cutoff ? cutoff.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : '7:00 AM' })}
            </div>

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button onClick={() => onNavigate('DispatcherManifest')}
                style={{ width: '100%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                {t('batch_handoff.view_manifest_button')}
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setResult(null); setMode('choose'); setOrderId(''); setOfflineForm({ productName:'',amount:'',buyerName:'',buyerPhone:'',deliveryAddress:'',quantity:1,notes:'' }); }}
                  style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                  {t('batch_handoff.another_button')}
                </button>
                <button onClick={() => onNavigate('SellerOrders')}
                  style={{ flex: 2, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 800 }}>
                  {t('batch_handoff.my_orders_button')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="BatchHandoff" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('SellerDashboard')} title={t('batch_handoff.page_title')} />

      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Info banner */}
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', borderRadius: 16, padding: 18, marginBottom: 16, color: '#fff' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{t('batch_handoff.info_banner_title')}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            {t('batch_handoff.info_banner_desc')}
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Mode selector */}
        {mode === 'choose' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <button onClick={() => setMode('assign')}
              style={{ backgroundColor: '#fff', border: '2px solid #e2e8f0', borderRadius: 16, padding: 20, cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>{t('batch_handoff.mode_kentexa_title')}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{t('batch_handoff.mode_kentexa_desc')}</div>
            </button>
            <button onClick={() => setMode('offline')}
              style={{ backgroundColor: '#fff', border: '2px solid #e2e8f0', borderRadius: 16, padding: 20, cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💵</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>{t('batch_handoff.mode_offline_title')}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{t('batch_handoff.mode_offline_desc')}</div>
            </button>
          </div>
        )}

        {/* Assign existing order */}
        {(mode === 'assign') && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>{t('batch_handoff.assign_section_title')}</h2>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{t('batch_handoff.order_number_label')}</label>
            <input
              type="number" placeholder="e.g. 47"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, marginBottom: 16 }}>
              {t('batch_handoff.order_number_hint')}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!propOrderId && (
                <button onClick={() => setMode('choose')}
                  style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                  {t('batch_handoff.back')}
                </button>
              )}
              <button onClick={handleAssignOrder} disabled={loading}
                style={{ flex: 2, background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {loading ? t('batch_handoff.assigning_button') : t('batch_handoff.assign_button')}
              </button>
            </div>
          </div>
        )}

        {/* Offline order */}
        {mode === 'offline' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>{t('batch_handoff.offline_section_title')}</h2>

            {[
              { key: 'productName',    label: t('batch_handoff.field_product_name'),         placeholder: t('batch_handoff.field_product_name_placeholder'), type: 'text' },
              { key: 'amount',         label: t('batch_handoff.field_amount'), placeholder: t('batch_handoff.field_amount_placeholder'), type: 'number' },
              { key: 'buyerName',      label: t('batch_handoff.field_buyer_name'),         placeholder: t('batch_handoff.field_buyer_name_placeholder'), type: 'text' },
              { key: 'buyerPhone',     label: t('batch_handoff.field_buyer_phone'),         placeholder: t('batch_handoff.field_buyer_phone_placeholder'), type: 'tel' },
              { key: 'deliveryAddress',label: t('batch_handoff.field_delivery_address'),         placeholder: t('batch_handoff.field_delivery_address_placeholder'), type: 'text' },
              { key: 'quantity',       label: t('batch_handoff.field_quantity'),                     placeholder: '1', type: 'number' },
              { key: 'notes',          label: t('batch_handoff.field_notes'),           placeholder: t('batch_handoff.field_notes_placeholder'), type: 'text' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{field.label}</label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={offlineForm[field.key]}
                  onChange={e => setOfflineForm({ ...offlineForm, [field.key]: e.target.value })}
                  style={inputStyle}
                />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => setMode('choose')}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                {t('batch_handoff.back')}
              </button>
              <button onClick={handleOfflineOrder} disabled={loading}
                style={{ flex: 2, background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {loading ? t('batch_handoff.creating_button') : t('batch_handoff.create_button')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchHandoff;