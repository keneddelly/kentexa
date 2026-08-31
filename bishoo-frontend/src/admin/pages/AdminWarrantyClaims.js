import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

// Read-only cross-business oversight (spec §15) — claim review itself
// stays seller-owned (SellerWarrantyClaims.js); this is visibility only,
// same posture as every other admin oversight page in this codebase.
const STATUS_STYLE = {
  submitted:    { bg: '#fef9c3', color: '#ca8a04', label: '📝 Submitted' },
  under_review: { bg: '#eff6ff', color: '#1d4ed8', label: '🔎 Under Review' },
  approved:     { bg: '#dcfce7', color: '#16a34a', label: '✅ Approved' },
  rejected:     { bg: '#fee2e2', color: '#dc2626', label: '❌ Rejected' },
  resolved:     { bg: '#dcfce7', color: '#16a34a', label: '✅ Resolved' },
};

const AdminWarrantyClaims = ({ activePage, onNavigate, onLogout }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [auditLog, setAuditLog] = useState([]);

  useEffect(() => { fetchRows(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRows = async () => {
    try {
      setLoading(true);
      const res = await api.get('/warranty/admin/claims');
      setRows(res.data || []);
    } catch { setError('Failed to load warranty claims'); }
    finally { setLoading(false); }
  };

  // Audit history (spec §24) — same "click row -> right-side drawer"
  // pattern AdminBrandAuthorizations.js already uses.
  const openDetail = (row) => {
    setSelected(row);
    setAuditLog([]);
    api.get(`/warranty/claims/${row.id}/audit`).then(r => setAuditLog(r.data || [])).catch(() => setAuditLog([]));
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>🛡️ Warranty Claims</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Cross-business visibility — claim review itself is owned by the seller</p>
          </div>
          <button onClick={fetchRows}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 Refresh
          </button>
        </div>

        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
            <div>No warranty claims yet</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['Registration', 'Reason', 'Status', 'Reviewed', 'Submitted'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const ss = STATUS_STYLE[r.status] || STATUS_STYLE.submitted;
                  return (
                    <tr key={r.id} onClick={() => openDetail(r)}
                      style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}>
                      <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>#{r.registrationId}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#475569', maxWidth: 320 }}>{r.reason}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: ss.bg, color: ss.color }}>{ss.label}</span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8' }}>
                        {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: '#94a3b8' }}>
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Detail drawer — reason/evidence/resolution already come back on
          the list row itself; the audit history is fetched fresh. */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelected(null)}>
          <div style={{ width: 440, backgroundColor: '#fff', height: '100%', overflowY: 'auto', padding: 28, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Claim #{selected.id}</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {(() => { const ss = STATUS_STYLE[selected.status] || STATUS_STYLE.submitted; return (
              <div style={{ backgroundColor: ss.bg, color: ss.color, padding: '10px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, marginBottom: 20 }}>
                {ss.label}
              </div>
            ); })()}

            {[
              { label: 'Registration', value: `#${selected.registrationId}` },
              { label: 'Reason',       value: selected.reason },
              { label: 'Resolution',   value: selected.resolution },
              { label: 'Submitted',    value: selected.createdAt ? new Date(selected.createdAt).toLocaleString() : null },
              { label: 'Reviewed',     value: selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString() : null },
            ].filter(f => f.value).map(field => (
              <div key={field.label} style={{ marginBottom: 14, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>{field.label.toUpperCase()}</div>
                <div style={{ fontSize: 14, color: '#1e293b', fontWeight: 600 }}>{field.value}</div>
              </div>
            ))}

            {selected.evidenceImages?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>EVIDENCE</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selected.evidenceImages.map((img, i) => (
                    <img key={i} src={img} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', cursor: 'pointer' }}
                      onClick={() => window.open(img, '_blank')} />
                  ))}
                </div>
              </div>
            )}

            {/* Audit History — spec §24's "Audit — full history" admin
                capability. Every transition reviewClaim()/fileClaim() has
                ever written for this claim, oldest first. */}
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
                    {entry.reason && <div style={{ color: '#64748b', marginTop: 2 }}>Note: {entry.reason}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWarrantyClaims;
