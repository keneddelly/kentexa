/**
 * PostService.js — Any user can post a service ad
 * Place at: src/public/pages/PostService.js
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar  from '../components/BackBar';
import api      from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const getCategories = (t) => [
  { value: 'ufundi',       icon: '🔧', label: t('post_service.cat_ufundi') },
  { value: 'usafi',        icon: '🧹', label: t('post_service.cat_usafi')       },
  { value: 'elimu',        icon: '📚', label: t('post_service.cat_elimu')            },
  { value: 'upishi',       icon: '👨‍🍳', label: t('post_service.cat_upishi')},
  { value: 'usafirishaji', icon: '🚗', label: t('post_service.cat_usafirishaji')    },
  { value: 'afya',         icon: '🏥', label: t('post_service.cat_afya')    },
  { value: 'ubunifu',      icon: '🎨', label: t('post_service.cat_ubunifu')},
  { value: 'matengenezo',  icon: '🔨', label: t('post_service.cat_matengenezo') },
  { value: 'biashara',     icon: '💼', label: t('post_service.cat_biashara')},
  { value: 'kilimo',       icon: '🌱', label: t('post_service.cat_kilimo')     },
  { value: 'nyumbani',     icon: '🏠', label: t('post_service.cat_nyumbani')     },
  { value: 'mengineyo',    icon: '📋', label: t('post_service.cat_mengineyo')                           },
];

const getPriceTypes = (t) => [
  { value: 'per_hour',  label: t('post_service.price_per_hour')           },
  { value: 'per_job',   label: t('post_service.price_per_job')           },
  { value: 'per_day',   label: t('post_service.price_per_day')           },
  { value: 'negotiate', label: t('post_service.price_negotiate')     },
  { value: 'free_quote',label: t('post_service.price_free_quote')    },
];

const getDays = (t) => [
  { v: 'Mon', l: t('post_service.day_mon') }, { v: 'Tue', l: t('post_service.day_tue') },
  { v: 'Wed', l: t('post_service.day_wed') }, { v: 'Thu', l: t('post_service.day_thu') },
  { v: 'Fri', l: t('post_service.day_fri')   }, { v: 'Sat', l: t('post_service.day_sat') },
  { v: 'Sun', l: t('post_service.day_sun')  },
];

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const PostService = ({ onNavigate, activeProfileId }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const PRICE_TYPES = getPriceTypes(t);
  const DAYS = getDays(t);
  const [step,  setStep]  = useState(1);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [form,  setForm]  = useState({
    title: '', description: '', category: '', subcategory: '',
    priceType: 'per_job', price: '', priceMax: '',
    coverageCity: '', coverageWards: '', images: [],
    workingDays: ['Mon','Tue','Wed','Thu','Fri'],
    workingHours: '08:00 - 18:00',
    isAvailableNow: true,
    whatsappPhone: '',
  });
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploading, setUploading]         = useState(false);
  const [coverageLocation, setCoverageLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [descGenerating, setDescGenerating]     = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (form.images.length + files.length > 5) { setError(t('post_service.max_images')); return; }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreviews(prev => [...prev, reader.result]);
      reader.readAsDataURL(file);
    });
    try {
      setUploading(true);
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(prev => ({ ...prev, images: [...prev.images, ...res.data.urls] }));
    } catch { setError(t('post_service.image_upload_failed')); }
    finally { setUploading(false); }
  };

  const removeImage = (i) => {
    setImagePreviews(prev => prev.filter((_, idx) => idx !== i));
    setForm(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }));
  };

  // Reads the already-uploaded photo(s) + typed title and writes a
  // grounded description — never invents specs the photo/title don't
  // support. Fills the textarea for review; never submits on its own.
  const generateDescription = async () => {
    if (!form.title || !form.images.length) return;
    try {
      setDescGenerating(true);
      setError('');
      const res = await api.post('/services/ai/generate-description', {
        title: form.title,
        imageUrls: form.images,
        categoryHint: CATEGORIES.find(c => c.value === form.category)?.label,
      });
      setForm(prev => ({ ...prev, description: res.data?.description || prev.description }));
    } catch { setError(t('post_service.ai_description_failed')); }
    finally { setDescGenerating(false); }
  };

  const toggleDay = (day) => {
    set('workingDays', form.workingDays.includes(day)
      ? form.workingDays.filter(d => d !== day)
      : [...form.workingDays, day]
    );
  };

  const handleSubmit = async () => {
    if (!form.title.trim())       return setError(t('post_service.title_required'));
    if (!form.description.trim()) return setError(t('post_service.description_required'));
    if (!form.category)           return setError(t('post_service.category_required'));
    if (!form.coverageCity.trim()) return setError(t('post_service.city_required'));
    try {
      setSaving(true); setError('');
      const payload = {
        ...form,
        price:         form.price    ? Number(form.price)    : 0,
        priceMax:      form.priceMax ? Number(form.priceMax) : null,
        coverageWards: form.coverageWards
          ? form.coverageWards.split(',').map(w => w.trim()).filter(Boolean)
          : [],
        commerceProfileId: activeProfileId || undefined,
      };
      const res = await api.post('/services', payload);
      onNavigate(`ServiceDetail-${res.data.id}`);
    } catch (e) {
      setError(e.response?.data?.message || t('post_service.submit_failed'));
    } finally { setSaving(false); }
  };

  const progress = [
    { n: 1, label: t('post_service.progress_type')     },
    { n: 2, label: t('post_service.progress_details')  },
    { n: 3, label: t('post_service.progress_price')      },
    { n: 4, label: t('post_service.progress_location')     },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      paddingBottom: 90,
      backgroundColor: '#f8fafc', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <BackBar onBack={() => step > 1 ? setStep(s => s - 1) : onNavigate('Services')}
        title={t('post_service.page_title')} top={0} />

      <div style={{ flex: 1, padding: '16px 16px 48px', maxWidth: 600,
        margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28 }}>
          {progress.map(s => (
            <div key={s.n} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 4, borderRadius: 100, marginBottom: 6,
                backgroundColor: step >= s.n ? '#1d4ed8' : '#e2e8f0' }} />
              <div style={{ fontSize: 10, fontWeight: 700,
                color: step >= s.n ? '#1d4ed8' : '#94a3b8' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 10,
            padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Step 1: Category */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 6 }}>
              {t('post_service.step1_title')}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              {t('post_service.step1_desc')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORIES.map(c => (
                <button key={c.value}
                  onClick={() => { set('category', c.value); setStep(2); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 18px', borderRadius: 12,
                    border: `2px solid ${form.category === c.value ? '#1d4ed8' : '#e2e8f0'}`,
                    cursor: 'pointer', textAlign: 'left',
                    backgroundColor: form.category === c.value ? '#eff6ff' : '#fff' }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{c.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{c.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 20 }}>
              {t('post_service.step2_title')}
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                {t('post_service.field_title_label')}
              </label>
              <input style={inp} value={form.title}
                placeholder={t('post_service.field_title_placeholder')}
                onChange={e => set('title', e.target.value)} />
            </div>

            {/* Photos — portfolio images shown on ServiceDetail/Services
                browse cards, which already render them if present. */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                {t('post_service.field_photos_label')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {imagePreviews.map((src, i) => (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                    <button type="button" onClick={() => removeImage(i)}
                      style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444',
                        color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18,
                        cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                ))}
                {form.images.length < 5 && (
                  <label style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed #cbd5e1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    color: '#94a3b8', fontSize: 24 }}>
                    {uploading ? '⏳' : '+'}
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload}
                      disabled={uploading} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{t('post_service.field_photos_hint')}</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>
                  {t('post_service.field_description_label')}
                </label>
                <button type="button" onClick={generateDescription}
                  disabled={descGenerating || !form.title || !form.images.length}
                  title={!form.images.length ? t('post_service.ai_description_needs_photo') : ''}
                  style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', background: 'none',
                    border: '1px solid #c4b5fd', borderRadius: 8, padding: '4px 10px',
                    cursor: (descGenerating || !form.title || !form.images.length) ? 'not-allowed' : 'pointer',
                    opacity: (!form.title || !form.images.length) ? 0.5 : 1 }}>
                  {descGenerating ? `⏳ ${t('post_service.ai_description_generating')}` : `✨ ${t('post_service.ai_description_button')}`}
                </button>
              </div>
              <textarea rows={5} style={{ ...inp, resize: 'vertical' }}
                value={form.description}
                placeholder={t('post_service.field_description_placeholder')}
                onChange={e => set('description', e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                {t('post_service.field_subcategory_label')}
              </label>
              <input style={inp} value={form.subcategory}
                placeholder={t('post_service.field_subcategory_placeholder')}
                onChange={e => set('subcategory', e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                {t('post_service.field_whatsapp_label')}
              </label>
              <input type="tel" style={inp} value={form.whatsappPhone}
                placeholder="0788 000 000"
                onChange={e => set('whatsappPhone', e.target.value)} />
            </div>
            {/* Working days */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 8 }}>
                {t('post_service.working_days_label')}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAYS.map(d => (
                  <button key={d.v} onClick={() => toggleDay(d.v)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      backgroundColor: form.workingDays.includes(d.v) ? '#1d4ed8' : '#f1f5f9',
                      color: form.workingDays.includes(d.v) ? '#fff' : '#64748b' }}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>{t('post_service.working_hours_label')}</label>
              <input style={inp} value={form.workingHours}
                placeholder="08:00 - 18:00"
                onChange={e => set('workingHours', e.target.value)} />
            </div>
            <button onClick={() => { if (!form.title.trim() || !form.description.trim()) return setError(t('post_service.fill_required_fields')); setError(''); setStep(3); }}
              style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                border: 'none', borderRadius: 12, padding: '14px 0',
                cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>
              {t('post_service.continue_button')}
            </button>
          </div>
        )}

        {/* Step 3: Pricing */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 20 }}>
              {t('post_service.step3_title')}
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 8 }}>
                {t('post_service.price_type_label')}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PRICE_TYPES.map(pt => (
                  <label key={pt.value}
                    style={{ display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${form.priceType === pt.value ? '#1d4ed8' : '#e2e8f0'}`,
                      backgroundColor: form.priceType === pt.value ? '#eff6ff' : '#fff' }}>
                    <input type="radio" name="priceType" value={pt.value}
                      checked={form.priceType === pt.value}
                      onChange={() => set('priceType', pt.value)} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                      {pt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {!['negotiate','free_quote'].includes(form.priceType) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                    color: '#64748b', marginBottom: 6 }}>{t('post_service.price_label')}</label>
                  <input type="number" style={inp} value={form.price}
                    placeholder="5000"
                    onChange={e => set('price', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                    color: '#64748b', marginBottom: 6 }}>{t('post_service.price_max_label')}</label>
                  <input type="number" style={inp} value={form.priceMax}
                    placeholder="15000"
                    onChange={e => set('priceMax', e.target.value)} />
                </div>
              </div>
            )}
            <button onClick={() => setStep(4)}
              style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                border: 'none', borderRadius: 12, padding: '14px 0',
                cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>
              {t('post_service.continue_button')}
            </button>
          </div>
        )}

        {/* Step 4: Location */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 20 }}>
              {t('post_service.step4_title')}
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                {t('post_service.main_city_label')}
              </label>
              <LocationPicker
                value={coverageLocation}
                onChange={loc => {
                  setCoverageLocation(loc);
                  set('coverageCity', [loc.districtName, loc.regionName].filter(Boolean).join(', '));
                }}
              />
              {form.coverageCity && (
                <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✅ {form.coverageCity}</div>
              )}
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                {t('post_service.specific_areas_label')}
              </label>
              <input style={inp} value={form.coverageWards}
                placeholder={t('post_service.specific_areas_placeholder')}
                onChange={e => set('coverageWards', e.target.value)} />
            </div>
            {/* Preview */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12,
              padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                {t('post_service.preview_title')}
              </div>
              {[
                [t('post_service.preview_service'), form.title],
                [t('post_service.preview_type'), CATEGORIES.find(c => c.value === form.category)?.label || '—'],
                [t('post_service.preview_price'), form.priceType === 'negotiate' ? t('post_service.price_negotiate_label') : form.priceType === 'free_quote' ? t('post_service.price_free_quote_label') : `TZS ${Number(form.price||0).toLocaleString()}`],
                [t('post_service.preview_city'), form.coverageCity || '—'],
              ].map(([k,v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{k}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={handleSubmit} disabled={saving}
              style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 800 }}>
              {saving ? t('post_service.submitting_button') : t('post_service.submit_button')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PostService;