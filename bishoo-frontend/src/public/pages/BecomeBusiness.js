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
import { ApplyPage, ErrorText, Field, InfoRows, K, Note, Section, chipStyle, inputStyle, noEmoji, pillStyle } from '../components/ApplyKit';
import LocationPicker from '../components/LocationPicker';
import api from '../../api/api';
import { getMyBusinesses } from '../../api/business';


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
  const [moreDetails, setMoreDetails] = useState(() => !!(draft?.form?.tradingName || draft?.form?.description || draft?.form?.address));
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
    <ApplyPage onBack={() => onNavigate('RoleActivation')} backTitle={t('become_business.page_title')}
      title={isHotel ? 'Fungua hoteli yako' : noEmoji(t('become_business.hero_title'))}
      desc={isHotel ? 'Weka menyu, QR za meza na upokee oda jikoni papo hapo.' : noEmoji(t('become_business.hero_desc'))}>

      {/* The person's businesses: open one (its capability page) or open another */}
      {!checkingStatus && showList && (
        <Section title={noEmoji(t('become_business.already_have_title'))} testId="my-business-list">
          <div>
            {myBusinesses.map(b => (
              <button key={b.id} type="button" onClick={() => onNavigate(businessHomeFor(b))}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', background: 'none', border: 'none', borderBottom: `1px solid ${K.LINE}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: K.INK }}>{b.tradingName || b.legalName}</span>
                <span style={{ fontSize: 14, color: K.BLUE, fontWeight: 700 }}>{noEmoji(t('become_business.open_business'))}</span>
              </button>
            ))}
          </div>
          <button type="button" data-testid="open-another-business" onClick={() => setAddAnother(true)} style={pillStyle(false)}>
            {noEmoji(t('become_business.open_another_business'))}
          </button>
        </Section>
      )}

      {/* Form */}
      {checkingStatus || showList ? null : (
        <Section title={noEmoji(t('become_business.form_title'))}>
          <Field label={noEmoji(t('become_business.legal_name_label'))}>
            <input type="text" placeholder={t('become_business.legal_name_placeholder')}
              value={form.legalName} onChange={e => setForm({ ...form, legalName: e.target.value })} style={inputStyle} />
          </Field>
          <Field label={noEmoji(t('become_business.category_label'))}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(c => (
                <button key={c.key} type="button" data-testid={`category-${c.key}`} aria-pressed={form.category === c.key}
                  onClick={() => setForm({ ...form, category: c.key })} style={chipStyle(form.category === c.key)}>
                  {noEmoji(c.label)}
                </button>
              ))}
            </div>
          </Field>
          <LocationPicker label={noEmoji(t('become_business.location_label'))} value={location} onChange={setLocation} />
          <Field label={noEmoji(t('become_business.phone_label'))}>
            <input type="tel" placeholder="255712345678" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          </Field>
          {/* Shorter form (owner 2026-11-09): only the must-haves first; the rest when the person wants. */}
          {!moreDetails ? (
            <button type="button" data-testid="business-more" onClick={() => setMoreDetails(true)}
              style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, color: K.BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 }}>
              Ongeza maelezo zaidi (si lazima)
            </button>
          ) : (
            <>
              <Field label={noEmoji(t('become_business.trading_name_label'))}>
            <input type="text" placeholder={t('become_business.trading_name_placeholder')}
              value={form.tradingName} onChange={e => setForm({ ...form, tradingName: e.target.value })} style={inputStyle} />
          </Field>
          <Field label={noEmoji(t('become_business.description_label'))}>
            <textarea rows={3} placeholder={t('become_business.description_placeholder')}
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <Field label={noEmoji(t('become_business.address_label'))}>
            <input type="text" placeholder={t('become_business.address_placeholder')}
              value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={inputStyle} />
          </Field>
          <Field label={noEmoji(t('become_business.email_label'))}>
            <input type="email" placeholder="business@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} />
          </Field>
            </>
          )}
          {!isLoggedIn && (
            <Note tone="amber">
              {noEmoji(t('become_business.login_required_pre'))}{' '}
              <button type="button" onClick={goLogin} style={{ border: 'none', background: 'none', padding: 0, color: K.BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                {noEmoji(t('become_business.login_required_link'))}
              </button>
              {' '}{noEmoji(t('become_business.login_required_post'))}
            </Note>
          )}
          <ErrorText>{error ? noEmoji(error) : ''}</ErrorText>
          <button type="button" onClick={handleSubmit} disabled={loading} style={pillStyle(true, loading)}>
            {loading ? noEmoji(t('become_business.submitting')) : noEmoji(t('become_business.submit_button'))}
          </button>
        </Section>
      )}

      {/* Benefits */}
      {!checkingStatus && myBusinesses.length === 0 && (
        <Section title={noEmoji(t('become_business.benefits_title'))}>
          <InfoRows items={[1, 2, 3, 4].map((n) => ({ title: noEmoji(t(`become_business.benefit${n}_title`)), desc: noEmoji(t(`become_business.benefit${n}_desc`)) }))} />
        </Section>
      )}
    </ApplyPage>
  );
};

export default BecomeBusiness;
