/**
 * TransportProviderSettings.js — Transport provider profile settings
 * Accessed via ⚙️ gear icon on TransportProviderDashboard
 *
 * Only exposes fields TransportService.updateProfile() actually persists
 * (name, contactPhone, whatsappPhone, contactEmail, description,
 * defaultParcelCapacity, defaultMaxWeightKg, logoUrl) — vehicle type is
 * chosen once at registration and isn't editable here.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const TransportProviderSettings = ({ onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    name: '', contactPhone: '', whatsappPhone: '', contactEmail: '',
    description: '', defaultParcelCapacity: '', defaultMaxWeightKg: '', logoUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    api.get('/transport/my-profile')
      .then(res => {
        setProfile(res.data);
        setForm({
          name: res.data.name || '',
          contactPhone: res.data.contactPhone || '',
          whatsappPhone: res.data.whatsappPhone || '',
          contactEmail: res.data.contactEmail || '',
          description: res.data.description || '',
          defaultParcelCapacity: res.data.defaultParcelCapacity ?? '',
          defaultMaxWeightKg: res.data.defaultMaxWeightKg ?? '',
          logoUrl: res.data.logoUrl || '',
        });
      })
      .catch(() => setError(t('transport_provider_settings.load_failed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setLogoUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(p => ({ ...p, logoUrl: res.data.urls?.[0] || '' }));
    } catch {
      setError(t('transport_provider_settings.logo_upload_failed'));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true); setError(''); setSuccess('');
      await api.patch('/transport/my-profile', {
        ...form,
        defaultParcelCapacity: form.defaultParcelCapacity === '' ? undefined : Number(form.defaultParcelCapacity),
        defaultMaxWeightKg: form.defaultMaxWeightKg === '' ? undefined : Number(form.defaultMaxWeightKg),
      });
      setSuccess(t('transport_provider_settings.save_success'));
    } catch (err) {
      setError(err?.response?.data?.message || t('transport_provider_settings.save_failed'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('transport_provider_settings.page_title')} top={0} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳</div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

            {profile?.type && (
              <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: '10px 14px',
                marginBottom: 20, fontSize: 12, color: '#9a5b00', textTransform: 'capitalize' }}>
                {t('transport_provider_settings.vehicle_type_label')}: <strong>{profile.type}</strong>
                <div style={{ fontSize: 11, color: '#9a5b00', opacity: 0.8, marginTop: 2, textTransform: 'none' }}>
                  {t('transport_provider_settings.vehicle_type_locked')}
                </div>
              </div>
            )}

            {error && (
              <div style={{ color: '#dc2626', backgroundColor: '#fee2e2', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                ❌ {error}
              </div>
            )}
            {success && (
              <div style={{ color: '#16a34a', backgroundColor: '#dcfce7', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
                {success}
              </div>
            )}

            {/* Logo */}
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <div style={{ width: 76, height: 76, borderRadius: 18, margin: '0 auto 10px',
                backgroundColor: '#f1f5f9', overflow: 'hidden', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                {form.logoUrl ? <img src={form.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚚'}
              </div>
              <label style={{ display: 'inline-block', backgroundColor: '#f1f5f9', color: '#1d4ed8',
                padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                {logoUploading ? t('transport_provider_settings.uploading') : t('transport_provider_settings.change_logo')}
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} disabled={logoUploading} />
              </label>
            </div>

            {[
              { k: 'name', l: t('transport_provider_settings.field_name_label'), ph: t('transport_provider_settings.field_name_placeholder') },
              { k: 'contactPhone', l: t('transport_provider_settings.field_phone_label'), ph: '0712345678', type: 'tel' },
              { k: 'whatsappPhone', l: t('transport_provider_settings.field_whatsapp_label'), ph: '255712345678', type: 'tel' },
              { k: 'contactEmail', l: t('transport_provider_settings.field_email_label'), ph: 'info@example.com', type: 'email' },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>{f.l}</label>
                <input type={f.type || 'text'} placeholder={f.ph} value={form[f.k] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                  style={inp} />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                  {t('transport_provider_settings.field_capacity_label')}
                </label>
                <input type="number" min="0" value={form.defaultParcelCapacity}
                  onChange={e => setForm(p => ({ ...p, defaultParcelCapacity: e.target.value }))}
                  style={inp} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                  {t('transport_provider_settings.field_max_weight_label')}
                </label>
                <input type="number" min="0" value={form.defaultMaxWeightKg}
                  onChange={e => setForm(p => ({ ...p, defaultMaxWeightKg: e.target.value }))}
                  style={inp} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                {t('transport_provider_settings.field_description_label')}
              </label>
              <textarea rows={4} placeholder={t('transport_provider_settings.field_description_placeholder')}
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                style={{ ...inp, resize: 'vertical' }} />
            </div>

            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', backgroundColor: saving ? '#94a3b8' : '#1d4ed8',
                color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 900 }}>
              {saving ? t('transport_provider_settings.saving') : t('transport_provider_settings.save_button')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransportProviderSettings;
