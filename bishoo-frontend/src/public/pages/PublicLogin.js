/**
 * PublicLogin.js — "Ingia KenteXa", rebuilt in the new look (owner approved 2026-11-02,
 * sketch "New Login and Signup"). One field for phone or email (an "@" means email), the
 * password, "Umesahau nenosiri?" (send a 6-digit code, then the code and a new password),
 * and "Fungua akaunti mpya". Same server calls as before: /auth/login,
 * /auth/forgot-password, /auth/reset-password.
 *
 * Accounts store phones as "255XXXXXXXXX" (Register converts a leading 0), so a typed
 * "0712 345 678" is sent the same way.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { AUTH, AuthButton, AuthError, AuthField, AuthLink, AuthNote, AuthOr, AuthShell, CodeBoxes, isEmail, phoneForServer } from '../components/AuthShell';
import AuthHelp from '../components/AuthHelp';
import { SocialButtons, SocialFinish } from '../components/SocialSignIn';
import { authErrorCode, authErrorText } from '../utils/authErrors';

const forServer = (raw) => (isEmail(raw) ? String(raw).trim() : phoneForServer(raw));

const PublicLogin = ({ onNavigate, onLoginSuccess }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState('login'); // login | forgot | reset | verify
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Issue #361: an account that never typed its sign-up code finishes here, not in a dead end.
  const [verifyId, setVerifyId] = useState('');
  const [smsFailed, setSmsFailed] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const fail = (err, fallbackKey) => { setErrorCode(authErrorCode(err)); setError(authErrorText(err, t, fallbackKey)); };

  const go = (next) => { setStep(next); setError(''); setNote(''); };
  // Google / Facebook (owner 2026-11-17): signed in, or a new person adds a phone once.
  const [social, setSocial] = useState(null);
  const onSocial = async (data) => {
    if (data?.status === 'need_phone') { setSocial(data); return; }
    if (onLoginSuccess) await onLoginSuccess(data);
  };

  const login = async (e) => {
    e?.preventDefault?.();
    if (!identifier.trim()) { setError(t('signin.need_identifier')); return; }
    if (!password) { setError(t('signin.need_password')); return; }
    setBusy(true); setError('');
    try {
      const payload = isEmail(identifier) ? { email: identifier.trim(), password } : { phone: phoneForServer(identifier), password };
      const res = await api.post('/auth/login', payload);
      if (onLoginSuccess) await onLoginSuccess(res.data);
    } catch (err) {
      const data = err?.response?.data;
      if (data?.code === 'ACCOUNT_NOT_VERIFIED' && data.identifier) {
        setVerifyId(String(data.identifier));
        setSmsFailed(data.otpSent === false);
        setCode('');
        go('verify');
        setNote(t('signin.errors.ACCOUNT_NOT_VERIFIED'));
        return;
      }
      fail(err, 'signin.invalid_credentials');
    } finally { setBusy(false); }
  };

  const sendCode = async () => {
    if (!identifier.trim()) { setError(t('signin.need_identifier')); return; }
    setBusy(true); setError('');
    try {
      await api.post('/auth/forgot-password', { identifier: forServer(identifier) });
      setCode(''); setNewPassword('');
      go('reset');
    } catch (err) {
      fail(err, 'signin.send_failed');
    } finally { setBusy(false); }
  };

  const reset = async () => {
    if (code.length !== 6) { setError(t('signin.need_code')); return; }
    if (newPassword.length < 6) { setError(t('signin.password_min')); return; }
    setBusy(true); setError('');
    try {
      await api.post('/auth/reset-password', { identifier: forServer(identifier), otp: code, newPassword });
      setPassword('');
      go('login');
      setNote(t('signin.reset_done'));
    } catch (err) {
      fail(err, 'signin.reset_failed');
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.length !== 6) { setError(t('signin.need_code')); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/verify-otp', { identifier: verifyId, otp: code });
      if (onLoginSuccess) await onLoginSuccess(res.data, { targetPage: 'AddProfilePhoto' });
    } catch (err) {
      fail(err, 'signin.invalid_code');
    } finally { setBusy(false); }
  };

  const resendVerify = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      const res = await api.post('/auth/resend-otp', { identifier: verifyId });
      setSmsFailed(res?.data?.otpSent === false);
      setCode('');
    } catch (err) {
      fail(err, 'signin.resend_failed');
    } finally { setBusy(false); }
  };

  if (social) {
    return <SocialFinish info={social} onLoginSuccess={onLoginSuccess} onCancel={() => setSocial(null)} onNavigate={onNavigate} />;
  }

  if (step === 'verify') {
    return (
      <AuthShell title={t('signin.finish_title')} subtitle={t('signin.code_desc', { identifier: identifier.trim() })} onLogo={() => onNavigate('Home')}>
        <AuthNote>{note}</AuthNote>
        {smsFailed && <p role="alert" data-testid="sms-not-sent" style={{ margin: 0, fontSize: 14, color: AUTH.RED }}>{t('signin.sms_not_sent')}</p>}
        <CodeBoxes value={code} onChange={setCode} label={t('signin.code_label')} testId="verify-code" />
        <AuthError>{error}</AuthError>
        <AuthButton onClick={verify} disabled={busy || code.length !== 6} testId="login-verify">{busy ? t('signin.verifying') : t('signin.verify_button')}</AuthButton>
        <AuthLink onClick={resendVerify} testId="login-verify-resend">{t('signin.resend')}</AuthLink>
        <AuthLink onClick={() => go('login')}>{t('signin.back_to_login')}</AuthLink>
        <AuthHelp step="code" errorCode={errorCode || (smsFailed ? 'SMS_NOT_SENT' : null)} phone={isEmail(identifier) ? '' : identifier} />
      </AuthShell>
    );
  }

  if (step === 'forgot') {
    return (
      <AuthShell title={t('signin.forgot_title')} subtitle={t('signin.forgot_desc')} onLogo={() => onNavigate('Home')}>
        <AuthField label={t('signin.identifier_label')} value={identifier} onChange={setIdentifier} autoComplete="username" testId="login-identifier" autoFocus />
        <AuthError>{error}</AuthError>
        <AuthButton onClick={sendCode} disabled={busy} testId="forgot-send">{busy ? t('signin.sending') : t('signin.send_code')}</AuthButton>
        <AuthLink onClick={() => go('login')}>{t('signin.back_to_login')}</AuthLink>
      </AuthShell>
    );
  }

  if (step === 'reset') {
    return (
      <AuthShell title={t('signin.reset_title')} subtitle={t('signin.reset_desc', { identifier: identifier.trim() })} onLogo={() => onNavigate('Home')}>
        <CodeBoxes value={code} onChange={setCode} label={t('signin.code_label')} testId="reset-code" />
        <AuthField label={t('signin.new_password_label')} value={newPassword} onChange={setNewPassword} type="password" autoComplete="new-password" testId="reset-password" />
        <AuthError>{error}</AuthError>
        <AuthButton onClick={reset} disabled={busy} testId="reset-submit">{busy ? t('signin.resetting') : t('signin.reset_button')}</AuthButton>
        <AuthLink onClick={sendCode}>{t('signin.resend')}</AuthLink>
        <AuthLink onClick={() => go('login')}>{t('signin.back_to_login')}</AuthLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('signin.login_title')} onLogo={() => onNavigate('Home')}
      footer={(
        <>
          <AuthOr>{t('signin.or')}</AuthOr>
          <AuthButton variant="outline" onClick={() => onNavigate('Register')} testId="login-register">{t('signin.create_account')}</AuthButton>
        </>
      )}>
      <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AuthNote>{note}</AuthNote>
        <AuthField label={t('signin.identifier_label')} value={identifier} onChange={setIdentifier} autoComplete="username" testId="login-identifier" />
        <AuthField label={t('signin.password_label')} value={password} onChange={setPassword} type="password" autoComplete="current-password" testId="login-password" />
        <AuthLink onClick={() => go('forgot')} testId="login-forgot">{t('signin.forgot_link')}</AuthLink>
        <AuthError>{error}</AuthError>
        <AuthButton type="submit" disabled={busy} testId="login-submit">{busy ? t('signin.logging_in') : t('signin.login_button')}</AuthButton>
      </form>
      <SocialButtons onResult={onSocial} />
      <AuthHelp step="login" errorCode={errorCode} phone={isEmail(identifier) ? '' : identifier} />
    </AuthShell>
  );
};

export default PublicLogin;
