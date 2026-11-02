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
import { getMyBusinesses } from '../../api/business';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

// Owner 2026-11-02: a hotel must be easy to find, so "Hoteli / mgahawa" (category food, which
// turns on the menu, table QR and kitchen) comes first and says what it is. No emoji (owner rule).
const getCategories = (t) => [
  { key: 'food',        label: 'Hoteli / mgahawa / chakula' },
  { key: 'electronics', label: t('stores.cat_electronics') },
  { key: 'fashion',     label: t('stores.cat_fashion') },
  { key: 'hardware',    label: t('stores.cat_hardware') },
  { key: 'beauty',      label: t('stores.cat_beauty') },
  { key: 'furniture',   label: t('stores.cat_furniture') },
  { key: 'wholesale',   label: t('stores.cat_wholesale') },
  { key: 'services',    label: t('stores.cat_services') },
];

// What the person typed survives the trip to the login page (owner 2026-11-01: it was lost).
const DRAFT_KEY = 'kentexa_business_draft';
export const saveBusinessDraft = (form, location) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, location })); } catch { /* storage unavailable */ }
};
export const readBusinessDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && typeof d.form === 'object' ? d : null;
  } catch { return null; }
};
const clearBusinessDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } };

/** Where a new or chosen business opens: its own page with the capability tiles (same as "Biashara zangu"). */
export const businessHomeFor = (business) => (business?.id ? `BusinessHome-${business.id}` : 'MyBusinesses');

const BecomeBusiness = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole, presetCategory }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [myBusinesses, setMyBusinesses] = useState([]);
  const [addAnother, setAddAnother] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft] = useState(readBusinessDraft);
  const [form, setForm] = useState({
    legalName: '', tradingName: '', description: '', category: presetCategory || '',
    address: '', phone: '', email: '',
    ...(draft?.form || {}),
  });
  // Opened from "Fungua hoteli": the form is shown straight away, as a hotel.
  const isHotel = form.category === 'food' && presetCategory === 'food';
  const [location, setLocation] = useState(draft?.location || {});
  const goLogin = () => {
    saveBusinessDraft(form, location);
    try { localStorage.setItem('kentexa_after_login', 'BecomeBusiness'); } catch { /* storage unavailable */ }
    onNavigate('PublicLogin');
  };

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
    // Every business of this person (not only the first): pick one, or open another.
    getMyBusinesses()
      .then(list => setMyBusinesses(Array.isArray(list) ? list : []))
      .catch(() => setMyBusinesses([]))
      .finally(() => setCheckingStatus(false));
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Back from login, the draft is in the form: it is used once, not on every later visit.
  useEffect(() => { if (isLoggedIn && draft) clearBusinessDraft(); }, [isLoggedIn, draft]);
  // Coming back from login with a draft: the form is shown straight away.
  const showList = myBusinesses.length > 0 && !addAnother && !draft && !presetCategory;

  const handleSubmit = async () => {
    if (!form.legalName.trim()) { setError(t('become_business.legal_name_required')); return; }
    if (!form.phone.trim()) { setError(t('become_business.phone_required')); return; }
    if (!isLoggedIn) { goLogin(); return; }
    try {
      setLoading(true); setError('');
      const res = await api.post('/business/create', {
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
      clearBusinessDraft();
      // The same page "Biashara zangu" opens: the business with its capability tiles.
      onNavigate(businessHomeFor(res?.data));
    } catch (err) {
      setError(err?.response?.data?.message || t('become_business.submit_failed'));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('RoleActivation')} title={t('become_business.page_title')} top={0} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#7c3aed)', padding: '28px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight:800, color: '#fff', margin: '0 0 6px', fontFamily:'inherit' }}>
          {isHotel ? 'Fungua hoteli yako' : t('become_business.hero_title')}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
          {isHotel ? 'Weka menyu, QR za meza na upokee oda jikoni papo hapo.' : t('become_business.hero_desc')}
        </p>
      </div>

      <div style={{ padding: '16px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* The person's businesses: open one (its capability page) or open another */}
        {!checkingStatus && showList && (
          <div data-testid="my-business-list" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>
              {t('become_business.already_have_title')}
            </h2>
            {myBusinesses.map(b => (
              <button key={b.id} type="button" onClick={() => onNavigate(businessHomeFor(b))}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', background: 'none', border: 'none', borderBottom: '1px solid #eff3f4', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#0f1419' }}>{b.tradingName || b.legalName}</span>
                <span style={{ fontSize: 14, color: '#2563eb', fontWeight: 700 }}>{t('become_business.open_business')}</span>
              </button>
            ))}
            <button type="button" data-testid="open-another-business" onClick={() => setAddAnother(true)}
              style={{ marginTop: 16, width: '100%', height: 48, borderRadius: 24, border: '1px solid #cfd9de', background: '#fff', color: '#0f1419', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('become_business.open_another_business')}
            </button>
          </div>
        )}

        {/* Benefits */}
        {!checkingStatus && myBusinesses.length === 0 && (
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

        {/* Form */}
        {checkingStatus || showList ? null : (

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
                    <button key={c.key} type="button" data-testid={`category-${c.key}`} aria-pressed={form.category === c.key}
                      onClick={() => setForm({ ...form, category: c.key })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 12px', borderRadius: 100,
                        border: form.category === c.key ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                        backgroundColor: form.category === c.key ? '#f5f3ff' : '#fff',
                        color: form.category === c.key ? '#7c3aed' : '#475569',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>
                      {c.label}
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
                  <span onClick={goLogin}
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
        )}
      </div>
    </div>
  );
};

export default BecomeBusiness;
