/**
 * Services.js — Admin view of service ads (ServiceAd)
 * Place at: src/admin/pages/Services.js
 *
 * Previously there was no admin visibility into services at all — no
 * sidebar entry, no endpoint returning every ad regardless of status
 * (browse()/search() only ever return status='active'). Mirrors
 * Products.js's layout/conventions; simpler than Products since ServiceAd
 * has no approval queue (isApproved) — just active/paused/inactive, set
 * by the provider or overridden here.
 */
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const STATUS = {
  active:   { bg: '#dcfce7', color: '#16a34a', label: '✅ Inafanya kazi' },
  paused:   { bg: '#fef9c3', color: '#ca8a04', label: '⏸ Imesimamishwa' },
  inactive: { bg: '#f1f5f9', color: '#64748b', label: '⚪ Haifanyi kazi' },
};

const Services = ({ activePage, onNavigate, onLogout }) => {
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [message, setMessage]   = useState('');
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all');

  useEffect(() => { fetchServices(); }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const res = await api.get('/services/admin/all');
      setServices(res.data || []);
    } catch (err) {
      setError('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const handleSetStatus = async (service, status) => {
    try {
      await api.patch(`/services/admin/${service.id}/status`, { status });
      setMessage(`Service ${status === 'active' ? 'enabled' : status === 'paused' ? 'paused' : 'disabled'}`);
      fetchServices();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update service');
    }
  };

  const filtered = services.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      s.title?.toLowerCase().includes(q) ||
      s.provider?.name?.toLowerCase().includes(q) ||
      s.provider?.storeName?.toLowerCase().includes(q) ||
      s.provider?.phone?.includes(q);
    const matchFilter = filter === 'all' || s.status === filter;
    return matchSearch && matchFilter;
  });

  const priceLabel = (s) => {
    if (s.priceType === 'negotiate') return 'Mazungumzo';
    if (s.priceType === 'free_quote') return 'Bei kwa Ombi';
    const unit = s.priceType === 'per_hour' ? '/saa' : s.priceType === 'per_day' ? '/siku' : '';
    return `TZS ${Number(s.price || 0).toLocaleString()}${unit}`;
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: '250px', flex: 1, padding: '32px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', margin: 0, fontFamily: 'Manrope,sans-serif' }}>🔧 Huduma</h1>
            <p style={{ color: '#64748b', marginTop: '4px', fontSize: '14px' }}>{services.length} huduma zote</p>
          </div>
          <button onClick={fetchServices} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
            🔄 Refresh
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>✅ {message} <button onClick={() => setMessage('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button></div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>❌ {error} <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button></div>}

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <input type="text" placeholder="🔍 Tafuta huduma au mtoa huduma..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} />
          {[
            { key: 'all',      label: `Zote (${services.length})` },
            { key: 'active',   label: '✅ Zinafanya kazi' },
            { key: 'paused',   label: '⏸ Zimesimamishwa' },
            { key: 'inactive', label: '⚪ Hazifanyi kazi' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, backgroundColor: filter === f.key ? '#1d4ed8' : '#fff', color: filter === f.key ? '#fff' : '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: '#64748b' }}>Inapakia huduma...</p>}

        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {filtered.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>Hakuna huduma zilizopatikana.</p>
            ) : (
              filtered.map((s) => {
                const sc = STATUS[s.status] || STATUS.inactive;
                return (
                  <div key={s.id} style={{
                    backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9',
                  }}>
                    <div style={{ height: '160px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      {s.images?.[0] ? (
                        <img src={s.images[0]} alt={s.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                      ) : <span style={{ fontSize: '40px' }}>🔧</span>}
                      <span style={{ position: 'absolute', top: 8, left: 8, backgroundColor: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>
                        {sc.label}
                      </span>
                    </div>

                    <div style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0, flex: 1 }}>{s.title}</h3>
                        <span style={{ padding: '3px 8px', borderRadius: 12, backgroundColor: '#ede9fe', color: '#6366f1', fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 6 }}>
                          {s.category?.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '6px 10px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                        <span style={{ fontSize: 12 }}>👤</span>
                        <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{s.provider?.storeName || s.provider?.name || '—'}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>· {s.provider?.phone || s.provider?.email || '—'}</span>
                      </div>

                      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
                        {s.description?.substring(0, 70)}{s.description?.length > 70 ? '...' : ''}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: '#1d4ed8' }}>{priceLabel(s)}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>⭐ {Number(s.rating || 0).toFixed(1)} ({s.totalRatings || 0})</span>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        {s.status !== 'active' && (
                          <button onClick={() => handleSetStatus(s, 'active')}
                            style={{ flex: 1, backgroundColor: '#dcfce7', color: '#16a34a', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            ▶ Washa
                          </button>
                        )}
                        {s.status !== 'paused' && (
                          <button onClick={() => handleSetStatus(s, 'paused')}
                            style={{ flex: 1, backgroundColor: '#fef9c3', color: '#ca8a04', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            ⏸ Simamisha
                          </button>
                        )}
                        {s.status !== 'inactive' && (
                          <button onClick={() => handleSetStatus(s, 'inactive')}
                            style={{ flex: 1, backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            ⚪ Zima
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Services;
