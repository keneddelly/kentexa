import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer from '../components/Footer';
import api from '../../api/api';

const CITIES = [
  'Dar es Salaam','Mwanza','Arusha','Moshi','Dodoma','Mbeya','Tanga','Morogoro',
  'Kigoma','Tabora','Songea','Iringa','Zanzibar','Lindi','Mtwara','Shinyanga',
  'Singida','Musoma','Bukoba','Sumbawanga','Babati','Kibaha','Njombe','Kasulu',
  'Mpanda','Masasi','Korogwe','Geita','Bariadi','Chato','Sengerema',
];

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const BecomeSuperAgentInfo = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [step, setStep]                   = useState('info');  // 'info' | 'form' | 'done'
  const [existingProfile, setExistingProfile] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [form, setForm] = useState({
    businessName: '', city: '', address: '',
    phone: '', governmentId: '', governmentIdImage: '',
  });

  useEffect(() => {
    if (!isLoggedIn) { setCheckingStatus(false); return; }
    api.get('/super-agents/my-profile')
      .then(res => setExistingProfile(res.data))
      .catch(() => setExistingProfile(null))
      .finally(() => setCheckingStatus(false));
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.businessName.trim()) { setError('Weka jina la biashara'); return; }
    if (!form.city) { setError('Chagua mji wa kufanyia kazi'); return; }
    if (!form.phone.trim()) { setError('Weka namba ya simu'); return; }
    if (!form.address.trim()) { setError('Weka anwani ya biashara'); return; }
    if (!isLoggedIn) {
      localStorage.setItem('kentexa_after_login', 'BecomeSuperAgentInfo');
      onNavigate('PublicLogin');
      return;
    }
    try {
      setLoading(true); setError('');
      await api.post('/super-agents/apply', form);
      setStep('done');
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kutuma ombi');
    } finally { setLoading(false); }
  };

  const statusInfo = existingProfile ? {
    pending:   { icon: '⏳', color: '#f59e0b', title: 'Ombi Liko Chini ya Mapitio', desc: 'Tutalipigia kazi ndani ya saa 24–48. Utapata ujumbe ukithibitishwa.' },
    active:    { icon: '✅', color: '#16a34a', title: 'Umeidhinishwa kama Super Agent!', desc: `Msimbo wako: ${existingProfile.agentCode || '—'} · Mji: ${existingProfile.city}` },
    suspended: { icon: '🚫', color: '#dc2626', title: 'Akaunti Imesimamishwa', desc: existingProfile.rejectionReason || 'Wasiliana na KenteXa support.' },
    blocked:   { icon: '⛔', color: '#dc2626', title: 'Akaunti Imezuiwa', desc: existingProfile.rejectionReason || 'Wasiliana na KenteXa support.' },
  }[existingProfile.status] : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Navbar currentPage="BecomeSuperAgentInfo" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('Home')} title="Kuwa Super Agent" />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🏢</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>
          Kuwa Super Agent wa KenteXa
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
          Simamia vifurushi vya intercity na uongeze mapato yako
        </p>
      </div>

      <div style={{ padding: '16px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Show existing profile status */}
        {!checkingStatus && existingProfile && statusInfo && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{statusInfo.icon}</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>{statusInfo.title}</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>{statusInfo.desc}</p>
            {existingProfile.status === 'active' && (
              <button onClick={() => onNavigate('SuperAgentDashboard')}
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                📊 Nenda Dashibodini
              </button>
            )}
          </div>
        )}

        {/* Benefits */}
        {(!existingProfile || step === 'info') && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>💼 Kwa Nini Kuwa Super Agent?</h3>
            {[
              { icon: '💰', title: 'Mapato Imara', desc: 'Pata kamisheni kwa kila kifurushi unachoshughulikia — intercity na Dar es Salaam' },
              { icon: '🌍', title: 'Mtandao wa Tanzania Nzima', desc: 'Unganika na wauzaji na wanunuzi kutoka kote nchini kupitia KenteXa' },
              { icon: '📱', title: 'Mfumo Rahisi', desc: 'Dashibodi yako ya simu inaonyesha kila kitu — vifurushi, mapato, hali' },
              { icon: '🚀', title: 'Ukuaji wa Haraka', desc: 'KenteXa inakua — Super Agents wanaanzisha mapema watanufaika zaidi' },
              { icon: '🤝', title: 'Msaada Kamili', desc: 'Mafunzo, mwongozo, na msaada wa KenteXa team nyuma yako' },
            ].map(b => (
              <div key={b.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, flexShrink: 0, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {b.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{b.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{b.desc}</div>
                </div>
              </div>
            ))}

            {/* Earnings example */}
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 8 }}>📊 MFANO WA MAPATO</div>
              {[
                ['Vifurushi 50/mwezi @ TZS 5,000/kila kimoja', 'TZS 250,000'],
                ['Kamisheni ya 10%', 'TZS 25,000/mwezi'],
                ['Makusanyo ya mauzo ya nje (20 @ TZS 2,000)', 'TZS 40,000/mwezi'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#475569' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{v}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #bfdbfe', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 13 }}>
                <span style={{ color: '#1e293b' }}>Jumla ya Mwezi</span>
                <span style={{ color: '#16a34a' }}>TZS 65,000+</span>
              </div>
            </div>
          </div>
        )}

        {/* Requirements */}
        {(!existingProfile || step === 'info') && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>✅ Mahitaji</h3>
            {[
              'Eneo la kuhifadhia vifurushi (nyumba, ofisi, au duka)',
              'Simu ya mkononi (Android au iPhone)',
              'Kitambulisho cha serikali (NIDA, Pasipoti, au Leseni)',
              'Uwezo wa kupokea na kutuma vifurushi kila siku',
              'Akaunti ya KenteXa (bure — unda hapa hapa)',
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ color: '#16a34a', fontWeight: 800, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: '#475569' }}>{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Application form */}
        {step === 'done' ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 8px' }}>Ombi Limetumwa!</h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>
              Tutakipigia kazi ombi lako ndani ya saa 24. Utapata SMS na email ukithibitishwa.
            </p>
            <button onClick={() => onNavigate('Home')}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
              🏠 Rudi Nyumbani
            </button>
          </div>
        ) : !existingProfile ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>📝 Jaza Fomu ya Ombi</h3>

            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                ❌ {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>Jina la Biashara / Hub *</label>
                <input type="text" placeholder="e.g. Geita Express Hub"
                  value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })}
                  style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>Mji wa Kufanyia Kazi *</label>
                <select value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} style={inputStyle}>
                  <option value="">— Chagua Mji —</option>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Mji ambao utashughulikia vifurushi vingi — vifurushi vya mji huu vitakuwa chini yako
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>Anwani ya Hub / Biashara *</label>
                <textarea rows={2} placeholder="e.g. Mtaa wa Geita, karibu na soko kuu, jengo jekundu"
                  value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>Namba ya Simu * (255XXXXXXXXX)</label>
                <input type="tel" placeholder="255712345678"
                  value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>Namba ya Kitambulisho *</label>
                <input type="text" placeholder="NIDA / Pasipoti / Leseni"
                  value={form.governmentId} onChange={e => setForm({ ...form, governmentId: e.target.value })}
                  style={inputStyle} />
              </div>

              {!isLoggedIn && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                  💡 Unahitaji{' '}
                  <span onClick={() => { localStorage.setItem('kentexa_after_login', 'BecomeSuperAgentInfo'); onNavigate('PublicLogin'); }}
                    style={{ color: '#d97706', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}>
                    kuingia
                  </span>
                  {' '}kwanza ili kutuma ombi
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                style={{ width: '100%', background: loading ? '#64748b' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 12px rgba(29,78,216,0.3)' }}>
                {loading ? '⏳ Inatuma...' : '🚀 Wasilisha Ombi la Super Agent'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default BecomeSuperAgentInfo;