import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const BecomeAgent = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole }) => {
  const [agentLocation, setAgentLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [form, setForm] = useState({
    fullName: '', phone: '', address: '', city: '', region: '',
    district: '', idNumber: '', idType: 'National ID',
    agentType: 'boda', maxWeightKg: '20', vehicleDescription: '',
  });
  const [loading, setLoading]               = useState(false);
  const [message, setMessage]               = useState('');
  const [error, setError]                   = useState('');
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [existingProfile, setExistingProfile] = useState(null);

  const CITIES = [
    'Dar es Salaam','Mwanza','Arusha','Moshi','Dodoma','Mbeya','Tanga','Morogoro',
    'Kigoma','Tabora','Songea','Iringa','Zanzibar','Lindi','Mtwara','Shinyanga',
    'Singida','Musoma','Bukoba','Sumbawanga','Babati','Kibaha','Njombe','Kasulu',
    'Mpanda','Masasi','Korogwe','Geita','Bariadi','Chato','Sengerema',
  ];

  const regions = [
    'Dar es Salaam','Mwanza','Arusha','Dodoma','Mbeya','Morogoro','Tanga',
    'Zanzibar','Kilimanjaro','Kigoma','Shinyanga','Kagera','Tabora','Lindi',
    'Mtwara','Ruvuma','Singida','Iringa','Mara','Pwani','Rukwa','Geita',
  ];

  const idTypes = ['National ID','Passport','Driving License','Voter ID'];

  // Pre-fill from profile
  React.useEffect(() => {
    if (!currentUser) return;
    setForm && setForm(prev => ({
      ...prev,
      fullName: prev.fullName || currentUser.name  || '',
      phone:    prev.phone    || currentUser.phone || '',
    }));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoggedIn) { setCheckingStatus(false); return; }
    api.get('/agents/my-profile')
      .then(res => setExistingProfile(res.data))
      .catch(() => setExistingProfile(null))
      .finally(() => setCheckingStatus(false));
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.fullName || !form.phone) { setError('Full name and phone are required'); return; }
    if (!isLoggedIn) { localStorage.setItem('kentexa_after_login', 'BecomeAgent'); onNavigate('PublicLogin'); return; }
    try {
      setLoading(true); setError('');
      await api.post('/agents/register', form);
      setMessage('Application submitted! Redirecting to your dashboard...');
      setTimeout(() => onNavigate('AgentDashboard'), 1500);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to submit application');
    } finally { setLoading(false); }
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '2px solid #e2e8f0', fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Navbar currentPage="BecomeAgent" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title="Become an Agent" />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#f7971e,#ffd200)', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🤝</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1e293b', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>Kuwa Wakala wa KenteXa</h1>
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.7)', margin: 0 }}>Pata kamisheni kwa kusaidia wateja kulipa</p>
      </div>

      {/* Commission tiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '16px 16px 0', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {[
          { tier: 'BASIC',  icon: '🥉', commission: '2.5%', transactions: '0–50',   color: '#64748b', bg: '#f1f5f9' },
          { tier: 'SILVER', icon: '🥈', commission: '3.5%', transactions: '51–200',  color: '#475569', bg: '#e2e8f0' },
          { tier: 'GOLD',   icon: '🥇', commission: '5.0%', transactions: '200+',    color: '#d97706', bg: '#fef9c3' },
        ].map(t => (
          <div key={t.tier} style={{ backgroundColor: t.bg, borderRadius: 12, padding: '14px 8px', textAlign: 'center', border: `2px solid ${t.color}40` }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{t.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: t.color }}>{t.tier}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>{t.commission}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{t.transactions} orders</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Benefits */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '18px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>💰 Faida za Kuwa Wakala</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '💵', title: 'Pata Kamisheni', desc: '2.5% - 5% kwa kila malipo unayoshughulikia' },
              { icon: '📱', title: 'Pokea Pesa Yoyote', desc: 'M-Pesa, Airtel Money, Tigo Pesa, cash' },
              { icon: '📊', title: 'Fuatilia Mapato', desc: 'Dashibodi ya wakati halisi na takwimu zako' },
              { icon: '🏆', title: 'Panda Ngazi', desc: 'Pata zaidi unaposhughulikia miamala zaidi' },
              { icon: '🎯', title: 'Uhuru wa Muda', desc: 'Fanya kazi wakati wowote, mahali popote Tanzania' },
            ].map(b => (
              <div key={b.title} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 36, height: 36, flexShrink: 0, background: 'linear-gradient(135deg,#f7971e,#ffd200)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                  {b.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Application form / status */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>

          {checkingStatus ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>⏳ Inaangalia hali ya ombi...</div>

          ) : existingProfile && existingProfile.status !== 'rejected' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>
                {existingProfile.status === 'approved' ? '✅' : existingProfile.status === 'suspended' ? '🚫' : '⏳'}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>
                {existingProfile.status === 'approved'  && 'Umeidhinishwa kama Wakala!'}
                {existingProfile.status === 'pending'   && 'Ombi lako liko chini ya mapitio'}
                {existingProfile.status === 'suspended' && 'Akaunti yako imesimamishwa'}
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
                {existingProfile.status === 'approved'  && `Nambari ya Wakala: ${existingProfile.agentCode || '—'}`}
                {existingProfile.status === 'pending'   && 'Tutalifanyia kazi ndani ya saa 24.'}
                {existingProfile.status === 'suspended' && (existingProfile.rejectionReason || 'Wasiliana na KenteXa support.')}
              </p>
              <button onClick={() => onNavigate('AgentDashboard')}
                style={{ background: 'linear-gradient(135deg,#f7971e,#ffd200)', color: '#1e293b', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                📊 Nenda Dashibodini
              </button>
            </div>

          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>📝 Jaza Fomu ya Ombi</h2>

              {existingProfile?.status === 'rejected' && (
                <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                  ❌ Ombi lako la awali lilikataliwa{existingProfile.rejectionReason ? `: ${existingProfile.rejectionReason}` : '.'} Unaweza kuomba tena hapa chini.
                </div>
              )}

              {message && (
                <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
                  ✅ {message}
                </div>
              )}
              {error && (
                <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>❌ {error}</span>
                  <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Jina Kamili *', key: 'fullName', placeholder: 'e.g. John Msomi', type: 'text' },
                  { label: 'Nambari ya Simu * (255XXXXXXXXX)', key: 'phone', placeholder: '255712345678', type: 'tel' },
                  { label: 'Anwani', key: 'address', placeholder: 'Mtaa, Eneo', type: 'text' },
                  { label: 'Wilaya', key: 'district', placeholder: 'e.g. Kinondoni', type: 'text' },
                  { label: 'Nambari ya Kitambulisho', key: 'idNumber', placeholder: 'NIDA / Pasipoti', type: 'text' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>{field.label}</label>
                    <input type={field.type} placeholder={field.placeholder}
                      value={form[field.key]} onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                      style={inputStyle} />
                  </div>
                ))}

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>Mji Unaofanya Kazi *</label>
                  <LocationPicker
                label="Eneo Lako (Mkoa / Wilaya / Kata) *"
                value={agentLocation}
                onChange={loc => {
                  setAgentLocation(loc);
                  setForm(f => ({
                    ...f,
                    city:     loc.districtName || loc.regionName || '',
                    region:   loc.regionName || '',
                    district: loc.districtName || '',
                    ward:     loc.wardName || '',
                    regionId:   loc.regionId || null,
                    districtId: loc.districtId || null,
                    wardId:     loc.wardId || null,
                  }));
                }}
                required
              />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Mji unaofanya kazi — hapa ndipo utakapopewa maagizo ya kuchukua na kuwasilisha
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>Mkoa</label>
                  <select value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} style={inputStyle}>
                    <option value="">Chagua Mkoa</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>Aina ya Kitambulisho</label>
                  <select value={form.idType} onChange={e => setForm({ ...form, idType: e.target.value })} style={inputStyle}>
                    {idTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <button onClick={handleSubmit} disabled={loading}
                  style={{ width: '100%', background: loading ? '#fcd34d' : 'linear-gradient(135deg,#f7971e,#ffd200)', color: '#1e293b', border: 'none', padding: 14, borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 12px rgba(247,151,30,0.3)', marginTop: 4 }}>
                  {loading ? '⏳ Inatuma...' : '🚀 Wasilisha Ombi'}
                </button>

                {!isLoggedIn && (
                  <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', margin: 0 }}>
                    Unahitaji{' '}
                    <span onClick={() => { localStorage.setItem('kentexa_after_login', 'BecomeAgent'); onNavigate('PublicLogin'); }}
                      style={{ color: '#f59e0b', cursor: 'pointer', fontWeight: 700 }}>kuingia</span>
                    {' '}kwanza
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default BecomeAgent;