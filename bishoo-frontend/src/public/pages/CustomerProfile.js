import React, { useEffect, useState } from 'react';
import PhoneNudgeBanner from '../components/PhoneNudgeBanner';
import ReputationBadge from '../components/ReputationBadge';
import api from '../../api/api';
import { useTranslation } from 'react-i18next';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const BackIcon = ({ color = DK }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
    <polyline points="15,18 9,12 15,6" />
  </svg>
);

const CustomerProfile = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser }) => {
  const { t } = useTranslation();
  const [profile, setProfile]   = useState(null);
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');
  const [form, setForm]         = useState({ name: '', phone: '', email: '', city: '', bio: '' });
  const [saving, setSaving]     = useState(false);
  const [avatarUrl, setAvatarUrl]   = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Pre-fill immediately from cached currentUser before API loads
  React.useEffect(() => {
    if (!currentUser || profile) return;
    setForm(prev => ({
      ...prev,
      name:  prev.name  || currentUser.name  || '',
      phone: prev.phone || currentUser.phone || '',
      email: prev.email || currentUser.email || '',
    }));
    setAvatarUrl(prev => prev || currentUser.avatarUrl || '');
  }, [currentUser, profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { onNavigate('PublicLogin'); return; }
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profileRes, ordersRes] = await Promise.all([
        api.get('/auth/profile'),
        api.get('/orders/my-orders'),
      ]);
      setProfile(profileRes.data);
      setOrders(ordersRes.data);
      setForm({
        email: profileRes.data.email || '', name: profileRes.data.name || '', phone: profileRes.data.phone || '',
        city: profileRes.data.city || '', bio: profileRes.data.bio || '',
      });
      setAvatarUrl(profileRes.data.avatarUrl || '');
    } catch { setError(t('profile.load_failed')); }
    finally { setLoading(false); }
  };

  const handleUpdateProfile = async () => {
    setSaving(true);
    // Validate
    if (!form.name.trim()) { setSaving(false); setError('Jina linahitajika.'); return; }
    if (form.phone && !/^(0|\+255|255)[0-9]{8,9}$/.test(form.phone.replace(/\s/g,''))) {
      setError('Namba ya simu si sahihi. Mfano: 0712345678'); return;
    }
    if (form.email && !/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) {
      setError('Barua pepe si sahihi.'); return;
    }
    setError('');
    try {
      await api.patch(`/users/${profile.id}`, {
        name:  form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim().toLowerCase() || undefined,
        city:  form.city.trim() || undefined,
        bio:   form.bio.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
      });
      setSaving(false);
      setMessage('✅ Wasifu umebadilishwa!');
      setEditing(false);
      fetchData();
    } catch (err) {
      setSaving(false);
      const msg = err?.response?.data?.message;
      if (msg) {
        // Handle specific errors
        if (msg.includes('phone') || msg.includes('simu')) {
          setError('Namba hii ya simu tayari inatumika na akaunti nyingine.');
        } else if (msg.includes('email')) {
          setError('Barua pepe hii tayari inatumika na akaunti nyingine.');
        } else {
          setError(msg);
        }
      } else {
        setError('Imeshindwa kubadilisha. Jaribu tena.');
      }
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setAvatarUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data.urls?.[0];
      if (url) {
        setAvatarUrl(url);
        await api.patch(`/users/${profile.id}`, { avatarUrl: url });
        setMessage('✅ Picha imesasishwa!');
        fetchData();
      }
    } catch {
      setError('Imeshindwa kupakia picha. Jaribu tena.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setError(t('profile.passwords_no_match')); return; }
    if (passwordForm.newPassword.length < 6) { setError(t('profile.password_too_short')); return; }
    try {
      await api.patch(`/users/${profile.id}`, { password: passwordForm.newPassword });
      setMessage(t('profile.password_changed'));
      setChangingPassword(false);
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    } catch { setError(t('profile.password_failed')); }
  };

  const statusColor = (status) => ({
    pending:    { backgroundColor: '#FEF9C3', color: '#CA8A04' },
    confirmed:  { backgroundColor: '#DBEAFE', color: B },
    processing: { backgroundColor: '#EDE9FE', color: '#7C3AED' },
    shipped:    { backgroundColor: '#FFEDD5', color: '#EA580C' },
    delivered:  { backgroundColor: '#DCFCE7', color: '#16A34A' },
    cancelled:  { backgroundColor: '#FEE2E2', color: '#DC2626' },
  }[status] || { backgroundColor: '#F1F5F9', color: GR });

  const getRoleInfo = (role) => ({
    admin:  { icon: '🛡️', bg: '#FEE2E2', color: '#DC2626', label: t('profile.role_admin') },
    seller: { icon: '🏪', bg: '#EFF6FF', color: B,          label: t('profile.role_seller') },
    agent:  { icon: '🏍️', bg: '#FDF2F8', color: '#A21CAF',  label: t('profile.role_agent') },
    user:   { icon: '👤', bg: '#F1F5F9', color: GR,          label: t('profile.role_user') },
  }[role] || { icon: '👤', bg: '#F1F5F9', color: GR, label: t('profile.role_user') });

  const Card = ({ children, style = {} }) => (
    <div style={{ backgroundColor: WH, borderRadius: 16, padding: 18,
      boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 12, ...style }}>
      {children}
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC',
      fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <div style={{ backgroundColor: WH, borderBottom: '1px solid #F1F5F9', padding: '14px 16px',
        position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => onNavigate('MyProfile')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <BackIcon />
        </button>
        <span style={{ fontSize: 15, fontWeight: 800, color: DK }}>{t('profile.title')}</span>
      </div>
      <div style={{ textAlign: 'center', padding: 80, color: GR }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>{t('profile.loading')}
      </div>
    </div>
  );

  const roleInfo = getRoleInfo(profile?.role);
  const score = profile?.reputationScore || 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', paddingBottom: 90,
      fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ── Sticky top bar ── */}
      <div style={{ backgroundColor: WH, borderBottom: '1px solid #F1F5F9', padding: '14px 16px',
        position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <button onClick={() => onNavigate('MyProfile')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <BackIcon />
        </button>
        <span style={{ fontSize: 15, fontWeight: 800, color: DK, fontFamily: 'Manrope,sans-serif' }}>
          {t('profile.title')}
        </span>
      </div>

      {/* ── Gradient identity header ── */}
      <div style={{ background: `linear-gradient(135deg,#1E1B4B,${B})`, padding: '28px 16px', textAlign: 'center' }}>
        <label style={{ position: 'relative', display: 'inline-block', width: 80, height: 80, margin: '0 auto 12px', cursor: 'pointer' }}>
          <div style={{ width: 80, height: 80, borderRadius: 22, overflow: 'hidden',
            background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 900, color: WH,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '3px solid rgba(255,255,255,0.35)' }}>
            {avatarUploading ? (
              <span style={{ fontSize: 13 }}>⏳</span>
            ) : avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (profile?.name || profile?.email || 'U').charAt(0).toUpperCase()
            )}
          </div>
          <div style={{ position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: '50%',
            backgroundColor: WH, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>📷</div>
          <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} disabled={avatarUploading} />
        </label>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: WH, margin: '0 0 4px', fontFamily: 'Manrope,sans-serif' }}>
          {profile?.name || profile?.email?.split('@')[0] || profile?.phone}
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px' }}>
          {profile?.email || profile?.phone}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.18)', color: WH, border: '1px solid rgba(255,255,255,0.3)' }}>
            {roleInfo.icon} {roleInfo.label}
          </span>
          {score > 0 && <ReputationBadge score={score} size="sm" />}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {message && (
          <div style={{ backgroundColor: '#DCFCE7', color: '#16A34A', padding: '12px 14px', borderRadius: 12,
            marginBottom: 12, fontSize: 13, fontWeight: 700 }}>✅ {message}</div>
        )}
        {error && (
          <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '12px 14px', borderRadius: 12,
            marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Phone nudge */}
        {profile && !profile.phone && <PhoneNudgeBanner userId={currentUser?.id} onSaved={fetchData} />}

        {/* Stats — Instagram-style stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: t('profile.orders'),    value: orders.length,                                       icon: '🛒', bg: '#EDE9FE', color: '#7C3AED' },
            { label: t('profile.delivered'), value: orders.filter(o => o.status === 'delivered').length,  icon: '📦', bg: '#DCFCE7', color: '#16A34A' },
            { label: t('profile.pending'),   value: orders.filter(o => o.status === 'pending').length,    icon: '⏳', bg: '#FEF9C3', color: '#CA8A04' },
            { label: t('profile.since'),     value: new Date(profile?.createdAt).getFullYear(),           icon: '📅', bg: '#DBEAFE', color: B },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 14, padding: '12px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 18 }}>{s.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9.5, color: GR, fontWeight: 700 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Seller store card */}
        {(userRole === 'seller') && profile?.storeName && (
          <Card style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE', boxShadow: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                {profile.logo ? (
                  <img src={profile.logo} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 12,
                    background: `linear-gradient(135deg,#1E1B4B,${B})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, color: WH, flexShrink: 0 }}>🏪</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: DK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.storeName}</div>
                  {profile.storeTagline && (
                    <div style={{ fontSize: 11, color: GR, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.storeTagline}</div>
                  )}
                  {profile.rating > 0 && (
                    <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 2 }}>
                      {'⭐'.repeat(Math.round(profile.rating))} {profile.rating}/5 · {profile.completedOrders} mauzo
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => onNavigate('SellerDashboard')}
                style={{ backgroundColor: B, color: WH, border: 'none',
                  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                Dashibodi →
              </button>
            </div>
          </Card>
        )}

        {/* Profile */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: 0 }}>👤 {t('profile.profile')}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {(userRole === 'seller' || userRole === 'admin') && (
                <button onClick={() => onNavigate('StoreSettings')}
                  style={{ backgroundColor: '#F5F3FF', color: '#7C3AED',
                    border: 'none', padding: '6px 14px', borderRadius: 8,
                    cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  🏪 Mipangilio ya Duka
                </button>
              )}
              {!editing && (
                <button onClick={() => setEditing(true)} style={{ backgroundColor: B, color: WH, border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  ✏️ {t('profile.edit')}
                </button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 10, padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: GR, marginBottom: 2 }}>{t('profile.full_name')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: DK }}>{profile?.name || '—'}</div>
          </div>
          <div style={{ marginBottom: 10, padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: GR, marginBottom: 2 }}>{t('profile.phone')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: DK }}>{profile?.phone || '—'}</div>
          </div>
          <div style={{ marginBottom: 10, padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: GR, marginBottom: 2 }}>Email</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: DK }}>{profile?.email || '—'}</div>
          </div>
          <div style={{ marginBottom: 10, padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: GR, marginBottom: 2 }}>📍 Mahali</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: DK }}>{profile?.city || '—'}</div>
          </div>
          <div style={{ marginBottom: editing ? 10 : 0, padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: GR, marginBottom: 2 }}>📝 Kuhusu mimi</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: DK }}>{profile?.bio || '—'}</div>
          </div>

          {editing && (
            <>
              <div style={{ marginTop: 10, marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>{t('profile.full_name')}</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder={t('profile.name_placeholder')}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `2px solid ${B}`, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>{t('profile.phone')}</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder={t('profile.phone_placeholder')}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `2px solid ${B}`, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 700 }}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="barua@mfano.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `2px solid ${B}`, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Email inatumiwa kuingia kwenye akaunti</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>📍 Mahali (Jiji)</label>
                <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                  placeholder="mfano: Dar es Salaam"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `2px solid ${B}`, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>📝 Kuhusu mimi</label>
                <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })}
                  placeholder="Maelezo mafupi kukuhusu..." rows={3} maxLength={200}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `2px solid ${B}`, fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(false)} style={{ flex: 1, backgroundColor: '#F1F5F9', color: GR, border: 'none', padding: 10, borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('profile.cancel')}</button>
                <button onClick={handleUpdateProfile} style={{ flex: 1, backgroundColor: B, color: WH, border: 'none', padding: 10, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{saving ? '⏳ Inahifadhi...' : '💾 Hifadhi Mabadiliko'}</button>
              </div>
            </>
          )}
        </Card>

        {/* Security */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: 0 }}>🔒 {t('profile.security')}</h2>
            {!changingPassword && (
              <button onClick={() => setChangingPassword(true)} style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                🔐 {t('profile.change')}
              </button>
            )}
          </div>

          {!changingPassword ? (
            <>
              <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: GR, marginBottom: 2 }}>{t('profile.password')}</div>
                <div style={{ fontSize: 18, color: DK, letterSpacing: 4 }}>••••••••</div>
              </div>
              <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: GR, marginBottom: 4 }}>{t('profile.role')}</div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8, backgroundColor: roleInfo.bg, color: roleInfo.color }}>{roleInfo.icon} {roleInfo.label}</span>
              </div>
              <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: GR, marginBottom: 2 }}>{t('profile.member_since')}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: DK }}>
                  {new Date(profile?.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>{t('profile.new_password')}</label>
                <input type="password" placeholder={t('profile.min_chars')} value={passwordForm.newPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid #DC2626', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>{t('profile.confirm_password')}</label>
                <input type="password" placeholder={t('profile.repeat_password')} value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid #DC2626', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setChangingPassword(false)} style={{ flex: 1, backgroundColor: '#F1F5F9', color: GR, border: 'none', padding: 10, borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('profile.cancel')}</button>
                <button onClick={handleChangePassword} style={{ flex: 1, backgroundColor: '#DC2626', color: WH, border: 'none', padding: 10, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{t('profile.update')}</button>
              </div>
            </>
          )}
        </Card>

        {/* Recent Orders */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: 0 }}>🛒 {t('profile.recent_orders')}</h2>
            <button onClick={() => onNavigate('MyOrders')} style={{ backgroundColor: '#F0FDF4', color: '#16A34A', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              {t('profile.view_all')} →
            </button>
          </div>

          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
              <p style={{ marginBottom: 14, fontSize: 13 }}>{t('profile.no_orders')}</p>
              <button onClick={() => onNavigate('Stores')} style={{ backgroundColor: B, color: WH, border: 'none', padding: '9px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                🏪 {t('profile.start_shopping')}
              </button>
            </div>
          ) : (
            orders.slice(0, 5).map(order => (
              <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 8, border: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#E2E8F0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {order.product?.images?.[0]
                      ? <img src={order.product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 18 }}>📦</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.product?.name || 'Product'}</div>
                    <div style={{ fontSize: 11, color: GR }}>#{order.id} • {new Date(order.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: B, marginBottom: 3 }}>TZS {Number(order.totalAmount).toLocaleString()}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, ...statusColor(order.status) }}>{order.status}</span>
                </div>
              </div>
            ))
          )}
        </Card>

        {/* Quick Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { label: `🏪 ${t('profile.stores')}`,     page: 'Stores',            bg: '#EFF6FF', color: B },
            { label: `📋 ${t('profile.classifieds')}`, page: 'ClassifiedsPublic', bg: '#FDF2F8', color: '#A21CAF' },
            { label: `🛒 ${t('profile.my_orders')}`,    page: 'MyOrders',          bg: '#F0FDF4', color: '#16A34A' },
            { label: `🛒 ${t('profile.cart')}`,         page: 'Cart',              bg: '#FEF9C3', color: '#CA8A04' },
          ].map(action => (
            <button key={action.label} onClick={() => onNavigate(action.page)}
              style={{ backgroundColor: action.bg, color: action.color, border: 'none', padding: 14, borderRadius: 14,
                cursor: 'pointer', fontSize: 13, fontWeight: 700, textAlign: 'left' }}>
              {action.label}
            </button>
          ))}
        </div>

        {/* ── Reviews I've Given ────────────────────────────────────── */}
        {orders.filter(o => o.buyerRating).length > 0 && (
          <Card>
            <div style={{ fontSize: 15, fontWeight: 900, color: DK, marginBottom: 14 }}>
              ⭐ Tathmini Zangu
            </div>
            {orders.filter(o => o.buyerRating).map(o => (
              <div key={o.id} style={{ padding: '12px 0',
                borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10,
                  backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  🏪
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DK }}>
                    {o.product?.name || o.manualProductName || 'Bidhaa'}
                  </div>
                  <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>
                    {o.seller?.storeName || o.seller?.businessName || 'Duka'}
                  </div>
                  <div style={{ fontSize: 18, marginTop: 4 }}>
                    {'⭐'.repeat(o.buyerRating)}{'☆'.repeat(5 - o.buyerRating)}
                  </div>
                  {o.buyerReview && (
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 4,
                      fontStyle: 'italic' }}>
                      "{o.buyerReview}"
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                    {o.reviewedAt ? new Date(o.reviewedAt).toLocaleDateString('sw-TZ') : ''}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* ── Pending reviews ────────────────────────────────────────── */}
        {orders.filter(o => o.status === 'delivered' && !o.buyerRating).length > 0 && (
          <div style={{ marginBottom: 14, backgroundColor: '#FEF9C3', borderRadius: 16,
            padding: 16, border: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400E', marginBottom: 12 }}>
              ⭐ Tathmini Zinazokungoja ({orders.filter(o => o.status === 'delivered' && !o.buyerRating).length})
            </div>
            {orders.filter(o => o.status === 'delivered' && !o.buyerRating).map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '8px 0',
                borderBottom: '1px solid #FDE68A' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: DK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.product?.name || o.manualProductName || 'Bidhaa'}
                  </div>
                  <div style={{ fontSize: 11, color: '#92400E' }}>
                    {o.seller?.storeName || 'Duka'}
                  </div>
                </div>
                <button
                  onClick={() => onNavigate(`ConfirmDelivery-${o.confirmationToken || o.trackingNumber}`)}
                  style={{ backgroundColor: '#F59E0B', color: WH, border: 'none',
                    padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 11, fontWeight: 800, flexShrink: 0, marginLeft: 8 }}>
                  ✅ Thibitisha & Tathmini
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerProfile;
