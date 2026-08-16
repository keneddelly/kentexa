/**
 * AddProfilePhoto.js — recovery path for accounts that verified OTP but
 * closed the app before finishing Register.js's mandatory Step 3. Reached
 * via App.js's login-time and mount-time gates when /auth/profile comes
 * back with no avatarUrl. Same upload+PATCH logic as Register.js Step 3.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const AddProfilePhoto = ({ onNavigate, currentUser, onUserUpdated }) => {
  const { t } = useTranslation();
  const [photoUrl, setPhotoUrl]             = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [finishing, setFinishing]           = useState(false);
  const [error, setError]                   = useState('');

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setPhotoUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotoUrl(res.data.urls?.[0] || '');
    } catch (err) {
      setError(t('register.photo_upload_failed'));
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleFinish = async () => {
    if (!photoUrl) { setError(t('register.photo_required_error')); return; }
    try {
      setFinishing(true);
      setError('');
      await api.patch(`/users/${currentUser?.id}`, { avatarUrl: photoUrl });
      onUserUpdated?.({ ...currentUser, avatarUrl: photoUrl });
      onNavigate('Home');
    } catch (err) {
      setError(err?.response?.data?.message || t('register.photo_upload_failed'));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4ff', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800;900&display=swap');
        .rb { width:100%; padding:14px; background:linear-gradient(135deg,#1d4ed8,#2563eb); color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:800; cursor:pointer; font-family:'Manrope',sans-serif; box-shadow:0 6px 18px rgba(37,99,235,0.4); }
        .rb:disabled { opacity:0.6; cursor:not-allowed; }
      `}</style>

      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px 16px' }}>
        <div style={{ backgroundColor:'#fff', borderRadius:20, padding:'32px 24px', width:'100%', maxWidth:400, boxShadow:'0 8px 40px rgba(37,99,235,0.12)' }}>

          <div style={{ textAlign:'center', marginBottom:24 }}>
            <h2 style={{ fontSize:20, fontWeight:900, color:'#0f172a', margin:'0 0 4px', fontFamily:'Manrope,sans-serif' }}>
              {t('register.add_photo_title')}
            </h2>
            <p style={{ fontSize:13, color:'#64748b', margin:0 }}>
              {t('register.add_photo_subtitle')}
            </p>
          </div>

          {error && (
            <div style={{ backgroundColor:'#fee2e2', color:'#dc2626', padding:'10px 14px', borderRadius:10, marginBottom:16, fontSize:13, display:'flex', justifyContent:'space-between' }}>
              <span>❌ {error}</span>
              <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontWeight:'bold' }}>×</button>
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {currentUser?.kentexaId && (
              <div style={{ textAlign:'center', backgroundColor:'#f0f9ff', borderRadius:12, padding:'10px 14px', border:'1px solid #bae6fd' }}>
                <div style={{ fontSize:11, color:'#0369a1', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>
                  {t('register.welcome_kentexa_id_label')}
                </div>
                <div style={{ fontSize:18, fontWeight:900, color:'#0369a1', letterSpacing:1 }}>{currentUser.kentexaId}</div>
              </div>
            )}
            <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', border:'2px dashed #93c5fd', borderRadius:16, padding:'28px 16px', backgroundColor:'#f8fafc' }}>
              {photoUrl ? (
                <img src={photoUrl} alt="" style={{ width:96, height:96, borderRadius:'50%', objectFit:'cover' }} />
              ) : (
                <div style={{ width:96, height:96, borderRadius:'50%', backgroundColor:'#e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>📷</div>
              )}
              <span style={{ fontSize:13, fontWeight:700, color:'#2563eb' }}>
                {photoUploading ? t('register.photo_uploading') : t('register.photo_upload_hint')}
              </span>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display:'none' }} disabled={photoUploading} />
            </label>
            <button className="rb" onClick={handleFinish} disabled={!photoUrl || photoUploading || finishing}>
              {finishing ? t('register.verifying') : t('register.photo_continue_button')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddProfilePhoto;
