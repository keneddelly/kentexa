import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BackBar from '../components/BackBar';
import PhoneNudgeBanner from '../components/PhoneNudgeBanner';
import api from '../../api/api';
import { useTranslation } from 'react-i18next';

const CustomerProfile = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser }) => {
  const { t } = useTranslation();
  const [profile, setProfile]   = useState(null);
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');
  const [form, setForm]         = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving]     = useState(false);

  // Pre-fill immediately from cached currentUser before API loads
  React.useEffect(() => {
    if (!currentUser || profile) return;
    setForm(prev => ({
      ...prev,
      name:  prev.name  || currentUser.name  || '',
      phone: prev.phone || currentUser.phone || '',
      email: prev.email || currentUser.email || '',
    }));
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
      setForm({ email: profileRes.data.email || '', name: profileRes.data.name || '', phone: profileRes.data.phone || '' });
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
    pending:    { backgroundColor: '#fef9c3', color: '#ca8a04' },
    confirmed:  { backgroundColor: '#dbeafe', color: '#2563eb' },
    processing: { backgroundColor: '#ede9fe', color: '#7c3aed' },
    shipped:    { backgroundColor: '#ffedd5', color: '#ea580c' },
    delivered:  { backgroundColor: '#dcfce7', color: '#16a34a' },
    cancelled:  { backgroundColor: '#fee2e2', color: '#dc2626' },
  }[status] || { backgroundColor: '#f1f5f9', color: '#64748b' });

  const getRoleInfo = (role) => ({
    admin:  { bg: '#fee2e2', color: '#dc2626', label: t('profile.role_admin') },
    seller: { bg: '#fef9c3', color: '#ca8a04', label: t('profile.role_seller') },
    agent:  { bg: '#dbeafe', color: '#2563eb', label: t('profile.role_agent') },
    user:   { bg: '#ede9fe', color: '#7c3aed', label: t('profile.role_user') },
  }[role] || { bg: '#ede9fe', color: '#7c3aed', label: t('profile.role_user') });

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Navbar currentPage="CustomerProfile" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>{t('profile.loading')}
      </div>
    </div>
  );

  const roleInfo = getRoleInfo(profile?.role);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="CustomerProfile" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('Home')} title={t('profile.title')} />

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'linear-gradient(135deg,#fcd34d,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', border: '4px solid rgba(255,255,255,0.3)' }}>
          👤
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 4px', fontFamily: 'Manrope,sans-serif' }}>
          {profile?.name || profile?.email?.split('@')[0] || profile?.phone}
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: '0 0 10px' }}>
          {profile?.email || profile?.phone}
        </p>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
          {roleInfo.label}
        </span>
      </div>

      <div style={{ padding: '14px 16px 32px', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {message && (
          <div style={{ background: 'linear-gradient(135deg,#43e97b,#38f9d7)', color: '#fff', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>✅ {message}</div>
        )}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Phone nudge */}
        {profile && !profile.phone && <PhoneNudgeBanner onSaved={fetchData} />}

        {/* Stats — 2x2 mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: t('profile.orders'),    value: orders.length,                                       icon: '🛒', bg: '#ede9fe', color: '#7c3aed' },
            { label: t('profile.delivered'), value: orders.filter(o => o.status === 'delivered').length,  icon: '📦', bg: '#dcfce7', color: '#16a34a' },
            { label: t('profile.pending'),   value: orders.filter(o => o.status === 'pending').length,    icon: '⏳', bg: '#fef9c3', color: '#ca8a04' },
            { label: t('profile.since'),     value: new Date(profile?.createdAt).getFullYear(),           icon: '📅', bg: '#dbeafe', color: '#2563eb' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>{s.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>


        {/* Seller store card */}
        {(userRole === 'seller') && profile?.storeName && (
          <div style={{ backgroundColor: '#f5f3ff', borderRadius: 14, padding: 16,
            marginBottom: 14, border: '1px solid #ddd6fe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {profile.logo ? (
                  <img src={profile.logo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 10,
                    background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, color: '#fff' }}>🏪</div>
                )}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>{profile.storeName}</div>
                  {profile.storeTagline && (
                    <div style={{ fontSize: 11, color: '#64748b' }}>{profile.storeTagline}</div>
                  )}
                  {profile.rating > 0 && (
                    <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>
                      {'⭐'.repeat(Math.round(profile.rating))} {profile.rating}/5 · {profile.completedOrders} mauzo
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => onNavigate('SellerDashboard')}
                style={{ backgroundColor: '#7c3aed', color: '#fff', border: 'none',
                  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 12, fontWeight: 800 }}>
                Dashibodi →
              </button>
            </div>
          </div>
        )}

        {/* Profile */}
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: 0 }}>👤 {t('profile.profile')}</h2>
            {/* Store settings for sellers */}
            {(userRole === 'seller' || userRole === 'admin') && (
              <button onClick={() => onNavigate('StoreSettings')}
                style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff',
                  border: 'none', padding: '6px 14px', borderRadius: 8,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, marginRight: 8 }}>
                🏪 Mipangilio ya Duka
              </button>
            )}
            {!editing && (
              <button onClick={() => setEditing(true)} style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                ✏️ {t('profile.edit')}
              </button>
            )}
          </div>

          <div style={{ marginBottom: 10, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{t('profile.email')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{profile?.email || '—'}</div>
          </div>
          <div style={{ marginBottom: editing ? 10 : 0, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{t('profile.phone')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{profile?.phone || '—'}</div>
          </div>
          <div style={{ marginBottom: 8, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Email</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{profile?.email || '—'}</div>
          </div>

          {editing && (
            <>
              <div style={{ marginTop: 10, marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{t('profile.full_name')}</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder={t('profile.name_placeholder')}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #2563eb', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{t('profile.phone')}</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder={t('profile.phone_placeholder')}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #2563eb', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 700 }}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="barua@mfano.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #2563eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Email inatumiwa kuingia kwenye akaunti</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(false)} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('profile.cancel')}</button>
                <button onClick={handleUpdateProfile} style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{saving ? '⏳ Inahifadhi...' : '💾 Hifadhi Mabadiliko'}</button>
              </div>
            </>
          )}
        </div>

        {/* Security */}
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: 0 }}>🔒 {t('profile.security')}</h2>
            {!changingPassword && (
              <button onClick={() => setChangingPassword(true)} style={{ background: 'linear-gradient(135deg,#f093fb,#f5576c)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                🔐 {t('profile.change')}
              </button>
            )}
          </div>

          {!changingPassword ? (
            <>
              <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{t('profile.password')}</div>
                <div style={{ fontSize: 18, color: '#1e293b', letterSpacing: 4 }}>••••••••</div>
              </div>
              <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{t('profile.role')}</div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8, backgroundColor: roleInfo.bg, color: roleInfo.color }}>{roleInfo.label}</span>
              </div>
              <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{t('profile.member_since')}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  {new Date(profile?.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{t('profile.new_password')}</label>
                <input type="password" placeholder={t('profile.min_chars')} value={passwordForm.newPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #f093fb', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{t('profile.confirm_password')}</label>
                <input type="password" placeholder={t('profile.repeat_password')} value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #f093fb', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setChangingPassword(false)} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('profile.cancel')}</button>
                <button onClick={handleChangePassword} style={{ flex: 1, background: 'linear-gradient(135deg,#f093fb,#f5576c)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{t('profile.update')}</button>
              </div>
            </>
          )}
        </div>

        {/* Recent Orders */}
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: 0 }}>🛒 {t('profile.recent_orders')}</h2>
            <button onClick={() => onNavigate('MyOrders')} style={{ background: 'linear-gradient(135deg,#43e97b,#38f9d7)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              {t('profile.view_all')} →
            </button>
          </div>

          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
              <p style={{ marginBottom: 14, fontSize: 13 }}>{t('profile.no_orders')}</p>
              <button onClick={() => onNavigate('Stores')} style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                🏪 {t('profile.start_shopping')}
              </button>
            </div>
          ) : (
            orders.slice(0, 5).map(order => (
              <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#f8fafc', borderRadius: 10, marginBottom: 8, border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {order.product?.images?.[0]
                      ? <img src={order.product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 18 }}>📦</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.product?.name || 'Product'}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>#{order.id} • {new Date(order.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', marginBottom: 3 }}>TZS {Number(order.totalAmount).toLocaleString()}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, ...statusColor(order.status) }}>{order.status}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: `🏪 ${t('profile.stores')}`,     page: 'Stores',            bg: 'linear-gradient(135deg,#1d4ed8,#2563eb)' },
            { label: `📋 ${t('profile.classifieds')}`, page: 'ClassifiedsPublic', bg: 'linear-gradient(135deg,#f093fb,#f5576c)' },
            { label: `🛒 ${t('profile.my_orders')}`,    page: 'MyOrders',          bg: 'linear-gradient(135deg,#43e97b,#38f9d7)' },
            { label: `🛒 ${t('profile.cart')}`,         page: 'Cart',              bg: 'linear-gradient(135deg,#f7971e,#ffd200)' },
          ].map(action => (
            <button key={action.label} onClick={() => onNavigate(action.page)}
              style={{ background: action.bg, color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Reviews I've Given ────────────────────────────────────── */}
      {orders.filter(o => o.buyerRating).length > 0 && (
        <div style={{ margin: '16px 0', backgroundColor: '#fff', borderRadius: 16,
          padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginBottom: 16 }}>
            ⭐ Tathmini Zangu
          </div>
          {orders.filter(o => o.buyerRating).map(o => (
            <div key={o.id} style={{ padding: '12px 0',
              borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10,
                backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                🏪
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                  {o.product?.name || o.manualProductName || 'Bidhaa'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
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
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {o.reviewedAt ? new Date(o.reviewedAt).toLocaleDateString('sw-TZ') : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pending reviews ────────────────────────────────────────── */}
      {orders.filter(o => o.status === 'delivered' && !o.buyerRating).length > 0 && (
        <div style={{ margin: '0 0 16px', backgroundColor: '#fef9c3', borderRadius: 16,
          padding: 16, border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 12 }}>
            ⭐ Tathmini Zinazokungoja ({orders.filter(o => o.status === 'delivered' && !o.buyerRating).length})
          </div>
          {orders.filter(o => o.status === 'delivered' && !o.buyerRating).map(o => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '8px 0',
              borderBottom: '1px solid #fde68a' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                  {o.product?.name || o.manualProductName || 'Bidhaa'}
                </div>
                <div style={{ fontSize: 11, color: '#92400e' }}>
                  {o.seller?.storeName || 'Duka'}
                </div>
              </div>
              <button
                onClick={() => onNavigate(`ConfirmDelivery-${o.confirmationToken || o.trackingNumber}`)}
                style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none',
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                ✅ Thibitisha & Tathmini
              </button>
            </div>
          ))}
        </div>
      )}

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default CustomerProfile;