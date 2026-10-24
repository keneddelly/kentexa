import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// Admin: business applications (a Business asking to sell, transport, run an office or
// offer services). The server has always had these routes; no admin screen read them,
// so applications could not be seen or decided (owner 2026-10-24).
const CAPABILITY = {
  commerce: 'Selling (Seller)', transport: 'Transport', cargo: 'Cargo', super_agent: 'Office (Super Agent)', service: 'Services',
};
const STATUSES = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']];
const cell = { padding: '8px 10px', borderTop: '1px solid #e2e8f0', verticalAlign: 'top', fontSize: 14 };
const when = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function BusinessApplications() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/admin/business-capability-applications', { params: { status } });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(err?.response?.data?.message || 'Could not load applications');
    } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function approve(row) {
    if (!window.confirm(`Approve ${CAPABILITY[row.capabilityCode] || row.capabilityCode} for ${row.businessName} (#${row.id})?`)) return;
    try { setBusy(row.id); setError(''); await api.post(`/admin/business-capability-applications/${row.id}/approve`); await load(); }
    catch (err) { setError(err?.response?.data?.message || 'Could not approve'); }
    finally { setBusy(null); }
  }

  async function reject(row) {
    const reason = window.prompt(`Reason to reject ${row.businessName} (#${row.id}):`);
    if (reason === null) return;
    if (reason.trim().length < 3) { setError('Enter a reason of at least 3 characters.'); return; }
    try {
      setBusy(row.id); setError('');
      await api.post(`/admin/business-capability-applications/${row.id}/reject`, { rejectionReason: reason.trim() });
      await load();
    } catch (err) { setError(err?.response?.data?.message || 'Could not reject'); }
    finally { setBusy(null); }
  }

  const details = (row) => {
    const d = row.applicationData || {};
    return [d.type && `Type: ${d.type}`, d.city && `City: ${d.city}`].filter(Boolean).join(' · ') || '—';
  };

  return (
    <section data-testid="business-applications" style={{ marginBottom: 32 }}>
      <h2 style={{ marginBottom: 4 }}>Applications</h2>
      <p style={{ marginTop: 0, color: '#475569' }}>Businesses asking to sell, transport, run an office or offer services.</p>
      <label>
        Show{' '}
        <select aria-label="Application status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {loading ? <p>Loading…</p> : rows.length === 0 ? (
        <p data-testid="no-applications">No {status} applications.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: 12 }}>
            <thead><tr>
              <th style={cell}>ID</th><th style={cell}>Business</th><th style={cell}>Wants</th><th style={cell}>Details</th>
              <th style={cell}>Applicant</th><th style={cell}>Sent</th><th style={cell}>Status</th><th style={cell}>Action</th>
            </tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id}>
                <td style={cell}>{row.id}</td>
                <td style={cell}>{row.businessName}<div style={{ fontSize: 12, color: '#64748b' }}>Business #{row.businessId} · {row.businessStatus}</div></td>
                <td style={cell}>{CAPABILITY[row.capabilityCode] || row.capabilityCode}</td>
                <td style={cell}>{details(row)}</td>
                <td style={cell}>{row.applicantName || '—'}{row.applicantPhone && <div><a href={`tel:${row.applicantPhone}`}>{row.applicantPhone}</a></div>}</td>
                <td style={cell}>{when(row.submittedAt)}</td>
                <td style={cell}>{row.status}{row.profileStatus ? <div style={{ fontSize: 12, color: '#64748b' }}>profile: {row.profileStatus}</div> : null}
                  {row.rejectionReason && <div style={{ fontSize: 12, color: '#b91c1c' }}>{row.rejectionReason}</div>}</td>
                <td style={cell}>{row.status === 'pending' ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" disabled={busy !== null} onClick={() => approve(row)}>Approve</button>
                    <button type="button" disabled={busy !== null} onClick={() => reject(row)}>Reject</button>
                  </span>
                ) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
