import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const WA = (phone) => {
  if (!phone) return null;
  const n = String(phone).replace(/[^\d]/g,'').replace(/^0/,'255');
  return `https://wa.me/${n}`;
};

const PhoneCell = ({ phone }) => {
  if (!phone || phone === '—') return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <a href={`tel:${phone}`} style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>
        {phone}
      </a>
      <a href={WA(phone)} target="_blank" rel="noreferrer"
        style={{ fontSize: 9, backgroundColor: '#25D366', color: '#fff', padding: '2px 5px',
          borderRadius: 4, textDecoration: 'none', fontWeight: 700 }}>
        WA
      </a>
    </div>
  );
};

const STATUS = {
  awaiting_payment:   { bg: '#fef9c3', color: '#ca8a04', label: 'Inasubiri Malipo' },
  payment_processing: { bg: '#dbeafe', color: '#2563eb', label: 'Inashughulikiwa' },
  paid:               { bg: '#dcfce7', color: '#16a34a', label: '✅ Imelipwa' },
  expired:            { bg: '#fee2e2', color: '#dc2626', label: 'Imekwisha Muda' },
  cancelled:          { bg: '#f1f5f9', color: '#64748b', label: 'Imefutwa' },
};

const Invoices = ({ activePage, onNavigate, onLogout }) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchInvoices(); }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await api.get('/invoices');
      setInvoices(res.data || []);
    } catch {
      setError('Imeshindwa kupakia ankara');
    } finally { setLoading(false); }
  };

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.order?.buyer?.name?.toLowerCase().includes(q) ||
      inv.order?.buyer?.phone?.includes(q) ||
      inv.order?.seller?.user?.name?.toLowerCase().includes(q) ||
      inv.order?.seller?.businessName?.toLowerCase().includes(q) ||
      inv.order?.product?.name?.toLowerCase().includes(q) ||
      inv.order?.manualProductName?.toLowerCase().includes(q);
    const matchFilter = filter === 'all' || inv.status === filter;
    return matchSearch && matchFilter;
  });

  const totalPaid    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalPending = invoices.filter(i => i.status === 'awaiting_payment').reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>🧾 Ankara</h1>
            <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>
              {invoices.length} ankara zote
            </p>
          </div>
          <button onClick={fetchInvoices}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            🔄 Onyesha Upya
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px',
            borderRadius: 8, marginBottom: 20 }}>❌ {error}</div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Zote',         value: invoices.length,
              sub: '', bg: '#ede9fe', color: '#7c3aed' },
            { label: 'Zimelipwa',    value: invoices.filter(i => i.status === 'paid').length,
              sub: `TZS ${totalPaid.toLocaleString()}`, bg: '#dcfce7', color: '#16a34a' },
            { label: 'Zinasubiri',   value: invoices.filter(i => i.status === 'awaiting_payment').length,
              sub: `TZS ${totalPending.toLocaleString()}`, bg: '#fef9c3', color: '#ca8a04' },
            { label: 'Mapato Yote',  value: `TZS ${totalPaid.toLocaleString()}`,
              sub: 'Zilizolipwa', bg: '#dbeafe', color: '#2563eb' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
              {s.sub && <div style={{ fontSize: 11, color: s.color, marginTop: 2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <input type="text" placeholder="🔍 Tafuta ankara, mteja, muuzaji, bidhaa..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} />
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }}>
            <option value="all">Hali Zote</option>
            <option value="awaiting_payment">Zinasubiri Malipo</option>
            <option value="paid">Zimelipwa</option>
            <option value="payment_processing">Zinashughulikiwa</option>
            <option value="expired">Zimekwisha Muda</option>
            <option value="cancelled">Zimefutwa</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Inapakia...</div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Ankara #','Agizo','Bidhaa','Muuzaji','Mnunuzi / Simu','Kiasi','Hali','Tarehe'].map(h => (
                    <th key={h} style={{ padding: '14px 16px', textAlign: 'left',
                      backgroundColor: '#f1f5f9', color: '#64748b',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="8" style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Hakuna ankara
                  </td></tr>
                ) : filtered.map(inv => {
                  const sc = STATUS[inv.status] || { bg: '#f1f5f9', color: '#64748b', label: inv.status };
                  const seller = inv.order?.seller;
                  const buyer  = inv.buyer || inv.order?.buyer;
                  const orderPaymentStatus = inv.order?.paymentStatus;
                  // Show mismatch warning
                  const statusMismatch = orderPaymentStatus === 'paid' && inv.status === 'awaiting_payment';
                  return (
                    <tr key={inv.id}
                      onClick={() => setSelected(inv)}
                      style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer',
                        backgroundColor: statusMismatch ? '#fff7ed' : 'transparent' }}>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace',
                        fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
                        {inv.invoiceNumber}
                        {statusMismatch && (
                          <div style={{ fontSize: 9, color: '#c2410c', fontWeight: 800 }}>
                            ⚠️ AGIZO LIMELIPWA
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>
                        #{inv.order?.id || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#0f172a',
                        maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.order?.product?.name || inv.order?.manualProductName || '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                          {seller?.businessName || seller?.user?.name || '—'}
                        </div>
                        <PhoneCell phone={seller?.user?.phone || seller?.phone} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                          {buyer?.name || inv.order?.manualBuyerName || '—'}
                        </div>
                        <PhoneCell phone={buyer?.phone || inv.order?.phone || inv.order?.manualBuyerPhone} />
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14,
                        fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        TZS {Number(inv.amount).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11,
                          fontWeight: 700, backgroundColor: sc.bg, color: sc.color,
                          whiteSpace: 'nowrap' }}>
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b',
                        whiteSpace: 'nowrap' }}>
                        {new Date(inv.createdAt).toLocaleDateString('sw-TZ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Invoice detail drawer */}
        {selected && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}
            onClick={() => setSelected(null)}>
            <div style={{ width: 440, backgroundColor: '#fff', height: '100%',
              overflowY: 'auto', padding: 28, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
              onClick={e => e.stopPropagation()}>

              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                    {selected.invoiceNumber}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Agizo #{selected.order?.id}
                  </div>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 20, color: '#94a3b8' }}>✕</button>
              </div>

              {/* Status */}
              {(() => {
                const sc = STATUS[selected.status] || { bg: '#f1f5f9', color: '#64748b', label: selected.status };
                const orderPaid = selected.order?.paymentStatus === 'paid';
                const mismatch = orderPaid && selected.status === 'awaiting_payment';
                return (
                  <div>
                    <div style={{ backgroundColor: sc.bg, color: sc.color, padding: '10px 14px',
                      borderRadius: 10, fontSize: 13, fontWeight: 800, marginBottom: mismatch ? 8 : 16 }}>
                      {sc.label}
                    </div>
                    {mismatch && (
                      <div style={{ backgroundColor: '#fff7ed', color: '#c2410c', padding: '10px 14px',
                        borderRadius: 10, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
                        ⚠️ Agizo limelipwa lakini ankara bado inaonyesha "Inasubiri Malipo".
                        Hii itatoka punde tu unapobonyeza Onyesha Upya.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Seller section */}
              <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8',
                  marginBottom: 8, letterSpacing: 0.5 }}>🏪 MUUZAJI</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                  {selected.order?.seller?.businessName || selected.order?.seller?.user?.name || '—'}
                </div>
                <PhoneCell phone={selected.order?.seller?.user?.phone || selected.order?.seller?.phone} />
                {selected.order?.seller?.user?.email && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    ✉️ {selected.order.seller.user.email}
                  </div>
                )}
              </div>

              {/* Buyer section */}
              <div style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a',
                  marginBottom: 8, letterSpacing: 0.5 }}>👤 MNUNUZI</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                  {selected.buyer?.name || selected.order?.buyer?.name || selected.order?.manualBuyerName || '—'}
                </div>
                <PhoneCell phone={selected.buyer?.phone || selected.order?.buyer?.phone || selected.order?.phone} />
              </div>

              {/* Invoice details */}
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b',
                  marginBottom: 8, letterSpacing: 0.5 }}>📋 MAELEZO</div>
                {[
                  ['Bidhaa',     selected.order?.product?.name || selected.order?.manualProductName || '—'],
                  ['Kiasi',      `TZS ${Number(selected.amount).toLocaleString()}`],
                  ['Risiti #',   selected.receiptNumber || '—'],
                  ['Njia ya Malipo', selected.paymentMethod || '—'],
                  ['Malipo ya Mlangoni', selected.agentId ? `Agent ID: ${selected.agentId}` : '—'],
                  ['Rejeleo',    selected.transactionReference || '—'],
                  ['Tarehe ya Kulipa', selected.paidAt ? new Date(selected.paidAt).toLocaleString('sw-TZ') : '—'],
                  ['Tarehe ya Kuisha', selected.expiredAt ? new Date(selected.expiredAt).toLocaleDateString('sw-TZ') : '—'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>{l}</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <button onClick={() => onNavigate(`TrackParcel-${selected.order?.trackingNumber || 'KTX-ORD-' + selected.order?.id}`)}
                style={{ width: '100%', backgroundColor: '#eff6ff', color: '#1d4ed8',
                  border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700 }}>
                📍 Fuatilia Agizo
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Invoices;