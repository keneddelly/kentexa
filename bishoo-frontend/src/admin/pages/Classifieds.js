/**
 * AdminClassifieds.js
 * Place at: src/admin/pages/Classifieds.js
 *
 * Shows ALL classifieds with full seller contact info.
 * Admin can: approve, reject, mark sold, contact seller via WhatsApp.
 */
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const WA = (phone) => {
  if (!phone) return null;
  const n = String(phone).replace(/[^\d]/g,'').replace(/^0/,'255');
  return `https://wa.me/${n}`;
};

const PhoneCell = ({ phone, name }) => {
  if (!phone) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <div>
      {name && <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{name}</div>}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 2 }}>
        <a href={`tel:${phone}`} style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'none' }}>
          {phone}
        </a>
        <a href={WA(phone)} target="_blank" rel="noreferrer"
          style={{ fontSize: 9, backgroundColor: '#25D366', color: '#fff',
            padding: '2px 5px', borderRadius: 4, textDecoration: 'none', fontWeight: 700 }}>
          WA
        </a>
      </div>
    </div>
  );
};

const STATUS = {
  active:  { bg: '#dcfce7', color: '#16a34a', label: '✅ Inaonyeshwa' },
  sold:    { bg: '#f1f5f9', color: '#64748b', label: 'Imeuzwa' },
  expired: { bg: '#fee2e2', color: '#dc2626', label: 'Imekwisha' },
};

const CATEGORY_LABELS = {
  electronics: 'Elektroniki', fashion: 'Mavazi', vehicles: 'Magari',
  food: 'Chakula', home_garden: 'Nyumba', health_beauty: 'Afya/Uzuri',
  baby_kids: 'Watoto', sports: 'Michezo', agriculture: 'Kilimo',
  services: 'Huduma', property: 'Mali Isiyohamishika', general: 'Mengine',
};

