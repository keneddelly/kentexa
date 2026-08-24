/**
 * VerifyIdentityModal.js — the spec's "Verify Your Identity to Sell on
 * Kentexa" flow (Level 1). Shown inline over whatever the user was doing
 * (e.g. posting a classified) when a 403 VERIFICATION_REQUIRED comes back
 * — never a separate page, so the caller's in-progress form/state is never
 * lost. On success, calls onVerified() so the caller can retry its own
 * action; this does NOT wait for admin approval — submitting unlocks
 * immediately (see VerificationService.getLevel(), PENDING already counts
 * as Level 1), admin review is a background trust check.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const overlayStyle = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000,
};
const sheetStyle = {
  backgroundColor: '#fff', borderRadius: '16px 16px 0 0', width: '100%',
  maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', padding: '20px 20px 28px',
  boxSizing: 'border-box',
};
const labelStyle = { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none' };

const VerifyIdentityModal = ({ onClose, onVerified }) => {
  const { t } = useTranslation();
  const [legalName, setLegalName]   = useState('');
  const [dateOfBirth, setDob]       = useState('');
  const [nidaNumber, setNida]       = useState('');
  const [idPhoto, setIdPhoto]       = useState(null);
  const [idPhotoPreview, setPreview] = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);
    try {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setIdPhoto(res.data.urls[0]);
    } catch { setError(t('verify_identity.photo_upload_failed')); }
    finally { setUploading(false); }
  };

  const handleSubmit = async () => {
    if (!legalName.trim() || !dateOfBirth || !nidaNumber.trim() || !idPhoto) {
      setError(t('verify_identity.all_fields_required'));
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await api.post('/identity/submit', {
        legalName: legalName.trim(),
        dateOfBirth,
        nidaNumber: nidaNumber.trim(),
        idDocumentImageUrl: idPhoto,
      });
      onVerified();
    } catch (err) {
      setError(err?.response?.data?.message || t('verify_identity.submit_failed'));
    } finally { setSubmitting(false); }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', margin: 0 }}>
            {t('verify_identity.title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 16px', lineHeight: 1.5 }}>
          {t('verify_identity.subtitle')}
        </p>

        {/* Progress checklist — spec section 5/12 */}
        <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 12.5 }}>
          <div style={{ color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>✓ {t('verify_identity.step_account')}</div>
          <div style={{ color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>✓ {t('verify_identity.step_phone')}</div>
          <div style={{ color: '#0f172a', fontWeight: 700 }}>○ {t('verify_identity.step_identity')}</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('verify_identity.legal_name_label')}</label>
          <input type="text" value={legalName} onChange={e => setLegalName(e.target.value)}
            placeholder={t('verify_identity.legal_name_placeholder')} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('verify_identity.dob_label')}</label>
          <input type="date" value={dateOfBirth} onChange={e => setDob(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('verify_identity.nida_label')}</label>
          <input type="text" value={nidaNumber} onChange={e => setNida(e.target.value)}
            placeholder={t('verify_identity.nida_placeholder')} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>{t('verify_identity.photo_label')}</label>
          {idPhotoPreview && (
            <img src={idPhotoPreview} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 8, display: 'block' }} />
          )}
          <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} id="idPhotoInput" />
          <label htmlFor="idPhotoInput" style={{ display: 'inline-block', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
            {uploading ? t('verify_identity.uploading') : idPhoto ? t('verify_identity.photo_change') : t('verify_identity.photo_choose')}
          </label>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting || uploading}
          style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff',
            border: 'none', padding: '13px 0', borderRadius: 10, cursor: submitting ? 'wait' : 'pointer',
            fontSize: 14, fontWeight: 800, opacity: submitting || uploading ? 0.7 : 1 }}>
          {submitting ? t('verify_identity.submitting') : t('verify_identity.submit_button')}
        </button>
        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 10 }}>
          {t('verify_identity.privacy_note')}
        </p>
      </div>
    </div>
  );
};

export default VerifyIdentityModal;
