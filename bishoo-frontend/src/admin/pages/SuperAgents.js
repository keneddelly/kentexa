import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const SuperAgents = ({ activePage, onNavigate, onLogout }) => {
  const [agents, setAgents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchAgents(); }, []);

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
    if (!suspendReason.trim()) { setError('Enter suspension reason'); return; }
    try {
      setActionLoading(true);
      await api.patch(`/super-agents/${selected.id}/suspend`, { reason: suspendReason });
      setMessage('Super Agent suspended.');
      setShowSuspendModal(false);
      setSuspendReason('');
      fetchAgents();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to suspend');
    } finally {
      setActionLoading(false);
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
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onNavigate('Dashboard')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Super Agents</div>
      </div>
      <main style={{ flex: 1, padding: 32 }}>

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
                          {agent.status === 'pending' && (
                            <button onClick={() => handleApprove(agent.id)} disabled={actionLoading}
                              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                              ✅ Approve
                            </button>
                          )}
                          {agent.status === 'active' && (
                            <button onClick={() => { setSelected(agent); setShowSuspendModal(true); }}
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
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>🚫 Suspend Super Agent</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>{selected?.businessName} — {selected?.agentCode}</p>
            <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Reason for suspension *</label>
            <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
              placeholder="e.g. Fraud reported, policy violation..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', minHeight: 80, marginBottom: 20, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowSuspendModal(false); setSuspendReason(''); }} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSuspend} disabled={actionLoading} style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}>
                {actionLoading ? '⏳' : '🚫 Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAgents;