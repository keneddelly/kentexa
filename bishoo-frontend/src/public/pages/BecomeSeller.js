import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const BecomeSeller = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    businessName: '',
    businessDescription: '',
    address: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Pre-fill from profile — Kentexa already knows these once you're logged
  // in, no reason to make you retype them. businessName stays blank: it's a
  // new choice, not something Kentexa already has on file.
  React.useEffect(() => {
    if (!currentUser) return;
    setForm(prev => ({
      ...prev,
      phone:   prev.phone   || currentUser.phone            || '',
      address: prev.address || currentUser.businessLocation || currentUser.city || '',
    }));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.businessName) {
      setError(t('become_seller.business_name_required'));
      return;
    }
    if (!isLoggedIn) {
      localStorage.setItem('kentexa_after_login', 'BecomeSeller');
      onNavigate('PublicLogin');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await api.post('/seller/apply', form);
      setMessage(t('become_seller.apply_success'));
    } catch (err) {
      setError(err?.response?.data?.message || t('become_seller.apply_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <BackBar onBack={() => onNavigate('back')} title={t('become_seller.page_title')} top={0} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏪</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
          {t('become_seller.hero_title')}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
          {t('become_seller.hero_desc')}
        </div>
      </div>

      <div style={{ flex: 1, padding: '16px', maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 40 }}>

        {/* Benefits */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { icon: '📦', title: t('become_seller.benefit_list_title'), color: '#667eea' },
            { icon: '📋', title: t('become_seller.benefit_classifieds_title'), color: '#f093fb' },
            { icon: '💰', title: t('become_seller.benefit_earn_title'), color: '#43e97b' },
            { icon: '📊', title: t('become_seller.benefit_track_title'), color: '#f7971e' },
          ].map(benefit => (
            <div key={benefit.title} style={{
              backgroundColor: '#fff', borderRadius: 12, padding: 14,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              borderTop: `3px solid ${benefit.color}`,
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{benefit.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', lineHeight: 1.4 }}>
                {benefit.title}
              </div>
            </div>
          ))}
        </div>

        {/* Application Form */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginBottom: 16 }}>
            {t('become_seller.apply_title')}
          </div>

          {message && (
            <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 700 }}>
              ✅ {message}
            </div>
          )}
          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>❌ {error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: t('become_seller.field_business_name_label'), key: 'businessName', placeholder: t('become_seller.field_business_name_placeholder'), type: 'text' },
              { label: t('become_seller.field_phone_label'), key: 'phone', placeholder: t('become_seller.field_phone_placeholder'), type: 'tel' },
              { label: t('become_seller.field_address_label'), key: 'address', placeholder: t('become_seller.field_address_placeholder'), type: 'text' },
            ].map(field => (
              <div key={field.key}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={form[field.key]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  style={inputStyle}
                />
              </div>
            ))}

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>
                {t('become_seller.field_description_label')}
              </label>
              <textarea
                placeholder={t('become_seller.field_description_placeholder')}
                value={form.businessDescription}
                onChange={e => setForm({ ...form, businessDescription: e.target.value })}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', marginTop: 16,
              background: loading ? '#a5b4fc' : 'linear-gradient(135deg,#667eea,#764ba2)',
              color: '#fff', border: 'none',
              padding: 14, borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 15, fontWeight: 800,
              boxShadow: '0 4px 12px rgba(102,126,234,0.4)',
            }}
          >
            {loading ? t('become_seller.submitting') : t('become_seller.submit_button')}
          </button>

          {!isLoggedIn && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginTop: 14 }}>
              {t('become_seller.login_required_pre')}{' '}
              <span onClick={() => onNavigate('PublicLogin')} style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: 700 }}>
                {t('become_seller.login_required_link')}
              </span>
              {' '}{t('become_seller.login_required_post')}
            </p>
          )}
        </div>

        {/* How it works */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#1e293b', marginBottom: 16 }}>
            {t('become_seller.how_it_works_title')}
          </div>
          {[
            { step: '1', title: t('become_seller.step1_title'), desc: t('become_seller.step1_desc'), color: '#667eea' },
            { step: '2', title: t('become_seller.step2_title'), desc: t('become_seller.step2_desc'), color: '#f093fb' },
            { step: '3', title: t('become_seller.step3_title'), desc: t('become_seller.step3_desc'), color: '#43e97b' },
            { step: '4', title: t('become_seller.step4_title'), desc: t('become_seller.step4_desc'), color: '#f7971e' },
          ].map(item => (
            <div key={item.step} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 30, height: 30, flexShrink: 0, borderRadius: 9,
                background: `linear-gradient(135deg, ${item.color}, ${item.color}99)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 900, color: '#fff',
              }}>
                {item.step}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Already a seller */}
        {isLoggedIn && (
          <div style={{
            background: 'linear-gradient(135deg,#667eea,#764ba2)',
            borderRadius: 16, padding: 20, color: '#fff',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
              {t('become_seller.already_applied_title')}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 14, lineHeight: 1.5 }}>
              {t('become_seller.already_applied_desc')}
            </div>
            <button
              onClick={() => onNavigate('SellerDashboard')}
              style={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                color: '#fff', border: '2px solid rgba(255,255,255,0.4)',
                padding: '9px 18px', borderRadius: 10,
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
              }}
            >
              {t('become_seller.go_to_dashboard_button')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BecomeSeller;
