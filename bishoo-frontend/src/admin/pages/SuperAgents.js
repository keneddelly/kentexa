import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const SuperAgents = ({ activePage, onNavigate, onLogout }) => {
  const [onboardingOfficers, setOnboardingOfficers] = useState([]);
  const [officerQuery, setOfficerQuery] = useState('');
  const [officerResults, setOfficerResults] = useState([]);
  const [selectedOfficer, setSelectedOfficer] = useState(null);
  const [officerLoading, setOfficerLoading] = useState(false);
  const [agents, setAgents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [detailAgent, setDetailAgent] = useState(null);
  const [suspendIsReject, setSuspendIsReject] = useState(false);
  const [grantCount, setGrantCount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [applicantIdentity, setApplicantIdentity] = useState(null);
  const [agentReferrals, setAgentReferrals] = useState([]);

  useEffect(() => { fetchAgents(); fetchOnboardingOfficers(); }, []);

  const fetchOnboardingOfficers = async () => {
    try {
      const res = await api.get('/super-agents/onboarding/officers');
      setOnboardingOfficers(Array.isArray(res.data) ? res.data : []);
    } catch { setOnboardingOfficers([]); }
  };

  const searchOnboardingUsers = async (value) => {
    setOfficerQuery(value);
    setSelectedOfficer(null);
    if (value.trim().length < 2) { setOfficerResults([]); return; }
    setOfficerLoading(true);
    try {
      const q = value.trim().toLowerCase();
      // Onboarding officers must already be registered Super Agents.
      // Use the Admin Super Agent list as the source of truth so ordinary
      // users can never be selected for this capability.
      const results = (Array.isArray(agents) ? agents : [])
        .filter(agent => agent?.user?.id)
        .filter(agent => {
          const user = agent.user;
          return [user.name, user.phone, user.email, agent.businessName, agent.agentCode]
            .filter(Boolean)
            .some(v => String(v).toLowerCase().includes(q));
        })
        .map(agent => ({
          id: agent.user.id,
          name: agent.user.name,
          phone: agent.user.phone,
          email: agent.user.email,
          superAgentId: agent.id,
          superAgentStatus: agent.status,
          businessName: agent.businessName,
        }));
      setOfficerResults(results);
    } catch { setOfficerResults([]); }
    finally { setOfficerLoading(false); }
  };

  const grantOnboardingOfficer = async () => {
    if (!selectedOfficer) return;
    try {
      setActionLoading(true);
      await api.patch(`/super-agents/onboarding/officers/${selectedOfficer.id}`, { enabled: true });
      setMessage(`${selectedOfficer.name || selectedOfficer.phone || 'User'} amepewa uwezo wa ku-activate Super Agent.`);
      setSelectedOfficer(null);
      setOfficerQuery('');
      setOfficerResults([]);
      await fetchOnboardingOfficers();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana kutoa uwezo.');
    } finally { setActionLoading(false); }
  };

  const revokeOnboardingOfficer = async (userId) => {
    try {
      setActionLoading(true);
      await api.patch(`/super-agents/onboarding/officers/${userId}`, { enabled: false });
      setMessage('Uwezo wa onboarding umeondolewa.');
      await fetchOnboardingOfficers();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana kuondoa uwezo.');
    } finally { setActionLoading(false); }
  };

  useEffect(() => {
    if (detailAgent) {
      setGrantCount(String(detailAgent.freeOrdersGranted ?? 0));
      setPaymentAmount('');
      setBillingError('');
      setApplicantIdentity(null);
      setAgentReferrals([]);
      const userId = detailAgent.user?.id;
      if (userId) {
        api.get(`/identity/admin/by-user/${userId}`)
          .then(r => setApplicantIdentity(r.data))
          .catch(() => {});
      }
      api.get('/super-agents/admin/referrals')
        .then(r => setAgentReferrals((r.data || []).filter(ref => ref.referrerSuperAgent?.id === detailAgent.id)))
        .catch(() => {});
    }
  }, [detailAgent]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super-agents');
      setAgents(res.data);
    } catch (err) {
      setError('Failed to load super agents');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      setActionLoading(true);
      await api.patch(`/super-agents/${id}/approve`);
      setMessage('Super Agent approved and activated!');
      fetchAgents();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to approve');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim()) { setError(`Enter ${suspendIsReject ? 'rejection' : 'suspension'} reason`); return; }
    try {
      setActionLoading(true);
      await api.patch(`/super-agents/${selected.id}/suspend`, { reason: suspendReason });
      setMessage(suspendIsReject ? 'Application rejected.' : 'Super Agent suspended.');
      setShowSuspendModal(false);
      setSuspendReason('');
      setSuspendIsReject(false);
      fetchAgents();
    } catch (err) {
      setError(err?.response?.data?.message || `Failed to ${suspendIsReject ? 'reject' : 'suspend'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const silentRefresh = async (focusId) => {
    try {
      const res = await api.get('/super-agents');
      setAgents(res.data);
      if (focusId) {
        const updated = res.data.find(a => a.id === focusId);
        if (updated) setDetailAgent(updated);
      }
    } catch { /* table just keeps its last known values */ }
  };

  // Sets the agent's total free-order allowance (absolute, not additive).
  // This is also the natural hook for a future coupon/promo-code system —
  // redeeming a code would call this same endpoint with the code's bonus
  // count instead of an admin typing a number by hand.
  const handleGrantFreeOrders = async () => {
    const count = Number(grantCount);
    if (!Number.isFinite(count) || count < 0) { setBillingError('Enter a valid number'); return; }
    try {
      setBillingLoading(true);
      setBillingError('');
      await api.patch(`/super-agents/${detailAgent.id}/grant-free-orders`, { count });
      setMessage(`Free orders granted set to ${count} for ${detailAgent.businessName}.`);
      await silentRefresh(detailAgent.id);
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
      await api.post(`/super-agents/${detailAgent.id}/billing-payment`, { amount, paymentMethod });
      setMessage(`Payment of TZS ${amount.toLocaleString()} recorded for ${detailAgent.businessName}.`);
      await silentRefresh(detailAgent.id);
    } catch (err) {
      setBillingError(err?.response?.data?.message || 'Failed to record payment');
    } finally {
      setBillingLoading(false);
    }
  };

  const statusStyle = (status) => ({
    pending:   { bg: '#fef9c3', color: '#ca8a04' },
    active:    { bg: '#dcfce7', color: '#16a34a' },
    suspended: { bg: '#fee2e2', color: '#dc2626' },
    blocked:   { bg: '#fecaca', color: '#991b1b' },
  }[status] || { bg: '#f1f5f9', color: '#64748b' });

  const filtered = filter === 'all' ? agents : agents.filter(a => a.status === filter);
  const counts   = { all: agents.length, pending: agents.filter(a => a.status === 'pending').length, active: agents.filter(a => a.status === 'active').length, suspended: agents.filter(a => a.status === 'suspended').length };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>
        <section style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#0f172a' }}>👥 Super Agent Onboarding Officers</h2>
          <p style={{ color: '#64748b', fontSize: 14, margin: '6px 0 16px', lineHeight: 1.5 }}>
            Mpe mfanyakazi wa Kentexa aliye na Super Agent role uwezo wa ziada wa ku-activate Super Agent. Hii haimpi Admin au ruhusa za fedha.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <input type="search" value={officerQuery} onChange={e => searchOnboardingUsers(e.target.value)}
                placeholder="Tafuta Super Agent kwa jina, simu, email au code"
                style={{ width: '100%', boxSizing: 'border-box', padding: 12, border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 16 }} />
              {officerLoading && <div style={{ marginTop: 8, color: '#64748b', fontSize: 13 }}>Inatafuta...</div>}
              {officerResults.map(user => (
                <button key={user.id} type="button" onClick={() => { setSelectedOfficer(user); setOfficerResults([]); setOfficerQuery(user.name || user.phone || user.email || ''); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 6, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', cursor: 'pointer' }}>
                  <strong>{user.name || 'Mtumiaji'}</strong><div style={{ fontSize: 13, color: '#64748b' }}>{user.phone || user.email || ('User #' + user.id)}</div>
                </button>
              ))}
            </div>
            <button type="button" disabled={!selectedOfficer || actionLoading} onClick={grantOnboardingOfficer}
              style={{ background: '#1d4ed8', color: '#fff', border: 0, borderRadius: 10, padding: '12px 16px', fontSize: 15, fontWeight: 800, cursor: selectedOfficer ? 'pointer' : 'not-allowed' }}>
              Mpe uwezo wa ku-activate
            </button>
          </div>
          {selectedOfficer && <div style={{ marginTop: 10, fontSize: 14, color: '#0f172a' }}>Aliyechaguliwa: <strong>{selectedOfficer.name || selectedOfficer.phone || selectedOfficer.email}</strong></div>}
          <div style={{ marginTop: 18 }}>
            <strong style={{ fontSize: 14 }}>Wenye uwezo sasa</strong>
            {onboardingOfficers.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>Hakuna onboarding officer aliyepewa uwezo.</div> : onboardingOfficers.map(officer => (
              <div key={officer.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
                <div><strong>User #{officer.userId}</strong><div style={{ fontSize: 12, color: '#64748b' }}>{officer.revokedAt ? 'Ruhusa imeondolewa' : 'Ana ruhusa ya ku-activate Super Agent'}</div></div>
                {!officer.revokedAt && <button type="button" disabled={actionLoading} onClick={() => revokeOnboardingOfficer(officer.userId)} style={{ border: '1px solid #ef4444', color: '#dc2626', background: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>Ondoa uwezo</button>}
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, fontFamily: 'Manrope,sans-serif' }}>🏢 Super Agents</h1>
            <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>{agents.length} total super agents</p>
          </div>
          <button onClick={fetchAgents} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>🔄 Refresh</button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>✅ {message} <button onClick={() => setMessage('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button></div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>❌ {error} <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button></div>}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total',     value: counts.all,       bg: '#ede9fe', color: '#7c3aed' },
            { label: 'Pending',   value: counts.pending,   bg: '#fef9c3', color: '#ca8a04' },
            { label: 'Active',    value: counts.active,    bg: '#dcfce7', color: '#16a34a' },
            { label: 'Suspended', value: counts.suspended, bg: '#fee2e2', color: '#dc2626' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['all','pending','active','suspended'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, backgroundColor: filter === f ? '#1d4ed8' : '#fff', color: filter === f ? '#fff' : '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)} {f !== 'all' && `(${counts[f] || 0})`}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? <p style={{ color: '#64748b' }}>Loading...</p> : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Code','Business','City','Phone','Commission','Parcels','Earnings','Status','Actions'].map(h => (
                    <th key={h} style={{ padding: '14px 16px', textAlign: 'left', backgroundColor: '#f1f5f9', color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="9" style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No super agents found</td></tr>
                ) : filtered.map(agent => {
                  const sc = statusStyle(agent.status);
                  return (
                    <tr key={agent.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{agent.agentCode}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                        <div>{agent.businessName}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{agent.user?.email || agent.user?.phone}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748b' }}>{agent.city}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748b' }}>{agent.phone || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748b' }}>{agent.commissionRate}%</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748b' }}>{agent.totalParcelsHandled}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#16a34a' }}>TZS {Number(agent.totalEarnings || 0).toLocaleString()}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: sc.bg, color: sc.color }}>
                          {agent.status?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setDetailAgent(agent)}
                            style={{ backgroundColor: '#f1f5f9', color: '#1e293b', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            🔍 View
                          </button>
                          {agent.status === 'pending' && (
                            <button onClick={() => handleApprove(agent.id)} disabled={actionLoading}
                              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                              ✅ Approve
                            </button>
                          )}
                          {agent.status === 'pending' && (
                            <button onClick={() => { setSelected(agent); setSuspendIsReject(true); setShowSuspendModal(true); }}
                              style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                              ❌ Reject
                            </button>
                          )}
                          {agent.status === 'active' && (
                            <button onClick={() => { setSelected(agent); setSuspendIsReject(false); setShowSuspendModal(true); }}
                              style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                              🚫 Suspend
                            </button>
                          )}
                          {agent.status === 'suspended' && (
                            <button onClick={() => handleApprove(agent.id)} disabled={actionLoading}
                              style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                              🔄 Reactivate
                            </button>
                          )}
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

      {/* Suspend Modal */}
      {showSuspendModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 32, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
              {suspendIsReject ? '❌ Reject Application' : '🚫 Suspend Super Agent'}
            </h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>{selected?.businessName} — {selected?.agentCode}</p>
            <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>
              Reason for {suspendIsReject ? 'rejection' : 'suspension'} *
            </label>
            <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
              placeholder={suspendIsReject ? 'e.g. Missing government ID, incomplete address...' : 'e.g. Fraud reported, policy violation...'}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', minHeight: 80, marginBottom: 20, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowSuspendModal(false); setSuspendReason(''); setSuspendIsReject(false); }} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSuspend} disabled={actionLoading} style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}>
                {actionLoading ? '⏳' : suspendIsReject ? '❌ Reject' : '🚫 Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Application Detail Modal — shows everything submitted, so admin
          never approves/rejects blind. Reuses the same approve/suspend
          actions above rather than a second workflow. */}
      {detailAgent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
          onClick={() => setDetailAgent(null)}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 32, width: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>{detailAgent.businessName}</h2>
              <button onClick={() => setDetailAgent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8' }}>×</button>
            </div>
            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, marginBottom: 16, ...statusStyle(detailAgent.status) }}>
              {detailAgent.status?.toUpperCase()}
            </span>

            {[
              ['Agent Code', detailAgent.agentCode],
              ['Applicant', detailAgent.user?.name],
              ['Account Phone', detailAgent.user?.phone],
              ['Account Email', detailAgent.user?.email],
              ['Business Phone', detailAgent.phone],
              ['WhatsApp', detailAgent.whatsappNumber],
              ['City', detailAgent.city],
              ['Region', detailAgent.region],
              ['Address', detailAgent.address],
              ['Description', detailAgent.description],
              ['Government ID Number', detailAgent.governmentId],
              ['Date Submitted', detailAgent.createdAt ? new Date(detailAgent.createdAt).toLocaleString() : null],
              ['Rejection/Suspension Reason', detailAgent.rejectionReason],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 14, color: '#0f172a', marginTop: 2 }}>{value}</div>
              </div>
            ))}

            {detailAgent.governmentIdImage && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Government ID Photo (legacy)</div>
                <img src={detailAgent.governmentIdImage} alt="Government ID"
                  style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0' }} />
              </div>
            )}

            {/* Identity Verification (Phase 3) — the applicant's centralized
                IdentityProfile, replacing the old text-only governmentId
                field for applications submitted after this phase. */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>🪪 Identity Verification</div>
                {applicantIdentity && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    backgroundColor: { not_submitted: '#f1f5f9', pending: '#fef9c3', verified: '#dcfce7', rejected: '#fee2e2' }[applicantIdentity.status] || '#f1f5f9',
                    color: { not_submitted: '#64748b', pending: '#ca8a04', verified: '#16a34a', rejected: '#dc2626' }[applicantIdentity.status] || '#64748b' }}>
                    {applicantIdentity.status}
                  </span>
                )}
              </div>
              {!applicantIdentity ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#94a3b8', fontSize: 12 }}>
                  No identity submission on file for this account
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>Legal Name: <strong>{applicantIdentity.legalName}</strong></div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>Date of Birth: <strong>{applicantIdentity.dateOfBirth}</strong></div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>ID Type: <strong>{({ nida: 'NIDA', drivers_license: "Driver's License", passport: 'Passport', voter_id: 'Voter ID' })[applicantIdentity.idType] || applicantIdentity.idType}</strong></div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>ID Number: <strong>{applicantIdentity.idNumber}</strong></div>
                  {applicantIdentity.idDocumentImageUrl && (
                    <a href={applicantIdentity.idDocumentImageUrl} target="_blank" rel="noreferrer">
                      <img src={applicantIdentity.idDocumentImageUrl} alt="ID Document"
                        style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer' }} />
                    </a>
                  )}
                </>
              )}
            </div>

            {/* Referral program (Phase 4) — audit visibility only */}
            {detailAgent.referralCode && (
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>🎁 Referrals</div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>Code: <strong>{detailAgent.referralCode}</strong></div>
                {agentReferrals.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>No referrals yet</div>
                ) : (
                  agentReferrals.map(r => {
                    const badge = { registered: ['⏳', '#ca8a04'], qualified: ['✅', '#16a34a'], rejected_fraud: ['❌', '#dc2626'] }[r.status] || ['?', '#64748b'];
                    return (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 }}>
                        <span style={{ color: '#475569' }}>{r.referredUser?.name || '—'}</span>
                        <span style={{ color: badge[1], fontWeight: 700 }}>{badge[0]} {r.status}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {(() => {
              const granted = Number(detailAgent.freeOrdersGranted || 0);
              const used = Number(detailAgent.freeOrdersUsed || 0);
              const remaining = Math.max(0, granted - used);
              const balance = Number(detailAgent.outstandingBalance || 0);
              const threshold = Number(detailAgent.billingThreshold || 0);
              const isBlocked = threshold > 0 && balance >= threshold;
              return (
                <div style={{ marginBottom: 18, backgroundColor: '#f8fafc', borderRadius: 10, padding: 16, border: isBlocked ? '2px solid #dc2626' : '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>💳 Billing &amp; Free Orders</div>
                  {[
                    ['Free orders granted', granted],
                    ['Free orders used', used],
                    ['Free orders remaining', remaining],
                    ['Paid orders (post-free)', detailAgent.paidOrders ?? 0],
                    ['Fee per order', `TZS ${Number(detailAgent.platformFeePerOrder || 0).toLocaleString()}`],
                    ['Fees waived (lifetime)', `TZS ${Number(detailAgent.totalPlatformFeesWaived || 0).toLocaleString()}`],
                    ['Fees charged (lifetime)', `TZS ${Number(detailAgent.totalPlatformFeesCharged || 0).toLocaleString()}`],
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
                      ⚠️ This agent is blocked from new registrations until the balance is paid down.
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

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {detailAgent.status === 'pending' && (
                <>
                  <button onClick={() => { handleApprove(detailAgent.id); setDetailAgent(null); }} disabled={actionLoading}
                    style={{ flex: 1, backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}>
                    ✅ Approve
                  </button>
                  <button onClick={() => { setSelected(detailAgent); setSuspendIsReject(true); setShowSuspendModal(true); setDetailAgent(null); }}
                    style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}>
                    ❌ Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAgents;