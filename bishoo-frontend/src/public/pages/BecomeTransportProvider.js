/**
 * BecomeTransportProvider.js — Self-service provider registration
 * Place at: src/public/pages/BecomeTransportProvider.js
 * Route: 'BecomeTransportProvider'
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar  from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer  from '../components/Footer';
import api     from '../../api/api';

const getProviderTypes = (t) => [
  { value: 'bus',     icon: '🚌', label: t('become_transport_provider.type_bus_label'),   desc: t('become_transport_provider.type_bus_desc') },
  { value: 'van',     icon: '🚐', label: t('become_transport_provider.type_van_label'),   desc: t('become_transport_provider.type_van_desc') },
  { value: 'courier', icon: '📦', label: t('become_transport_provider.type_courier_label'),    desc: t('become_transport_provider.type_courier_desc') },
  { value: 'truck',   icon: '🚛', label: t('become_transport_provider.type_truck_label'),       desc: t('become_transport_provider.type_truck_desc') },
  { value: 'boda',    icon: '🏍️', label: t('become_transport_provider.type_boda_label'), desc: t('become_transport_provider.type_boda_desc') },
  { value: 'boat',    icon: '⛵',   label: t('become_transport_provider.type_boat_label'),          desc: t('become_transport_provider.type_boat_desc') },
];

const inp = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};

const BecomeTransportProvider = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole }) => {
  const { t } = useTranslation();
  const PROVIDER_TYPES = getProviderTypes(t);
  const [step,   setStep]   = useState(1); // 1=type, 2=details, 3=success
  const [form,   setForm]   = useState({
    type: '', name: '', contactPhone: '', whatsappPhone: '',
    contactEmail: '', registrationNumber: '', description: '',
    defaultParcelCapacity: '20', defaultMaxWeightKg: '200',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Pre-fill from profile — don't make them re-type what's already known.
  useEffect(() => {
    if (!currentUser) return;
    setForm(prev => ({
      ...prev,
      name:          prev.name          || currentUser.name          || '',
      contactPhone:  prev.contactPhone  || currentUser.phone          || '',
      contactEmail:  prev.contactEmail  || currentUser.email          || '',
      whatsappPhone: prev.whatsappPhone || currentUser.storeWhatsApp  || '',
    }));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.name.trim())         return setError(t('become_transport_provider.name_required'));
    if (!form.contactPhone.trim()) return setError(t('become_transport_provider.phone_required'));
    try {
      setSaving(true); setError('');
      await api.post('/transport/register', {
        ...form,
        defaultParcelCapacity: Number(form.defaultParcelCapacity),
        defaultMaxWeightKg:    Number(form.defaultMaxWeightKg),
      });
      setStep(3);
    } catch (e) {
      setError(e.response?.data?.message || t('become_transport_provider.submit_failed'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="BecomeTransportProvider" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => step > 1 ? setStep(s => s - 1) : onNavigate('back')}
        title={t('become_transport_provider.page_title')} />

      <div style={{ flex: 1, padding: '16px 16px 40px', maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {[1, 2].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 100,
              backgroundColor: step >= s ? '#1d4ed8' : '#e2e8f0',
              transition: 'background 0.3s' }} />
          ))}
        </div>

        {/* Step 1: Choose type */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 6 }}>
              {t('become_transport_provider.step1_title')}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
              {t('become_transport_provider.step1_subtitle')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PROVIDER_TYPES.map(pt => (
                <button key={pt.value} onClick={() => { set('type', pt.value); setStep(2); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16,
                    backgroundColor: '#fff', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                    border: '2px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    transition: 'border 0.15s' }}>
                  <span style={{ fontSize: 36, flexShrink: 0 }}>{pt.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{pt.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{pt.desc}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 18, color: '#94a3b8' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 32 }}>
                {PROVIDER_TYPES.find(t => t.value === form.type)?.icon}
              </span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#1e293b' }}>{t('become_transport_provider.step2_title')}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {PROVIDER_TYPES.find(pt => pt.value === form.type)?.label}
                </div>
              </div>
            </div>

            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 10,
                padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                {t('become_transport_provider.field_name_label')}
              </label>
              <input style={inp} value={form.name}
                placeholder={form.type === 'boda' ? t('become_transport_provider.field_name_placeholder_boda') : t('become_transport_provider.field_name_placeholder_default')}
                onChange={e => set('name', e.target.value)} />
            </div>

            {/* Phone */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  {t('become_transport_provider.field_contact_phone_label')}
                </label>
                <input style={inp} value={form.contactPhone} type="tel"
                  placeholder="0788 000 000"
                  onChange={e => set('contactPhone', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  {t('become_transport_provider.field_whatsapp_label')}
                </label>
                <input style={inp} value={form.whatsappPhone} type="tel"
                  placeholder="0788 000 000"
                  onChange={e => set('whatsappPhone', e.target.value)} />
              </div>
            </div>

            {/* Registration number */}
            {['bus', 'courier', 'truck'].includes(form.type) && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  {t('become_transport_provider.field_registration_label')}
                </label>
                <input style={inp} value={form.registrationNumber}
                  placeholder="e.g. SUMATRA/BUS/2024/001"
                  onChange={e => set('registrationNumber', e.target.value)} />
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                {t('become_transport_provider.field_description_label')}
              </label>
              <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }}
                value={form.description}
                placeholder={
                  form.type === 'bus'    ? t('become_transport_provider.desc_placeholder_bus') :
                  form.type === 'van'    ? t('become_transport_provider.desc_placeholder_van') :
                  form.type === 'boda'   ? t('become_transport_provider.desc_placeholder_boda') :
                  t('become_transport_provider.desc_placeholder_default')
                }
                onChange={e => set('description', e.target.value)} />
            </div>

            {/* Capacity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  {t('become_transport_provider.field_capacity_label')}
                </label>
                <input style={inp} type="number" value={form.defaultParcelCapacity}
                  onChange={e => set('defaultParcelCapacity', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  {t('become_transport_provider.field_max_weight_label')}
                </label>
                <input style={inp} type="number" value={form.defaultMaxWeightKg}
                  onChange={e => set('defaultMaxWeightKg', e.target.value)} />
              </div>
            </div>

            {/* Note about verification */}
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 20,
              border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>
                {t('become_transport_provider.verification_note_title')}
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {t('become_transport_provider.verification_note_desc')}
              </div>
            </div>

            <button onClick={handleSubmit} disabled={saving}
              style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0',
                fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? t('become_transport_provider.submitting_button') : t('become_transport_provider.submit_button')}
            </button>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
              {t('become_transport_provider.success_title')}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 32, lineHeight: 1.6 }}>
              {t('become_transport_provider.success_desc').split('\n').map((line, i, arr) => (
                <React.Fragment key={i}>{line}{i < arr.length - 1 && <br />}</React.Fragment>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => onNavigate('TransportProviderDashboard')}
                style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                  borderRadius: 12, padding: '14px 0', fontSize: 14, fontWeight: 800,
                  cursor: 'pointer' }}>
                {t('become_transport_provider.go_dashboard_button')}
              </button>
              <button onClick={() => onNavigate('Home')}
                style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none',
                  borderRadius: 12, padding: '14px 0', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer' }}>
                {t('become_transport_provider.back_home_button')}
              </button>
            </div>
          </div>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default BecomeTransportProvider;