/**
 * BecomeBusiness.js — multi-role architecture Phase 3
 *
 * Entry point for spec section 7: "a manufacturer that only wants a
 * digital presence, no selling." POST /business/create already exists
 * and is live (Phase 1) — this page is the only thing that was missing.
 * Deliberately does not collect TIN/BRELA/license: a Business profile
 * shouldn't require registration paperwork just to exist (that stays
 * optional, added later via BusinessDashboard's edit modal).
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import LocationPicker from '../components/LocationPicker';
import api from '../../api/api';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const getCategories = (t) => [
  { key: 'electronics', label: t('stores.cat_electronics'), icon: '📱' },
  { key: 'fashion',     label: t('stores.cat_fashion'),     icon: '👗' },
  { key: 'food',        label: t('stores.cat_food'),        icon: '🍽️' },
  { key: 'hardware',    label: t('stores.cat_hardware'),    icon: '🔧' },
  { key: 'beauty',      label: t('stores.cat_beauty'),      icon: '💄' },
  { key: 'furniture',   label: t('stores.cat_furniture'),   icon: '🛋️' },
  { key: 'wholesale',   label: t('stores.cat_wholesale'),   icon: '📦' },
  { key: 'services',    label: t('stores.cat_services'),    icon: '⚙️' },
];

const BecomeBusiness = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [existingBusiness, setExistingBusiness] = useState(null);
  const [step, setStep] = useState('form'); // 'form' | 'done'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    legalName: '', tradingName: '', description: '', category: '',
    address: '', phone: '', email: '',
  });
  const [location, setLocation] = useState({});

  useEffect(() => {
    if (!currentUser) return;
    setForm(prev => ({
      ...prev,
      phone: prev.phone || currentUser.phone || '',
      email: prev.email || currentUser.email || '',
    }));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoggedIn) { setCheckingStatus(false); return; }
    api.get('/business/mine')
      .then(res => setExistingBusiness(res.data))
      .catch(() => setExistingBusiness(null))
      .finally(() => setCheckingStatus(false));
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.legalName.trim()) { setError(t('become_business.legal_name_required')); return; }
    if (!form.phone.trim()) { setError(t('become_business.phone_required')); return; }
    if (!isLoggedIn) {
      localStorage.setItem('kentexa_after_login', 'BecomeBusiness');
      onNavigate('PublicLogin');
      return;
    }
    try {
      setLoading(true); setError('');
      await api.post('/business/create', {
        legalName: form.legalName,
        tradingName: form.tradingName || undefined,
        description: form.description || undefined,
        category: form.category || undefined,
        address: form.address || undefined,
        phone: form.phone,
        email: form.email || undefined,
        regionId: location.regionId || undefined,
        region: location.regionName || undefined,
        districtId: location.districtId || undefined,
        district: location.districtName || undefined,
        wardId: location.wardId || undefined,
        ward: location.wardName || undefined,
      });
      setStep('done');
    } catch (err) {
      setError(err?.response?.data?.message || t('become_business.submit_failed'));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('RoleActivation')} title={t('become_business.page_title')} top={0} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#7c3aed)', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🏢</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>
          {t('become_business.hero_title')}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
          {t('become_business.hero_desc')}
        </p>
      </div>

      <div style={{ padding: '16px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Existing Business */}
        {!checkingStatus && existingBusiness && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>
              {t('become_business.already_have_title')}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              {existingBusiness.tradingName || existingBusiness.legalName}
            </p>
            <button onClick={() => onNavigate('BusinessDashboard')}
              style={{ background: 'linear-gradient(135deg,#7c3aed,#a21caf)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
              {t('become_business.go_to_dashboard_button')}
            </button>
          </div>
        )}

        {/* Benefits */}
        {!checkingStatus && !existingBusiness && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>{t('become_business.benefits_title')}</h3>
            {[
              { icon: '🏢', title: t('become_business.benefit1_title'), desc: t('become_business.benefit1_desc') },
              { icon: '👥', title: t('become_business.benefit2_title'), desc: t('become_business.benefit2_desc') },
              { icon: '📥', title: t('become_business.benefit3_title'), desc: t('become_business.benefit3_desc') },
              { icon: '🛍️', title: t('become_business.benefit4_title'), desc: t('become_business.benefit4_desc') },
            ].map(b => (
              <div key={b.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, flexShrink: 0, background: 'linear-gradient(135deg,#7c3aed,#a21caf)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {b.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{b.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Form / done */}
        {checkingStatus ? null : step === 'done' ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 8px' }}>{t('become_business.done_title')}</h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>{t('become_business.done_desc')}</p>
            <button onClick={() => onNavigate('BusinessDashboard')}
              style={{ background: 'linear-gradient(135deg,#7c3aed,#a21caf)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
              {t('become_business.go_to_dashboard_button')}
            </button>
          </div>
        ) : !existingBusiness ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>{t('become_business.form_title')}</h3>

            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                ❌ {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>
                  {t('become_business.legal_name_label')}
                </label>
                <input type="text" placeholder={t('become_business.legal_name_placeholder')}
                  value={form.legalName} onChange={e => setForm({ ...form, legalName: e.target.value })}
                  style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>
                  {t('become_business.trading_name_label')}
                </label>
                <input type="text" placeholder={t('become_business.trading_name_placeholder')}
                  value={form.tradingName} onChange={e => setForm({ ...form, tradingName: e.target.value })}
                  style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>
                  {t('become_business.category_label')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIES.map(c => (
                    <button key={c.key} type="button"
                      onClick={() => setForm({ ...form, category: c.key })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 12px', borderRadius: 100,
                        border: form.category === c.key ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                        backgroundColor: form.category === c.key ? '#f5f3ff' : '#fff',
                        color: form.category === c.key ? '#7c3aed' : '#475569',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>
                      <span>{c.icon}</span>{c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>
                  {t('become_business.description_label')}
                </label>
                <textarea rows={3} placeholder={t('become_business.description_placeholder')}
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <LocationPicker
                label={t('become_business.location_label')}
                value={location}
                onChange={setLocation}
              />

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>
                  {t('become_business.address_label')}
                </label>
                <input type="text" placeholder={t('become_business.address_placeholder')}
                  value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>
                  {t('become_business.phone_label')}
                </label>
                <input type="tel" placeholder="255712345678"
                  value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>
                  {t('become_business.email_label')}
                </label>
                <input type="email" placeholder="business@example.com"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  style={inputStyle} />
              </div>

              {!isLoggedIn && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                  💡 {t('become_business.login_required_pre')}{' '}
                  <span onClick={() => { localStorage.setItem('kentexa_after_login', 'BecomeBusiness'); onNavigate('PublicLogin'); }}
                    style={{ color: '#d97706', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}>
                    {t('become_business.login_required_link')}
                  </span>
                  {' '}{t('become_business.login_required_post')}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                style={{ width: '100%', background: loading ? '#64748b' : 'linear-gradient(135deg,#7c3aed,#a21caf)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 12px rgba(124,58,237,0.3)' }}>
                {loading ? t('become_business.submitting') : t('become_business.submit_button')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BecomeBusiness;
