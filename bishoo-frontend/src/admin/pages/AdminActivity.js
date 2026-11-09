/**
 * Admin "Shughuli": everything happening on KenteXa, newest first (owner 2026-11-09: "admin is the
 * mirror of KenteXa ... we don't need to rely on checking the back-end"). Named events and every
 * recorded change, filtered by area, kind and words; refreshes every 30 s; "Pakia zaidi" goes back.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import ActivityList from '../components/ActivityList';
import { CATEGORY_LABEL } from '../utils/describeEvent';
import api from '../../api/api';

const input = { height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontFamily: 'inherit', background: '#fff' };

export default function AdminActivity({ activePage, onNavigate, onLogout }) {
  const [filter, setFilter] = useState({ category: '', kind: 'all', q: '' });
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useCallback((extra = {}) => {
    const p = { kind: filter.kind, limit: 60, ...extra };
    if (filter.category) p.category = filter.category;
    if (filter.q.trim()) p.q = filter.q.trim();
    return p;
  }, [filter]);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get('/activity/admin/feed', { params: params() });
      setItems(data?.items || []); setNext(data?.nextBefore ?? null);
    } catch (e) { setError(e?.response?.data?.message || 'Shughuli hazikupatikana'); }
    finally { setLoading(false); }
  }, [params]);
  useEffect(() => { setLoading(true); load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const more = async () => {
    try {
      const { data } = await api.get('/activity/admin/feed', { params: params({ before: next }) });
      setItems((cur) => [...cur, ...(data?.items || [])]); setNext(data?.nextBefore ?? null);
    } catch { setError('Imeshindikana kupakia zaidi'); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 980, color: '#0f172a' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Shughuli</h1>
        <p style={{ margin: '4px 0 16px', color: '#64748b' }}>Kila kinachofanyika KenteXa: nani, nini, lini. Inajisasisha kila sekunde 30.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <select aria-label="Eneo" value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))} style={input}>
            <option value="">Maeneo yote</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Aina" value={filter.kind} onChange={(e) => setFilter((f) => ({ ...f, kind: e.target.value }))} style={input}>
            <option value="all">Zote</option>
            <option value="named">Matukio makuu</option>
            <option value="action">Kila badiliko</option>
          </select>
          <input aria-label="Tafuta" placeholder="Tafuta (mf. orders, approve)" value={filter.q}
            onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} style={{ ...input, flex: 1, minWidth: 180 }} />
        </div>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '4px 16px 12px' }}>
          {loading ? <p style={{ color: '#64748b' }}>Inapakia...</p>
            : <ActivityList items={items} onOpenPerson={(userId) => onNavigate('AdminPerson', { userId })} />}
          {next && (
            <button type="button" onClick={more} style={{ marginTop: 12, height: 38, padding: '0 16px', borderRadius: 19, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>
              Pakia zaidi
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
