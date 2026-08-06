import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import api from '../../api/api';

const BecomeSeller = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    businessName: '',
    businessDescription: '',
    address: '',
    phone: '',
    idType: 'national_id',
    idNumber: '',
    idPhotoUrl: '',
    registrationNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploadingId, setUploadingId] = useState(false);
  const [idPreview, setIdPreview] = useState('');

  const handleIdPhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setIdPreview(reader.result);
    reader.readAsDataURL(file);
    try {
      setUploadingId(true);
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(f => ({ ...f, idPhotoUrl: res.data.urls[0] }));
    } catch {
      setError(t('become_seller.id_upload_failed'));
      setIdPreview('');
    } finally {
      setUploadingId(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.businessName) {
      setError(t('become_seller.business_name_required'));
      return;
    }
    if (!form.idNumber.trim() || !form.idPhotoUrl) {
      setError(t('become_seller.id_required'));
      return;
    }
    if (!isLoggedIn) {
      onNavigate('PublicLogin');
      return;
    }
    try {
      setLoading(true);
      await api.post('/seller/apply', form);
      setMessage(t('become_seller.apply_success'));
    } catch (err) {
      setError(err?.response?.data?.message || t('become_seller.apply_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Navbar currentPage="BecomeSeller" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        padding: '60px 32px',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '42px', fontWeight: '900', color: '#fff', margin: '0 0 12px' }}>
          {t('become_seller.hero_title')}
        </h1>
        <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.85)', marginBottom: '0' }}>
          {t('become_seller.hero_desc')}
        </p>
      </div>

      <div style={{ padding: '48px 32px', maxWidth: '1100px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Benefits */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '48px' }}>
          {[
            { icon: '📦', title: t('become_seller.benefit_list_title'), desc: t('become_seller.benefit_list_desc'), color: '#667eea' },
            { icon: '📋', title: t('become_seller.benefit_classifieds_title'), desc: t('become_seller.benefit_classifieds_desc'), color: '#f093fb' },
            { icon: '💰', title: t('become_seller.benefit_earn_title'), desc: t('become_seller.benefit_earn_desc'), color: '#43e97b' },
            { icon: '📊', title: t('become_seller.benefit_track_title'), desc: t('become_seller.benefit_track_desc'), color: '#f7971e' },
          ].map(benefit => (
            <div key={benefit.title} style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '24px',
              textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              borderTop: `4px solid ${benefit.color}`,
            }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>{benefit.icon}</div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', margin: '0 0 8px' }}>
                {benefit.title}
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: '1.5' }}>
                {benefit.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Application Form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>

          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b', margin: '0 0 24px' }}>
              {t('become_seller.apply_title')}
            </h2>

            {message && (
              <div style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: '#fff', padding: '14px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', fontWeight: '600' }}>
                ✅ {message}
              </div>
            )}
            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
                ❌ {error}
              </div>
            )}

            {[
              { label: t('become_seller.field_business_name_label'), key: 'businessName', placeholder: t('become_seller.field_business_name_placeholder'), type: 'text' },
              { label: t('become_seller.field_phone_label'), key: 'phone', placeholder: t('become_seller.field_phone_placeholder'), type: 'text' },
              { label: t('become_seller.field_address_label'), key: 'address', placeholder: t('become_seller.field_address_placeholder'), type: 'text' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={form[field.key]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  style={{
                    width: '100%', padding: '12px',
                    borderRadius: '8px', border: '2px solid #e2e8f0',
                    fontSize: '14px', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  onFocus={e => e.target.style.border = '2px solid #a78bfa'}
                  onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
                />
              </div>
            ))}

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                {t('become_seller.field_description_label')}
              </label>
              <textarea
                placeholder={t('become_seller.field_description_placeholder')}
                value={form.businessDescription}
                onChange={e => setForm({ ...form, businessDescription: e.target.value })}
                rows={4}
                style={{
                  width: '100%', padding: '12px',
                  borderRadius: '8px', border: '2px solid #e2e8f0',
                  fontSize: '14px', boxSizing: 'border-box',
                  resize: 'vertical', outline: 'none',
                }}
                onFocus={e => e.target.style.border = '2px solid #a78bfa'}
                onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
              />
            </div>

            {/* ── Identity verification (KYC) — required before approval ───── */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', margin: '0 0 4px' }}>
                🪪 {t('become_seller.id_section_title')}
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px' }}>
                {t('become_seller.id_section_desc')}
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                  {t('become_seller.field_id_type_label')}
                </label>
                <select
                  value={form.idType}
                  onChange={e => setForm({ ...form, idType: e.target.value })}
                  style={{
                    width: '100%', padding: '12px',
                    borderRadius: '8px', border: '2px solid #e2e8f0',
                    fontSize: '14px', boxSizing: 'border-box',
                    outline: 'none', backgroundColor: '#fff',
                  }}>
                  <option value="national_id">{t('become_seller.id_type_national_id')}</option>
                  <option value="voters_id">{t('become_seller.id_type_voters_id')}</option>
                  <option value="passport">{t('become_seller.id_type_passport')}</option>
                  <option value="driving_license">{t('become_seller.id_type_driving_license')}</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                  {t('become_seller.field_id_number_label')}
                </label>
                <input
                  type="text"
                  placeholder={t('become_seller.field_id_number_placeholder')}
                  value={form.idNumber}
                  onChange={e => setForm({ ...form, idNumber: e.target.value })}
                  style={{
                    width: '100%', padding: '12px',
                    borderRadius: '8px', border: '2px solid #e2e8f0',
                    fontSize: '14px', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  onFocus={e => e.target.style.border = '2px solid #a78bfa'}
                  onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                  {t('become_seller.field_id_photo_label')}
                </label>
                {idPreview && (
                  <img src={idPreview} alt="ID" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: '10px', marginBottom: '10px', border: '2px solid #e2e8f0' }} />
                )}
                <label style={{
                  display: 'block', textAlign: 'center', padding: '12px',
                  borderRadius: '8px', border: '2px dashed #cbd5e1',
                  fontSize: '13px', fontWeight: '700', color: '#64748b',
                  cursor: uploadingId ? 'wait' : 'pointer', backgroundColor: '#f8fafc',
                }}>
                  <input type="file" accept="image/*" onChange={handleIdPhotoUpload} disabled={uploadingId} style={{ display: 'none' }} />
                  {uploadingId ? `⏳ ${t('become_seller.uploading')}` : form.idPhotoUrl ? `✅ ${t('become_seller.id_photo_uploaded')}` : `📷 ${t('become_seller.id_photo_choose')}`}
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>
                  {t('become_seller.field_registration_number_label')}
                </label>
                <input
                  type="text"
                  placeholder={t('become_seller.field_registration_number_placeholder')}
                  value={form.registrationNumber}
                  onChange={e => setForm({ ...form, registrationNumber: e.target.value })}
                  style={{
                    width: '100%', padding: '12px',
                    borderRadius: '8px', border: '2px solid #e2e8f0',
                    fontSize: '14px', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  onFocus={e => e.target.style.border = '2px solid #a78bfa'}
                  onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff', border: 'none',
                padding: '14px', borderRadius: '10px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '15px', fontWeight: '800',
                boxShadow: '0 4px 12px rgba(102,126,234,0.4)',
              }}
            >
              {loading ? t('become_seller.submitting') : t('become_seller.submit_button')}
            </button>

            {!isLoggedIn && (
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', marginTop: '16px' }}>
                {t('become_seller.login_required_pre')}{' '}
                <span onClick={() => onNavigate('PublicLogin')} style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: '700' }}>
                  {t('become_seller.login_required_link')}
                </span>
                {' '}{t('become_seller.login_required_post')}
              </p>
            )}
          </div>

          {/* How it works */}
          <div>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', margin: '0 0 20px' }}>
                {t('become_seller.how_it_works_title')}
              </h3>
              {[
                { step: '1', title: t('become_seller.step1_title'), desc: t('become_seller.step1_desc'), color: '#667eea' },
                { step: '2', title: t('become_seller.step2_title'), desc: t('become_seller.step2_desc'), color: '#f093fb' },
                { step: '3', title: t('become_seller.step3_title'), desc: t('become_seller.step3_desc'), color: '#43e97b' },
                { step: '4', title: t('become_seller.step4_title'), desc: t('become_seller.step4_desc'), color: '#f7971e' },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '36px', height: '36px', flexShrink: 0,
                    borderRadius: '10px',
                    background: `linear-gradient(135deg, ${item.color}, ${item.color}99)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', fontWeight: '800', color: '#fff',
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{item.title}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Already a seller */}
            {isLoggedIn && (
              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '16px', padding: '24px', color: '#fff',
              }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '800' }}>
                  {t('become_seller.already_applied_title')}
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '13px', opacity: 0.85 }}>
                  {t('become_seller.already_applied_desc')}
                </p>
                <button
                  onClick={() => onNavigate('SellerDashboard')}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    color: '#fff', border: '2px solid rgba(255,255,255,0.4)',
                    padding: '10px 20px', borderRadius: '8px',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '700',
                  }}
                >
                  {t('become_seller.go_to_dashboard_button')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default BecomeSeller;