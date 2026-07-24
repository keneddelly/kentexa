import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import api from '../../api/api';

const Register = ({ onNavigate, onLoginSuccess }) => {
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
    if (!name.trim() || name.trim().length < 2) { setError('Please enter your full name'); return; }
    if (!identifier.trim()) { setError(method === 'phone' ? 'Phone number is required' : 'Email is required'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (method === 'email' && !identifier.includes('@')) { setError('Enter a valid email'); return; }

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
      setError(err?.response?.data?.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    try {
      setOtpLoading(true);
      setError('');
      const res = await api.post('/auth/verify-otp', { identifier: identifier.trim(), otp });
      localStorage.setItem('token', res.data.access_token);
      if (onLoginSuccess) onLoginSuccess('Home'); // navigates inside handleLoginSuccess
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid OTP');
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
      setError(err?.response?.data?.message || 'Failed to resend');
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
              {step === 1 ? 'Create Account' : `Verify Your ${method === 'phone' ? 'Phone' : 'Email'}`}
            </h2>
            <p style={{ fontSize:13, color:'#64748b', margin:0 }}>
              {step === 1 ? "Join Tanzania's #1 marketplace" : `Code sent to ${identifier}`}
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
                  👤 Full Name *
                </label>
                <input className="ri" placeholder="e.g. John Mwangi" type="text"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>

              {/* Method tabs */}
              <div style={{ display:'flex', gap:4, backgroundColor:'#f1f5f9', borderRadius:10, padding:4 }}>
                <button className="tab" onClick={() => { setMethod('phone'); setIdentifier(''); setError(''); }}
                  style={{ backgroundColor: method==='phone' ? '#2563eb' : 'transparent', color: method==='phone' ? '#fff' : '#64748b' }}>
                  📱 Phone
                </button>
                <button className="tab" onClick={() => { setMethod('email'); setIdentifier(''); setError(''); }}
                  style={{ backgroundColor: method==='email' ? '#2563eb' : 'transparent', color: method==='email' ? '#fff' : '#64748b' }}>
                  📧 Email
                </button>
              </div>

              {/* Phone or Email */}
              {method === 'phone' ? (
                <div>
                  <label style={{ display:'block', fontSize:12, color:'#64748b', marginBottom:5, fontWeight:700 }}>
                    📱 Phone Number * <span style={{ color:'#94a3b8', fontWeight:400 }}>(OTP sent here)</span>
                  </label>
                  <input className="ri" placeholder="0712345678 or 255712345678" type="tel"
                    value={identifier} onChange={e => handlePhoneChange(e.target.value)} />
                  {identifier.startsWith('255') && (
                    <div style={{ fontSize:11, color:'#16a34a', marginTop:4, fontWeight:700 }}>✅ +{identifier}</div>
                  )}
                </div>
              ) : (
                <div>
                  <label style={{ display:'block', fontSize:12, color:'#64748b', marginBottom:5, fontWeight:700 }}>
                    📧 Email Address * <span style={{ color:'#94a3b8', fontWeight:400 }}>(OTP sent here)</span>
                  </label>
                  <input className="ri" placeholder="you@example.com" type="email"
                    value={identifier} onChange={e => setIdentifier(e.target.value)} />
                </div>
              )}

              {/* Password */}
              <div>
                <label style={{ display:'block', fontSize:12, color:'#64748b', marginBottom:5, fontWeight:700 }}>Password *</label>
                <input className="ri" placeholder="Min. 6 characters" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRegister()} />
              </div>

              <button className="rb" onClick={handleRegister} disabled={loading}>
                {loading ? '⏳ Creating...' : `${method === 'phone' ? '📱' : '📧'} Register & Get OTP`}
              </button>

              <div style={{ textAlign:'center', fontSize:13, color:'#64748b' }}>
                Already have an account?{' '}
                <span onClick={() => onNavigate('PublicLogin')} style={{ color:'#2563eb', fontWeight:700, cursor:'pointer' }}>Login</span>
              </div>
            </div>
          )}

          {/* STEP 2 — OTP */}
          {step === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:48, marginBottom:8 }}>{method === 'phone' ? '📱' : '📧'}</div>
                <div style={{ backgroundColor:'#f0f9ff', borderRadius:12, padding:'10px 14px', border:'1px solid #bae6fd', fontSize:12, color:'#0369a1', fontWeight:600 }}>
                  6-digit code sent via {method === 'phone' ? 'SMS' : 'Email'}. Check your {method === 'phone' ? 'messages' : 'inbox'}.
                </div>
              </div>

              <input className="otp" placeholder="000000" value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                maxLength={6} type="tel" />

              <button className="rb" onClick={handleVerify} disabled={otpLoading || otp.length !== 6}>
                {otpLoading ? '⏳ Verifying...' : '✅ Verify & Continue'}
              </button>

              <div style={{ textAlign:'center' }}>
                {resendTimer > 0
                  ? <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>Resend in <strong style={{ color:'#2563eb' }}>{resendTimer}s</strong></p>
                  : <button onClick={handleResend} disabled={resendLoading}
                      style={{ background:'none', border:'none', color:'#2563eb', fontWeight:700, cursor:'pointer', fontSize:13 }}>
                      {resendLoading ? '⏳ Sending...' : '🔁 Resend OTP'}
                    </button>
                }
              </div>

              <button onClick={() => { setStep(1); setOtp(''); setError(''); }}
                style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:13 }}>
                ← Change {method === 'phone' ? 'phone' : 'email'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;