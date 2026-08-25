import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const AUDIENCE_LABELS = {
  all:         { label: '👥 Wote', color: '#6366f1' },
  sellers:     { label: '🏪 Wauzaji', color: '#7c3aed' },
  agents:      { label: '🤝 Agents', color: '#2563eb' },
  super_agents:{ label: '⭐ Super Agents', color: '#ca8a04' },
  buyers:      { label: '👤 Wanunuzi', color: '#16a34a' },
};

const PRIORITY_LABELS = {
  info:    { label: 'ℹ️ Habari',    bg: '#dbeafe', color: '#1d4ed8' },
  success: { label: '✅ Mafanikio', bg: '#dcfce7', color: '#16a34a' },
  warning: { label: '⚠️ Onyo',      bg: '#fef9c3', color: '#ca8a04' },
  urgent:  { label: '🚨 Dharura',   bg: '#fee2e2', color: '#dc2626' },
};

const emptyForm = {
  title: '', message: '', audience: 'all', priority: 'info',
  linkUrl: '', linkLabel: '', sendSms: false, expiresAt: '',
  targetUserId: null, targetUserName: '',
};

const Announcements = ({ activePage, onNavigate, onLogout }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');
  const [targetMode, setTargetMode] = useState('broadcast'); // 'broadcast' | 'user'
  const [allUsers, setAllUsers]     = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [usersLoaded, setUsersLoaded] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const loadUsersOnce = async () => {
    if (usersLoaded) return;
    try {
      const res = await api.get('/users');
      setAllUsers(res.data || []);
      setUsersLoaded(true);
    } catch { /* search list just stays empty */ }
  };

  const matchingUsers = userSearch.trim().length < 2 ? [] : allUsers.filter(u => {
    const q = userSearch.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q) || String(u.id).includes(q);
  }).slice(0, 8);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await api.get('/announcements/admin/all');
      setAnnouncements(res.data || []);
    } catch { setError('Imeshindwa kupakia matangazo'); }
    finally { setLoading(false); }
  };

  const showMsg = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000); };
  const showErr = (m) => { setError(m);   setTimeout(() => setError(''),   4000); };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      showErr('Weka kichwa na ujumbe'); return;
    }
    if (targetMode === 'user' && !form.targetUserId) {
      showErr('Chagua mtumiaji mahususi'); return;
    }
    try {
      setSaving(true);
      await api.post('/announcements/admin', {
        ...form,
        targetUserId: targetMode === 'user' ? form.targetUserId : undefined,
        targetUserName: targetMode === 'user' ? form.targetUserName : undefined,
        expiresAt: form.expiresAt || undefined,
        sendSms:   form.sendSms,
      });
      showMsg(`✅ Tangazo limetumwa${form.sendSms ? ' + SMS' : ''}`);
      setShowForm(false);
      setForm(emptyForm);
      setTargetMode('broadcast');
      setUserSearch('');
      fetchAll();
    } catch (err) {
      showErr(err?.response?.data?.message || 'Imeshindwa kutuma');
    } finally { setSaving(false); }
  };

  const handleToggle = async (id, isActive) => {
    await api.patch(`/announcements/admin/${id}`, { isActive: !isActive });
    fetchAll();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Futa tangazo hili?')) return;
    await api.delete(`/announcements/admin/${id}`);
    showMsg('✅ Tangazo limefutwa');
    fetchAll();
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>📢 Matangazo</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Tuma ujumbe kwa wauzaji, agents na wanunuzi</p>
          </div>
          <button onClick={() => setShowForm(true)}
            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            ➕ Tangazo Jipya
          </button>
        </div>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{message}</div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>❌ {error}</div>}

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Matangazo Yote',    value: announcements.length,                                    color: '#6366f1', bg: '#ede9fe' },
            { label: 'Yanayotumika',      value: announcements.filter(a => a.isActive).length,             color: '#16a34a', bg: '#dcfce7' },
            { label: 'SMS Zilizotumwa',   value: announcements.filter(a => a.smsSent).length,              color: '#ca8a04', bg: '#fef9c3' },
            { label: 'Yaliyokwisha',      value: announcements.filter(a => !a.isActive).length,            color: '#94a3b8', bg: '#f1f5f9' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Inapakia...</div>
        ) : announcements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 14, color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📢</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Hakuna matangazo bado</div>
            <div style={{ fontSize: 13 }}>Bonyeza "Tangazo Jipya" kuandika ujumbe wa kwanza</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {announcements.map(a => {
              const ps = PRIORITY_LABELS[a.priority] || PRIORITY_LABELS.info;
              const as_ = AUDIENCE_LABELS[a.audience] || AUDIENCE_LABELS.all;
              const readCount = a.readByUserIds?.length || 0;
              return (
                <div key={a.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', opacity: a.isActive ? 1 : 0.6, borderLeft: `4px solid ${ps.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, backgroundColor: ps.bg, color: ps.color }}>{ps.label}</span>
                        {a.targetUserId ? (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, backgroundColor: '#f1f5f9', color: '#0f172a' }}>👤 {a.targetUserName || `User #${a.targetUserId}`}</span>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, backgroundColor: '#f1f5f9', color: as_.color }}>{as_.label}</span>
                        )}
                        {!a.isActive && <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>IMEZIMWA</span>}
                        {a.smsSent && <span style={{ fontSize: 11, fontWeight: 700, color: '#ca8a04' }}>📱 SMS Imetumwa</span>}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{a.title}</div>
                      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{a.message}</div>
                      {a.linkUrl && (
                        <div style={{ fontSize: 11, color: '#6366f1', marginTop: 4 }}>🔗 {a.linkUrl}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 16, flexShrink: 0 }}>
                      <button onClick={() => handleToggle(a.id, a.isActive)}
                        style={{ backgroundColor: a.isActive ? '#fef9c3' : '#dcfce7', color: a.isActive ? '#ca8a04' : '#16a34a', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        {a.isActive ? '⏸ Simamisha' : '▶️ Amilisha'}
                      </button>
                      <button onClick={() => handleDelete(a.id)}
                        style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                    <span>📅 {new Date(a.createdAt).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span>👁 Wamesoma: {readCount}</span>
                    {a.expiresAt && <span>⏰ Inaisha: {new Date(a.expiresAt).toLocaleDateString('sw-TZ')}</span>}
                    <span>✍️ {a.createdBy?.name || 'Admin'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <div style={{ width: 480, backgroundColor: '#fff', height: '100%', overflowY: 'auto', padding: 28, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>📢 Tangazo Jipya</h2>
              <button onClick={() => { setShowForm(false); setForm(emptyForm); setTargetMode('broadcast'); setUserSearch(''); }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {/* Broadcast vs specific-user mode */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[
                { key: 'broadcast', label: '📢 Broadcast' },
                { key: 'user',      label: '👤 Mtumiaji Mahususi' },
              ].map(m => (
                <button key={m.key} type="button"
                  onClick={() => { setTargetMode(m.key); if (m.key === 'user') loadUsersOnce(); }}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    border: targetMode === m.key ? '2px solid #6366f1' : '2px solid #e2e8f0',
                    backgroundColor: targetMode === m.key ? '#eef2ff' : '#fff',
                    color: targetMode === m.key ? '#4f46e5' : '#64748b' }}>
                  {m.label}
                </button>
              ))}
            </div>

            {targetMode === 'user' && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Tafuta Mtumiaji *</label>
                {form.targetUserId ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: '#eef2ff', borderRadius: 8, padding: '10px 12px' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5' }}>👤 {form.targetUserName}</span>
                    <button onClick={() => { setForm({...form, targetUserId: null, targetUserName: ''}); setUserSearch(''); }}
                      style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      Badilisha
                    </button>
                  </div>
                ) : (
                  <>
                    <input placeholder="Tafuta kwa jina, simu, email..." value={userSearch}
                      onChange={e => setUserSearch(e.target.value)} style={inputStyle} />
                    {matchingUsers.length > 0 && (
                      <div style={{ marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                        {matchingUsers.map(u => (
                          <div key={u.id} onClick={() => { setForm({...form, targetUserId: u.id, targetUserName: u.name || u.phone || u.email}); }}
                            style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>{u.name || '—'}</div>
                            <div style={{ color: '#94a3b8' }}>{u.phone || u.email} · {u.role}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Kichwa *</label>
              <input placeholder="e.g. Mabadiliko ya Ada ya Van" value={form.title}
                onChange={e => setForm({...form, title: e.target.value})} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Ujumbe *</label>
              <textarea placeholder="Andika ujumbe wako hapa..." value={form.message}
                onChange={e => setForm({...form, message: e.target.value})} rows={5}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: targetMode === 'user' ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {targetMode === 'broadcast' && (
                <div>
                  <label style={labelStyle}>Walengwa</label>
                  <select value={form.audience} onChange={e => setForm({...form, audience: e.target.value})} style={inputStyle}>
                    {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label style={labelStyle}>Aina</label>
                <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} style={inputStyle}>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Kiungo (Optional)</label>
                <input placeholder="e.g. VanToday au https://..." value={form.linkUrl}
                  onChange={e => setForm({...form, linkUrl: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Lebo ya Kiungo</label>
                <input placeholder="e.g. Angalia Hapa" value={form.linkLabel}
                  onChange={e => setForm({...form, linkLabel: e.target.value})} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Inaisha Tarehe (Optional)</label>
              <input type="datetime-local" value={form.expiresAt}
                onChange={e => setForm({...form, expiresAt: e.target.value})} style={inputStyle} />
            </div>

            {/* SMS option */}
            <div style={{ backgroundColor: form.sendSms ? '#fef9c3' : '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 20, cursor: 'pointer' }}
              onClick={() => setForm({...form, sendSms: !form.sendSms})}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${form.sendSms ? '#ca8a04' : '#e2e8f0'}`, backgroundColor: form.sendSms ? '#ca8a04' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {form.sendSms && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>📱 Tuma SMS pia</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>SMS itatumwa kwa wote waliolengwa wanazo namba za simu</div>
                </div>
              </div>
              {form.sendSms && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                  ⚠️ Hii itatumia credits za Africa's Talking. Hakikisha una credit ya kutosha.
                </div>
              )}
            </div>

            {/* Preview */}
            {form.title && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Mfano wa Tangazo</label>
                <div style={{ backgroundColor: (PRIORITY_LABELS[form.priority] || PRIORITY_LABELS.info).bg, borderRadius: 10, padding: 14, border: `1px solid ${(PRIORITY_LABELS[form.priority] || PRIORITY_LABELS.info).color}40` }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: (PRIORITY_LABELS[form.priority] || PRIORITY_LABELS.info).color, marginBottom: 4 }}>
                    {(PRIORITY_LABELS[form.priority] || PRIORITY_LABELS.info).label} {form.title}
                  </div>
                  <div style={{ fontSize: 12, color: (PRIORITY_LABELS[form.priority] || PRIORITY_LABELS.info).color, lineHeight: 1.5 }}>
                    {form.message || '...'}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowForm(false); setForm(emptyForm); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                Ghairi
              </button>
              <button onClick={handleCreate} disabled={saving}
                style={{ flex: 2, background: saving ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {saving ? '⏳ Inatuma...' : `📢 Tuma${form.sendSms ? ' + SMS' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Announcements;