const Classifieds = ({ activePage, onNavigate, onLogout }) => {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await api.get('/classifieds/admin');
      setItems(res.data || []);
    } catch {
      setError('Imeshindwa kupakia matangazo');
    } finally { setLoading(false); }
  };

  const handleStatus = async (id, status) => {
    try {
      setActionLoading(true);
      await api.patch(`/classifieds/${id}/status`, { status });
      setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
      if (selected?.id === id) setSelected(s => ({ ...s, status }));
    } catch { setError('Imeshindwa kubadilisha hali'); }
    finally { setActionLoading(false); }
  };

  const filtered = items.filter(item => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      item.title?.toLowerCase().includes(q) ||
      item.seller?.name?.toLowerCase().includes(q) ||
      item.seller?.phone?.includes(q) ||
      item.seller?.email?.toLowerCase().includes(q) ||
      item.location?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q);
    const matchFilter = filter === 'all' || item.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>
              📋 Matangazo
            </h1>
            <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>
              {items.length} matangazo yote
            </p>
          </div>
          <button onClick={fetchAll}
            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
              fontSize: 14, fontWeight: 700 }}>
            🔄 Onyesha Upya
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626',
            padding: '12px 16px', borderRadius: 8, marginBottom: 20 }}>
            ❌ {error}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Yanayoonyeshwa', value: items.filter(i => i.status === 'active').length,  bg: '#dcfce7', color: '#16a34a' },
            { label: 'Yaliyouzwa',     value: items.filter(i => i.status === 'sold').length,    bg: '#f1f5f9', color: '#64748b' },
            { label: 'Yaliyokwisha',   value: items.filter(i => i.status === 'expired').length, bg: '#fee2e2', color: '#dc2626' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12,
              padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <input type="text" placeholder="🔍 Tafuta jina, muuzaji, simu, eneo..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }} />
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }}>
            <option value="all">Hali Zote</option>
            <option value="active">Yanayoonyeshwa</option>
            <option value="sold">Yaliyouzwa</option>
            <option value="expired">Yaliyokwisha</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Inapakia...</div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Picha','Kichwa','Kategoria','Bei','Muuzaji / Simu','Eneo','Hali','Tarehe','Vitendo'].map(h => (
                    <th key={h} style={{ padding: '13px 14px', textAlign: 'left',
                      backgroundColor: '#f1f5f9', color: '#64748b',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="9" style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Hakuna matangazo
                  </td></tr>
                ) : filtered.map(item => {
                  const sc = STATUS[item.status] || { bg: '#f1f5f9', color: '#64748b', label: item.status };
                  return (
                    <tr key={item.id}
                      onClick={() => setSelected(item)}
                      style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}>
                      <td style={{ padding: '10px 14px' }}>
                        {item.images?.[0] ? (
                          <img src={item.images[0]} alt=""
                            style={{ width: 44, height: 44, borderRadius: 8,
                              objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 8,
                            backgroundColor: '#f1f5f9', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 18 }}>📦</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', maxWidth: 200 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          #{item.id}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
                        {CATEGORY_LABELS[item.category] || item.category || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13,
                        fontWeight: 800, color: '#16a34a', whiteSpace: 'nowrap' }}>
                        TZS {Number(item.price).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <PhoneCell name={item.seller?.name} phone={item.seller?.phone} />
                        {item.seller?.email && (
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            {item.seller.email}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
                        📍 {item.location || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20,
                          fontSize: 11, fontWeight: 700,
                          backgroundColor: sc.bg, color: sc.color }}>
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12,
                        color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(item.createdAt).toLocaleDateString('sw-TZ')}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {item.status !== 'sold' && (
                            <button
                              onClick={e => { e.stopPropagation(); handleStatus(item.id, 'sold'); }}
                              disabled={actionLoading}
                              style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6,
                                border: 'none', cursor: 'pointer', backgroundColor: '#f1f5f9',
                                color: '#64748b', fontWeight: 700 }}>
                              Imeuzwa
                            </button>
                          )}
                          {item.status === 'expired' && (
                            <button
                              onClick={e => { e.stopPropagation(); handleStatus(item.id, 'active'); }}
                              disabled={actionLoading}
                              style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6,
                                border: 'none', cursor: 'pointer', backgroundColor: '#dcfce7',
                                color: '#16a34a', fontWeight: 700 }}>
                              Onyesha
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Detail drawer */}
        {selected && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}
            onClick={() => setSelected(null)}>
            <div style={{ width: 440, backgroundColor: '#fff', height: '100%',
              overflowY: 'auto', padding: 28,
              boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
              onClick={e => e.stopPropagation()}>

              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a',
                  maxWidth: 340, lineHeight: 1.3 }}>
                  {selected.title}
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 20, color: '#94a3b8', flexShrink: 0 }}>✕</button>
              </div>

              {/* Image */}
              {selected.images?.[0] && (
                <img src={selected.images[0]} alt=""
                  style={{ width: '100%', height: 200, objectFit: 'cover',
                    borderRadius: 12, marginBottom: 16 }} />
              )}

              {/* Seller */}
              <div style={{ backgroundColor: '#eff6ff', borderRadius: 12,
                padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8',
                  marginBottom: 8, letterSpacing: 0.5 }}>🏪 ALIYEWEKA</div>
                <PhoneCell name={selected.seller?.name} phone={selected.seller?.phone} />
                {selected.seller?.email && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                    ✉️ {selected.seller.email}
                  </div>
                )}
                {selected.seller?.id && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    User ID: {selected.seller.id}
                  </div>
                )}
              </div>

              {/* Details */}
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12,
                padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b',
                  marginBottom: 8, letterSpacing: 0.5 }}>📋 MAELEZO</div>
                {[
                  ['Bei',       `TZS ${Number(selected.price).toLocaleString()}`],
                  ['Kategoria', CATEGORY_LABELS[selected.category] || selected.category || '—'],
                  ['Eneo',      selected.location || '—'],
                  ['Hali ya Bidhaa', selected.condition || '—'],
                  ['Mazungumzo', selected.isNegotiable ? 'Inaweza kupunguzwa' : 'Bei imara'],
                  ['Utoaji',    selected.deliveryMethod || '—'],
                  ['Bure',      selected.isFreeListing ? 'Ndiyo' : 'Hapana'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>{l}</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Description */}
              {selected.description && (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 12,
                  padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b',
                    marginBottom: 8, letterSpacing: 0.5 }}>📝 MAELEZO ZAIDI</div>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                    {selected.description}
                  </p>
                </div>
              )}

              {/* Admin actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.status !== 'sold' && (
                  <button onClick={() => handleStatus(selected.id, 'sold')}
                    disabled={actionLoading}
                    style={{ backgroundColor: '#f1f5f9', color: '#64748b',
                      border: 'none', padding: 12, borderRadius: 10,
                      cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    ✅ Weka kama Imeuzwa
                  </button>
                )}
                {selected.status === 'expired' && (
                  <button onClick={() => handleStatus(selected.id, 'active')}
                    disabled={actionLoading}
                    style={{ backgroundColor: '#dcfce7', color: '#16a34a',
                      border: 'none', padding: 12, borderRadius: 10,
                      cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    🔄 Onyesha Tena
                  </button>
                )}
                {selected.status !== 'expired' && (
                  <button onClick={() => handleStatus(selected.id, 'expired')}
                    disabled={actionLoading}
                    style={{ backgroundColor: '#fee2e2', color: '#dc2626',
                      border: 'none', padding: 12, borderRadius: 10,
                      cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    🗑️ Futa Tangazo
                  </button>
                )}
                {selected.seller?.phone && (
                  <a href={WA(selected.seller.phone)}
                    target="_blank" rel="noreferrer"
                    style={{ backgroundColor: '#25D366', color: '#fff',
                      border: 'none', padding: 12, borderRadius: 10,
                      cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                    💬 Wasiliana na Muuzaji WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Classifieds;