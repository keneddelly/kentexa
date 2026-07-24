import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const API_URL = process.env.REACT_APP_API_URL || 'https://api.kentexa.com';

const SellerInvoices = ({ onNavigate, currentUser, isLoggedIn, onLogout, userRole, preSelected }) => {
  const [requests, setRequests]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [showForm, setShowForm]           = useState(null);
  const [form, setForm]                   = useState({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 });
  const [creating, setCreating]           = useState(false);
  const [showManual, setShowManual]       = useState(false);
  const [myClassifieds, setMyClassifieds] = useState([]);
  const [loadingClassifieds, setLoadingClassifieds] = useState(false);
  const [selectedClassified, setSelectedClassified] = useState(null);
  const [manualForm, setManualForm]       = useState({ buyerName: '', buyerPhone: '', deliveryAddress: '', amount: '', notes: '', dueDays: 3 });
  const [creatingManual, setCreatingManual] = useState(false);
  const [manualResult, setManualResult]   = useState(null);
  const [classifiedSearch, setClassifiedSearch] = useState('');

  // Shipping modal state
  const [shippingInvoice, setShippingInvoice] = useState(null);
  const [shippingMethod, setShippingMethod]   = useState('');
  const [shippingNote, setShippingNote]       = useState('');
  const [submittingShipping, setSubmittingShipping] = useState(false);

  // ── Tracking result — shown after shipping method is set ─────────────────
  const [lastTracking, setLastTracking]   = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchRequests();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (preSelected) {
      setShowManual(true);
      setSelectedClassified(preSelected);
      setManualForm(prev => ({ ...prev, amount: String(preSelected.price) }));
      fetchMyClassifieds();
    }
  }, [preSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/classifieds/invoices/seller-requests');
      setRequests(res.data);
    } catch { setError('Failed to load invoice requests'); }
    finally { setLoading(false); }
  };

  const fetchMyClassifieds = async () => {
    try {
      setLoadingClassifieds(true);
      const res = await api.get('/classifieds/user/mine');
      setMyClassifieds(res.data);
    } catch { setMyClassifieds([]); }
    finally { setLoadingClassifieds(false); }
  };

  const openManualModal = () => {
    setShowManual(true); setManualResult(null); setSelectedClassified(null);
    setClassifiedSearch('');
    setManualForm({ buyerName: '', buyerPhone: '', deliveryAddress: '', amount: '', notes: '', dueDays: 3 });
    fetchMyClassifieds();
  };

  const handleSelectClassified = (c) => {
    setSelectedClassified(c);
    setManualForm(prev => ({ ...prev, amount: String(c.price) }));
  };

  const handleCreateInvoice = async (requestId) => {
    if (!form.amount || !form.invoiceDescription) { setError('Amount and description are required'); return; }
    try {
      setCreating(true); setError('');
      const res = await api.post(`/classifieds/invoices/${requestId}/create`, {
        amount: Number(form.amount), invoiceDescription: form.invoiceDescription,
        sellerNotes: form.sellerNotes, dueDays: Number(form.dueDays),
      });
      setSuccess(`✅ Invoice ${res.data.invoiceNumber} sent to buyer!`);
      setShowForm(null);
      setForm({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 });
      fetchRequests();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create invoice');
    } finally { setCreating(false); }
  };

  const handleCreateManualInvoice = async () => {
    if (!manualForm.buyerName.trim())  { setError('Buyer name is required');  return; }
    if (!manualForm.buyerPhone.trim()) { setError('Buyer phone is required');  return; }
    if (!manualForm.amount)            { setError('Amount is required');       return; }
    if (!selectedClassified)           { setError('Please select a classified listing'); return; }
    try {
      setCreatingManual(true); setError('');
      const res = await api.post('/classifieds/invoices/manual', {
        buyerName: manualForm.buyerName.trim(), buyerPhone: manualForm.buyerPhone.trim(),
        deliveryAddress: manualForm.deliveryAddress.trim(), productName: selectedClassified.title,
        classifiedId: selectedClassified.id, amount: Number(manualForm.amount),
        notes: manualForm.notes.trim(), dueDays: Number(manualForm.dueDays),
      });
      setManualResult(res.data);
      setShowManual(false);
      setManualForm({ buyerName: '', buyerPhone: '', deliveryAddress: '', amount: '', notes: '', dueDays: 3 });
      setSelectedClassified(null);
      fetchRequests();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create invoice');
    } finally { setCreatingManual(false); }
  };

  // ── Shipping handler — now creates a real KenteXa order with tracking ─────
  const handleSubmitShipping = async () => {
    if (!shippingMethod) { setError('Please choose a shipping method'); return; }
    try {
      setSubmittingShipping(true); setError('');
      const res = await api.patch(`/classifieds/invoices/${shippingInvoice.id}/shipping`, {
        shippingMethod, notes: shippingNote.trim(),
      });
      const orderId        = res.data?.orderId;
      const trackingNumber = res.data?.trackingNumber;

      setSuccess(
        trackingNumber
          ? `✅ Agizo #${orderId} limeundwa! Namba ya kufuatilia: ${trackingNumber}`
          : `✅ Njia ya utoaji imewekwa. Mnunuzi ataarifu.`
      );

      // Store tracking info for the card below
      if (trackingNumber) {
        setLastTracking({ orderId, trackingNumber });
      }

      setShippingInvoice(null); setShippingMethod(''); setShippingNote('');
      fetchRequests();

      // Navigate to SellerOrders after a moment so seller can manage the shipment
      if (orderId) {
        setTimeout(() => onNavigate('SellerOrders'), 2500);
      } else {
        setTimeout(() => setSuccess(''), 5000);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update shipping');
    } finally { setSubmittingShipping(false); }
  };

  const statusBadge = (status) => ({
    pending:   { bg: '#fef9c3', color: '#ca8a04' },
    sent:      { bg: '#dbeafe', color: '#2563eb' },
    paid:      { bg: '#dcfce7', color: '#16a34a' },
    shipping:  { bg: '#ffedd5', color: '#ea580c' },
    delivered: { bg: '#d1fae5', color: '#065f46' },
    cancelled: { bg: '#fee2e2', color: '#dc2626' },
  }[status] || { bg: '#f1f5f9', color: '#64748b' });

  const filteredClassifieds = myClassifieds.filter(c =>
    c.title.toLowerCase().includes(classifiedSearch.toLowerCase())
  );

  const inputStyle = {
    width: '100%', padding: '11px', borderRadius: '8px',
    border: '2px solid #e2e8f0', fontSize: '14px',
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="SellerInvoices" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ textAlign: 'center', padding: '60px 16px', color: '#64748b' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>Loading invoices...
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="SellerInvoices" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title="Invoices"
        right={
          <button onClick={openManualModal}
            style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
            + Create
          </button>
        }
      />

      <div style={{ padding: '14px 16px 32px', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>{success}</span>
            <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* ── Tracking number card — shown after shipping method is set ─────── */}
        {lastTracking && (
          <div style={{ backgroundColor: '#fff', border: '2px solid #1d4ed8', borderRadius: 14, padding: 18, marginBottom: 16, boxShadow: '0 4px 16px rgba(29,78,216,0.12)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>
              📦 Namba ya Kufuatilia Imetolewa
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, color: '#1d4ed8', marginBottom: 10, letterSpacing: 1 }}>
              {lastTracking.trackingNumber}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              Tuma namba hii kwa mnunuzi wako ili aweze kufuatilia kifurushi chake.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { navigator.clipboard.writeText(lastTracking.trackingNumber); setSuccess('Namba imenakiliwa!'); }}
                style={{ flex: 1, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '2px solid #1d4ed8', padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                📋 Nakili Namba
              </button>
              <button onClick={() => onNavigate(`TrackParcel-${lastTracking.trackingNumber}`)}
                style={{ flex: 1, backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                🔍 Fuatilia Sasa
              </button>
              <button onClick={() => onNavigate('SellerOrders')}
                style={{ flex: 1, backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                📦 Maagizo Yangu
              </button>
              <button onClick={() => setLastTracking(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, padding: '0 4px' }}>×</button>
            </div>
          </div>
        )}

        {/* Manual Invoice Result */}
        {manualResult && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', marginBottom: 16, border: '2px solid #7c3aed', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 6 }}>Invoice Created!</h2>
            <p style={{ color: '#64748b', marginBottom: 16, fontSize: 13 }}>Share this invoice number with your buyer so they can pay.</p>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>Invoice Number</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'monospace', letterSpacing: 1 }}>{manualResult.invoiceNumber}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, textAlign: 'left' }}>
              {[
                { label: 'Buyer',   value: manualResult.buyerName },
                { label: 'Phone',   value: manualResult.buyerPhone },
                { label: 'Product', value: manualResult.productName },
                { label: 'Amount',  value: `TZS ${Number(manualResult.amount).toLocaleString()}` },
              ].map(item => (
                <div key={item.label} style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { navigator.clipboard.writeText(manualResult.invoiceNumber); setSuccess('Copied!'); }}
                style={{ flex: 1, backgroundColor: '#ede9fe', color: '#7c3aed', border: 'none', padding: 11, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>📋 Copy</button>
              <button onClick={() => setManualResult(null)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 11, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Done</button>
            </div>
          </div>
        )}

        {/* Invoice Requests */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>📥 All Invoices</h2>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>Invoice requests and manual invoices</p>

          {requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🧾</div>
              <p style={{ fontSize: 13 }}>No invoices yet. Create one above.</p>
            </div>
          ) : requests.map(req => {
            const badge = statusBadge(req.status);
            const msgParts = (req.buyerMessage || '').split(' | ');
            const parsedName  = msgParts.find(p => p.startsWith('Name:'))?.replace('Name: ', '')   || req.buyerName  || '—';
            const parsedPhone = msgParts.find(p => p.startsWith('Phone:'))?.replace('Phone: ', '') || req.buyerPhone || '—';
            const isPaid = req.status === 'paid';
            const needsShipping = isPaid && !req.shippingMethod;
            // Derive tracking number from linkedOrderId if available
            const trackingNum = req.trackingNumber || (req.linkedOrderId ? `KTX-ORD-${req.linkedOrderId}` : null);

            return (
              <div key={req.id} style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 10, border: needsShipping ? '2px solid #f97316' : '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.classifiedTitle || req.invoiceDescription || 'Manual Invoice'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>👤 {parsedName} · 📞 {parsedPhone}</div>
                    {req.invoiceNumber && <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, marginTop: 2 }}>{req.invoiceNumber}</div>}
                    {/* Show tracking number if order was created */}
                    {trackingNum && (
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 800, marginTop: 3 }}>
                        📦 {trackingNum}
                        <button onClick={() => onNavigate(`TrackParcel-${trackingNum}`)}
                          style={{ marginLeft: 8, fontSize: 10, backgroundColor: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '1px 6px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
                          Fuatilia
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(req.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: badge.bg, color: badge.color }}>
                      {req.status.toUpperCase()}
                    </span>
                    {req.amount && (
                      <span style={{ fontSize: 13, fontWeight: 900, color: '#1d4ed8' }}>TZS {Number(req.amount).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                {/* ── PAID — needs shipping ── */}
                {needsShipping && (
                  <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 12, marginBottom: 10, border: '1px solid #fed7aa' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#ea580c', marginBottom: 6 }}>
                      🚚 Malipo yamepokelewa! Chagua njia ya utoaji
                    </div>
                    <div style={{ fontSize: 12, color: '#9a3412', marginBottom: 10 }}>
                      TZS {Number(req.amount).toLocaleString()} imelipwa. Agizo na namba ya kufuatilia vitaundwa mara baada ya kuchagua njia.
                    </div>
                    <button onClick={() => { setShippingInvoice(req); setShippingMethod(''); setShippingNote(''); }}
                      style={{ width: '100%', background: 'linear-gradient(135deg,#ea580c,#f97316)', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                      📦 Weka Njia ya Utoaji → Pata Tracking Number
                    </button>
                  </div>
                )}

                {/* ── PAID with shipping set — show tracking ── */}
                {isPaid && req.shippingMethod && (
                  <div style={{ backgroundColor: '#dcfce7', borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 2 }}>
                      ✅ Imelipwa · {req.shippingMethod === 'agent' ? '🤝 Via KenteXa Agent' : '📦 Utoaji Moja kwa Moja'}
                    </div>
                    <div style={{ color: '#166534' }}>
                      {trackingNum
                        ? `Inafuatiliwa: ${trackingNum} · Inasubiri uthibitisho wa mnunuzi`
                        : 'Inasubiri uthibitisho wa mnunuzi kutoa malipo yako'}
                    </div>
                  </div>
                )}

                {/* ── SENT status ── */}
                {req.status === 'sent' && req.invoiceNumber && (
                  <div style={{ backgroundColor: '#dbeafe', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12 }}>
                    <strong>Invoice imetumwa:</strong> {req.invoiceNumber} · TZS {Number(req.amount).toLocaleString()} · Inasubiri malipo
                  </div>
                )}

                {/* ── PENDING — create invoice ── */}
                {req.status === 'pending' && (
                  showForm === req.id ? (
                    <div style={{ backgroundColor: '#fff', borderRadius: 10, padding: 14, border: '2px solid #7c3aed' }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>Create Invoice for {parsedName}</h4>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Amount (TZS) *</label>
                        <input type="number" placeholder={String(req.listingPrice || '')} value={form.amount}
                          onChange={e => setForm({ ...form, amount: e.target.value })} style={inputStyle} />
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Description *</label>
                        <input placeholder={req.classifiedTitle} value={form.invoiceDescription}
                          onChange={e => setForm({ ...form, invoiceDescription: e.target.value })} style={inputStyle} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setShowForm(null); setForm({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 }); }}
                          style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
                        <button onClick={() => handleCreateInvoice(req.id)} disabled={creating}
                          style={{ flex: 2, background: creating ? '#a5b4fc' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: creating ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                          {creating ? '⏳' : '📤 Send Invoice'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setShowForm(req.id); setForm({ amount: String(req.listingPrice || ''), invoiceDescription: req.classifiedTitle || '', sellerNotes: '', dueDays: 3 }); }}
                      style={{ backgroundColor: '#7c3aed', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      🧾 Create & Send Invoice
                    </button>
                  )
                )}

                {/* Download buttons for paid invoices */}
                {isPaid && req.invoiceNumber && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <a href={`${API_URL}/invoices/number/${req.invoiceNumber}/pdf`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, display: 'block', textAlign: 'center', backgroundColor: '#ede9fe', color: '#7c3aed', textDecoration: 'none', padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                      📄 Invoice PDF
                    </a>
                    {trackingNum && (
                      <button onClick={() => onNavigate(`TrackParcel-${trackingNum}`)}
                        style={{ flex: 1, backgroundColor: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        🔍 Fuatilia Agizo
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SHIPPING METHOD MODAL ── */}
      {shippingInvoice && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 16px', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 6px' }}>🚚 Chagua Njia ya Utoaji</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px' }}>
              Malipo ya TZS {Number(shippingInvoice.amount).toLocaleString()} yamepokelewa kutoka kwa{' '}
              {(shippingInvoice.buyerMessage || '').split(' | ').find(p => p.startsWith('Name:'))?.replace('Name: ', '') || 'mnunuzi'}
            </p>
            {/* Important note */}
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
              📦 Baada ya kuchagua, agizo na namba ya kufuatilia (KTX-ORD-...) vitaundwa kiotomatiki. Mnunuzi ataweza kufuatilia kifurushi chake mara moja.
            </div>

            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
                ❌ {error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', float: 'right' }}>×</button>
              </div>
            )}

            {/* Shipping options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {[
                  {
                    key:   'agent',
                    icon:  '🤝',
                    title: 'KenteXa Super Agent',
                    desc:  'Peleka hub ya KenteXa karibu nawe. Ufuatiliaji wa wakati halisi, SMS kwa mnunuzi, usalama kamili.',
                    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe',
                  },
                  {
                    key:   'bus',
                    icon:  '🚌',
                    title: 'Basi la Abiria',
                    desc:  'Tuma kwa basi (Scandinavian, Kilimanjaro, Abood n.k.). Pakia tiketi — mnunuzi ataarifiwa kukichukua terminali.',
                    color: '#ea580c', bg: '#fff7ed', border: '#fed7aa',
                  },
                  {
                    key:   'courier',
                    icon:  '📬',
                    title: 'Courier / DHL / Posta',
                    desc:  'Tuma kwa courier wako. Pakia namba ya kufuatilia baadaye ili mnunuzi aweze kuona hali.',
                    color: '#16a34a', bg: '#f0fdf4', border: '#86efac',
                  },
                  {
                    key:   'boda',
                    icon:  '🏍️',
                    title: 'Boda Boda (Mji Mmoja)',
                    desc:  'Utoaji wa ndani ya mji. Faa kwa vitu vidogo ndani ya jiji moja.',
                    color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe',
                  },
                  {
                    key:   'direct',
                    icon:  '🚗',
                    title: 'Utoaji Wako Mwenyewe',
                    desc:  'Unapeleka mwenyewe kwa mnunuzi. Rahisi kwa vitu vikubwa au wateja wa karibu.',
                    color: '#64748b', bg: '#f8fafc', border: '#e2e8f0',
                  },
              ].map(opt => (
                <div key={opt.key} onClick={() => setShippingMethod(opt.key)}
                  style={{ border: `2px solid ${shippingMethod === opt.key ? opt.color : opt.border}`, backgroundColor: shippingMethod === opt.key ? opt.bg : '#fff', borderRadius: 12, padding: 14, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{opt.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: shippingMethod === opt.key ? opt.color : '#1e293b', marginBottom: 4 }}>{opt.title}</div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{opt.desc}</div>
                    </div>
                    {shippingMethod === opt.key && <span style={{ fontSize: 18, color: opt.color, marginLeft: 'auto', flexShrink: 0 }}>✅</span>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Maelezo (hiari)</label>
              {/* Bus details — shown when bus selected */}
              {shippingMethod === 'bus' && (
                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', marginBottom: 8 }}>🚌 Maelezo ya Basi (hiari — unaweza kuongeza baadaye kwenye Maagizo)</div>
                  <input placeholder="Kampuni ya Basi (e.g. Scandinavian, Kilimanjaro...)"
                    value={shippingNote.busCompany || ''}
                    onChange={e => setShippingNote(p => typeof p === 'object' ? {...p, busCompany: e.target.value} : { busCompany: e.target.value })}
                    style={{ ...inputStyle, marginBottom: 6 }} />
                  <input placeholder="Namba ya Tiketi (e.g. KE-12345)"
                    value={shippingNote.busTicketNumber || ''}
                    onChange={e => setShippingNote(p => typeof p === 'object' ? {...p, busTicketNumber: e.target.value} : { busTicketNumber: e.target.value })}
                    style={{ ...inputStyle }} />
                </div>
              )}

              {/* Courier details — shown when courier selected */}
              {shippingMethod === 'courier' && (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>📬 Maelezo ya Courier (hiari)</div>
                  <input placeholder="Jina la Courier (e.g. DHL, EMS, G4S...)"
                    value={shippingNote.courierName || ''}
                    onChange={e => setShippingNote(p => typeof p === 'object' ? {...p, courierName: e.target.value} : { courierName: e.target.value })}
                    style={{ ...inputStyle, marginBottom: 6 }} />
                  <input placeholder="Namba ya Kufuatilia (Tracking Ref)"
                    value={shippingNote.courierRef || ''}
                    onChange={e => setShippingNote(p => typeof p === 'object' ? {...p, courierRef: e.target.value} : { courierRef: e.target.value })}
                    style={{ ...inputStyle }} />
                </div>
              )}

              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Maelezo ya Ziada (hiari)</label>
              <textarea placeholder="e.g. Nitapeleka hub Jumanne asubuhi..." value={typeof shippingNote === 'string' ? shippingNote : shippingNote.notes || ''}
                onChange={e => setShippingNote(p => typeof p === 'object' ? {...p, notes: e.target.value} : e.target.value)} rows={2}
                style={{ ...inputStyle, resize: 'none' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShippingInvoice(null)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Ghairi</button>
              <button onClick={handleSubmitShipping} disabled={submittingShipping || !shippingMethod}
                style={{ flex: 2, background: !shippingMethod ? '#e2e8f0' : 'linear-gradient(135deg,#ea580c,#f97316)', color: !shippingMethod ? '#94a3b8' : '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: !shippingMethod ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 14 }}>
                {submittingShipping ? '⏳ Inaunda Agizo...' : '✅ Thibitisha → Pata Tracking Number'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MANUAL INVOICE MODAL ── */}
      {showManual && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 16px', width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 4px' }}>📄 Unda Ankara ya Mkono</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 20px', lineHeight: 1.6 }}>
              Unda ankara ili mnunuzi aweze kulipa mtandaoni au kupitia wakala.
            </p>

            {/* Step 1 — Select listing */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#1e293b', marginBottom: 10, fontWeight: 700 }}>Hatua ya 1 — Chagua Tangazo Lako *</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input placeholder="Tafuta matangazo..." value={classifiedSearch} onChange={e => setClassifiedSearch(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => onNavigate('SellerClassifieds')}
                  style={{ backgroundColor: '#7c3aed', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>+ Mpya</button>
              </div>
              {loadingClassifieds ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 13 }}>⏳ Inapakia...</div>
              ) : filteredClassifieds.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#94a3b8', fontSize: 12 }}>Hakuna matangazo.</div>
              ) : (
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  {filteredClassifieds.map(c => (
                    <div key={c.id} onClick={() => handleSelectClassified(c)}
                      style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: selectedClassified?.id === c.id ? '#ede9fe' : '#fff', borderBottom: '1px solid #f1f5f9' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{c.title}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{c.category} · {c.status}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#7c3aed', flexShrink: 0, marginLeft: 10 }}>TZS {Number(c.price).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
              {selectedClassified && (
                <div style={{ backgroundColor: '#ede9fe', borderRadius: 8, padding: '10px 12px', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed' }}>✅ {selectedClassified.title}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>TZS {Number(selectedClassified.price).toLocaleString()}</div>
                  </div>
                  <button onClick={() => setSelectedClassified(null)} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              )}
            </div>

            {/* Step 2 — Buyer details */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#1e293b', marginBottom: 12, fontWeight: 700 }}>Hatua ya 2 — Maelezo ya Mnunuzi</label>
              {[
                { label: 'Jina Kamili la Mnunuzi *', key: 'buyerName',       placeholder: 'e.g. John Msomi',                type: 'text' },
                { label: 'Simu ya Mnunuzi *',        key: 'buyerPhone',      placeholder: '255712345678',                   type: 'tel' },
                { label: 'Anwani ya Utoaji',          key: 'deliveryAddress', placeholder: 'e.g. Dar es Salaam, Kinondoni', type: 'text' },
              ].map(field => (
                <div key={field.key} style={{ marginBottom: 10 }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{field.label}</label>
                  <input type={field.type} placeholder={field.placeholder} value={manualForm[field.key]}
                    onChange={e => setManualForm({ ...manualForm, [field.key]: e.target.value })} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* Step 3 — Payment */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#1e293b', marginBottom: 12, fontWeight: 700 }}>Hatua ya 3 — Maelezo ya Malipo</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Kiasi (TZS) *</label>
                  <input type="number" placeholder="500000" value={manualForm.amount}
                    onChange={e => setManualForm({ ...manualForm, amount: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Muda (siku)</label>
                  <input type="number" value={manualForm.dueDays}
                    onChange={e => setManualForm({ ...manualForm, dueDays: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <textarea placeholder="Maelezo (hiari)" value={manualForm.notes}
                onChange={e => setManualForm({ ...manualForm, notes: e.target.value })} rows={2}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowManual(false)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Ghairi</button>
              <button onClick={handleCreateManualInvoice} disabled={creatingManual}
                style={{ flex: 2, background: creatingManual ? '#a5b4fc' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: creatingManual ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 14 }}>
                {creatingManual ? '⏳ Inaunda...' : '📄 Tengeneza Ankara'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default SellerInvoices;