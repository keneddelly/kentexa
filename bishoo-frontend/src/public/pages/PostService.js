/**
 * PostService.js — post a service ad on ONE screen (audit B step 5, decision S1)
 * Place at: src/public/pages/PostService.js
 *
 *  - asked: category, title, short description, price type (+ amount when
 *    fixed), at least one photo;
 *  - known from the account and shown, not asked: area (changeable) and the
 *    WhatsApp number;
 *  - working days/hours: optional, folded away on the same screen (there is
 *    no "edit service" page yet to move them to);
 *  - the ID screen appears only when no ID was sent or it was rejected; a
 *    waiting ID may post, and the ad stays hidden from customers until the
 *    ID is verified (it then appears by itself).
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar  from '../components/BackBar';
import VerifyIdentityModal from '../components/VerifyIdentityModal';
import api      from '../../api/api';
import PlaceSearchField, { placeLabel } from '../components/PlaceSearchField';
import { identityState, needsIdentityStep, afterIdentitySent } from '../../utils/identityState';
import useIdentityRefresh from '../../utils/useIdentityRefresh';

const getCategories = (t) => [
  { value: 'ufundi',       label: t('post_service.cat_ufundi') },
  { value: 'usafi',        label: t('post_service.cat_usafi') },
  { value: 'elimu',        label: t('post_service.cat_elimu') },
  { value: 'upishi',       label: t('post_service.cat_upishi') },
  { value: 'usafirishaji', label: t('post_service.cat_usafirishaji') },
  { value: 'afya',         label: t('post_service.cat_afya') },
  { value: 'ubunifu',      label: t('post_service.cat_ubunifu') },
  { value: 'matengenezo',  label: t('post_service.cat_matengenezo') },
  { value: 'biashara',     label: t('post_service.cat_biashara') },
  { value: 'kilimo',       label: t('post_service.cat_kilimo') },
  { value: 'nyumbani',     label: t('post_service.cat_nyumbani') },
  { value: 'mengineyo',    label: t('post_service.cat_mengineyo') },
];

const getPriceTypes = (t) => [
  { value: 'per_job',    label: t('post_service.price_per_job') },
  { value: 'per_hour',   label: t('post_service.price_per_hour') },
  { value: 'per_day',    label: t('post_service.price_per_day') },
  { value: 'negotiate',  label: t('post_service.price_negotiate') },
  { value: 'free_quote', label: t('post_service.price_free_quote') },
];

const getDays = (t) => [
  { v: 'Mon', l: t('post_service.day_mon') }, { v: 'Tue', l: t('post_service.day_tue') },
  { v: 'Wed', l: t('post_service.day_wed') }, { v: 'Thu', l: t('post_service.day_thu') },
  { v: 'Fri', l: t('post_service.day_fri') }, { v: 'Sat', l: t('post_service.day_sat') },
  { v: 'Sun', l: t('post_service.day_sun') },
];

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};
const label = { display: 'block', fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 6 };
const chip = (on) => ({ padding: '8px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: on ? '2px solid #1d4ed8' : '2px solid #e2e8f0', backgroundColor: on ? '#eff6ff' : '#fff', color: on ? '#1d4ed8' : '#475569' });
const card = { backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 };
const primary = (on) => ({ width: '100%', background: on ? 'linear-gradient(135deg,#1d4ed8,#7c3aed)' : '#94a3b8', color: '#fff',
  border: 'none', borderRadius: 12, padding: '14px 0', cursor: on ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 800 });
const fixedPrice = (pt) => !['negotiate', 'free_quote'].includes(pt);

const PostService = ({ onNavigate, isLoggedIn = true, currentUser, activeProfileId, activeContext, activeBusinessName }) => {
  const { t } = useTranslation();
  // Acting as the Business's own SERVICE_PROVIDER role -> the ad is
  // Business-attributed, server-derived (POST /services/business).
  const postingAsBusinessProvider = activeContext?.roleType === 'service_provider' && activeContext?.businessId != null;
  const CATEGORIES = getCategories(t);
  const PRICE_TYPES = getPriceTypes(t);
  const DAYS = getDays(t);
  const [identityStatus, setIdentityStatus] = useState(null);
  useIdentityRefresh(setIdentityStatus, isLoggedIn);
  const [showVerifyIdentity, setShowVerifyIdentity] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);                     // the posted ad, when it waits for the ID
  const [form, setForm] = useState({
    title: '', description: '', category: '', priceType: 'per_job', price: '',
    images: [], workingDays: [], workingHours: '',
  });
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [changeArea, setChangeArea] = useState(false);
  const [areaLocation, setAreaLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [descGenerating, setDescGenerating] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    api.get('/identity/me').then((r) => setIdentityStatus(r.data)).catch(() => setIdentityStatus({ status: 'not_submitted', level: 0 }));
  }, [isLoggedIn]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const accountArea = (currentUser?.city || '').trim();
  const pickedArea = [areaLocation.districtName, areaLocation.regionName].filter(Boolean).join(', ') || placeLabel(areaLocation);
  const area = changeArea ? pickedArea : accountArea;
  const accountPhone = currentUser?.phone || '';
  const idWaiting = identityState(identityStatus) === 'waiting';

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (form.images.length + files.length > 5) { setError(t('post_service.max_images')); return; }
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreviews((prev) => [...prev, reader.result]);
      reader.readAsDataURL(file);
    });
    try {
      setUploading(true);
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm((prev) => ({ ...prev, images: [...prev.images, ...res.data.urls] }));
    } catch { setError(t('post_service.image_upload_failed')); }
    finally { setUploading(false); }
  };

  const removeImage = (i) => {
    setImagePreviews((prev) => prev.filter((_, idx) => idx !== i));
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }));
  };

  // Writes a description from the photo(s) + title, for review; never submits.
  const generateDescription = async () => {
    if (!form.title || !form.images.length) return;
    try {
      setDescGenerating(true); setError('');
      const res = await api.post('/services/ai/generate-description', {
        title: form.title, imageUrls: form.images,
        categoryHint: CATEGORIES.find((c) => c.value === form.category)?.label,
      });
      setForm((prev) => ({ ...prev, description: res.data?.description || prev.description }));
    } catch { setError(t('post_service.ai_description_failed')); }
    finally { setDescGenerating(false); }
  };

  const toggleDay = (day) => set('workingDays', form.workingDays.includes(day) ? form.workingDays.filter((d) => d !== day) : [...form.workingDays, day]);

  const handleSubmit = async () => {
    if (!form.category)           return setError(t('post_service.category_required'));
    if (!form.title.trim())       return setError(t('post_service.title_required'));
    if (!form.description.trim()) return setError(t('post_service.description_required'));
    if (!form.images.length)      return setError(t('post_service.image_required'));
    if (!area)                    return setError(t('service_signup.area_required'));
    try {
      setSaving(true); setError('');
      const payload = {
        title: form.title.trim(), description: form.description.trim(), category: form.category,
        priceType: form.priceType,
        price: fixedPrice(form.priceType) ? (form.price ? Number(form.price) : 0) : 0,
        coverageCity: area,
        images: form.images,
        whatsappPhone: accountPhone || undefined,
        ...(form.workingDays.length ? { workingDays: form.workingDays } : {}),
        ...(form.workingHours.trim() ? { workingHours: form.workingHours.trim() } : {}),
        isAvailableNow: true,
      };
      const res = postingAsBusinessProvider
        ? await api.post('/services/business', payload)
        : await api.post('/services', { ...payload, commerceProfileId: activeProfileId || undefined });
      // Waiting for the ID: say so here (the ad is not public yet). Otherwise open it.
      if (res.data?.waitingForId) { setSent(res.data); window.scrollTo(0, 0); }
      else onNavigate(`ServiceDetail-${res.data.id}`);
    } catch (e) {
      const code = e.response?.data?.code;
      if (code === 'VERIFICATION_REQUIRED' || code === 'VERIFICATION_REJECTED') {
        setShowVerifyIdentity(true);
      } else {
        const m = e.response?.data?.message;
        setError(Array.isArray(m) ? m.join(', ') : (m || t('post_service.submit_failed')));
      }
    } finally { setSaving(false); }
  };

  const ready = !!form.category && !!form.title.trim() && !!form.description.trim() && form.images.length > 0 && !!area && !uploading;

  let body;
  if (!identityStatus) {
    body = <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>⏳</div>;
  } else if (sent) {
    body = (
      <div data-testid="service-waiting-id" style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '4px 0 8px' }}>{t('work_roles.status_waiting_id')}</div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 6px', lineHeight: 1.5 }}>{t('service_signup.waiting_desc')}</p>
      </div>
    );
  } else if (needsIdentityStep(identityStatus)) {
    // The one ID screen: only when no ID was sent, or it was rejected.
    body = (
      <div data-testid="service-identity-step" style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{t('service_signup.identity_title')}</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
          {identityState(identityStatus) === 'rejected' ? t('agent_signup.identity_rejected') : t('service_signup.identity_desc')}
        </div>
        <button onClick={() => setShowVerifyIdentity(true)} style={primary(true)}>{t('agent_signup.identity_button')}</button>
      </div>
    );
  } else {
    body = (
      <div data-testid="service-form" style={card}>
        {error && <div role="alert" style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>{error}</div>}
        {idWaiting && (
          <div role="status" style={{ backgroundColor: '#fef9c3', color: '#854d0e', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
            <strong>{t('identity_state.waiting_title')}</strong><br />{t('service_signup.identity_waiting_note')}
          </div>
        )}

        <label style={label}>{t('post_service.step1_title')} *</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button" aria-pressed={form.category === c.value} onClick={() => set('category', c.value)} style={chip(form.category === c.value)}>
              {c.label}
            </button>
          ))}
        </div>

        <label style={label}>{t('post_service.field_title_label')}</label>
        <input style={{ ...inp, marginBottom: 16 }} value={form.title} placeholder={t('post_service.field_title_placeholder')}
          onChange={(e) => set('title', e.target.value)} />

        <label style={label}>{t('post_service.field_photos_label')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {imagePreviews.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
              <button type="button" onClick={() => removeImage(i)} aria-label="x"
                style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%',
                  width: 18, height: 18, cursor: 'pointer', fontSize: 10 }}>×</button>
            </div>
          ))}
          {form.images.length < 5 && (
            <label style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed #cbd5e1', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 24 }}>
              {uploading ? '…' : '+'}
              <input type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} style={{ display: 'none' }} data-testid="service-photo-input" />
            </label>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ ...label, marginBottom: 0 }}>{t('post_service.field_description_label')}</label>
          <button type="button" onClick={generateDescription} disabled={descGenerating || !form.title || !form.images.length}
            style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', background: 'none', border: '1px solid #c4b5fd', borderRadius: 8, padding: '4px 10px',
              cursor: (descGenerating || !form.title || !form.images.length) ? 'not-allowed' : 'pointer', opacity: (!form.title || !form.images.length) ? 0.5 : 1 }}>
            {descGenerating ? t('post_service.ai_description_generating') : t('post_service.ai_description_button')}
          </button>
        </div>
        <textarea rows={3} style={{ ...inp, resize: 'vertical', marginBottom: 16 }} value={form.description}
          placeholder={t('post_service.field_description_placeholder')} onChange={(e) => set('description', e.target.value)} />

        <label style={label}>{t('post_service.price_type_label')}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {PRICE_TYPES.map((pt) => (
            <button key={pt.value} type="button" aria-pressed={form.priceType === pt.value} onClick={() => set('priceType', pt.value)} style={chip(form.priceType === pt.value)}>
              {pt.label}
            </button>
          ))}
        </div>
        {fixedPrice(form.priceType) && (
          <input type="number" inputMode="numeric" style={{ ...inp, marginBottom: 16 }} value={form.price}
            placeholder={t('service_signup.price_placeholder')} onChange={(e) => set('price', e.target.value)} />
        )}

        {/* Known from the account: shown, not asked. */}
        <div data-testid="service-account-line" style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, margin: '6px 0 10px' }}>
          {!changeArea && (
            <>
              {t('service_signup.area_from_account', { place: accountArea || '—' })}{' '}
              <button type="button" onClick={() => setChangeArea(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                {t('service_signup.change')}
              </button>
              <br />
            </>
          )}
          {t('service_signup.whatsapp_from_account', { phone: accountPhone || '—' })}
        </div>
        {changeArea && (
          <div style={{ marginBottom: 12 }}>
            <PlaceSearchField id="service-place" value={areaLocation} onChange={setAreaLocation} />
            {pickedArea && <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✓ {pickedArea}</div>}
          </div>
        )}

        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 13, padding: '8px 0', cursor: 'pointer', color: '#1d4ed8', fontWeight: 700 }}>{t('service_signup.more_details')}</summary>
          <label style={{ ...label, marginTop: 6 }}>{t('post_service.working_days_label')}</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {DAYS.map((d) => (
              <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  backgroundColor: form.workingDays.includes(d.v) ? '#1d4ed8' : '#f1f5f9', color: form.workingDays.includes(d.v) ? '#fff' : '#64748b' }}>
                {d.l}
              </button>
            ))}
          </div>
          <label style={label}>{t('post_service.working_hours_label')}</label>
          <input style={inp} value={form.workingHours} placeholder="08:00 - 18:00" onChange={(e) => set('workingHours', e.target.value)} />
        </details>

        <button type="button" onClick={handleSubmit} disabled={saving || !ready} style={primary(!saving && ready)}>
          {saving ? t('post_service.submitting_button') : t('post_service.submit_button')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', paddingBottom: 90,
      backgroundColor: '#f8fafc', fontFamily:'inherit' }}>
      <BackBar onBack={() => onNavigate('Services')} title={t('post_service.page_title')} top={0} />
      <div style={{ flex: 1, padding: '16px 16px 48px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {postingAsBusinessProvider && (
          <div style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', borderRadius: 10, padding: '9px 14px', marginBottom: 16, fontSize: 12, fontWeight: 700 }}>
            {t('post_service.posting_as_business', { business: activeBusinessName || t('post_service.default_business_name') })}
          </div>
        )}
        {body}
      </div>

      {showVerifyIdentity && (
        <VerifyIdentityModal onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => { setShowVerifyIdentity(false); setIdentityStatus((prev) => afterIdentitySent(prev)); }} />
      )}
    </div>
  );
};

export default PostService;
