import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const Profile = ({ activePage, onNavigate, onLogout }) => {
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
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: '250px', flex: 1, padding: '32px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
            Profile & Settings
          </h1>
          <p style={{ color: '#64748b', marginTop: '4px', fontSize: '14px' }}>
            Manage your account details
          </p>
        </div>

        {/* Success Message */}
        {message && (
          <div style={{
            backgroundColor: '#dcfce7',
            color: '#16a34a',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
          }}>
            ✅ {message}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
          }}>
            ❌ {error}
          </div>
        )}

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
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default Profile;