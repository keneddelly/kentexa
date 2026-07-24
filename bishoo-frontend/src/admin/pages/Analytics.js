import React, { useEffect, useState, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

/**
 * Analytics Admin Dashboard
 * Shows real-time user behavior, sessions, events, devices, locations
 */

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

const StatCard = ({ icon, label, value, sub, color = '#6366f1' }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: `3px solid ${color}` }}>
    <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a' }}>{value}</div>
    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
  </div>
);

const MiniBar = ({ data, valueKey, labelKey, colors }) => {
  if (!data?.length) return <div style={{ color: '#94a3b8', fontSize: 12, padding: '10px 0' }}>Hakuna data</div>;
  const max = Math.max(...data.map(d => Number(d[valueKey] || 0)));
  return (
    <div>
      {data.slice(0, 8).map((item, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>{item[labelKey] || '—'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{Number(item[valueKey]).toLocaleString()}</span>
          </div>
          <div style={{ height: 6, backgroundColor: '#f1f5f9', borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${(Number(item[valueKey]) / max) * 100}%`, backgroundColor: colors?.[i % colors.length] || '#6366f1', borderRadius: 3, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const Analytics = ({ activePage, onNavigate, onLogout }) => {
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [days, setDays]         = useState(7);
  const [liveEvents, setLiveEvents] = useState([]);
  const [error, setError]       = useState('');
  const refreshRef              = useRef(null);

  useEffect(() => { fetchStats(); }, [days]);

  useEffect(() => {
    fetchLive();
    refreshRef.current = setInterval(fetchLive, 15000); // eslint-disable-line react-hooks/exhaustive-deps
    return () => clearInterval(refreshRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/analytics/dashboard?days=${days}`);
      setStats(res.data);
    } catch { setError('Imeshindwa kupakia analytics'); }
    finally { setLoading(false); }
  };

  const fetchLive = async () => {
    try {
      const res = await api.get('/analytics/events/recent?limit=30');
      setLiveEvents(res.data || []);
    } catch {}
  };

  const EVENT_ICONS = {
    page_view:                '👁',
    click:                    '🖱️',
    scroll:                   '📜',
    search:                   '🔍',
    product_view:             '📦',
    add_to_cart:              '🛒',
    checkout_start:           '💳',
    order_placed:             '✅',
    login:                    '🔑',
    session_start:            '🟢',
    delivery_method_selected: '🚚',
    seller_action:            '🏪',
    page_exit:                '🚪',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 'calc(100vw - 250px)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>📊 Analytics — Tabia za Watumiaji</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Kila kitu kinachofanywa na watumiaji — wakati halisi</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)}
                style={{ padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  backgroundColor: days === d ? '#6366f1' : '#fff', color: days === d ? '#fff' : '#64748b',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                {d === 1 ? 'Leo' : `Siku ${d}`}
              </button>
            ))}
            <button onClick={fetchStats}
              style={{ padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, backgroundColor: '#f1f5f9', color: '#64748b' }}>
              🔄
            </button>
          </div>
        </div>

        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>❌ {error}</div>}

        {/* Active users badge */}
        {stats?.summary?.activeSessions > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: '#dcfce7', borderRadius: 20, padding: '6px 16px', marginBottom: 20, fontSize: 13, color: '#16a34a', fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            {stats.summary.activeSessions} watumiaji wanaotumia sasa
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            Inapakia data za analytics...
          </div>
        ) : stats && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginBottom: 28 }}>
              <StatCard icon="🌐" label="Sessions" value={stats.summary.totalSessions.toLocaleString()} color="#6366f1" />
              <StatCard icon="⚡" label="Matukio" value={stats.summary.totalEvents.toLocaleString()} color="#f59e0b" />
              <StatCard icon="👁" label="Page Views" value={stats.summary.totalPageViews.toLocaleString()} color="#06b6d4" />
              <StatCard icon="✅" label="Waliponunua" value={stats.summary.conversions.toLocaleString()} sub={`${stats.summary.conversionRate}% conversion`} color="#10b981" />
              <StatCard icon="🟢" label="Wanaotumia Sasa" value={stats.summary.activeSessions} color="#16a34a" />
              <StatCard icon="📈" label="Events/Session" value={stats.summary.avgEventsPerSession} color="#8b5cf6" />
            </div>

            {/* Main grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>

              {/* Top pages */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>📄 Kurasa Zinazofikiwa Zaidi</div>
                <MiniBar data={stats.topPages} valueKey="views" labelKey="page" colors={COLORS} />
              </div>

              {/* Top products */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>📦 Bidhaa Zinazoangaliwa Zaidi</div>
                <MiniBar data={stats.topProducts} valueKey="views" labelKey="name" colors={['#f59e0b','#fbbf24','#fcd34d','#fde68a']} />
              </div>

              {/* Top searches */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>🔍 Utafutaji Mkubwa</div>
                <MiniBar data={stats.topSearches} valueKey="count" labelKey="term" colors={['#8b5cf6','#a78bfa','#c4b5fd']} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>

              {/* Devices */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>📱 Vifaa</div>
                {(stats.devices || []).map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{d.device === 'mobile' ? '📱' : d.device === 'tablet' ? '📟' : '🖥️'}</span>
                      <span style={{ fontSize: 13, color: '#475569', textTransform: 'capitalize' }}>{d.device || 'desktop'}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{Number(d.count).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* Browsers */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>🌐 Vivinjari</div>
                <MiniBar data={stats.browsers} valueKey="count" labelKey="browser" colors={COLORS} />
              </div>

              {/* Traffic sources */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>📡 Chanzo cha Trafiki</div>
                <MiniBar data={stats.sources} valueKey="count" labelKey="source" colors={['#10b981','#34d399','#6ee7b7']} />
              </div>

              {/* Cities */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>📍 Miji</div>
                <MiniBar data={stats.cities} valueKey="count" labelKey="city" colors={['#ef4444','#f87171','#fca5a5']} />
              </div>
            </div>

            {/* Sessions over time */}
            <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>📈 Sessions kwa Siku</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                {(() => {
                  const data = stats.byDay || [];
                  const max  = Math.max(...data.map(d => Number(d.sessions || 0)), 1);
                  return data.map((d, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>{Number(d.sessions)}</span>
                      <div style={{ width: '100%', backgroundColor: '#6366f1', borderRadius: '3px 3px 0 0', height: `${(Number(d.sessions) / max) * 60}px`, minHeight: 2 }} />
                      <span style={{ fontSize: 9, color: '#94a3b8', transform: 'rotate(-30deg)', transformOrigin: 'center' }}>
                        {d.date ? new Date(d.date).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' }) : ''}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Event types + Live feed */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>

              {/* Event breakdown */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>⚡ Matukio kwa Aina</div>
                {(stats.eventTypes || []).map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 12 }}>
                    <span style={{ color: '#475569' }}>
                      {EVENT_ICONS[e.type] || '•'} {e.type?.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{Number(e.count).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* Live feed */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                    🟢 Matukio ya Mwisho
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>inasasishwa kila sekunde 15</span>
                  </div>
                  <button onClick={fetchLive}
                    style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', color: '#64748b' }}>
                    🔄
                  </button>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {liveEvents.map((e, i) => (
                    <div key={e.id || i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8fafc', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{EVENT_ICONS[e.eventType] || '•'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                          {e.eventType?.replace(/_/g, ' ')}
                          {e.eventLabel && <span style={{ color: '#94a3b8', fontWeight: 400 }}> — {e.eventLabel?.slice(0,40)}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          📄 {e.page || '—'}
                          {e.userId && <span style={{ marginLeft: 6, color: '#6366f1' }}>👤 #{e.userId}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                        {e.createdAt ? new Date(e.createdAt).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent sessions table */}
            <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>🌐 Sessions za Hivi Karibuni</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      {['Session', 'Mtumiaji', 'Kifaa', 'Kivinjari', 'Chanzo', 'Ukurasa', 'Matukio', 'Mabadiliko', 'Wakati'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.recentSessions || []).map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                        onClick={() => window.open(`/admin/session/${s.sessionId}`, '_blank')}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#6366f1' }}>{s.sessionId?.slice(0,12)}...</td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{s.userId ? `#${s.userId}` : '—'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {s.device === 'mobile' ? '📱' : s.device === 'tablet' ? '📟' : '🖥️'} {s.device || 'desktop'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{s.browser || '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>
                          {s.utmSource || (s.referrer ? (s.referrer.includes('google') ? 'Google' : s.referrer.includes('whatsapp') ? 'WhatsApp' : 'Referral') : 'Direct')}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{s.exitPage || '—'}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>{s.events}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {s.converted
                            ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✅ Ndiyo</span>
                            : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {s.createdAt ? new Date(s.createdAt).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Analytics;