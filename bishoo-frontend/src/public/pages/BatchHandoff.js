import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import api from '../../api/api';

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
    if (!orderId.trim()) { showErr('Weka nambari ya agizo'); return; }
    try {
      setLoading(true); setError('');
      const res = await api.post(`/daily-batches/assign/${orderId.trim()}`);
      setResult(res.data);
    } catch (err) {
      showErr(err?.response?.data?.message || 'Imeshindwa kuainisha agizo');
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineOrder = async () => {
    const { productName, amount, buyerName, buyerPhone, deliveryAddress } = offlineForm;
    if (!productName.trim() || !amount || !buyerName.trim() || !buyerPhone.trim() || !deliveryAddress.trim()) {
      showErr('Jaza sehemu zote zinazohitajika (*)'); return;
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
      showErr(err?.response?.data?.message || 'Imeshindwa kuunda agizo');
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
              {isAlready ? 'Tayari Imepangiliwa!' : 'Imefanikiwa!'}
            </h2>
            {isAlready && (
              <div style={{ backgroundColor: '#dbeafe', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                ℹ️ Agizo hili lilikuwa limeshapangiliwa kwenye van. Hapa chini ni maelezo yake.
              </div>
            )}
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>{result.message}</p>

            <div style={{ backgroundColor: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'left' }}>
              {[
                { label: 'Tracking Number', value: result.trackingNumber, mono: true },
                { label: 'Eneo la Utoaji', value: result.zoneName },
                { label: 'Agent wa Eneo', value: result.zoneAgent || '—' },
                { label: 'Tarehe ya Van', value: result.runDate ? new Date(result.runDate).toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long' }) : '—' },
                { label: 'Muda wa Mwisho wa Kuleta', value: cutoff ? cutoff.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : '—' },
                { label: 'Inatarajiwa Kufika', value: eta ? eta.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : '—' },
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
              ⚠️ Lete kifurushi hiki kwenye hub ya Kariakoo kabla ya {cutoff ? cutoff.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : '7:00 AM'} ili iandane na van ya leo.
            </div>

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button onClick={() => onNavigate('DispatcherManifest')}
                style={{ width: '100%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                🚐 Angalia Manifest ya Leo
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setResult(null); setMode('choose'); setOrderId(''); setOfflineForm({ productName:'',amount:'',buyerName:'',buyerPhone:'',deliveryAddress:'',quantity:1,notes:'' }); }}
                  style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                  ➕ Nyingine
                </button>
                <button onClick={() => onNavigate('SellerOrders')}
                  style={{ flex: 2, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 800 }}>
                  📋 Maagizo Yangu
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
      <BackBar onBack={() => onNavigate('SellerDashboard')} title="Ongeza kwenye Van ya Leo" />

      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Info banner */}
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', borderRadius: 16, padding: 18, marginBottom: 16, color: '#fff' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>🚐 KenteXa Batch Delivery — Dar es Salaam</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            Van inaondoka Kariakoo saa 2 asubuhi kila siku (8:00 AM).
            Vifurushi lazima viwe hubuni kabla ya saa 1 asubuhi (7:00 AM).
            Maeneo: Mbagala → Mbezi → Bunju
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
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Agizo la KenteXa</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Ainisha agizo lililolipwa tayari</div>
            </button>
            <button onClick={() => setMode('offline')}
              style={{ backgroundColor: '#fff', border: '2px solid #e2e8f0', borderRadius: 16, padding: 20, cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💵</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Agizo la Mkono</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Mteja alilipa cash — agizo si la KenteXa</div>
            </button>
          </div>
        )}

        {/* Assign existing order */}
        {(mode === 'assign') && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>📦 Ainisha Agizo kwenye Batch</h2>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Nambari ya Agizo *</label>
            <input
              type="number" placeholder="e.g. 47"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, marginBottom: 16 }}>
              Nambari ya agizo inayoonyeshwa kwenye "Maagizo Yangu"
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!propOrderId && (
                <button onClick={() => setMode('choose')}
                  style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                  ← Rudi
                </button>
              )}
              <button onClick={handleAssignOrder} disabled={loading}
                style={{ flex: 2, background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {loading ? '⏳ Inaainisha...' : '📦 Ainisha kwenye Van'}
              </button>
            </div>
          </div>
        )}

        {/* Offline order */}
        {mode === 'offline' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>💵 Agizo la Mkono (Cash)</h2>

            {[
              { key: 'productName',    label: 'Jina la Bidhaa *',         placeholder: 'e.g. Samsung A15 128GB', type: 'text' },
              { key: 'amount',         label: 'Kiasi Kilicholipwa (TZS) *', placeholder: 'e.g. 150000', type: 'number' },
              { key: 'buyerName',      label: 'Jina la Mnunuzi *',         placeholder: 'e.g. Amina Juma', type: 'text' },
              { key: 'buyerPhone',     label: 'Simu ya Mnunuzi *',         placeholder: 'e.g. 0712345678', type: 'tel' },
              { key: 'deliveryAddress',label: 'Anwani ya Utoaji *',         placeholder: 'e.g. Mbagala, Mtaa wa Rangi Tatu', type: 'text' },
              { key: 'quantity',       label: 'Idadi',                     placeholder: '1', type: 'number' },
              { key: 'notes',          label: 'Maelezo ya Ziada',           placeholder: 'e.g. Bidhaa ina uharibifu mdogo...', type: 'text' },
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
                ← Rudi
              </button>
              <button onClick={handleOfflineOrder} disabled={loading}
                style={{ flex: 2, background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {loading ? '⏳ Inaunda...' : '💵 Unda na Ainisha kwenye Van'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchHandoff;