import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import PhoneNudgeBanner from '../components/PhoneNudgeBanner';
import ProfileCompletionBanner from '../components/ProfileCompletionBanner';
import api from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const GN = '#16A34A';
const PU = '#7C3AED';
const fmt = n => Number(n||0).toLocaleString();

// ── Revenue Chart — last 7 days ────────────────────────────────────────────
const RevenueChart = ({ orders }) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date:  d,
      label: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      key:   d.toISOString().slice(0, 10),
      revenue: 0,
      orders:  0,
    };
  });

  (orders || []).forEach(o => {
    const day = o.createdAt?.slice(0, 10);
    const found = days.find(d => d.key === day);
    if (found) {
      found.revenue += Number(o.totalAmount || 0);
      found.orders  += 1;
    }
  });

  const maxRev  = Math.max(...days.map(d => d.revenue), 1);
  const W = 320, H = 120, PAD = 28, BAR_W = 32, GAP = 14;
  const totalW  = days.length * (BAR_W + GAP) - GAP;
  const startX  = (W - totalW) / 2;

  return (
    <div style={{ backgroundColor: WH, borderRadius: 16, padding: 20,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: DK }}>
          📊 Revenue — This Week
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: GN }}>
          TZS {fmt(days.reduce((s, d) => s + d.revenue, 0))}
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H + PAD}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={B} />
            <stop offset="100%" stopColor={PU} />
          </linearGradient>
        </defs>
        {days.map((day, i) => {
          const x      = startX + i * (BAR_W + GAP);
          const barH   = day.revenue > 0 ? Math.max(8, (day.revenue / maxRev) * H) : 4;
          const y      = H - barH;
          const isToday = i === 6;
          return (
            <g key={day.key}>
              <rect x={x} y={y} width={BAR_W} height={barH}
                rx={6} fill={isToday ? 'url(#barGrad)' : '#E2E8F0'}
                style={{ transition: 'height 0.3s' }} />
              {(isToday && day.revenue > 0) && (
                <text x={x + BAR_W / 2} y={y - 6}
                  textAnchor="middle" fontSize={9} fill={B} fontWeight="700">
                  {(day.revenue / 1000).toFixed(0)}k
                </text>
              )}
              <text x={x + BAR_W / 2} y={H + PAD - 4}
                textAnchor="middle" fontSize={10}
                fill={isToday ? B : '#94A3B8'}
                fontWeight={isToday ? '800' : '400'}>
                {day.label}
              </text>
              {day.orders > 0 && (
                <circle cx={x + BAR_W / 2} cy={y - 14}
                  r={7} fill={isToday ? B : '#A5B4FC'} />
              )}
              {day.orders > 0 && (
                <text x={x + BAR_W / 2} y={y - 10}
                  textAnchor="middle" fontSize={8} fill={WH} fontWeight="800">
                  {day.orders}
                </text>
              )}
            </g>
          );
        })}
        <line x1={startX - 4} y1={H} x2={startX + totalW + 4} y2={H}
          stroke="#F1F5F9" strokeWidth={1} />
      </svg>

      <div style={{ display: 'flex', gap: 16, marginTop: 4, justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: GR }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#E2E8F0' }} />
          Past days
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: GR }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: `linear-gradient(135deg,${B},${PU})` }} />
          Today
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: GR }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#A5B4FC' }} />
          Order count
        </div>
      </div>
    </div>
  );
};

// ── Menu row — icon, label, optional live value, chevron ──────────────────
const MenuRow = ({ icon, label, value, onClick, last }) => (
  <button onClick={onClick}
    style={{ width:'100%', display:'flex', alignItems:'center', gap:14,
      padding:'14px 16px', border:'none', background:'none', cursor:'pointer',
      borderBottom: last ? 'none' : '1px solid #F8FAFC', textAlign:'left' }}>
    <span style={{ fontSize:20, width:26, textAlign:'center', flexShrink:0 }}>{icon}</span>
    <span style={{ flex:1, fontSize:14, fontWeight:700, color:DK }}>{label}</span>
    {value != null && (
      <span style={{ fontSize:12, fontWeight:700, color:GR, flexShrink:0 }}>{value}</span>
    )}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={GR} strokeWidth="2" style={{ flexShrink:0 }}>
      <polyline points="9,18 15,12 9,6"/>
    </svg>
  </button>
);

