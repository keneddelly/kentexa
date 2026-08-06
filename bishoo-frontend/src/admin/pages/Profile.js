import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const ADMIN_SECTIONS = [
  { category: 'Muhtasari', items: [
    { icon: '📊', label: 'Dashboard',          page: 'Dashboard' },
    { icon: '📈', label: 'Analytics',          page: 'Analytics' },
    { icon: '📈', label: 'Reports',            page: 'Reports' },
    { icon: '📈', label: 'Fedha (Finance)',    page: 'FinancialDashboard' },
  ]},
  { category: 'Biashara', items: [
    { icon: '📦', label: 'Products',           page: 'Products' },
    { icon: '📋', label: 'Classifieds',        page: 'Classifieds' },
    { icon: '🛒', label: 'Orders',             page: 'Orders' },
    { icon: '🧾', label: 'Invoices',           page: 'Invoices' },
  ]},
  { category: 'Watu', items: [
    { icon: '👥', label: 'Users',              page: 'Users' },
    { icon: '🏪', label: 'Sellers',            page: 'Sellers' },
    { icon: '🤝', label: 'Agents',             page: 'Agents' },
    { icon: '🏢', label: 'Super Agents',       page: 'SuperAgents' },
    { icon: '📊', label: 'Agent Performance',  page: 'AgentPerformance' },
  ]},
  { category: 'Malipo', items: [
    { icon: '💳', label: 'Payments',           page: 'Payments' },
    { icon: '💰', label: 'Payouts',            page: 'Payouts' },
  ]},
  { category: 'Usafirishaji', items: [
    { icon: '🗺️', label: 'Njia za Intercity',  page: 'RouteManagement' },
    { icon: '🚴', label: 'Ada za Kukusanya',   page: 'CollectionFees' },
    { icon: '🗺️', label: 'Zones (Dar)',        page: 'ZoneManagement' },
    { icon: '🛵', label: 'Bei za Boda',        page: 'BodaRates' },
    { icon: '🚌', label: 'Wasafirishaji',      page: 'TransportAdmin' },
    { icon: '🏢', label: 'Vituo / Hubs',       page: 'HubAdmin' },
  ]},
  { category: 'Msaada', items: [
    { icon: '⚠️', label: 'Disputes',           page: 'Disputes' },
    { icon: '📢', label: 'Matangazo',          page: 'Announcements' },
    { icon: '📬', label: 'Ujumbe',             page: 'ContactMessages' },
  ]},
];

const Profile = ({ onNavigate, onLogout }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/profile');
      setProfile(res.data);
      setForm({
        name: res.data.name || '',
        phone: res.data.phone || '',
      });
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await api.patch(`/users/${profile.id}`, form);
      setMessage('Profile updated successfully');
      setEditing(false);
      fetchProfile();
    } catch (err) {
      setError('Failed to update profile');
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    try {
      await api.patch(`/users/${profile.id}`, {
        password: passwordForm.newPassword,
      });
      setMessage('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError('Failed to change password');
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    fontSize: '14px',
    boxSizing: 'border-box',
    backgroundColor: '#f8fafc',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '6px',
    fontWeight: '600',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onNavigate('Dashboard')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Profile & Settings</div>
      </div>
      <main style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>

        {/* Success / Error */}
        {message && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
            ✅ {message}
          </div>
        )}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
            ❌ {error}
          </div>
        )}

        {/* Admin sections hub — replaces the old sidebar */}
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>⚙️ Sehemu za Admin</h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>Chagua sehemu unayotaka kusimamia</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {ADMIN_SECTIONS.map(group => (
              <div key={group.category} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: '10px' }}>
                  {group.category}
                </div>
                {group.items.map(item => (
                  <button key={item.page} onClick={() => onNavigate(item.page)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      backgroundColor: 'transparent', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#334155',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <span style={{ color: '#cbd5e1' }}>›</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#64748b' }}>Loading profile...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

            {/* Profile Info Card */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
              {/* Avatar */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  backgroundColor: '#6366f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  margin: '0 auto 12px',
                }}>
                  👤
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
                  {profile?.name || 'Admin'}
                </h2>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  backgroundColor: '#ede9fe',
                  color: '#6366f1',
                  fontSize: '12px',
                  fontWeight: '600',
                  marginTop: '8px',
                  display: 'inline-block',
                }}>
                  {profile?.role?.toUpperCase()}
                </span>
              </div>

              {/* Profile Details */}
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Email</label>
                <input
                  style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b' }}
                  value={profile?.email || ''}
                  disabled
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Full Name</label>
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  disabled={!editing}
                  placeholder="Enter your name"
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Phone</label>
                <input
                  style={inputStyle}
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  disabled={!editing}
                  placeholder="255XXXXXXXXX"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                {editing ? (
                  <>
                    <button
                      onClick={handleUpdateProfile}
                      style={{
                        flex: 1,
                        backgroundColor: '#6366f1',
                        color: '#fff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                      }}
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      style={{
                        flex: 1,
                        backgroundColor: '#f1f5f9',
                        color: '#64748b',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      flex: 1,
                      backgroundColor: '#6366f1',
                      color: '#fff',
                      border: 'none',
                      padding: '10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    ✏️ Edit Profile
                  </button>
                )}
              </div>
            </div>

            {/* Change Password Card */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '20px', marginTop: 0 }}>
                🔒 Change Password
              </h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>New Password</label>
                <input
                  type="password"
                  style={inputStyle}
                  placeholder="Min 6 characters"
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Confirm New Password</label>
                <input
                  type="password"
                  style={inputStyle}
                  placeholder="Repeat new password"
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                />
              </div>

              <button
                onClick={handleChangePassword}
                style={{
                  width: '100%',
                  backgroundColor: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                }}
              >
                🔐 Update Password
              </button>

              {/* Account Info */}
              <div style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
              }}>
                <h4 style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px', textTransform: 'uppercase' }}>
                  Account Info
                </h4>
                <div style={{ fontSize: '13px', color: '#0f172a', lineHeight: '2' }}>
                  <div>🆔 ID: <strong>{profile?.id}</strong></div>
                  <div>📧 Email: <strong>{profile?.email}</strong></div>
                  <div>👑 Role: <strong>{profile?.role}</strong></div>
                  <div>📅 Joined: <strong>{new Date(profile?.createdAt).toLocaleDateString()}</strong></div>
                </div>
              </div>

              {/* Logout */}
              <button onClick={onLogout}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  color: '#ef4444',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '14px',
                }}
              >
                🚪 Logout
              </button>
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default Profile;
