import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import LocationPicker from '../components/LocationPicker';
import VerifyIdentityModal from '../components/VerifyIdentityModal';
import { identityState, needsIdentityStep, afterIdentitySent } from '../../utils/identityState';
import api from '../../api/api';
import useIdentityRefresh from '../../utils/useIdentityRefresh';

// Become a seller (audit B step 4, rule A). Short path:
//   individual: ONE screen  (type, store name pre-filled, category; phone and
//               place shown from the account)
//   business:   + ONE "business papers" screen (registration, TIN, licence, documents)
// The ID screen appears only when no ID was sent (or it was rejected); a
// waiting ID may apply and the store waits until the ID is verified.
// An existing request shows its status here instead of the form.
const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};
const card = { backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 };
const label = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 };
const primary = (on) => ({ width: '100%', marginTop: 16, background: on ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#a5b4fc',
  color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: on ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 800 });

// Same keys Stores.js's category filter chips already read/expect —
// picking one here is what actually makes a new seller show up under a
// category filter instead of only "all".
const getCategories = (t) => [
  { key: 'electronics', label: t('stores.cat_electronics') },
  { key: 'fashion',     label: t('stores.cat_fashion') },
  { key: 'food',        label: t('stores.cat_food') },
  { key: 'hardware',    label: t('stores.cat_hardware') },
  { key: 'beauty',      label: t('stores.cat_beauty') },
  { key: 'furniture',   label: t('stores.cat_furniture') },
  { key: 'wholesale',   label: t('stores.cat_wholesale') },
  { key: 'services',    label: t('stores.cat_services') },
];

