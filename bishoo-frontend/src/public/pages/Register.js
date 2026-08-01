import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import api from '../../api/api';

const Register = ({ onNavigate, onLoginSuccess }) => {
  const { t } = useTranslation();
  const [method, setMethod]   = useState('phone');
  const [step, setStep]       = useState(1);
  const [name, setName]       = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [otp, setOtp]               = useState('');
  const [loading, setLoading]       = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendTimer, setResendTimer]     = useState(0);
  const [error, setError]   = useState('');

  const startTimer = () => {
    setResendTimer(60);
    const iv = setInterval(() => {
      setResendTimer(p => { if (p <= 1) { clearInterval(iv); return 0; } return p - 1; });
    }, 1000);
  };

  // Auto-format phone
  const handlePhoneChange = (val) => {
    const digits = val.replace(/\D/g, '');
    if (val.startsWith('0')) {
      setIdentifier('255' + digits.slice(1));
    } else {
      setIdentifier(digits);
    }
  };

  const handleRegister = async () => {
    setError('');
    if (!name.trim() || name.trim().length < 2) { setError(t('register.name_required')); return; }
    if (!identifier.trim()) { setError(method === 'phone' ? t('register.phone_required') : t('register.email_required')); return; }
    if (!password || password.length < 6) { setError(t('register.password_min')); return; }
    if (method === 'email' && !identifier.includes('@')) { setError(t('register.invalid_email')); return; }

    try {
      setLoading(true);
      const endpoint = method === 'phone' ? '/auth/register/phone' : '/auth/register/email';
      const payload  = method === 'phone'
        ? { phone: identifier.trim(), password, name: name.trim() }
        : { email: identifier.trim(), password, name: name.trim() };

      await api.post(endpoint, payload);
      setStep(2);
      startTimer();
    } catch (err) {
      setError(err?.response?.data?.message || t('register.registration_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) { setError(t('register.enter_otp')); return; }
    try {
      setOtpLoading(true);
      setError('');
      const res = await api.post('/auth/verify-otp', { identifier: identifier.trim(), otp });
      localStorage.setItem('token', res.data.access_token);
      if (onLoginSuccess) onLoginSuccess('Home'); // navigates inside handleLoginSuccess
    } catch (err) {
      setError(err?.response?.data?.message || t('register.invalid_otp'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResendLoading(true);
      await api.post('/auth/resend-otp', { identifier: identifier.trim() });
      startTimer();
      setOtp('');
    } catch (err) {
      setError(err?.response?.data?.message || t('register.resend_failed'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4ff', display: 'flex', flexDirection: 'column' }}>
      <Navbar currentPage="Register" onNavigate={onNavigate} isLoggedIn={false} onLogout={() => {}} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800;900&display=swap');
        .ri { width:100%; padding:13px 14px; border-radius:10px; border:2px solid #e2e8f0; font-size:15px; outline:none; box-sizing:border-box; font-family:'Manrope',sans-serif; transition:border 0.2s; background:#fff; }
        .ri:focus { border-color:#2563eb; }
        .rb { width:100%; padding:14px; background:linear-gradient(135deg,#1d4ed8,#2563eb); color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:800; cursor:pointer; font-family:'Manrope',sans-serif; box-shadow:0 6px 18px rgba(37,99,235,0.4); }
        .rb:disabled { opacity:0.6; cursor:not-allowed; }
        .otp { width:100%; padding:18px 14px; border-radius:12px; border:2px solid #e2e8f0; font-size:28px; font-weight:900; letter-spacing:8px; text-align:center; outline:none; box-sizing:border-box; font-family:'Manrope',sans-serif; }
        .otp:focus { border-color:#2563eb; }
        .tab { flex:1; padding:10px; border:none; cursor:pointer; font-size:14px; font-weight:700; border-radius:8px; font-family:'Manrope',sans-serif; transition:all 0.2s; }
      `}</style>

      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px 16px' }}>
        <div style={{ backgroundColor:'#fff', borderRadius:20, padding:'32px 24px', width:'100%', maxWidth:400, boxShadow:'0 8px 40px rgba(37,99,235,0.12)' }}>

          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'center', gap:0, marginBottom:6 }}>
              <span style={{ fontSize:28, fontWeight:900, fontFamily:'Manrope,sans-serif', background:'linear-gradient(135deg,#1e40af,#2563eb)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>K</span>
              <span style={{ fontSize:28, fontWeight:900, fontFamily:'Manrope,sans-serif', color:'#0f172a' }}>ente</span>
              <span style={{ fontSize:28, fontWeight:900, fontFamily:'Manrope,sans-serif', background:'linear-gradient(135deg,#1e40af,#2563eb)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>X</span>
              <span style={{ fontSize:28, fontWeight:900, fontFamily:'Manrope,sans-serif', color:'#0f172a' }}>a</span>
            </div>
            <h2 style={{ fontSize:20, fontWeight:900, color:'#0f172a', margin:'0 0 4px', fontFamily:'Manrope,sans-serif' }}>
              {step === 1 ? t('register.create_account_title') : t('register.verify_title', { method: method === 'phone' ? t('register.method_phone') : t('register.method_email') })}
            </h2>
            <p style={{ fontSize:13, color:'#64748b', margin:0 }}>
              {step === 1 ? t('register.subtitle_create') : t('register.subtitle_code_sent', { identifier })}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{ backgroundColor:'#fee2e2', color:'#dc2626', padding:'10px 14px', borderRadius:10, marginBottom:16, fontSize:13, display:'flex', justifyContent:'space-between' }}>
              <span>❌ {error}</span>
              <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontWeight:'bold' }}>×</button>
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Full Name — required */}
              <div>
                <label style={{ display:'block', fontSize:12, color:'#64748b', marginBottom:5, fontWeight:700 }}>
                  {t('register.full_name_label')}
                </label>
                <input className="ri" placeholder={t('register.full_name_placeholder')} type="text"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>

              {/* Method tabs */}
              <div style={{ display:'flex', gap:4, backgroundColor:'#f1f5f9', borderRadius:10, padding:4 }}>
                <button className="tab" onClick={() => { setMethod('phone'); setIdentifier(''); setError(''); }}
                  style={{ backgroundColor: method==='phone' ? '#2563eb' : 'transparent', color: method==='phone' ? '#fff' : '#64748b' }}>
                  {t('register.tab_phone')}
                </button>
                <button className="tab" onClick={() => { setMethod('email'); setIdentifier(''); setError(''); }}
                  style={{ backgroundColor: method==='email' ? '#2563eb' : 'transparent', color: method==='email' ? '#fff' : '#64748b' }}>
                  {t('register.tab_email')}
                </button>
              </div>

              {/* Phone or Email */}
              {method === 'phone' ? (
                <div>
                  <label style={{ display:'block', fontSize:12, color:'#64748b', marginBottom:5, fontWeight:700 }}>
                    {t('register.phone_label')} <span style={{ color:'#94a3b8', fontWeight:400 }}>{t('register.otp_sent_here')}</span>
                  </label>
                  <input className="ri" placeholder={t('register.phone_placeholder')} type="tel"
                    value={identifier} onChange={e => handlePhoneChange(e.target.value)} />
                  {identifier.startsWith('255') && (
                    <div style={{ fontSize:11, color:'#16a34a', marginTop:4, fontWeight:700 }}>✅ +{identifier}</div>
                  )}
                </div>
              ) : (
                <div>
                  <label style={{ display:'block', fontSize:12, color:'#64748b', marginBottom:5, fontWeight:700 }}>
                    {t('register.email_label')} <span style={{ color:'#94a3b8', fontWeight:400 }}>{t('register.otp_sent_here')}</span>
                  </label>
                  <input className="ri" placeholder={t('register.email_placeholder')} type="email"
                    value={identifier} onChange={e => setIdentifier(e.target.value)} />
                </div>
              )}

              {/* Password */}
              <div>
                <label style={{ display:'block', fontSize:12, color:'#64748b', marginBottom:5, fontWeight:700 }}>{t('register.password_label')}</label>
                <input className="ri" placeholder={t('register.password_placeholder')} type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRegister()} />
              </div>

              <button className="rb" onClick={handleRegister} disabled={loading}>
                {loading ? t('register.creating') : t('register.register_button', { icon: method === 'phone' ? '📱' : '📧' })}
              </button>

              <div style={{ textAlign:'center', fontSize:13, color:'#64748b' }}>
                {t('register.already_have_account')}{' '}
                <span onClick={() => onNavigate('PublicLogin')} style={{ color:'#2563eb', fontWeight:700, cursor:'pointer' }}>{t('register.login_link')}</span>
              </div>
            </div>
          )}

          {/* STEP 2 — OTP */}
          {step === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:48, marginBottom:8 }}>{method === 'phone' ? '📱' : '📧'}</div>
                <div style={{ backgroundColor:'#f0f9ff', borderRadius:12, padding:'10px 14px', border:'1px solid #bae6fd', fontSize:12, color:'#0369a1', fontWeight:600 }}>
                  {t('register.code_sent_via', { channel: method === 'phone' ? t('register.sms_channel') : t('register.email_channel'), location: method === 'phone' ? t('register.messages_location') : t('register.inbox_location') })}
                </div>
              </div>

              <input className="otp" placeholder="000000" value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                maxLength={6} type="tel" />

              <button className="rb" onClick={handleVerify} disabled={otpLoading || otp.length !== 6}>
                {otpLoading ? t('register.verifying') : t('register.verify_button')}
              </button>

              <div style={{ textAlign:'center' }}>
                {resendTimer > 0
                  ? <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>{t('register.resend_in')} <strong style={{ color:'#2563eb' }}>{t('register.resend_seconds', { seconds: resendTimer })}</strong></p>
                  : <button onClick={handleResend} disabled={resendLoading}
                      style={{ background:'none', border:'none', color:'#2563eb', fontWeight:700, cursor:'pointer', fontSize:13 }}>
                      {resendLoading ? t('register.sending') : t('register.resend_otp')}
                    </button>
                }
              </div>

              <button onClick={() => { setStep(1); setOtp(''); setError(''); }}
                style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:13 }}>
                {t('register.change_button', { method: method === 'phone' ? t('register.method_phone') : t('register.method_email') })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;