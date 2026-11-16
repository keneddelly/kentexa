import React, { useEffect, useState } from 'react';
import api from '../../api/api';

// Traffic step 2 (issue #368, owner approved 2026-11-16): the admin's emergency switch for a
// traffic spike, with the server's live numbers. On: AI help (except safety checks) and browsing
// records pause; public pages are cached longer. A restart or deploy turns it off again.
export default function SpikeModeCard() {
  const [mode, setMode] = useState(null);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/traffic/spike-mode').then((r) => setMode(r.data)).catch(() => setMode(null));
    api.get('/version/health').then((r) => setHealth(r.data)).catch(() => setHealth(null));
  };
  useEffect(load, []);

  const toggle = async () => {
    setBusy(true); setError('');
    try { const r = await api.post('/traffic/spike-mode', { on: !mode?.on }); setMode(r.data); }
    catch { setError('Imeshindikana kubadilisha. Jaribu tena.'); }
    finally { setBusy(false); }
  };

  const req = health?.requests;
  const last = req?.perMinute?.length ? req.perMinute[req.perMinute.length - 1].count : null;
  const pool = health?.database?.pool;
  return (
    <div data-testid="spike-mode-card" style={{ background: '#fff', border: `1px solid ${mode?.on ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 14, padding: 18, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Hali ya msongamano</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
            {mode?.on ? 'IMEWASHWA: AI (isipokuwa ukaguzi wa usalama) na kumbukumbu za kuvinjari zimesimamishwa.' : 'Imezimwa. Washa wakati wa msongamano mkubwa wa watumiaji.'}
          </div>
        </div>
        <button type="button" onClick={toggle} disabled={busy || !mode} data-testid="spike-mode-toggle"
          style={{ background: mode?.on ? '#0f1419' : '#f59e0b', color: '#fff', border: 'none', borderRadius: 999, padding: '9px 18px', fontWeight: 700, cursor: 'pointer' }}>
          {mode?.on ? 'Zima' : 'Washa'}
        </button>
      </div>
      {error && <div role="alert" style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{error}</div>}
      {health && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, fontSize: 13, color: '#334155' }}>
          <span>Maombi dakika hii: <b>{last ?? '—'}</b></span>
          <span>Muda (p95): <b>{req?.latencyMs?.p95 ?? '—'} ms</b></span>
          <span>Hitilafu 5xx: <b>{req?.status?.server5xx ?? 0}</b></span>
          <span>Mengi mno (429): <b>{req?.status?.tooMany429 ?? 0}</b></span>
          <span>Database: <b>{pool ? `${pool.total - pool.idle}/${pool.max ?? '?'} zinatumika, ${pool.waiting} zinasubiri` : '—'}</b></span>
          <button type="button" onClick={load} style={{ border: 'none', background: 'none', color: '#1d9bf0', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Onyesha upya</button>
        </div>
      )}
    </div>
  );
}