const BecomeSeller = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const [checking, setChecking] = useState(true);
  const [existing, setExisting] = useState(null);           // this person's seller request, if any
  const [identityStatus, setIdentityStatus] = useState(null);
  useIdentityRefresh(setIdentityStatus, isLoggedIn);
  const [showVerifyIdentity, setShowVerifyIdentity] = useState(false);
  const [screen, setScreen] = useState('main');              // 'main' | 'papers' (business only)
  const [sellerType, setSellerType] = useState('individual');
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [changePlace, setChangePlace] = useState(false);
  const [location, setLocation] = useState({});
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [businessLicenseNumber, setBusinessLicenseNumber] = useState('');
  const [businessDocs, setBusinessDocs] = useState({ brela: null, tin: null, license: null });
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) { setIdentityStatus({ status: 'not_submitted', level: 0 }); setChecking(false); return; }
    api.get('/identity/me').then((r) => setIdentityStatus(r.data)).catch(() => setIdentityStatus({ status: 'not_submitted', level: 0 }));
    api.get('/seller/my-profile').then((r) => setExisting(r.data || null)).catch(() => setExisting(null)).finally(() => setChecking(false));
  }, [isLoggedIn]);

  // Pre-fill the store name the platform already knows.
  useEffect(() => {
    if (currentUser) setBusinessName((prev) => prev || currentUser.storeName || '');
  }, [currentUser]);

  const accountPhone = currentUser?.phone || '';
  const accountPlace = currentUser?.businessLocation || currentUser?.city || '';
  const needsId = isLoggedIn && needsIdentityStep(identityStatus);
  const idWaiting = identityState(identityStatus) === 'waiting';
  const isBusiness = sellerType === 'business';

  const handleBusinessDocUpload = async (docType, file) => {
    if (!file) return;
    try {
      setUploadingDoc(docType); setError('');
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBusinessDocs((prev) => ({ ...prev, [docType]: res.data.urls[0] }));
    } catch { setError(t('become_seller.document_upload_failed')); }
    finally { setUploadingDoc(null); }
  };

  const mainReady = !!businessCategory && (!isBusiness || businessName.trim().length >= 3);
  const goNext = () => {
    if (isBusiness && businessName.trim().length < 3) { setError(t('become_seller.business_name_required')); return; }
    setError(''); setScreen('papers'); window.scrollTo(0, 0);
  };

  const handleSubmit = async () => {
    if (!isLoggedIn) { localStorage.setItem('kentexa_after_login', 'BecomeSeller'); onNavigate('PublicLogin'); return; }
    if (isBusiness && (!businessDocs.brela || !businessDocs.tin)) { setError(t('become_seller.business_documents_required')); return; }
    try {
      setLoading(true); setError('');
      const picked = changePlace && location.regionName;
      const res = await api.post('/seller/apply', {
        sellerType,
        businessName: businessName.trim() || undefined,
        businessCategory,
        phone: accountPhone || undefined,
        address: accountPlace || undefined,
        ...(picked ? {
          regionId: location.regionId || undefined, businessRegion: location.regionName || undefined,
          districtId: location.districtId || undefined, businessDistrict: location.districtName || undefined,
          wardId: location.wardId || undefined, businessCity: location.wardName || undefined,
        } : { businessRegion: currentUser?.city || undefined }),
        ...(isBusiness ? {
          registrationNumber: registrationNumber.trim() || undefined, tinNumber, businessLicenseNumber,
          businessDocuments: Object.entries(businessDocs).filter(([, url]) => url).map(([type, url]) => ({ type, url })),
        } : {}),
      });
      // Sent: show this request's waiting status here.
      setExisting({ ...(res.data || {}), status: res.data?.status || 'pending' });
      window.scrollTo(0, 0);
    } catch (err) {
      if (err?.response?.data?.code === 'VERIFICATION_REQUIRED') {
        const fresh = await api.get('/identity/me').then((r) => r.data).catch(() => null);
        if (fresh) setIdentityStatus(fresh);
        if (!fresh || needsIdentityStep(fresh)) setShowVerifyIdentity(true);
        return;
      }
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : (m || t('become_seller.apply_failed')));
    } finally { setLoading(false); }
  };

  const errorBox = error && (
    <div role="alert" style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>{error}</div>
  );

  // ── Status of an existing request ─────────────────────────────────────────
  const statusCard = () => {
    const s = existing.status;
    const waitingForId = s === 'pending' && identityState(identityStatus) !== 'verified';
    const title = s === 'approved' ? t('seller_signup.status_approved_title')
      : s === 'pending' ? (waitingForId ? t('work_roles.status_waiting_id') : t('work_roles.status_waiting'))
      : s === 'suspended' ? t('work_roles.status_suspended') : t('seller_signup.status_rejected_title');
    const desc = s === 'approved' ? t('seller_signup.status_approved_desc')
      : s === 'pending' ? (waitingForId ? t('seller_signup.status_waiting_id_desc') : t('seller_signup.status_waiting_desc'))
      : (existing.rejectionReason || t('seller_signup.status_contact_desc'));
    return (
      <div data-testid="seller-status" style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '4px 0 8px' }}>{title}</div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 6px', lineHeight: 1.5 }}>{desc}</p>
        {s === 'approved' && (
          <button onClick={() => onNavigate('SellerDashboard')} style={{ ...primary(true), width: 'auto', padding: '12px 24px' }}>
            {t('become_seller.go_to_dashboard_button')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: 'inherit' }}>
      <BackBar onBack={() => (screen === 'papers' ? setScreen('main') : onNavigate('back'))} title={t('become_seller.page_title')} top={0} />

      <div style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight:800, color: '#fff', marginBottom: 6 }}>{t('become_seller.hero_title')}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>{t('become_seller.hero_desc')}</div>
      </div>

      <div style={{ flex: 1, padding: 16, maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 140 }}>
        {checking || !identityStatus ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>⏳</div>

        ) : existing && existing.status ? statusCard()

        : needsId ? (
          // The one ID screen: only when no ID was sent, or it was rejected.
          <div data-testid="seller-identity-step" style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight:800, color: '#1e293b', marginBottom: 8 }}>
              {identityStatus?.status === 'rejected' ? t('become_seller.identity_rejected_title') : t('become_seller.identity_required_title')}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
              {identityStatus?.status === 'rejected' ? t('become_seller.identity_rejected_desc') : t('become_seller.identity_required_desc')}
            </div>
            {identityStatus?.status === 'rejected' && identityStatus?.rejectionReason && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 12.5, textAlign: 'left' }}>
                {t('become_seller.identity_rejected_reason', { reason: identityStatus.rejectionReason })}
              </div>
            )}
            <button onClick={() => setShowVerifyIdentity(true)} style={primary(true)}>{t('become_seller.identity_verify_button')}</button>
          </div>

        ) : screen === 'main' ? (
          <div data-testid="seller-form" style={card}>
            {errorBox}
            {idWaiting && (
              <div role="status" style={{ backgroundColor: '#fef9c3', color: '#854d0e', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
                <strong>{t('identity_state.waiting_title')}</strong><br />{t('seller_signup.identity_waiting_note')}
              </div>
            )}

            <label style={{ ...label, marginBottom: 8 }}>{t('become_seller.seller_type_label')}</label>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {[
                { key: 'individual', title: t('become_seller.seller_type_individual_title'), desc: t('become_seller.seller_type_individual_desc') },
                { key: 'business',   title: t('become_seller.seller_type_business_title'),   desc: t('become_seller.seller_type_business_desc') },
              ].map((opt) => (
                <button key={opt.key} type="button" onClick={() => setSellerType(opt.key)} aria-pressed={sellerType === opt.key}
                  style={{ flex: 1, textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer',
                    border: sellerType === opt.key ? '2px solid #7c3aed' : '2px solid #e2e8f0', backgroundColor: sellerType === opt.key ? '#f5f3ff' : '#fff' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: sellerType === opt.key ? '#7c3aed' : '#1e293b' }}>{opt.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{opt.desc}</div>
                </button>
              ))}
            </div>

            <label style={label}>{isBusiness ? t('become_seller.field_business_name_label') : t('become_seller.field_display_name_label')}</label>
            <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
              placeholder={isBusiness ? t('become_seller.field_business_name_placeholder') : (currentUser?.name || t('become_seller.field_display_name_placeholder'))}
              style={{ ...inputStyle, marginBottom: 16 }} />

            <label style={label}>{t('become_seller.field_category_label')} *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {CATEGORIES.map((c) => (
                <button key={c.key} type="button" onClick={() => setBusinessCategory(c.key)} aria-pressed={businessCategory === c.key}
                  style={{ padding: '8px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: businessCategory === c.key ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                    backgroundColor: businessCategory === c.key ? '#f5f3ff' : '#fff', color: businessCategory === c.key ? '#7c3aed' : '#475569' }}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Known from the account: shown, not asked. */}
            <div data-testid="seller-account-line" style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
              {t('seller_signup.phone_from_account', { phone: accountPhone || '—' })}<br />
              {!changePlace && (
                <>
                  {t('seller_signup.place_from_account', { place: accountPlace || '—' })}{' '}
                  <button type="button" onClick={() => setChangePlace(true)}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#7c3aed', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                    {t('seller_signup.change_place')}
                  </button>
                </>
              )}
            </div>
            {changePlace && <div style={{ marginTop: 10 }}><LocationPicker label={t('become_seller.field_location_label')} value={location} onChange={setLocation} /></div>}

            {isBusiness ? (
              <button type="button" disabled={!mainReady} onClick={goNext} style={primary(mainReady)}>{t('seller_signup.next_papers')}</button>
            ) : (
              <button type="button" disabled={!mainReady || loading} onClick={handleSubmit} style={primary(mainReady && !loading)}>
                {loading ? t('become_seller.submitting') : t('become_seller.submit_button')}
              </button>
            )}
            {!isLoggedIn && (
              <p style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginTop: 14 }}>
                {t('become_seller.login_required_pre')}{' '}
                <span onClick={() => onNavigate('PublicLogin')} style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: 700 }}>{t('become_seller.login_required_link')}</span>
                {' '}{t('become_seller.login_required_post')}
              </p>
            )}
          </div>

        ) : (
          // Business papers: the one extra screen for a registered business.
          <div data-testid="seller-papers" style={card}>
            {errorBox}
            <div style={{ fontSize: 15, fontWeight:800, color: '#1e293b', marginBottom: 14 }}>{t('become_seller.business_documents_label')}</div>
            <label style={label}>{t('become_seller.field_registration_number_label')}</label>
            <input type="text" placeholder={t('become_seller.field_registration_number_placeholder')} value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={label}>{t('become_seller.field_tin_label')}</label>
            <input type="text" placeholder={t('become_seller.field_tin_placeholder')} value={tinNumber}
              onChange={(e) => setTinNumber(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={label}>{t('become_seller.field_license_label')}</label>
            <input type="text" placeholder={t('become_seller.field_license_placeholder')} value={businessLicenseNumber}
              onChange={(e) => setBusinessLicenseNumber(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'brela',   label: t('become_seller.doc_brela_label') },
                { key: 'tin',     label: t('become_seller.doc_tin_label') },
                { key: 'license', label: t('become_seller.doc_license_label') },
              ].map((doc) => (
                <div key={doc.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 12, color: '#475569', flex: 1 }}>{doc.label}</span>
                  {businessDocs[doc.key] && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 800 }}>✓</span>}
                  <input type="file" accept="image/*" style={{ display: 'none' }} id={`doc-${doc.key}`}
                    onChange={(e) => handleBusinessDocUpload(doc.key, e.target.files?.[0])} />
                  <label htmlFor={`doc-${doc.key}`} style={{ background: '#f5f3ff', color: '#7c3aed', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {uploadingDoc === doc.key ? t('become_seller.uploading') : businessDocs[doc.key] ? t('become_seller.doc_change') : t('become_seller.doc_choose')}
                  </label>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{t('become_seller.business_documents_hint')}</p>
            <button type="button" disabled={loading} onClick={handleSubmit} style={primary(!loading)}>
              {loading ? t('become_seller.submitting') : t('become_seller.submit_button')}
            </button>
          </div>
        )}
      </div>

      {showVerifyIdentity && (
        <VerifyIdentityModal onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => { setShowVerifyIdentity(false); setIdentityStatus((prev) => afterIdentitySent(prev)); }} />
      )}
    </div>
  );
};

export default BecomeSeller;
