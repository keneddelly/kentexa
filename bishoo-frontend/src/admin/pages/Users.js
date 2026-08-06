import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const ROLE_STYLE = {
  buyer:        { bg: '#f1f5f9', color: '#475569',  label: '👤 Mnunuzi' },
  seller:       { bg: '#ede9fe', color: '#7c3aed',  label: '🏪 Muuzaji' },
  agent:        { bg: '#dbeafe', color: '#2563eb',  label: '🤝 Agent' },
  super_agent:  { bg: '#fef9c3', color: '#ca8a04',  label: '⭐ Super Agent' },
  admin:        { bg: '#fee2e2', color: '#dc2626',  label: '🛡️ Admin' },
  manager:      { bg: '#dcfce7', color: '#16a34a',  label: '📊 Manager' },
};

const Users = ({ activePage, onNavigate, onLogout }) => {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');
  const [newRole, setNewRole]       = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setUsers(res.data || []);
    } catch { setError('Imeshindwa kupakia watumiaji'); }
    finally { setLoading(false); }
  };

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const handleChangeRole = async () => {
    if (!newRole) { showErr('Chagua jukumu'); return; }
    try {
      setActionLoading(true);
      await api.patch(`/users/${selected.id}`, { role: newRole });
      showMsg(`✅ Jukumu la ${selected.name} limebadilishwa kwenda ${newRole}`);
      setShowRoleModal(false);
      setNewRole('');
      setSelected(null);
      fetchUsers();
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setActionLoading(false); }
  };

  const handleDelete = async (userId, name) => {
    if (!window.confirm(`Futa akaunti ya ${name}? Hatua hii haiwezi kutenduliwa.`)) return;
    try {
      setActionLoading(true);
      await api.delete(`/users/${userId}`);
      showMsg(`✅ Akaunti ya ${name} imefutwa`);
      setSelected(null);
      fetchUsers();
    } catch (err) { showErr(err?.response?.data?.message || 'Imeshindwa'); }
    finally { setActionLoading(false); }
  };

  const filtered = users.filter(u => {
    const matchRole = filter === 'all' || u.role === filter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q) ||
      String(u.id).includes(q);
    return matchRole && matchSearch;
  });

  const counts = {};
  users.forEach(u => { counts[u.role] = (counts[u.role] || 0) + 1; });

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onNavigate('Dashboard')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Users</div>
      </div>
      <main style={{ flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>👥 Watumiaji</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Simamia akaunti zote za mfumo</p>
          </div>
          <button onClick={fetchUsers}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 Onyesha Upya
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { key: 'all', label: 'Wote', value: users.length, color: '#6366f1', bg: '#ede9fe' },
            ...Object.entries(ROLE_STYLE).map(([key, s]) => ({
              key, label: s.label, value: counts[key] || 0, color: s.color, bg: s.bg
            })),
          ].slice(0,6).map(c => (
            <div key={c.key} onClick={() => setFilter(c.key)}
              style={{ backgroundColor: filter === c.key ? c.color : c.bg, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.2s' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: filter === c.key ? '#fff' : c.color }}>{c.value}</div>
              <div style={{ fontSize: 10, color: filter === c.key ? 'rgba(255,255,255,0.8)' : c.color, fontWeight: 600, marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <input placeholder="🔍 Tafuta kwa jina, email, simu, ID..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, marginBottom: 16, backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} />

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Inapakia...</div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                  {['#', 'Jina', 'Email / Simu', 'Jukumu', 'Imethibitishwa', 'Tarehe', 'Vitendo'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, idx) => {
                  const rs = ROLE_STYLE[user.role] || ROLE_STYLE.buyer;
                  return (
                    <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                      onClick={() => setSelected(user)}>
                      <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>#{user.id}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{user.name || '—'}</div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 12, color: '#475569' }}>{user.email}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{user.phone || '—'}</div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: rs.bg, color: rs.color }}>
                          {rs.label}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 12, color: user.isVerified ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                          {user.isVerified ? '✅ Ndiyo' : '❌ Hapana'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: '#94a3b8' }}>
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('sw-TZ') : '—'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={e => { e.stopPropagation(); setSelected(user); setShowRoleModal(true); setNewRole(user.role); }}
                            style={{ backgroundColor: '#ede9fe', color: '#7c3aed', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                            🔄 Jukumu
                          </button>
                          {!['admin','manager'].includes(user.role) && (
                            <button onClick={e => { e.stopPropagation(); handleDelete(user.id, user.name); }}
                              style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
              Inaonyesha {filtered.length} kati ya {users.length} watumiaji
            </div>
          </div>
        )}
      </main>

      {/* Role change modal */}
      {showRoleModal && selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>🔄 Badilisha Jukumu</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>
              Mtumiaji: <strong>{selected.name}</strong> ({selected.email})
            </p>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Jukumu Jipya</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inputStyle, marginBottom: 18 }}>
              {Object.entries(ROLE_STYLE).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </select>
            <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
              ⚠️ Kubadilisha jukumu kutabadilisha ruhusa za mtumiaji mara moja.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowRoleModal(false); setNewRole(''); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                Ghairi
              </button>
              <button onClick={handleChangeRole} disabled={actionLoading}
                style={{ flex: 2, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: actionLoading ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {actionLoading ? '⏳...' : '✅ Hifadhi Jukumu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;