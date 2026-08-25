/**
 * BusinessDashboard.js — multi-role architecture Phase 2
 *
 * The real "Business only" dashboard (spec section 19): Profile, Brand,
 * Followers, Analytics, Messages. Deliberately does NOT show Products,
 * Inventory, Orders, Payments, or Ship Item — those are Seller
 * capabilities, and a Business has none of them until it explicitly
 * activates Seller (the card at the bottom). This is the fix for
 * "Ship Product must never appear merely because someone is a Business."
 *
 * Leads and Team are shown as locked tiles, not hidden and not faked --
 * Leads has no real backing data anywhere in the app yet, and Team
 * management is confirmed hard-gated behind an active SellerProfile
 * today (BusinessController's canManageTeam check has no fallback).
 * Both route to Activate Seller when tapped.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const SCard = ({ children, style = {} }) => (
  <div style={{ backgroundColor: WH, borderRadius: 16, padding: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 12, ...style }}>
    {children}
  </div>
);

const Row = ({ icon, label, value, onAction, color = DK, sub, locked }) => (
  <div onClick={onAction}
    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
      borderBottom: '1px solid #F8FAFC', cursor: onAction ? 'pointer' : 'default' }}>
    <span style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'center' }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: DK }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: GR, marginTop: 1 }}>{sub}</div>}
    </div>
    {locked && <span style={{ fontSize: 14 }}>🔒</span>}
    {value !== undefined && !locked && (
      <div style={{ fontSize: 13, fontWeight: 700, color, textAlign: 'right' }}>{value}</div>
    )}
    {onAction && <span style={{ fontSize: 16, color: '#CBD5E1' }}>›</span>}
  </div>
);

const BusinessDashboard = ({ onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [business, setBusiness] = useState(null);
  const [dash, setDash] = useState(null);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    try {
      setLoading(true);
      const mine = await api.get('/business/mine');
      if (!mine.data) { setError(t('business_dashboard.no_business')); return; }
      setBusiness(mine.data);
      const [dashRes, todayRes] = await Promise.all([
        api.get(`/business/${mine.data.id}/dashboard`).catch(() => null),
        api.get(`/business/${mine.data.id}/today`).catch(() => null),
      ]);
      if (dashRes) setDash(dashRes.data);
      if (todayRes) setToday(todayRes.data);
    } catch {
      setError(t('business_dashboard.load_failed'));
    } finally { setLoading(false); }
  };

  const openEdit = () => {
    setEditForm({
      legalName: business.legalName || '',
      tradingName: business.tradingName || '',
      description: business.description || '',
      category: business.category || '',
      logo: business.logo || '',
    });
    setShowEdit(true);
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    try {
      setUploadingLogo(true);
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEditForm(prev => ({ ...prev, logo: res.data.urls[0] }));
    } catch { /* non-fatal, user can retry */ }
    finally { setUploadingLogo(false); }
  };

  const handleSaveEdit = async () => {
    try {
      setSaving(true);
      await api.patch(`/business/${business.id}`, editForm);
      setShowEdit(false);
      fetchAll();
    } catch {
      setError(t('business_dashboard.save_failed'));
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GR }}>
      ⏳ {t('common.loading')}
    </div>
  );

  if (error || !business) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('business_dashboard.title')} top={0} />
      <div style={{ padding: '48px 24px', textAlign: 'center', color: GR }}>{error}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('business_dashboard.title')} top={0} />

      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <SCard>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: '#EFF6FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {business.logo
                ? <img src={business.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 26 }}>🏢</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: DK }}>
                {business.tradingName || business.legalName}
              </div>
              <div style={{ fontSize: 12, color: GR, marginTop: 2 }}>
                {business.category || t('business_dashboard.no_category')}
              </div>
            </div>
          </div>
        </SCard>

        {/* Today's Kentexa Intelligence — Layer 2 (deterministic counts) of
            the Internal AI Intelligence architecture. Real numbers only:
            no AI-generated insight/recommendation text (that's a later
            phase) and no Moments section (that feature doesn't exist yet,
            so it's omitted rather than faked). */}
        {today && (
          <SCard>
            <div style={{ fontSize: 13, fontWeight: 800, color: DK, marginBottom: 12 }}>
              📊 {t('business_dashboard.today_title')}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: GR, marginBottom: 8, letterSpacing: 0.4 }}>
              {t('business_dashboard.today_commerce_label')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
              {[
                [t('business_dashboard.today_orders'), today.commerce?.ordersToday ?? 0],
                [t('business_dashboard.today_payments'), today.commerce?.paymentsCompletedToday ?? 0],
                [t('business_dashboard.today_pending_invoices'), today.commerce?.pendingInvoicesCount ?? 0],
              ].map(([label, value]) => (
                <div key={label} style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: B }}>{value}</div>
                  <div style={{ fontSize: 10, color: GR, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: GR, marginBottom: 8, letterSpacing: 0.4 }}>
              {t('business_dashboard.today_customer_activity_label')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {[
                [t('business_dashboard.today_profile_visits'), today.customerActivity?.profileVisitsToday ?? 0],
                [t('business_dashboard.today_product_views'), today.customerActivity?.productViewsToday ?? 0],
                [t('business_dashboard.today_new_followers'), today.customerActivity?.newFollowersToday ?? 0],
                [t('business_dashboard.today_reviews'), today.customerActivity?.reviewsToday ?? 0],
              ].map(([label, value]) => (
                <div key={label} style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: DK }}>{value}</div>
                  <div style={{ fontSize: 10, color: GR, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </SCard>
        )}

        {/* Business menu — Profile/Brand/Followers/Analytics/Messages only.
            Deliberately no Products/Inventory/Orders/Ship Item here. */}
        <SCard>
          <Row icon="🏢" label={t('business_dashboard.profile_label')}
            sub={t('business_dashboard.profile_sub')} onAction={openEdit} />
          <Row icon="👥" label={t('business_dashboard.followers_label')}
            value={dash?.followersCount ?? 0} />
          <Row icon="📊" label={t('business_dashboard.analytics_label')}
            value={dash?.rating ? `⭐ ${Number(dash.rating).toFixed(1)}` : '—'}
            sub={t('business_dashboard.analytics_sub', { count: dash?.reviewsCount || 0 })} />
          <Row icon="💬" label={t('business_dashboard.messages_label')}
            onAction={() => onNavigate('SellerInbox')} />
          <Row icon="📥" label={t('business_dashboard.leads_label')}
            sub={t('business_dashboard.leads_sub')} locked
            onAction={() => onNavigate(`BecomeSeller`)} />
          <Row icon="👔" label={t('business_dashboard.team_label')}
            sub={t('business_dashboard.team_sub')} locked
            onAction={() => onNavigate(`BecomeSeller`)} />
        </SCard>

        {/* Activate Seller — the sanctioned way a Business gains selling
            capability, never an accident of navigation */}
        {!dash?.hasSeller && (
          <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderRadius: 16,
            padding: 20, color: '#fff', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
              🛍️ {t('business_dashboard.activate_seller_title')}
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 14, lineHeight: 1.5 }}>
              {t('business_dashboard.activate_seller_desc')}
            </div>
            <button onClick={() => onNavigate('BecomeSeller')}
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: '2px solid rgba(255,255,255,0.4)',
                padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {t('business_dashboard.activate_seller_button')}
            </button>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {showEdit && editForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: '16px 16px 0 0',
            padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 17, fontWeight: 900, color: DK, margin: 0 }}>
                {t('business_dashboard.edit_title')}
              </h2>
              <button onClick={() => setShowEdit(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: '#F1F5F9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {editForm.logo
                  ? <img src={editForm.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 22 }}>🏢</span>}
              </div>
              <input type="file" accept="image/*" style={{ display: 'none' }} id="bizLogoInput"
                onChange={e => handleLogoUpload(e.target.files?.[0])} />
              <label htmlFor="bizLogoInput"
                style={{ background: '#EFF6FF', color: B, padding: '8px 14px', borderRadius: 8,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                {uploadingLogo ? t('business_dashboard.uploading') : t('business_dashboard.change_logo')}
              </label>
            </div>

            {[
              { key: 'legalName', label: t('business_dashboard.field_legal_name') },
              { key: 'tradingName', label: t('business_dashboard.field_trading_name') },
              { key: 'category', label: t('business_dashboard.field_category') },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: GR, marginBottom: 5, fontWeight: 600 }}>{f.label}</label>
                <input value={editForm[f.key]} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0',
                    fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, color: GR, marginBottom: 5, fontWeight: 600 }}>
                {t('business_dashboard.field_description')}
              </label>
              <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                rows={4} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0',
                  fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            <button onClick={handleSaveEdit} disabled={saving}
              style={{ width: '100%', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
                color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 800 }}>
              {saving ? t('business_dashboard.saving') : t('business_dashboard.save_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessDashboard;
