/**
 * BecomeTransportProvider.js — Self-service provider registration
 * Place at: src/public/pages/BecomeTransportProvider.js
 * Route: 'BecomeTransportProvider'
 */
import React, { useState } from 'react';
import Navbar  from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer  from '../components/Footer';
import api     from '../../api/api';

const PROVIDER_TYPES = [
  { value: 'bus',     icon: '🚌', label: 'Kampuni ya Basi',   desc: 'Safari za miji — Dar, Mbeya, Mwanza, n.k.' },
  { value: 'van',     icon: '🚐', label: 'Van / Gari Dogo',   desc: 'Safari za ndani ya mji au kati ya miji' },
  { value: 'courier', icon: '📦', label: 'Courier Company',    desc: 'DHL, EMS, Fast Express, n.k.' },
  { value: 'truck',   icon: '🚛', label: 'Lori / Truck',       desc: 'Mizigo mizito na volumetric' },
  { value: 'boda',    icon: '🏍️', label: 'Boda Boda / Pikipiki', desc: 'Utoaji wa mwisho ndani ya mji' },
  { value: 'boat',    icon: '⛵',   label: 'Meli / Boti',          desc: 'Ziwa Victoria, Tanganyika, Zanzibar na pwani' },
];

const inp = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};

const BecomeTransportProvider = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [step,   setStep]   = useState(1); // 1=type, 2=details, 3=success
  const [form,   setForm]   = useState({
    type: '', name: '', contactPhone: '', whatsappPhone: '',
    contactEmail: '', registrationNumber: '', description: '',
    defaultParcelCapacity: '20', defaultMaxWeightKg: '200',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim())         return setError('Jina la kampuni linahitajika');
    if (!form.contactPhone.trim()) return setError('Nambari ya simu inahitajika');
    try {
      setSaving(true); setError('');
      await api.post('/transport/register', {
        ...form,
        defaultParcelCapacity: Number(form.defaultParcelCapacity),
        defaultMaxWeightKg:    Number(form.defaultMaxWeightKg),
      });
      setStep(3);
    } catch (e) {
      setError(e.response?.data?.message || 'Imeshindwa. Jaribu tena.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="BecomeTransportProvider" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => step > 1 ? setStep(s => s - 1) : onNavigate('back')}
        title="🚌 Jiunge kama Msafirishaji" />

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
              Una aina gani ya usafirishaji?
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
              Chagua aina inayokuhusu zaidi
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PROVIDER_TYPES.map(t => (
                <button key={t.value} onClick={() => { set('type', t.value); setStep(2); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16,
                    backgroundColor: '#fff', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                    border: '2px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    transition: 'border 0.15s' }}>
                  <span style={{ fontSize: 36, flexShrink: 0 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{t.desc}</div>
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
                <div style={{ fontSize: 18, fontWeight: 900, color: '#1e293b' }}>Maelezo ya Kampuni</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {PROVIDER_TYPES.find(t => t.value === form.type)?.label}
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
                Jina la Kampuni / Mtu *
              </label>
              <input style={inp} value={form.name}
                placeholder={form.type === 'boda' ? 'e.g. Juma John' : 'e.g. ABC Bus Company'}
                onChange={e => set('name', e.target.value)} />
            </div>

            {/* Phone */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Simu ya Mawasiliano *
                </label>
                <input style={inp} value={form.contactPhone} type="tel"
                  placeholder="0788 000 000"
                  onChange={e => set('contactPhone', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  WhatsApp
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
                  Nambari ya Usajili (SUMATRA / TRA)
                </label>
                <input style={inp} value={form.registrationNumber}
                  placeholder="e.g. SUMATRA/BUS/2024/001"
                  onChange={e => set('registrationNumber', e.target.value)} />
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Maelezo Mafupi
              </label>
              <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }}
                value={form.description}
                placeholder={
                  form.type === 'bus'    ? 'e.g. Tunasafirisha kila siku Dar-Mbeya, Dar-Mwanza...' :
                  form.type === 'van'    ? 'e.g. Van yangu inafanya safari Kariakoo→Mbagala kila siku...' :
                  form.type === 'boda'   ? 'e.g. Ninafanya utoaji katika Bunju, Tegeta, Mbezi...' :
                  'Eleza huduma zako...'
                }
                onChange={e => set('description', e.target.value)} />
            </div>

            {/* Capacity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Idadi ya Vifurushi (Kawaida)
                </label>
                <input style={inp} type="number" value={form.defaultParcelCapacity}
                  onChange={e => set('defaultParcelCapacity', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  Uzito Max (kg)
                </label>
                <input style={inp} type="number" value={form.defaultMaxWeightKg}
                  onChange={e => set('defaultMaxWeightKg', e.target.value)} />
              </div>
            </div>

            {/* Note about verification */}
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 20,
              border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>
                ℹ️ Baada ya Usajili
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                Akaunti yako itakaguliwa na timu ya KenteXa. Utaarifiwa ndani ya saa 24.
                Baada ya kukaguliwa, utaonekana kwa Super Agents wote nchini Tanzania.
              </div>
            </div>

            <button onClick={handleSubmit} disabled={saving}
              style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0',
                fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? '⏳ Inatuma...' : '🚀 Wasilisha Ombi'}
            </button>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
              Ombi Limewasilishwa!
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 32, lineHeight: 1.6 }}>
              Akaunti yako itakaguliwa na timu ya KenteXa.<br />
              Utapata ujumbe wa SMS na WhatsApp ukithibitishiwa.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => onNavigate('TransportProviderDashboard')}
                style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                  borderRadius: 12, padding: '14px 0', fontSize: 14, fontWeight: 800,
                  cursor: 'pointer' }}>
                📊 Nenda Dashibodini
              </button>
              <button onClick={() => onNavigate('Home')}
                style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none',
                  borderRadius: 12, padding: '14px 0', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer' }}>
                Rudi Nyumbani
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