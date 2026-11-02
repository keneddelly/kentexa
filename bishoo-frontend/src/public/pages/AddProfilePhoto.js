/**
 * AddProfilePhoto.js — "Weka picha yako" (owner approved 2026-11-02, sketch "New Login and
 * Signup"): the first welcome step after the code, in the new look. The photo is optional:
 * "Ruka kwa sasa" is remembered on this phone (utils/photoLater) and Home keeps a small
 * reminder until a photo is added. After it: the welcome steps (Onboarding), or the
 * place the person was going (kentexa_after_login), or Home.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { AUTH, AuthButton, AuthError, AuthShell } from '../components/AuthShell';
import { skipPhoto } from '../../utils/photoLater';

const AddProfilePhoto = ({ onNavigate, currentUser, onUserUpdated }) => {
  const { t } = useTranslation();
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const next = () => {
    if (currentUser?.onboardingCompleted !== true) { onNavigate('Onboarding'); return; }
    let intended = null;
    try { intended = localStorage.getItem('kentexa_after_login'); if (intended) localStorage.removeItem('kentexa_after_login'); } catch { /* storage blocked */ }
    onNavigate(intended || 'Home');
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const form = new FormData();
      form.append('files', file);
      const res = await api.post('/upload/images', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotoUrl(res.data?.urls?.[0] || '');
    } catch { setError(t('signin.photo_failed')); } finally { setUploading(false); }
  };

  const save = async () => {
    if (!photoUrl) return;
    setSaving(true); setError('');
    try {
      const res = await api.patch(`/users/${currentUser?.id}`, { avatarUrl: photoUrl });
      onUserUpdated?.({ ...currentUser, ...res.data, avatarUrl: photoUrl });
      next();
    } catch (err) {
      setError(err?.response?.data?.message || t('signin.photo_failed'));
    } finally { setSaving(false); }
  };

  const later = () => { skipPhoto(currentUser?.id); next(); };

  return (
    <AuthShell title={t('signin.photo_title')} subtitle={t('signin.photo_desc')} onLogo={() => {}}>
      <label style={{ alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', margin: '8px 0' }}>
        <span style={{ width: 120, height: 120, borderRadius: '50%', overflow: 'hidden', background: '#eff3f4', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: AUTH.MUTED, fontWeight: 700, fontSize: 14, border: `1px solid ${AUTH.LINE}` }}>
          {photoUrl ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (uploading ? t('signin.photo_uploading') : t('signin.photo_choose'))}
        </span>
        <span style={{ color: AUTH.BLUE, fontWeight: 600, fontSize: 15 }}>{photoUrl ? t('signin.photo_change') : t('signin.photo_choose')}</span>
        <input type="file" accept="image/*" onChange={upload} disabled={uploading} style={{ display: 'none' }} />
      </label>
      <AuthError>{error}</AuthError>
      <AuthButton onClick={save} disabled={!photoUrl || uploading || saving} testId="photo-save">{saving ? t('signin.photo_saving') : t('signin.photo_save')}</AuthButton>
      <AuthButton variant="outline" onClick={later} disabled={saving} testId="photo-skip">{t('signin.photo_skip')}</AuthButton>
    </AuthShell>
  );
};

export default AddProfilePhoto;
