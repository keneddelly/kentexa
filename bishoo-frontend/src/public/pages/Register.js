/**
 * Register.js — "Fungua akaunti", rebuilt in the new look (owner approved 2026-11-02,
 * sketch "New Login and Signup"). Two steps:
 *   1 name, phone (or "Tumia barua pepe badala yake"), password -> "Endelea";
 *   2 the 6-digit code in six boxes, "Tuma tena" after 60 s, "Badilisha namba".
 * Same server calls as before (/auth/register/phone|email, /auth/verify-otp,
 * /auth/resend-otp); an invitation link (?ref=) still names who invited them.
 * After the code, App.js takes the new person to the welcome steps.
 */
import { referralCode as keptReferralCode } from '../../utils/referralLink';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { AUTH, AuthButton, AuthError, AuthField, AuthLink, AuthShell, CodeBoxes, phoneForServer } from '../components/AuthShell';

const Register = ({ onNavigate, onLoginSuccess }) => {
  const { t } = useTranslation();
  const [method, setMethod] = useState('phone');
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const tick = useRef(null);

  // An invitation link (kept by utils/referralLink) names who invited them.
  const [referralCode] = useState(() => keptReferralCode());
  const [inviter, setInviter] = useState(null);
  useEffect(() => {
    if (!referralCode) return;
    api.get(`/advertisers/invite/${encodeURIComponent(referralCode)}`)
      .then((r) => setInviter(r.data?.name ? r.data : null)).catch(() => setInviter(null));
  }, [referralCode]);
  useEffect(() => () => clearInterval(tick.current), []);

  const identifier = method === 'phone' ? phoneForServer(contact) : contact.trim();

  const startTimer = () => {
    clearInterval(tick.current);
    setTimer(60);
    tick.current = setInterval(() => setTimer((s) => { if (s <= 1) { clearInterval(tick.current); return 0; } return s - 1; }), 1000);
  };

  const register = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (name.trim().length < 2) { setError(t('signin.name_required')); return; }
    if (method === 'phone' && identifier.length < 9) { setError(t('signin.phone_required')); return; }
    if (method === 'email' && !identifier.includes('@')) { setError(t('signin.email_required')); return; }
    if (password.length < 6) { setError(t('signin.password_min')); return; }
    setBusy(true);
    try {
      const payload = method === 'phone' ? { phone: identifier, password, name: name.trim() } : { email: identifier, password, name: name.trim() };
      if (referralCode) payload.referralCode = referralCode;
      await api.post(method === 'phone' ? '/auth/register/phone' : '/auth/register/email', payload);
      setCode(''); setStep(2); startTimer();
    } catch (err) {
      setError(err?.response?.data?.message || t('signin.register_failed'));
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.length !== 6) { setError(t('signin.need_code')); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/verify-otp', { identifier, otp: code });
      if (onLoginSuccess) await onLoginSuccess(res.data, { targetPage: 'AddProfilePhoto' });
    } catch (err) {
      setError(err?.response?.data?.message || t('signin.invalid_code'));
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/auth/resend-otp', { identifier });
      setCode(''); startTimer();
    } catch (err) {
      setError(err?.response?.data?.message || t('signin.resend_failed'));
    } finally { setBusy(false); }
  };

  if (step === 2) {
    return (
      <AuthShell title={t('signin.code_title')} subtitle={t('signin.code_desc', { identifier: contact.trim() })} onLogo={() => onNavigate('Home')}>
        <CodeBoxes value={code} onChange={setCode} label={t('signin.code_label')} />
        <AuthError>{error}</AuthError>
        <AuthButton onClick={verify} disabled={busy || code.length !== 6} testId="register-verify">{busy ? t('signin.verifying') : t('signin.verify_button')}</AuthButton>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {timer > 0
            ? <span style={{ fontSize: 14, color: AUTH.MUTED }}>{t('signin.resend_in', { seconds: timer })}</span>
            : <AuthLink onClick={resend} testId="register-resend">{t('signin.resend')}</AuthLink>}
          <AuthLink onClick={() => { setStep(1); setError(''); }} testId="register-change">{t('signin.change_number')}</AuthLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('signin.register_title')} onLogo={() => onNavigate('Home')}
      subtitle={referralCode ? (inviter?.name ? `Umealikwa na ${inviter.name}. Karibu KenteXa!` : 'Umealikwa kujiunga na KenteXa. Karibu!') : null}
      footer={(
        <span style={{ fontSize: 15, color: AUTH.MUTED, textAlign: 'center' }}>
          {t('signin.have_account')}{' '}
          <button type="button" onClick={() => onNavigate('PublicLogin')} data-testid="register-login"
            style={{ border: 'none', background: 'none', padding: 0, color: AUTH.BLUE, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t('signin.login_link')}
          </button>
        </span>
      )}>
      <form onSubmit={register} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AuthField label={t('signin.name_label')} value={name} onChange={setName} autoComplete="name" testId="register-name" />
        <AuthField label={method === 'phone' ? t('signin.phone_label') : t('signin.email_label')} value={contact} onChange={setContact}
          type={method === 'phone' ? 'tel' : 'email'} inputMode={method === 'phone' ? 'tel' : 'email'} autoComplete={method === 'phone' ? 'tel' : 'email'} testId="register-contact" />
        <AuthLink onClick={() => { setMethod((m) => (m === 'phone' ? 'email' : 'phone')); setContact(''); setError(''); }} testId="register-method">
          {method === 'phone' ? t('signin.use_email') : t('signin.use_phone')}
        </AuthLink>
        <AuthField label={t('signin.register_password_label')} value={password} onChange={setPassword} type="password" autoComplete="new-password" testId="register-password" />
        <AuthError>{error}</AuthError>
        <AuthButton type="submit" disabled={busy} testId="register-submit">{busy ? t('signin.creating') : t('signin.continue')}</AuthButton>
      </form>
    </AuthShell>
  );
};

export default Register;
