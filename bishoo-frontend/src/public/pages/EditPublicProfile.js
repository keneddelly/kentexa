import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: 12, fontSize: 16, border: '1px solid #cbd5e1', borderRadius: 10, fontFamily: 'inherit' };
const EditPublicProfile = ({ commerceProfileId, activeProfileId, currentUser, onUserUpdated, onNavigate }) => {
  const { t } = useTranslation();
  const id = commerceProfileId || activeProfileId;
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.get('/profiles/' + id).then(res => {
      if (cancelled) return;
      if (Number(res.data.ownerId) !== Number(currentUser?.id)) throw new Error(t('profile_editor.not_owner'));
      setProfile(res.data);
      setForm(Object.fromEntries(['displayName','username','photoUrl','coverImage','bio','location'].map(key => [key, res.data[key] || ''])));
    }).catch(err => { if (!cancelled) setError(err.message || t('profile.load_failed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, currentUser?.id, t]);
  const upload = async (event, field) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(field); setError('');
    try {
      const body = new FormData(); body.append('files', file);
      const res = await api.post('/upload/images', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data.urls?.[0];
      if (!url) throw new Error(t('register.photo_upload_failed'));
      setForm(prev => ({ ...prev, [field]: url }));
    } catch { setError(t('register.photo_upload_failed')); }
    finally { setUploading(''); }
  };
  const save = async event => {
    event.preventDefault();
    if (saving || uploading) return;
    setSaving(true); setError('');
    try {
      if (profile.type === 'personal') {
        await api.patch('/profiles/' + profile.id, { ...(form.username.trim() !== profile.username ? { username: form.username.trim() } : {}), coverImage: form.coverImage });
        const res = await api.patch('/users/' + currentUser.id, {
          name: form.displayName.trim(), avatarUrl: form.photoUrl, bio: form.bio.trim(), city: form.location.trim(),
        });
        onUserUpdated?.({ ...currentUser, ...res.data });
      } else {
        await api.patch('/profiles/' + profile.id, { displayName: form.displayName.trim(), photoUrl: form.photoUrl, coverImage: form.coverImage, ...(form.username.trim() !== profile.username ? { username: form.username.trim() } : {}), bio: form.bio.trim(), location: form.location.trim() });
      }
      onNavigate('CommerceProfile-' + profile.ownerId, { commerceProfileId: profile.id });
    } catch (err) { setError(err.response?.data?.message || t('profile_editor.save_failed')); }
    finally { setSaving(false); }
  };
  return (
    <main style={{ maxWidth: 640, padding: 20, margin: 'auto', paddingBottom: 100, fontFamily: 'Inter,sans-serif' }}>
      <BackBar title={t('profile_editor.title')} onBack={() => onNavigate('back')} />
      {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 16 }}>{String(error)}</p>}
      {loading ? <p>{t('profile.loading')}</p> : profile && (
        <form onSubmit={save}>
          <h1 style={{ fontSize: 24 }}>{profile.displayName}</h1>
          <p style={{ fontSize: 16, color: '#64748b' }}>{t('profile_editor.public_hint')}</p>
          {['photoUrl','coverImage'].map(field => (
            <div key={field} style={{ marginBottom: 20 }}>
              <label htmlFor={field} style={{ display: 'block', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{t('profile_editor.' + field)}</label>
              {form[field] && <img src={form[field]} alt="" style={{ width: field === 'photoUrl' ? 96 : '100%', height: field === 'photoUrl' ? 96 : 140, borderRadius: 12, objectFit: 'cover', marginBottom: 12 }} />}
              <input id={field} type="file" accept="image/*" disabled={saving || !!uploading} onChange={e => upload(e, field)} style={{ fontSize: 16, maxWidth: '100%' }} />
              {uploading === field && <p role="status">{t('register.photo_uploading')}</p>}
            </div>
          ))}
          {['displayName','username','location','bio'].map(field => (
            <div key={field} style={{ marginBottom: 20 }}>
              <label htmlFor={field} style={{ display: 'block', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{t('profile_editor.' + field)}</label>
              {field === 'bio' ? <textarea id={field} rows={5} value={form[field]} disabled={saving} onChange={e => setForm({ ...form, [field]: e.target.value })} style={inputStyle} /> :
                <input id={field} required={field === 'displayName' || field === 'username'} value={form[field]} disabled={saving} onChange={e => setForm({ ...form, [field]: e.target.value })} style={inputStyle} />}
            </div>
          ))}
          <button type="submit" disabled={saving || !!uploading} style={{ width: '100%', padding: 16, border: 'none', borderRadius: 12, color: '#fff', background: '#2563eb', fontSize: 16, fontWeight: 800 }}>{t(saving ? 'onboarding.saving_button' : 'profile.update')}</button>
        </form>
      )}
    </main>
  );
};
export default EditPublicProfile;
