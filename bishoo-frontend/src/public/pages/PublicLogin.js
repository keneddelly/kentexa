import React, { useState } from 'react';
import api from '../../api/api';

const PublicLogin = ({ onNavigate, onLoginSuccess }) => {
  const [loginMethod, setLoginMethod]   = useState('phone');
  const [identifier, setIdentifier]     = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  // Forgot password states
  const [step, setStep]                 = useState('login'); // 'login' | 'forgot' | 'reset'
  const [fpIdentifier, setFpIdentifier] = useState('');
  const [fpOtp, setFpOtp]               = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpLoading, setFpLoading]       = useState(false);
  const [fpMessage, setFpMessage]       = useState('');

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError(`Please enter your ${loginMethod === 'phone' ? 'phone number' : 'email'} and password`);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const payload = loginMethod === 'phone'
        ? { phone: identifier.trim(), password }
        : { email: identifier.trim(), password };
      const res = await api.post('/auth/login', payload);
      localStorage.setItem('token', res.data.access_token);
      if (onLoginSuccess) onLoginSuccess(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSend = async () => {
    if (!fpIdentifier.trim()) { setError('Enter your phone or email'); return; }
    try {
      setFpLoading(true); setError('');
      await api.post('/auth/forgot-password', { identifier: fpIdentifier.trim() });
      setFpMessage(`OTP sent to ${fpIdentifier.trim()}`);
      setStep('reset');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send OTP');
    } finally {
      setFpLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (fpOtp.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    if (fpNewPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    try {
      setFpLoading(true); setError('');
      await api.post('/auth/reset-password', {
        identifier: fpIdentifier.trim(),
        otp: fpOtp,
        newPassword: fpNewPassword,
      });
      setFpMessage('✅ Password reset successfully! Please login.');
      setTimeout(() => {
        setStep('login');
        setFpIdentifier(''); setFpOtp(''); setFpNewPassword(''); setFpMessage('');
      }, 2000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to reset password');
    } finally {
      setFpLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '13px 16px',
    backgroundColor: '#f8fafc', border: '2px solid #e2e8f0',
    borderRadius: 12, color: '#0f172a', fontSize: 15,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  const btnPrimary = {
    width: '100%', padding: 14,
    background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 15, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(29,78,216,0.35)', marginBottom: 16,
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4ff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '36px 28px', width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.1)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div onClick={() => onNavigate('Home')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'baseline', gap: 0, marginBottom: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#1d4ed8', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
          </div>
          <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>
            {step === 'login' ? 'Welcome back 👋' : step === 'forgot' ? '🔑 Forgot Password' : '🔒 Reset Password'}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Success message */}
        {fpMessage && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
            ✅ {fpMessage}
          </div>
        )}

        {/* ── LOGIN ── */}
        {step === 'login' && (
          <>
            {/* Phone / Email toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {[
                { method: 'phone', icon: '📞', label: 'Phone' },
                { method: 'email', icon: '📧', label: 'Email' },
              ].map(({ method, icon, label }) => (
                <button key={method}
                  onClick={() => { setLoginMethod(method); setIdentifier(''); setError(''); }}
                  style={{ padding: '11px', borderRadius: 12, border: '2px solid', borderColor: loginMethod === method ? '#1d4ed8' : '#e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 700, backgroundColor: loginMethod === method ? '#eff6ff' : '#f8fafc', color: loginMethod === method ? '#1d4ed8' : '#94a3b8' }}>
                  {icon} {label}
                </button>
              ))}
            </div>

            {/* Identifier */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>
                {loginMethod === 'phone' ? 'Phone Number' : 'Email Address'}
              </label>
              <input type={loginMethod === 'phone' ? 'tel' : 'email'}
                placeholder={loginMethod === 'phone' ? '255XXXXXXXXX' : 'you@example.com'}
                value={identifier} onChange={e => setIdentifier(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleLogin()}
                style={inputStyle} />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleLogin()}
                  style={{ ...inputStyle, paddingRight: 48 }} />
                <button onClick={() => setShowPassword(s => !s)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <button onClick={() => { setStep('forgot'); setFpIdentifier(identifier); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#1d4ed8', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Forgot Password?
              </button>
            </div>

            <button onClick={handleLogin} disabled={loading}
              style={{ ...btnPrimary, background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '⏳ Logging in...' : '🔐 Login'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
            </div>

            <button onClick={() => onNavigate('Register')}
              style={{ width: '100%', padding: 13, backgroundColor: '#f8fafc', color: '#1d4ed8', border: '2px solid #e2e8f0', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 20 }}>
              ✨ Create New Account
            </button>

            <div style={{ textAlign: 'center' }}>
              <button onClick={() => onNavigate('Home')}
                style={{ background: 'none', border: 'none', fontSize: 13, color: '#1d4ed8', cursor: 'pointer', fontWeight: 700, padding: '8px 0' }}>
                ← Back to Home
              </button>
            </div>
          </>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {step === 'forgot' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
              Enter your phone number or email address and we'll send you a reset code.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>Phone or Email</label>
              <input type="text" placeholder="255XXXXXXXXX or you@example.com"
                value={fpIdentifier} onChange={e => setFpIdentifier(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleForgotSend()}
                style={inputStyle} />
            </div>
            <button onClick={handleForgotSend} disabled={fpLoading}
              style={{ ...btnPrimary, marginBottom: 0, cursor: fpLoading ? 'not-allowed' : 'pointer', background: fpLoading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)' }}>
              {fpLoading ? '⏳ Sending...' : '📨 Send Reset Code'}
            </button>
            <button onClick={() => { setStep('login'); setError(''); setFpMessage(''); }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              ← Back to Login
            </button>
          </div>
        )}

        {/* ── RESET PASSWORD ── */}
        {step === 'reset' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Enter the 6-digit code sent to <strong>{fpIdentifier}</strong> and your new password.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>OTP Code</label>
              <input type="tel" placeholder="000000" maxLength={6}
                value={fpOtp} onChange={e => setFpOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                style={{ ...inputStyle, fontSize: 24, fontWeight: 900, letterSpacing: 8, textAlign: 'center' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>New Password</label>
              <input type="password" placeholder="Min. 6 characters"
                value={fpNewPassword} onChange={e => setFpNewPassword(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleResetPassword()}
                style={inputStyle} />
            </div>
            <button onClick={handleResetPassword} disabled={fpLoading}
              style={{ ...btnPrimary, marginBottom: 0, cursor: fpLoading ? 'not-allowed' : 'pointer', background: fpLoading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)' }}>
              {fpLoading ? '⏳ Resetting...' : '🔒 Reset Password'}
            </button>
            <button onClick={() => { setStep('forgot'); setFpOtp(''); setFpNewPassword(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              ← Resend Code
            </button>
          </div>
        )}
      </div>

      <p style={{ marginTop: 20, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        KenteXa © 2026 · Tanzania's #1 Marketplace
      </p>
    </div>
  );
};

export default PublicLogin;