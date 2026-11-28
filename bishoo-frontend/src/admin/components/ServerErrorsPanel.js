/**
 * Error Watch: server errors (HTTP 500) from the last 24 hours, grouped by feature and route.
 * Shows only what the backend recorded: the messages are already redacted there.
 * Refreshes every 30 s. Shows nothing when there are no errors.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('sw-TZ', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function ServerErrorsPanel() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/activity/admin/errors', { params: { hours: 24 } });
      setReport(data || null);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.message || 'Makosa hayakupatikana');
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (error) return <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>;
  if (!report) return null;
  if (!report.totalErrors) {
    return <p data-testid="errors-none" style={{ color: '#15803d', fontWeight: 600 }}>Hakuna makosa ya seva masaa 24 yaliyopita.</p>;
  }

  return (
    <section data-testid="server-errors" aria-label="Makosa ya seva"
      style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 14, padding: '12px 16px', marginBottom: 16 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#b91c1c' }}>
        Makosa ya seva: {report.totalErrors} (masaa 24)
      </h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {report.groups.map((g) => (
          <div key={`${g.method}-${g.route}`} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, minWidth: 0 }}>
            <strong>{g.feature}</strong> · <code>{g.method} {g.route}</code> · <span>{g.count} mara</span>
            <div style={{ color: '#64748b', fontSize: 13 }}>
              Mara ya mwisho: {fmt(g.lastSeen)} · Ujumbe: <span style={{ wordBreak: 'break-word' }}>{g.sampleMessage}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
