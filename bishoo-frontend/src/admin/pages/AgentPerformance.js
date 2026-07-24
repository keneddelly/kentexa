import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const STATUS_STYLE = {
  active:    { bg: '#dcfce7', color: '#16a34a', label: '✅ Hai' },
  pending:   { bg: '#fef9c3', color: '#ca8a04', label: '⏳ Inasubiri' },
  suspended: { bg: '#fee2e2', color: '#dc2626', label: '🚫 Imesimamishwa' },
  blocked:   { bg: '#f1f5f9', color: '#64748b', label: '⛔ Imezuiwa' },
};

const StarRating = ({ rating }) => {
  const full = Math.floor(Number(rating));
  const half = Number(rating) % 1 >= 0.5;
  return (
    <span style={{ fontSize: 13, letterSpacing: 1 }}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(5 - full - (half ? 1 : 0))}
      <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>{Number(rating).toFixed(1)}</span>
    </span>
  );
};

const Stat = ({ label, value, color = '#1e293b', sub }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 20, fontWeight: 900, color }}>{value}</div>
    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color }}>{sub}</div>}
  </div>
);

const AgentPerformance = ({ onNavigate }) => {
  const [agents, setAgents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]   = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError]     = useState('');
  const [sortBy, setSortBy]   = useState('rating');
  const [filterCity, setFilterCity] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/super-agents/admin/performance');
        setAgents(res.data || []);
      } catch { setError('Imeshindwa kupakia data'); }
      finally { setLoading(false); }
    })();
  }, []);

  const loadDetail = async (id) => {
    setSelected(id);
    setDetailLoading(true);
    try {
      const res = await api.get(`/super-agents/admin/performance/${id}`);
      setDetail(res.data);
    } catch {}
    finally { setDetailLoading(false); }
  };

  const cities = [...new Set(agents.map(a => a.city))].sort();

  const sorted = [...agents]
    .filter(a => !filterCity || a.city === filterCity)
    .sort((a, b) => {
      if (sortBy === 'rating') return Number(b.rating) - Number(a.rating);
      if (sortBy === 'parcels') return b.totalParcelsDelivered - a.totalParcelsDelivered;
      if (sortBy === 'earnings') return Number(b.totalEarnings) - Number(a.totalEarnings);
      if (sortBy === 'complaints') return b.totalComplaints - a.totalComplaints;
      return 0;
    });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar onNavigate={onNavigate} activeItem="AgentPerformance" />
      <div style={{ flex: 1, padding: 24 }}>

        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>📊 Utendaji wa Super Agents</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
          Rating, vifurushi, mapato, na malalamiko — Super Agents wote kwa jicho moja
        </p>

        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>❌ {error}</div>}

        {/* Summary cards */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Super Agents',     value: agents.length,    color: '#1d4ed8', bg: '#dbeafe' },
              { label: 'Wanaofanya kazi',  value: agents.filter(a => a.status === 'active').length, color: '#16a34a', bg: '#dcfce7' },
              { label: 'Vifurushi Jumla',  value: agents.reduce((s,a) => s + a.totalParcelsDelivered, 0), color: '#7c3aed', bg: '#ede9fe' },
              { label: 'Malalamiko',       value: agents.reduce((s,a) => s + a.totalComplaints, 0), color: '#dc2626', bg: '#fee2e2' },
            ].map(c => (
              <div key={c.label} style={{ backgroundColor: c.bg, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 11, color: c.color, fontWeight: 600 }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 20 }}>
          {/* Agent list */}
          <div style={{ flex: 1 }}>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <option value="">Miji yote</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <option value="rating">Panga: Rating</option>
                <option value="parcels">Panga: Vifurushi</option>
                <option value="earnings">Panga: Mapato</option>
                <option value="complaints">Panga: Malalamiko</option>
              </select>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{sorted.length} agents</div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Inapakia...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sorted.map(agent => {
                  const st = STATUS_STYLE[agent.status] || STATUS_STYLE.pending;
                  const isSelected = selected === agent.id;
                  return (
                    <div key={agent.id}
                      onClick={() => loadDetail(agent.id)}
                      style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, cursor: 'pointer',
                        boxShadow: isSelected ? '0 0 0 2px #1d4ed8' : '0 2px 8px rgba(0,0,0,0.06)',
                        border: isSelected ? '2px solid #1d4ed8' : '2px solid transparent' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{agent.businessName}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>📍 {agent.city} · {agent.agentCode || '—'}</div>
                          <div style={{ marginTop: 4 }}><StarRating rating={agent.rating} /></div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                        <Stat label="Vifurushi" value={agent.totalParcelsDelivered} color="#1d4ed8" />
                        <Stat label="Vilivopotea" value={agent.totalParcelsLost} color={agent.totalParcelsLost > 0 ? '#dc2626' : '#16a34a'} />
                        <Stat label="Malalamiko" value={agent.totalComplaints} color={agent.totalComplaints > 0 ? '#dc2626' : '#16a34a'} />
                        <Stat label="Mapato" value={`TZS ${Number(agent.totalEarnings).toLocaleString()}`} color="#16a34a" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ width: 300, flexShrink: 0 }}>
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', position: 'sticky', top: 24 }}>
                {detailLoading ? (
                  <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>⏳</div>
                ) : detail ? (
                  <>
                    <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1e293b', margin: '0 0 4px' }}>{detail.businessName}</h3>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>📍 {detail.city} · {detail.agentCode || 'Hakuna msimbo'}</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                      {[
                        { l: 'Rating', v: `${Number(detail.rating).toFixed(1)} ⭐`, c: '#f59e0b' },
                        { l: 'Total Ratings', v: detail.totalRatings, c: '#64748b' },
                        { l: 'Vimepokewa', v: detail.totalParcelsHandled, c: '#1d4ed8' },
                        { l: 'Vimefikishwa', v: detail.totalParcelsDelivered, c: '#16a34a' },
                        { l: 'Vilivopotea', v: detail.totalParcelsLost, c: detail.totalParcelsLost > 0 ? '#dc2626' : '#16a34a' },
                        { l: 'Vilichelewa', v: detail.totalParcelsDelayed, c: detail.totalParcelsDelayed > 0 ? '#f59e0b' : '#16a34a' },
                        { l: 'Malalamiko', v: detail.totalComplaints, c: detail.totalComplaints > 0 ? '#dc2626' : '#16a34a' },
                        { l: 'Muda wa Saa', v: detail.onTimeRate != null ? `${detail.onTimeRate}%` : '—', c: '#7c3aed' },
                      ].map(item => (
                        <div key={item.l} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: item.c }}>{item.v}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{item.l}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>💰 MAPATO</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d' }}>TZS {Number(detail.totalEarnings).toLocaleString()}</div>
                      {Number(detail.pendingEarnings) > 0 && (
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          Inayosubiri: TZS {Number(detail.pendingEarnings).toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, marginBottom: 4 }}>💹 COMMISSION RATE</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#1d4ed8' }}>{detail.commissionRate}%</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>ya ada ya usafirishaji</div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentPerformance;