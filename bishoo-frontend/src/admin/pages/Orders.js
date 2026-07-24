import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const STATUS_STYLE = {
  pending:         { bg: '#f1f5f9', color: '#64748b',  label: '📋 Inasubiri' },
  pending_payment: { bg: '#fef9c3', color: '#ca8a04',  label: '💳 Inasubiri Malipo' },
  paid:            { bg: '#dbeafe', color: '#2563eb',  label: '💰 Imelipwa' },
  preparing:       { bg: '#ede9fe', color: '#7c3aed',  label: '📦 Inaandaliwa' },
  in_transit:      { bg: '#e0f2fe', color: '#0284c7',  label: '🚚 Inasafirishwa' },
  delivered:       { bg: '#dcfce7', color: '#16a34a',  label: '✅ Imetolewa' },
  confirmed:       { bg: '#f0fdf4', color: '#15803d',  label: '🎉 Imethibitishwa' },
  cancelled:       { bg: '#fee2e2', color: '#dc2626',  label: '❌ Imefutwa' },
  disputed:        { bg: '#fef3c7', color: '#d97706',  label: '⚠️ Inabishaniwa' },
  refunded:        { bg: '#fee2e2', color: '#9f1239',  label: '↩️ Imerudishwa' },
};

const Orders = ({ activePage, onNavigate, onLogout }) => {
  const [orders, setOrders]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage]         = useState('');
  const [error, setError]             = useState('');

  useEffect(() => { fetchOrders(); }, []);


  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get('/orders');
      setOrders(res.data || []);
    } catch { setError('Imeshindwa kupakia maagizo'); }
    finally { setLoading(false); }
  };


  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const handleForceStatus = async (orderId, status) => {
    if (!window.confirm(`Badilisha hali ya agizo #${orderId} kwenda "${status}"?`)) return;
    try {
      setActionLoading(true);
      await api.patch(`/orders/${orderId}/admin-status`, { status });
      showMsg(`✅ Hali imebadilishwa kwenda ${status}`);
      fetchOrders();
      if (selected?.id === orderId) setSelected(s => ({ ...s, status }));
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setActionLoading(false); }
  };

  const handleCancel = async (orderId) => {
    const reason = window.prompt('Sababu ya kufuta agizo:');
    if (!reason) return;
    try {
      setActionLoading(true);
      await api.patch(`/orders/${orderId}/cancel`, { reason });
      showMsg('✅ Agizo limefutwa');
      fetchOrders();
      setSelected(null);
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setActionLoading(false); }
  };

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'all' || o.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      String(o.id).includes(q) ||
      o.buyer?.name?.toLowerCase().includes(q) ||
      o.buyer?.email?.toLowerCase().includes(q) ||
      o.product?.name?.toLowerCase().includes(q) ||
      o.trackingNumber?.toLowerCase().includes(q) ||
      o.deliveryAddress?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const counts = {};
  orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
  const totalRevenue = orders.filter(o => ['delivered','confirmed'].includes(o.status))
    .reduce((s, o) => s + Number(o.totalAmount || 0), 0);

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>🛒 Maagizo Yote</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Angalia na simamia maagizo yote ya mfumo</p>
          </div>
          <button onClick={fetchOrders}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 Onyesha Upya
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Maagizo Yote',  value: orders.length,          color: '#6366f1', bg: '#ede9fe', icon: '📋' },
            { label: 'Inasubiri',     value: counts.pending_payment || 0, color: '#ca8a04', bg: '#fef9c3', icon: '⏳' },
            { label: 'Inasafirishwa', value: counts.in_transit || 0, color: '#0284c7', bg: '#e0f2fe', icon: '🚚' },
            { label: 'Yaliyotolewa',  value: (counts.delivered || 0) + (counts.confirmed || 0), color: '#16a34a', bg: '#dcfce7', icon: '✅' },
            { label: 'Mapato (TZS)',  value: totalRevenue.toLocaleString(), color: '#15803d', bg: '#f0fdf4', icon: '💰' },
          ].map(c => (
            <div key={c.label} style={{ backgroundColor: c.bg, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{c.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 11, color: c.color, opacity: 0.8, fontWeight: 600 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')}
            style={{ padding: '6px 14px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              backgroundColor: filter === 'all' ? '#6366f1' : '#fff', color: filter === 'all' ? '#fff' : '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            Yote ({orders.length})
          </button>
          {Object.entries(STATUS_STYLE).map(([key, ss]) => (
            counts[key] > 0 && (
              <button key={key} onClick={() => setFilter(key)}
                style={{ padding: '6px 14px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  backgroundColor: filter === key ? '#6366f1' : '#fff', color: filter === key ? '#fff' : '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {ss.label} ({counts[key]})
              </button>
            )
          ))}
        </div>

        {/* Search */}
        <input placeholder="🔍 Tafuta kwa #ID, jina la mnunuzi, bidhaa, tracking..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, marginBottom: 16, backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} />

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Inapakia...</div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['#', 'Mnunuzi', 'Bidhaa', 'Muuzaji', 'Kiasi', 'Utoaji', 'Hali', 'Tarehe', ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, idx) => {
                  const ss = STATUS_STYLE[order.status] || STATUS_STYLE.pending;
                  return (
                    <tr key={order.id} onClick={() => setSelected(order)}
                      style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}>
                      <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#6366f1', fontWeight: 700 }}>
                        #{order.id}
                        {order.source === 'offline' && (
                          <div title="Mauzo ya Nje — Hakuna Malipo ya KenteXa"
                            style={{ display: 'inline-block', marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 10, backgroundColor: '#f1f5f9', color: '#64748b', verticalAlign: 'middle' }}>
                            💰 NJE
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{order.buyer?.name || order.manualBuyerName || '—'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{order.buyer?.email || order.phone || '—'}</div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#475569', maxWidth: 160 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {order.product?.name || order.manualProductName || '—'}{order.weightKg ? <span style={{fontSize:9,backgroundColor:'#f1f5f9',color:'#64748b',padding:'1px 4px',borderRadius:4,marginLeft:4}}>{order.weightKg}kg</span> : ''}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#64748b' }}>
                        {order.seller?.businessName || order.seller?.user?.name || '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                        TZS {Number(order.totalAmount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: '#64748b' }}>
                        {order.shippingMethod === 'boda' ? '🛵' :
                         order.shippingMethod === 'kentexa_delivery' ? '🚐' :
                         order.shippingMethod === 'agent' ? '🏢' : '📦'}
                        {' '}{order.shippingMethod || '—'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, backgroundColor: ss.bg, color: ss.color, whiteSpace: 'nowrap' }}>
                          {ss.label}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString('sw-TZ') : '—'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <button onClick={e => { e.stopPropagation(); setSelected(order); }}
                          style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                          👁
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Order detail drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => { setSelected(null); }}>
          <div style={{ width: 460, backgroundColor: '#fff', height: '100%', overflowY: 'auto', padding: 28, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Agizo #{selected.id}</h2>
              <button onClick={() => { setSelected(null); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {/* Manual/offline order banner — appears above status, impossible to miss */}
            {selected.source === 'offline' && (
              <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                💰 <strong>MAUZO YA NJE — HAKUNA MALIPO YA KENTEXA</strong><br/>
                Agizo hili liliundwa na muuzaji kwa mteja aliyelipa nje ya mfumo (M-Pesa, taslimu). KenteXa haikushika pesa hii — hakuna ada wala malipo yanayohitajika kutoka KenteXa.
              </div>
            )}

            {/* Status */}
            {(() => { const ss = STATUS_STYLE[selected.status] || STATUS_STYLE.pending; return (
              <div style={{ backgroundColor: ss.bg, color: ss.color, padding: '10px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, marginBottom: 20 }}>
                {ss.label}
              </div>
            ); })()}

            {/* Key info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Mnunuzi',   value: selected.buyer?.name || selected.manualBuyerName || '—' },
                { label: 'Simu ya Mnunuzi', value: selected.buyer?.phone || selected.phone || selected.manualBuyerPhone || '—', isPhone: true },
                { label: 'Muuzaji',   value: selected.seller?.businessName || selected.seller?.user?.name || '—' },
                { label: 'Simu ya Muuzaji', value: selected.seller?.user?.phone || selected.seller?.phone || '—', isPhone: true },
                { label: 'Bidhaa',    value: selected.product?.name || selected.manualProductName || '—' },
                { label: 'Uzito',     value: selected.weightKg ? `${selected.weightKg} kg` : '—' },
                { label: 'Kiasi',     value: `TZS ${Number(selected.totalAmount || 0).toLocaleString()}` },
                { label: 'Malipo',    value: selected.paymentStatus || '—' },
                { label: 'Chanzo',    value: selected.source === 'online' ? '🌐 Online' : selected.source === 'offline' ? '🤝 Offline' : selected.source === 'seller_shipment' ? '📦 Muuzaji' : selected.source || '—' },
                { label: 'Wakala wa Utoaji', value: selected.deliveryAgent?.name || selected.agentName || '—' },{ label: 'Utoaji', value: selected.shippingMethod || '—' },
                { label: 'Anwani', value: selected.deliveryAddress || '—' },
                { label: 'Tracking', value: selected.trackingNumber || '—' },
              ].map(f => (
                <div key={f.label} style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>{f.label.toUpperCase()}</div>
                  {f.isPhone && f.value !== '—' ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <a href={`tel:${f.value}`} style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none' }}>{f.value}</a>
                      <a href={`https://wa.me/${String(f.value).replace(/[^\d]/g,'').replace(/^0/,'255')}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, backgroundColor: '#25D366', color: '#fff', padding: '2px 6px', borderRadius: 6, textDecoration: 'none', fontWeight: 700 }}>
                        WA
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{f.value}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Admin actions */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                ⚡ Vitendo vya Admin
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {!['delivered','confirmed','cancelled','refunded'].includes(selected.status) && (
                  <button onClick={() => handleForceStatus(selected.id, 'delivered')} disabled={actionLoading}
                    style={{ backgroundColor: '#dcfce7', color: '#16a34a', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>
                    ✅ Weka kama Imetolewa
                  </button>
                )}

                {!['in_transit','cancelled','refunded'].includes(selected.status) && (
                  <button onClick={() => handleForceStatus(selected.id, 'in_transit')} disabled={actionLoading}
                    style={{ backgroundColor: '#e0f2fe', color: '#0284c7', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>
                    🚚 Weka kama Inasafirishwa
                  </button>
                )}

                {!['confirmed','cancelled','refunded'].includes(selected.status) && (
                  selected.source === 'offline' ? (
                    <div style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: 8, fontSize: 12, textAlign: 'left', lineHeight: 1.5 }}>
                      💰 <strong>Mauzo ya Nje — Hakuna Malipo ya KenteXa</strong><br/>
                      Mteja alilipa muuzaji moja kwa moja. KenteXa haikushika pesa hii — hakuna malipo ya kutoa.
                    </div>
                  ) : (
                    <button onClick={() => handleForceStatus(selected.id, 'confirmed')} disabled={actionLoading}
                      style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>
                      🎉 Thibitisha na Toa Malipo kwa Muuzaji
                    </button>
                  )
                )}

                {!['cancelled','refunded'].includes(selected.status) && (
                  <button onClick={() => handleCancel(selected.id)} disabled={actionLoading}
                    style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>
                    ❌ Futa Agizo
                  </button>
                )}

                <button onClick={() => onNavigate(`TrackParcel-${selected.trackingNumber || selected.id}`)}
                  style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>
                  📍 Angalia Ufuatiliaji
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;