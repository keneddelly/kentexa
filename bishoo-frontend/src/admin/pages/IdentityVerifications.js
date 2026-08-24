import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const STATUS_STYLE = {
  not_submitted: { bg: '#f1f5f9', color: '#64748b', label: '— Not submitted' },
  pending:       { bg: '#fef9c3', color: '#ca8a04', label: '⏳ Pending' },
  verified:      { bg: '#dcfce7', color: '#16a34a', label: '✅ Verified' },
  rejected:      { bg: '#fee2e2', color: '#dc2626', label: '❌ Rejected' },
};

const IdentityVerifications = ({ activePage, onNavigate, onLogout }) => {
  const [profiles, setProfiles]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('pending');
  const [selected, setSelected]     = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => { fetchProfiles(filter); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProfiles = async (which) => {
    try {
      setLoading(true);
      const res = await api.get('/identity/admin/list', { params: { status: which === 'pending' ? 'pending' : 'all' } });
      setProfiles(res.data || []);
    } catch { setError('Failed to load identity submissions'); }
    finally { setLoading(false); }
  };

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const handleApprove = async (id) => {
    try {
      setActionLoading(true);
      await api.patch(`/identity/admin/${id}/review`, { approve: true });
      showMsg('✅ Identity verified');
      setSelected(null);
      fetchProfiles(filter);
    } catch (err) { showErr(err?.response?.data?.message || 'Failed'); }
    finally { setActionLoading(false); }
  };

  const handleReject = async (id) => {
    if (!rejectReason.trim()) { showErr('Enter a rejection reason'); return; }
    try {
      setActionLoading(true);
      await api.patch(`/identity/admin/${id}/review`, { approve: false, reason: rejectReason });
      showMsg('❌ Identity submission rejected');
      setShowRejectModal(false);
      setRejectReason('');
      setSelected(null);
      fetchProfiles(filter);
    } catch (err) { showErr(err?.response?.data?.message || 'Failed'); }
    finally { setActionLoading(false); }
  };

  const counts = {
    pending: profiles.filter(p => p.status === 'pending').length,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>🪪 Identity Verification</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Review submitted NIDA/identity information</p>
          </div>
          <button onClick={() => fetchProfiles(filter)}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 Refresh
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[
            { key: 'pending', label: '⏳ Pending', color: '#ca8a04' },
            { key: 'all',     label: 'All',        color: '#6366f1' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                backgroundColor: filter === tab.key ? tab.color : '#fff',
                color: filter === tab.key ? '#fff' : '#64748b',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              {tab.label}{tab.key === 'pending' ? ` (${counts.pending})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Loading...</div>
        ) : profiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🪪</div>
            <div>No identity submissions here</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['Legal Name', 'Account', 'NIDA', 'Status', 'Submitted', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, idx) => {
                  const ss = STATUS_STYLE[p.status] || STATUS_STYLE.not_submitted;
                  return (
                    <tr key={p.id}
                      style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                      onClick={() => setSelected(p)}>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{p.legalName || '—'}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 12, color: '#475569' }}>{p.user?.name || '—'}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.user?.phone || p.user?.email || '—'}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>{p.nidaNumber || '—'}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: ss.bg, color: ss.color }}>{ss.label}</span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8' }}>
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {p.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={e => { e.stopPropagation(); handleApprove(p.id); }} disabled={actionLoading}
                              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                              ✅ Approve
                            </button>
                            <button onClick={e => { e.stopPropagation(); setSelected(p); setShowRejectModal(true); }}
                              style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                              ❌ Reject
                            </button>
                          </div>
                        )}
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
      {selected && !showRejectModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelected(null)}>
          <div style={{ width: 420, backgroundColor: '#fff', height: '100%', overflowY: 'auto', padding: 28, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>🪪 Identity Submission</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {(() => { const ss = STATUS_STYLE[selected.status] || STATUS_STYLE.not_submitted; return (
              <div style={{ backgroundColor: ss.bg, color: ss.color, padding: '10px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, marginBottom: 20 }}>
                {ss.label}
                {selected.rejectionReason && <div style={{ fontWeight: 400, fontSize: 12, marginTop: 4 }}>Reason: {selected.rejectionReason}</div>}
              </div>
            ); })()}

            {[
              { label: 'Legal Name',    value: selected.legalName },
              { label: 'Date of Birth', value: selected.dateOfBirth },
              { label: 'NIDA Number',   value: selected.nidaNumber },
              { label: 'Account Name',  value: selected.user?.name },
              { label: 'Phone',         value: selected.user?.phone },
              { label: 'Email',         value: selected.user?.email },
              { label: 'Submitted',     value: selected.createdAt ? new Date(selected.createdAt).toLocaleString() : null },
            ].filter(f => f.value).map(field => (
              <div key={field.label} style={{ marginBottom: 14, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>{field.label.toUpperCase()}</div>
                <div style={{ fontSize: 14, color: '#1e293b', fontWeight: 600 }}>{field.value}</div>
              </div>
            ))}

            {selected.idDocumentImageUrl && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>ID DOCUMENT</div>
                <a href={selected.idDocumentImageUrl} target="_blank" rel="noreferrer">
                  <img src={selected.idDocumentImageUrl} alt="ID Document"
                    style={{ width: '100%', borderRadius: 10, border: '2px solid #e2e8f0', cursor: 'pointer' }} />
                </a>
              </div>
            )}

            {selected.status === 'pending' && (
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={() => handleApprove(selected.id)} disabled={actionLoading}
                  style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 15 }}>
                  {actionLoading ? '⏳...' : '✅ Verify Identity'}
                </button>
                <button onClick={() => setShowRejectModal(true)}
                  style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                  ❌ Reject Submission
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>❌ Reject Submission</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>
              <strong>{selected.legalName || selected.user?.name}</strong>'s identity submission will be rejected with this reason.
            </p>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Rejection Reason *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4}
              placeholder="e.g. ID photo unreadable, please resubmit..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                Cancel
              </button>
              <button onClick={() => handleReject(selected.id)} disabled={actionLoading}
                style={{ flex: 2, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: actionLoading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {actionLoading ? '⏳...' : '❌ Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdentityVerifications;
