import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const STATUS_STYLE = {
  pending:   { bg: '#fef9c3', color: '#ca8a04', label: '⏳ Inasubiri' },
  approved:  { bg: '#dcfce7', color: '#16a34a', label: '✅ Imeidhinishwa' },
  rejected:  { bg: '#fee2e2', color: '#dc2626', label: '❌ Imekataliwa' },
  suspended: { bg: '#fee2e2', color: '#dc2626', label: '🚫 Imesimamishwa' },
};

const Sellers = ({ activePage, onNavigate, onLogout }) => {
  const [sellers, setSellers]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [approveTier, setApproveTier] = useState('registered');
  const [grantCount, setGrantCount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [businessDocs, setBusinessDocs] = useState([]);
  const [businessActionLoading, setBusinessActionLoading] = useState(false);
  const [showBusinessRejectModal, setShowBusinessRejectModal] = useState(false);
  const [businessRejectReason, setBusinessRejectReason] = useState('');

  useEffect(() => { fetchSellers(); }, []);

  useEffect(() => {
    if (selected) {
      setGrantCount(String(selected.freeOrdersGranted ?? 0));
      setPaymentAmount('');
      setBillingError('');
      setBusinessDocs([]);
      if (selected.sellerType === 'business') {
        api.get(`/identity/business/admin/${selected.id}/documents`)
          .then(r => setBusinessDocs(r.data || []))
          .catch(() => {});
      }
    }
  }, [selected]);

  const fetchSellers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/seller/all');
      setSellers(res.data || []);
    } catch { setError('Imeshindwa kupakia wauzaji'); }
    finally { setLoading(false); }
  };

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const handleApprove = async (id, tier) => {
    try {
      setActionLoading(true);
      await api.patch(`/seller/${id}/approve`, tier ? { verificationTier: tier } : {});
      showMsg('✅ Muuzaji ameidhinishwa na ataarifiwa kwa SMS/email');
      setSelected(null);
      fetchSellers();
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setActionLoading(false); }
  };

  const handleReject = async (id) => {
    if (!rejectReason.trim()) { showErr('Weka sababu ya kukataa'); return; }
    try {
      setActionLoading(true);
      await api.patch(`/seller/${id}/reject`, { reason: rejectReason });
      showMsg('❌ Muuzaji amekataliwa na ataarifiwa');
      setShowRejectModal(false);
      setRejectReason('');
      setSelected(null);
      fetchSellers();
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setActionLoading(false); }
  };

  const handleSuspend = async (id) => {
    if (!suspendReason.trim()) { showErr('Weka sababu ya kusimamisha'); return; }
    try {
      setActionLoading(true);
      await api.patch(`/seller/${id}/suspend`, { reason: suspendReason });
      showMsg('🚫 Muuzaji amesimamishwa');
      setShowSuspendModal(false);
      setSuspendReason('');
      setSelected(null);
      fetchSellers();
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setActionLoading(false); }
  };

  const handleVerifyBusiness = async (sellerProfileId) => {
    try {
      setBusinessActionLoading(true);
      await api.patch(`/identity/business/admin/${sellerProfileId}/review`, { approve: true });
      showMsg('✅ Business documents verified');
      await silentRefresh(sellerProfileId);
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setBusinessActionLoading(false); }
  };

  const handleRejectBusiness = async (sellerProfileId) => {
    if (!businessRejectReason.trim()) { showErr('Weka sababu ya kukataa'); return; }
    try {
      setBusinessActionLoading(true);
      await api.patch(`/identity/business/admin/${sellerProfileId}/review`, { approve: false, reason: businessRejectReason });
      showMsg('❌ Business documents rejected');
      setShowBusinessRejectModal(false);
      setBusinessRejectReason('');
      await silentRefresh(sellerProfileId);
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setBusinessActionLoading(false); }
  };

  const silentRefresh = async (focusId) => {
    try {
      const res = await api.get('/seller/all');
      setSellers(res.data || []);
      if (focusId) {
        const updated = (res.data || []).find(s => s.id === focusId);
        if (updated) setSelected(updated);
      }
    } catch { /* table just keeps its last known values */ }
  };

  // Sets the seller's total free-order allowance (absolute, not additive) —
  // same billing model and same future coupon-code hook as the Super Agent
  // panel (SuperAgents.js): redeeming a code would call this same endpoint.
  const handleGrantFreeOrders = async () => {
    const count = Number(grantCount);
    if (!Number.isFinite(count) || count < 0) { setBillingError('Enter a valid number'); return; }
    try {
      setBillingLoading(true);
      setBillingError('');
      await api.patch(`/super-agents/admin/sellers/${selected.id}/grant-free-orders`, { count });
      showMsg(`Free orders granted set to ${count} for ${selected.storeName || selected.businessName}.`);
      await silentRefresh(selected.id);
    } catch (err) {
      setBillingError(err?.response?.data?.message || 'Failed to grant free orders');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setBillingError('Enter a valid amount'); return; }
    try {
      setBillingLoading(true);
      setBillingError('');
      await api.post(`/super-agents/admin/sellers/${selected.id}/billing-payment`, { amount, paymentMethod });
      showMsg(`Payment of TZS ${amount.toLocaleString()} recorded for ${selected.storeName || selected.businessName}.`);
      await silentRefresh(selected.id);
    } catch (err) {
      setBillingError(err?.response?.data?.message || 'Failed to record payment');
    } finally {
      setBillingLoading(false);
    }
  };

  const filtered = sellers.filter(s => {
    const matchStatus = filter === 'all' || s.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      s.businessName?.toLowerCase().includes(q) ||
      s.storeName?.toLowerCase().includes(q) ||
      s.user?.email?.toLowerCase().includes(q) ||
      s.user?.name?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const counts = {
    all:       sellers.length,
    pending:   sellers.filter(s => s.status === 'pending').length,
    approved:  sellers.filter(s => s.status === 'approved').length,
    rejected:  sellers.filter(s => s.status === 'rejected').length,
    suspended: sellers.filter(s => s.status === 'suspended').length,
  };

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>🏪 Wauzaji</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Simamia maombi ya wauzaji na akaunti zao</p>
          </div>
          <button onClick={fetchSellers}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 Onyesha Upya
          </button>
        </div>

        {/* Flash messages */}
        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        {/* Stat tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { key: 'all',       label: 'Wote',          count: counts.all,       color: '#6366f1' },
            { key: 'pending',   label: '⏳ Wanaosubiri', count: counts.pending,   color: '#ca8a04' },
            { key: 'approved',  label: '✅ Walioidhinishwa', count: counts.approved, color: '#16a34a' },
            { key: 'rejected',  label: '❌ Waliokataliwa', count: counts.rejected, color: '#dc2626' },
            { key: 'suspended', label: '🚫 Waliositamishwa', count: counts.suspended, color: '#dc2626' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                backgroundColor: filter === tab.key ? tab.color : '#fff',
                color: filter === tab.key ? '#fff' : '#64748b',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input placeholder="🔍 Tafuta kwa jina, email, simu..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 16, backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} />
        </div>

        {/* Pending alert */}
        {counts.pending > 0 && (
          <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400e', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => setFilter('pending')}>
            ⚠️ Kuna wauzaji <strong>{counts.pending}</strong> wanaosubiri idhini yako — bonyeza hapa kuangalia
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Inapakia...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
            <div>Hakuna wauzaji wanaolingana na utafutaji wako</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['Muuzaji', 'Mawasiliano', 'Eneo', 'Hali', 'Tarehe', 'Vitendo'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((seller, idx) => {
                  const ss = STATUS_STYLE[seller.status] || STATUS_STYLE.pending;
                  return (
                    <tr key={seller.id}
                      style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                      onClick={() => setSelected(seller)}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                          {seller.storeName || seller.businessName || '—'}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {seller.user?.name || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 12, color: '#475569' }}>{seller.user?.email || '—'}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{seller.phone || '—'}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>
                        {seller.businessLocation || seller.city || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: ss.bg, color: ss.color }}>
                          {ss.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8' }}>
                        {seller.createdAt ? new Date(seller.createdAt).toLocaleDateString('sw-TZ') : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {seller.status === 'pending' && (
                            <>
                              <button onClick={e => { e.stopPropagation(); handleApprove(seller.id); }} disabled={actionLoading}
                                style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                ✅ Idhinisha
                              </button>
                              <button onClick={e => { e.stopPropagation(); setSelected(seller); setShowRejectModal(true); }}
                                style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                ❌ Kataa
                              </button>
                            </>
                          )}
                          {seller.status === 'approved' && (
                            <button onClick={e => { e.stopPropagation(); setSelected(seller); setShowSuspendModal(true); }}
                              style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                              🚫 Simamisha
                            </button>
                          )}
                          {['rejected','suspended'].includes(seller.status) && (
                            <button onClick={e => { e.stopPropagation(); handleApprove(seller.id); }} disabled={actionLoading}
                              style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                              🔄 Amilisha
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); setSelected(seller); }}
                            style={{ backgroundColor: '#f1f5f9', color: '#475569', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                            👁 Angalia
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Detail drawer */}
      {selected && !showRejectModal && !showSuspendModal && !showBusinessRejectModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelected(null)}>
          <div style={{ width: 420, backgroundColor: '#fff', height: '100%', overflowY: 'auto', padding: 28, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>🏪 Maelezo ya Muuzaji</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {/* Status */}
            {(() => { const ss = STATUS_STYLE[selected.status] || STATUS_STYLE.pending; return (
              <div style={{ backgroundColor: ss.bg, color: ss.color, padding: '10px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, marginBottom: 20 }}>
                {ss.label}
                {selected.rejectionReason && <div style={{ fontWeight: 400, fontSize: 12, marginTop: 4 }}>Sababu: {selected.rejectionReason}</div>}
              </div>
            ); })()}

            {/* Fields */}
            {[
              { label: 'Jina la Duka',     value: selected.storeName },
              { label: 'Jina la Biashara', value: selected.businessName },
              { label: 'Jina la Mtumiaji', value: selected.user?.name },
              { label: 'Email',            value: selected.user?.email },
              { label: 'Simu',             value: selected.phone || selected.user?.phone },
              { label: 'Anwani',           value: selected.businessLocation || selected.address },
              { label: 'Maelezo',          value: selected.businessDescription },
              { label: 'Aina ya Bidhaa',   value: selected.businessCategory },
              { label: 'Mkoa',             value: selected.businessRegion },
              { label: 'Wilaya',           value: selected.businessDistrict },
              { label: 'Kata',             value: selected.businessCity },
              { label: 'Kiwango cha Uthibitisho', value: {
                  registered: 'Amesajiliwa',
                  verified_seller: '✅ Muuzaji Aliyethibitishwa',
                  verified_business: '🏆 Biashara Iliyothibitishwa',
                }[selected.verificationTier] },
              { label: 'Tarehe ya Ombi',   value: selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('sw-TZ') : null },
            ].filter(f => f.value).map(field => (
              <div key={field.label} style={{ marginBottom: 14, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>{field.label.toUpperCase()}</div>
                <div style={{ fontSize: 14, color: '#1e293b', fontWeight: 600 }}>{field.value}</div>
              </div>
            ))}

            {/* Documents */}
            {selected.idDocument && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>HATI YA UTAMBULISHO</div>
                <a href={selected.idDocument} target="_blank" rel="noreferrer"
                  style={{ display: 'block', backgroundColor: '#eff6ff', color: '#2563eb', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  📄 Angalia Hati →
                </a>
              </div>
            )}


            {/* KYC Documents */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                🪪 Nyaraka za KYC
              </div>
              {selected.idPhotoUrl ? (
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                    Aina: <strong>{selected.idType || 'Kitambulisho'}</strong> ·
                    Namba: <strong>{selected.idNumber || '—'}</strong>
                  </div>
                  <a href={selected.idPhotoUrl} target="_blank" rel="noreferrer">
                    <img src={selected.idPhotoUrl} alt="ID Document"
                      style={{ width: '100%', borderRadius: 10, border: '2px solid #e2e8f0',
                        cursor: 'pointer', marginBottom: 8 }} />
                  </a>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Bonyeza picha kuona ukubwa kamili
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
                  <div style={{ fontSize: 12 }}>Hakuna nyaraka zilizopakiwa</div>
                </div>
              )}
              {selected.registrationNumber && (
                <div style={{ marginTop: 10, padding: '8px 12px', backgroundColor: '#fff',
                  borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                  📋 Usajili: <strong>{selected.registrationNumber}</strong>
                </div>
              )}
            </div>

            {/* Business Documents (Phase 2) — only for sellerType='business' */}
            {selected.sellerType === 'business' && (
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16,
                border: selected.businessDocumentsStatus === 'pending' ? '2px solid #ca8a04' : '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>🏢 Business Documents</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    backgroundColor: { not_submitted: '#f1f5f9', pending: '#fef9c3', verified: '#dcfce7', rejected: '#fee2e2' }[selected.businessDocumentsStatus] || '#f1f5f9',
                    color: { not_submitted: '#64748b', pending: '#ca8a04', verified: '#16a34a', rejected: '#dc2626' }[selected.businessDocumentsStatus] || '#64748b' }}>
                    {selected.businessDocumentsStatus || 'not_submitted'}
                  </span>
                </div>
                {selected.tinNumber && (
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>TIN: <strong>{selected.tinNumber}</strong></div>
                )}
                {selected.businessLicenseNumber && (
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>License: <strong>{selected.businessLicenseNumber}</strong></div>
                )}
                {businessDocs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}>
                    <div style={{ fontSize: 12 }}>No documents uploaded yet</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {businessDocs.map(doc => (
                      <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>{doc.documentType}</div>
                        <img src={doc.url} alt={doc.documentType}
                          style={{ width: '100%', borderRadius: 8, border: '2px solid #e2e8f0', cursor: 'pointer' }} />
                      </a>
                    ))}
                  </div>
                )}
                {selected.businessDocumentsStatus === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => handleVerifyBusiness(selected.id)} disabled={businessActionLoading}
                      style={{ flex: 1, backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      ✅ Verify Business
                    </button>
                    <button onClick={() => setShowBusinessRejectModal(true)}
                      style={{ flex: 1, backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      ❌ Reject
                    </button>
                  </div>
                )}
                {selected.businessDocumentsStatus === 'rejected' && selected.rejectionReason && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626' }}>Reason: {selected.rejectionReason}</div>
                )}
              </div>
            )}

            {/* Billing & Free Orders */}
            {(() => {
              const granted = Number(selected.freeOrdersGranted ?? 0);
              const used = Number(selected.freeOrdersUsed ?? 0);
              const remaining = Math.max(0, granted - used);
              const balance = Number(selected.outstandingBalance || 0);
              const threshold = Number(selected.billingThreshold || 0);
              const isBlocked = threshold > 0 && balance >= threshold;
              return (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16, border: isBlocked ? '2px solid #dc2626' : '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>💳 Billing &amp; Free Orders</div>
                  {[
                    ['Free orders granted', granted],
                    ['Free orders used', used],
                    ['Free orders remaining', remaining],
                    ['Paid orders (post-free)', selected.paidOrders ?? 0],
                    ['Fee per order', `TZS ${Number(selected.platformFeePerOrder || 0).toLocaleString()}`],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12.5, color: '#475569' }}>
                      <span>{l}</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', marginTop: 4, borderTop: '1px solid #e2e8f0', fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: '#475569' }}>Outstanding balance</span>
                    <span style={{ fontWeight: 900, color: isBlocked ? '#dc2626' : '#0f172a' }}>
                      TZS {balance.toLocaleString()} / {threshold.toLocaleString()}
                    </span>
                  </div>
                  {isBlocked && (
                    <div style={{ marginTop: 8, backgroundColor: '#fef2f2', borderRadius: 6, padding: '8px 10px', fontSize: 11.5, color: '#b91c1c', fontWeight: 700 }}>
                      ⚠️ This seller is blocked from new manual shipments until the balance is paid down.
                    </div>
                  )}
                  {billingError && <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', fontWeight: 700 }}>{billingError}</div>}

                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Set free orders granted</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" min="0" value={grantCount} onChange={e => setGrantCount(e.target.value)}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
                      <button onClick={handleGrantFreeOrders} disabled={billingLoading}
                        style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        Save
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Record billing payment</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" min="0" placeholder="Amount (TZS)" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                        style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}>
                        <option value="cash">Cash</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="bank">Bank</option>
                      </select>
                      <button onClick={handleRecordPayment} disabled={billingLoading || balance <= 0}
                        style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        Record
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selected.status === 'pending' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>
                      Kiwango cha Uthibitisho wa Kuidhinisha
                    </label>
                    <select value={approveTier} onChange={e => setApproveTier(e.target.value)}
                      style={{ ...inputStyle, marginBottom: 4 }}>
                      <option value="registered">Amesajiliwa</option>
                      <option value="verified_seller">✅ Muuzaji Aliyethibitishwa</option>
                      <option value="verified_business">🏆 Biashara Iliyothibitishwa</option>
                    </select>
                  </div>
                  <button onClick={() => handleApprove(selected.id, approveTier)} disabled={actionLoading}
                    style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 15 }}>
                    {actionLoading ? '⏳...' : '✅ Idhinisha Muuzaji'}
                  </button>
                  <button onClick={() => setShowRejectModal(true)}
                    style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    ❌ Kataa Ombi
                  </button>
                </>
              )}
              {selected.status === 'approved' && (
                <button onClick={() => setShowSuspendModal(true)}
                  style={{ backgroundColor: '#fef9c3', color: '#92400e', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                  🚫 Simamisha Akaunti
                </button>
              )}
              {['rejected','suspended'].includes(selected.status) && (
                <button onClick={() => handleApprove(selected.id)} disabled={actionLoading}
                  style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 800 }}>
                  🔄 Amilisha Tena
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>❌ Kataa Ombi</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>
              Muuzaji <strong>{selected.businessName || selected.user?.name}</strong> atakataliwa na ataariwa sababu hii.
            </p>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Sababu ya Kukataa *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4}
              placeholder="e.g. Nyaraka hazikamiliki. Tuma tena na cheti cha biashara..."
              style={{ ...inputStyle, resize: 'none' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                Ghairi
              </button>
              <button onClick={() => handleReject(selected.id)} disabled={actionLoading}
                style={{ flex: 2, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: actionLoading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {actionLoading ? '⏳...' : '❌ Kataa Ombi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend modal */}
      {showSuspendModal && selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>🚫 Simamisha Akaunti</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>
              Muuzaji <strong>{selected.storeName || selected.businessName}</strong> hataweza kufanya mauzo hadi akaunti iamilishwe.
            </p>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Sababu ya Kusimamisha *</label>
            <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} rows={4}
              placeholder="e.g. Malalamiko mengi kutoka kwa wanunuzi..."
              style={{ ...inputStyle, resize: 'none' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowSuspendModal(false); setSuspendReason(''); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                Ghairi
              </button>
              <button onClick={() => handleSuspend(selected.id)} disabled={actionLoading}
                style={{ flex: 2, background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: actionLoading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {actionLoading ? '⏳...' : '🚫 Simamisha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject business documents modal */}
      {showBusinessRejectModal && selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>❌ Reject Business Documents</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>
              <strong>{selected.businessName}</strong>'s business documents will be rejected with this reason.
            </p>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Rejection Reason *</label>
            <textarea value={businessRejectReason} onChange={e => setBusinessRejectReason(e.target.value)} rows={4}
              placeholder="e.g. BRELA certificate unreadable, please resubmit..."
              style={{ ...inputStyle, resize: 'none' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowBusinessRejectModal(false); setBusinessRejectReason(''); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                Cancel
              </button>
              <button onClick={() => handleRejectBusiness(selected.id)} disabled={businessActionLoading}
                style={{ flex: 2, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: businessActionLoading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {businessActionLoading ? '⏳...' : '❌ Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sellers;