const SellerDashboard = ({ onNavigate, isLoggedIn, onLogout, userRole, onOpenMoment, currentUser }) => {
  const [data, setData]                       = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');
  const [profile, setProfile]                 = useState(null);
  const [profileStatus, setProfileStatus]     = useState(null);
  const [invoiceRequests, setInvoiceRequests] = useState([]);
  const [showCreateInvoice, setShowCreateInvoice] = useState(null);
  const [invoiceForm, setInvoiceForm]         = useState({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 });
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceMessage, setInvoiceMessage]   = useState('');
  const [vanStatus, setVanStatus]             = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      setLoading(true);
      const profileRes = await api.get('/seller/my-profile');
      setProfile(profileRes.data);
      setProfileStatus(profileRes.data.status);
      if (profileRes.data.status === 'approved') {
        const dashRes = await api.get('/seller/dashboard');
        setData(dashRes.data);
        try {
          const invoiceRes = await api.get('/classifieds/invoices/seller-requests');
          setInvoiceRequests(invoiceRes.data);
        } catch { setInvoiceRequests([]); }
        try {
          const vanRes = await api.get('/daily-batches/manifest/today');
          setVanStatus(vanRes.data);
        } catch { setVanStatus(null); }
      }
    } catch (err) {
      if (err?.response?.status === 404) setProfileStatus('not_applied');
      else setError('Could not load the dashboard');
    } finally { setLoading(false); }
  };

  const handleCreateInvoice = async (requestId) => {
    if (!invoiceForm.amount || !invoiceForm.invoiceDescription) {
      setError('Amount and description are required'); return;
    }
    try {
      setCreatingInvoice(true);
      const res = await api.post(`/classifieds/invoices/${requestId}/create`, {
        amount: Number(invoiceForm.amount),
        invoiceDescription: invoiceForm.invoiceDescription,
        sellerNotes: invoiceForm.sellerNotes,
        dueDays: Number(invoiceForm.dueDays),
      });
      setInvoiceMessage(`✅ Invoice ${res.data.invoiceNumber} sent to the buyer!`);
      setShowCreateInvoice(null);
      setInvoiceForm({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 });
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not create the invoice');
    } finally { setCreatingInvoice(false); }
  };

  const statusConfig = {
    pending:     { icon: '⏳', title: 'Application Under Review', desc: 'Your seller application is being reviewed. We\u2019ll let you know within 24 hours.', color: '#D97706', bg: '#FEF9C3' },
    approved:    { icon: '✅', title: 'Seller Account Active',    desc: 'Your account is approved and active.',                                              color: GN,        bg: '#DCFCE7' },
    rejected:    { icon: '❌', title: 'Application Declined',     desc: `Reason: ${profile?.rejectionReason || 'Not specified'}`,                            color: '#DC2626',  bg: '#FEE2E2' },
    suspended:   { icon: '🚫', title: 'Account Suspended',        desc: `Reason: ${profile?.rejectionReason || 'Contact support'}`,                          color: '#DC2626',  bg: '#FEE2E2' },
    not_applied: { icon: '🏪', title: 'Not Applied Yet',          desc: 'You haven\u2019t applied to become a seller yet.',                                  color: PU,         bg: '#EDE9FE' },
  };

  const statusInfo  = statusConfig[profileStatus] || statusConfig['not_applied'];
  const displayName = profile?.storeName || profile?.businessName || 'Your Business';
  const inputStyle  = { width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' };

  const vanBatch     = vanStatus?.batch;
  const vanParcels   = vanStatus?.totalParcels || 0;
  const vanCutoff    = vanBatch ? new Date(vanBatch.cutoffTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
  const vanDeparts   = vanBatch ? new Date(vanBatch.plannedDepartureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      <Navbar currentPage="SellerDashboard" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ textAlign: 'center', padding: 80, color: GR }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>Loading...
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#F8FAFC', fontFamily: "'Inter','Segoe UI',sans-serif",
      paddingBottom: 90 }}>
      <Navbar currentPage="SellerDashboard" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* ── Identity header ── */}
      <div style={{ backgroundColor: WH, borderBottom: '1px solid #F1F5F9', padding: '18px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: GR, marginBottom: 2 }}>
              🏪 SELLER DASHBOARD
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 900, color: DK, margin: 0 }}>{displayName}</h1>
          </div>
          {profileStatus === 'approved' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ backgroundColor: '#DCFCE7', color: GN, padding: '5px 12px',
                borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                ✅ Approved
              </span>
              <button onClick={() => onNavigate('StoreSettings')}
                style={{ backgroundColor: '#F1F5F9', color: DK, border: 'none',
                  padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                  fontSize: 11, fontWeight: 800 }}>
                ✏️ Edit Store
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '14px 16px 32px', maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {error && (
          <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '12px 14px',
            borderRadius: 10, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {profileStatus !== 'approved' && (
          <div style={{ backgroundColor: statusInfo.bg, borderRadius: 16, padding: '24px 16px',
            marginBottom: 24, border: `2px solid ${statusInfo.color}20`, textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>{statusInfo.icon}</div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: statusInfo.color, margin: '0 0 6px' }}>{statusInfo.title}</h2>
            <p style={{ fontSize: 13, color: GR, margin: '0 0 16px' }}>{statusInfo.desc}</p>
            {profileStatus === 'not_applied' && (
              <button onClick={() => onNavigate('BecomeSeller')}
                style={{ background: `linear-gradient(135deg,${B},${PU})`, color: WH, border: 'none',
                  padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                🚀 Apply Now
              </button>
            )}
          </div>
        )}

        {profileStatus === 'approved' && data && (
          <>
            {profile && !profile.phone && <PhoneNudgeBanner onSaved={fetchData} />}
            <ProfileCompletionBanner profile={profile} onNavigate={onNavigate} />

            {/* ── Van Today banner ── */}
            {vanBatch && (
              <div onClick={() => onNavigate('VanToday')}
                style={{ background: `linear-gradient(135deg,#1E1B4B,${B})`, borderRadius: 14,
                  padding: '14px 16px', marginBottom: 16, cursor: 'pointer', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#A5B4FC', marginBottom: 4 }}>
                    🚐 KenteXa Van — Today
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: WH }}>
                    {vanParcels} parcels
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 400, marginLeft: 8 }}>
                      Cutoff: {vanCutoff} · Departs: {vanDeparts}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                  backgroundColor: PU, color: WH }}>
                  View →
                </div>
              </div>
            )}

            {/* ── Quick Actions — 4 live numbers, not decoration ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Products', value: fmt(data.stats.totalProducts),  icon: '📦', color: B,  bg: '#EFF6FF', page: 'SellerProducts' },
                { label: 'Listings', value: fmt(data.stats.totalClassifieds), icon: '🏷️', color: '#EA580C', bg: '#FFF7ED', page: 'SellerClassifieds' },
                { label: 'Orders',   value: fmt(data.stats.totalOrders),    icon: '🛒', color: PU, bg: '#F5F3FF', page: 'SellerOrders' },
                { label: 'Revenue',  value: `${fmt(data.stats.totalRevenue)}`, icon: '💰', color: GN, bg: '#F0FDF4', page: 'SellerAnalytics' },
              ].map(s => (
                <button key={s.label} onClick={() => onNavigate(s.page)}
                  style={{ backgroundColor: s.bg, border: 'none', borderRadius: 14,
                    padding: '12px 8px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: s.color, wordBreak: 'break-word' }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: GR, marginTop: 1, fontWeight: 700 }}>{s.label}</div>
                </button>
              ))}
            </div>

            {/* ── Menu — vertical list, Instagram-Settings style ── */}
            <div style={{ backgroundColor: WH, borderRadius: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 16 }}>
              <MenuRow icon="📸" label="Share a Moment" onClick={() => onOpenMoment?.('selling')} />
              <MenuRow icon="📦" label="My Products" onClick={() => onNavigate('SellerProducts')} />
              <MenuRow icon="🏷️" label="My Listings" onClick={() => onNavigate('SellerClassifieds')} />
              <MenuRow icon="🛒" label="Orders" onClick={() => onNavigate('SellerOrders')} />
              <MenuRow icon="👥" label="Customers" onClick={() => onNavigate('SellerCustomers')} />
              <MenuRow icon="💬" label="Inbox" onClick={() => onNavigate('SellerInbox')} />
              <MenuRow icon="📦" label="Ship an Item" onClick={() => onNavigate('SellerShipment')} />
              <MenuRow icon="🚐" label="Van Today" value={vanParcels > 0 ? `${vanParcels} parcels` : null} onClick={() => onNavigate('VanToday')} />
              <MenuRow icon="🧾" label="Invoices" value={invoiceRequests.filter(r=>r.status==='pending').length > 0 ? `${invoiceRequests.filter(r=>r.status==='pending').length} pending` : null} onClick={() => onNavigate('SellerInvoices')} />
              <MenuRow icon="💸" label="Payouts" onClick={() => onNavigate('SellerPayouts')} />
              <MenuRow icon="📊" label="Analytics" onClick={() => onNavigate('SellerAnalytics')} />
              <MenuRow icon="👥" label="My Team" onClick={() => onNavigate('SellerTeam')} />
              <MenuRow icon="🌐" label="Public Business Profile" onClick={() => onNavigate('CommerceProfile')} />
              <MenuRow icon="🏪" label="Store Settings" onClick={() => onNavigate('StoreSettings')} last />
            </div>

            {/* Recent Orders */}
            <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: 0 }}>🛒 Recent Orders</h2>
                <button onClick={() => onNavigate('SellerOrders')}
                  style={{ backgroundColor: '#EDE9FE', color: PU, border: 'none', padding: '6px 12px',
                    borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  View All →
                </button>
              </div>

              <RevenueChart orders={data.recentOrders} />

              {data.recentOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🛒</div>
                  <p style={{ fontSize: 13 }}>No orders yet</p>
                </div>
              ) : (
                data.recentOrders.map(order => (
                  <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10,
                    marginBottom: 8, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DK,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        #{order.id} — {order.product?.name || order.manualProductName || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: GR }}>
                        {order.recipientName || order.buyer?.name || order.manualBuyerName || '—'} · {new Date(order.createdAt).toLocaleDateString('en-GB')}
                      </div>
                      {order.shippingMethod === 'kentexa_delivery' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: PU }}>🚐 KenteXa Van</span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: PU }}>TZS {fmt(order.totalAmount)}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        backgroundColor: order.status === 'delivered' ? '#DCFCE7' : order.status === 'paid' ? '#DBEAFE' : '#FEF9C3',
                        color: order.status === 'delivered' ? GN : order.status === 'paid' ? B : '#CA8A04' }}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Invoice Requests */}
            <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: '0 0 4px' }}>🧾 Invoice Requests</h2>
              <p style={{ fontSize: 12, color: GR, margin: '0 0 14px' }}>Buyers requesting an invoice from your listings</p>

              {invoiceMessage && (
                <div style={{ backgroundColor: '#DCFCE7', color: GN, padding: '10px 14px', borderRadius: 8,
                  marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
                  {invoiceMessage}
                  <button onClick={() => setInvoiceMessage('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: GN, fontWeight: 'bold' }}>×</button>
                </div>
              )}

              {invoiceRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
                  <p style={{ fontSize: 13 }}>No invoice requests yet</p>
                </div>
              ) : (
                invoiceRequests.map(req => (
                  <div key={req.id} style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14,
                    marginBottom: 10, border: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: DK, marginBottom: 2 }}>{req.classifiedTitle}</div>
                        <div style={{ fontSize: 11, color: GR }}>From: <strong>{req.buyerName}</strong></div>
                        {req.buyerPhone && <div style={{ fontSize: 11, color: GR }}>📞 {req.buyerPhone}</div>}
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                          Listing price: TZS {fmt(req.listingPrice)}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, flexShrink: 0,
                        backgroundColor: req.status === 'pending' ? '#FEF9C3' : req.status === 'sent' ? '#DBEAFE' : req.status === 'paid' ? '#DCFCE7' : '#FEE2E2',
                        color: req.status === 'pending' ? '#CA8A04' : req.status === 'sent' ? B : req.status === 'paid' ? GN : '#DC2626' }}>
                        {req.status.toUpperCase()}
                      </span>
                    </div>

                    {req.status === 'sent' && req.invoiceNumber && (
                      <div style={{ backgroundColor: '#DBEAFE', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12 }}>
                        <strong>Invoice:</strong> {req.invoiceNumber} · TZS {fmt(req.amount)}
                      </div>
                    )}
                    {req.status === 'paid' && (
                      <div style={{ backgroundColor: '#DCFCE7', borderRadius: 8, padding: 10, fontSize: 12, color: GN, fontWeight: 600 }}>
                        ✅ Paid — TZS {fmt(req.amount)}
                      </div>
                    )}

                    {req.status === 'pending' && showCreateInvoice === req.id && (
                      <div style={{ backgroundColor: WH, borderRadius: 10, padding: 14, marginTop: 10, border: `2px solid ${B}` }}>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: DK, margin: '0 0 12px' }}>Create Invoice for {req.buyerName}</h4>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>Amount (TZS) *</label>
                          <input type="number" placeholder={String(req.listingPrice)} value={invoiceForm.amount}
                            onChange={e => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>Invoice Description *</label>
                          <input placeholder="e.g. Toyota Corolla 2018" value={invoiceForm.invoiceDescription}
                            onChange={e => setInvoiceForm({ ...invoiceForm, invoiceDescription: e.target.value })} style={inputStyle} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setShowCreateInvoice(null); setInvoiceForm({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 }); }}
                            style={{ flex: 1, backgroundColor: '#F1F5F9', color: GR, border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Cancel</button>
                          <button onClick={() => handleCreateInvoice(req.id)} disabled={creatingInvoice}
                            style={{ flex: 2, background: creatingInvoice ? '#A5B4FC' : `linear-gradient(135deg,${B},${PU})`, color: WH, border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                            {creatingInvoice ? '⏳' : '📤 Send Invoice'}
                          </button>
                        </div>
                      </div>
                    )}

                    {req.status === 'pending' && showCreateInvoice !== req.id && (
                      <button onClick={() => { setShowCreateInvoice(req.id); setInvoiceForm({ amount: String(req.listingPrice || ''), invoiceDescription: req.classifiedTitle, sellerNotes: '', dueDays: 3 }); }}
                        style={{ backgroundColor: B, color: WH, border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                        🧾 Create Invoice
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Business Profile summary */}
            <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: 0 }}>🏪 Business Profile</h2>
                <button onClick={() => onNavigate('StoreSettings')}
                  style={{ backgroundColor: '#EDE9FE', color: PU, border: 'none', padding: '6px 12px',
                    borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  ✏️ Edit
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Store Name',    value: profile?.storeName || '— Not set —' },
                  { label: 'Business Name', value: profile?.businessName || '—' },
                  { label: 'Phone',         value: profile?.phone || '—' },
                  { label: 'Address',       value: profile?.businessLocation || profile?.address || '—' },
                ].map(item => (
                  <div key={item.label} style={{ padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: GR, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700,
                      color: item.value?.startsWith?.('—') ? '#94A3B8' : DK,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SellerDashboard;