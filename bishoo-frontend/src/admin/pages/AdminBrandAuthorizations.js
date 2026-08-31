import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const STATUS_STYLE = {
  pending:   { bg: '#fef9c3', color: '#ca8a04', label: '⏳ Pending' },
  approved:  { bg: '#dcfce7', color: '#16a34a', label: '✅ Authorized' },
  rejected:  { bg: '#fee2e2', color: '#dc2626', label: '❌ Rejected' },
  suspended: { bg: '#ffedd5', color: '#c2410c', label: '⏸ Suspended' },
  expired:   { bg: '#f1f5f9', color: '#64748b', label: '⌛ Expired' },
  revoked:   { bg: '#fee2e2', color: '#dc2626', label: '🚫 Revoked' },
};

const AdminBrandAuthorizations = ({ activePage, onNavigate, onLogout }) => {
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('pending');
  const [selected, setSelected]     = useState(null);
  const [evidence, setEvidence]     = useState([]);
  const [auditLog, setAuditLog]     = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');
  const [reasonModal, setReasonModal] = useState(null); // 'reject' | 'suspend' | 'revoke' | null
  const [reasonText, setReasonText] = useState('');

  useEffect(() => { fetchRows(filter); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRows = async (which) => {
    try {
      setLoading(true);
      const res = await api.get('/brand-authorizations/admin', { params: which === 'all' ? {} : { status: which } });
      setRows(res.data || []);
    } catch { setError('Failed to load brand authorization requests'); }
    finally { setLoading(false); }
  };

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const openDetail = (row) => {
    setSelected(row);
    setEvidence([]);
    setAuditLog([]);
    api.get(`/brand-authorizations/${row.id}/evidence`).then(r => setEvidence(r.data || [])).catch(() => setEvidence([]));
    api.get(`/brand-authorizations/${row.id}/audit`).then(r => setAuditLog(r.data || [])).catch(() => setAuditLog([]));
  };

  const viewEvidence = async (ev) => {
    try {
      const res = await api.get(`/brand-authorizations/${selected.id}/evidence/${ev.id}/signed-url`);
      window.open(res.data.url, '_blank');
    } catch { showErr('Could not open this document'); }
  };

  // Takes the target row explicitly rather than always reading `selected`
  // — the table's own quick-approve button calls this without first
  // waiting for openDetail()'s setSelected() to flush, so relying on
  // `selected` there would act on the previous drawer's row (or null).
  const runAction = async (action, reason, row = selected) => {
    if (!row) return;
    try {
      setActionLoading(true);
      if (action === 'approve') {
        await api.patch(`/brand-authorizations/${row.id}/approve`);
        showMsg('✅ Brand authorization approved');
      } else {
        await api.patch(`/brand-authorizations/${row.id}/${action}`, { reason });
        showMsg(`Authorization ${action}ed`);
      }
      setReasonModal(null); setReasonText(''); setSelected(null);
      fetchRows(filter);
    } catch (err) { showErr(err?.response?.data?.message || 'Action failed'); }
    finally { setActionLoading(false); }
  };

  const counts = { pending: rows.filter(r => r.status === 'pending').length };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>✅ Brand Authorizations</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Review and manage business-to-brand authorization requests</p>
          </div>
          <button onClick={() => fetchRows(filter)}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 Refresh
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { key: 'pending',   label: '⏳ Pending',   color: '#ca8a04' },
            { key: 'approved',  label: '✅ Authorized', color: '#16a34a' },
            { key: 'all',       label: 'All',           color: '#6366f1' },
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
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
            <div>No authorization requests here</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['Brand', 'Business Profile', 'Scope', 'Status', 'Submitted', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const ss = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
                  return (
                    <tr key={r.id} onClick={() => openDetail(r)}
                      style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{r.brand?.name || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#475569' }}>#{r.commerceProfileId}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b' }}>
                        {r.categoryScope || 'All categories'}{r.geographicScope?.length ? ` · ${r.geographicScope.join(', ')}` : ''}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: ss.bg, color: ss.color }}>{ss.label}</span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8' }}>
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {r.status === 'pending' && (
                          <button onClick={e => { e.stopPropagation(); runAction('approve', null, r); }} disabled={actionLoading}
                            style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                            ✅ Approve
                          </button>
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
      {selected && !reasonModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelected(null)}>
          <div style={{ width: 440, backgroundColor: '#fff', height: '100%', overflowY: 'auto', padding: 28, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>{selected.brand?.name}</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {(() => { const ss = STATUS_STYLE[selected.status] || STATUS_STYLE.pending; return (
              <div style={{ backgroundColor: ss.bg, color: ss.color, padding: '10px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, marginBottom: 20 }}>
                {ss.label}
                {selected.statusReason && <div style={{ fontWeight: 400, fontSize: 12, marginTop: 4 }}>Reason: {selected.statusReason}</div>}
              </div>
            ); })()}

            {[
              { label: 'Business Profile ID', value: `#${selected.commerceProfileId}` },
              { label: 'Distributor',         value: selected.distributor?.name },
              { label: 'Category Scope',      value: selected.categoryScope || 'All categories' },
              { label: 'Model Scope',         value: selected.modelScope?.join(', ') },
              { label: 'Region Scope',        value: selected.geographicScope?.join(', ') || 'Nationwide' },
              { label: 'Authorization #',     value: selected.authorizationNumber },
              { label: 'Verification Source', value: selected.verificationSource },
              { label: 'Expires',             value: selected.expiresAt ? new Date(selected.expiresAt).toLocaleDateString() : 'No expiry' },
              { label: 'Submitted',           value: selected.createdAt ? new Date(selected.createdAt).toLocaleString() : null },
            ].filter(f => f.value).map(field => (
              <div key={field.label} style={{ marginBottom: 14, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>{field.label.toUpperCase()}</div>
                <div style={{ fontSize: 14, color: '#1e293b', fontWeight: 600 }}>{field.value}</div>
              </div>
            ))}

            {evidence.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>EVIDENCE</div>
                {evidence.map(ev => (
                  <button key={ev.id} onClick={() => viewEvidence(ev)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', marginBottom: 6, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
                    📄 {ev.documentType} — view (signed link, expires in 5 min)
                  </button>
                ))}
              </div>
            )}

            {/* Audit History — spec §24's "Audit — full history" admin
                capability. Every transition recordTransition() has ever
                written for this authorization, oldest first. */}
            {auditLog.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>AUDIT HISTORY</div>
                {auditLog.map(entry => (
                  <div key={entry.id} style={{ padding: '10px 14px', marginBottom: 6, backgroundColor: '#f8fafc', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b' }}>
                      {entry.previousStatus} → {entry.newStatus}
                    </div>
                    <div style={{ color: '#64748b', marginTop: 2 }}>
                      {entry.actorUserId ? `User #${entry.actorUserId}` : 'System'} · {new Date(entry.createdAt).toLocaleString()}
                    </div>
                    {entry.reason && <div style={{ color: '#64748b', marginTop: 2 }}>Reason: {entry.reason}</div>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selected.status === 'pending' && (
                <>
                  <button onClick={() => runAction('approve')} disabled={actionLoading}
                    style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 15 }}>
                    {actionLoading ? '⏳...' : '✅ Approve'}
                  </button>
                  <button onClick={() => setReasonModal('reject')}
                    style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    ❌ Reject
                  </button>
                </>
              )}
              {selected.status === 'approved' && (
                <>
                  <button onClick={() => setReasonModal('suspend')}
                    style={{ backgroundColor: '#ffedd5', color: '#c2410c', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    ⏸ Suspend
                  </button>
                  <button onClick={() => setReasonModal('revoke')}
                    style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    🚫 Revoke
                  </button>
                </>
              )}
              {['suspended', 'expired'].includes(selected.status) && (
                <button onClick={() => runAction('approve')} disabled={actionLoading}
                  style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 15 }}>
                  {actionLoading ? '⏳...' : '✅ Reinstate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reason modal — reject/suspend/revoke all require one */}
      {reasonModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: 400 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800, textTransform: 'capitalize' }}>{reasonModal} reason</h3>
            <textarea value={reasonText} onChange={e => setReasonText(e.target.value)} rows={4}
              placeholder="Explain why..."
              style={{ width: '100%', padding: 12, borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setReasonModal(null); setReasonText(''); }}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontWeight: 700 }}>
                Cancel
              </button>
              <button onClick={() => runAction(reasonModal, reasonText)} disabled={!reasonText.trim() || actionLoading}
                style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', backgroundColor: !reasonText.trim() ? '#94a3b8' : '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBrandAuthorizations;
