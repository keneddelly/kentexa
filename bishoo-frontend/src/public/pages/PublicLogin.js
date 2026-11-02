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
import { AuthButton, AuthError, AuthField, AuthLink, AuthNote, AuthOr, AuthShell, CodeBoxes, isEmail, phoneForServer } from '../components/AuthShell';

const forServer = (raw) => (isEmail(raw) ? String(raw).trim() : phoneForServer(raw));

const PublicLogin = ({ onNavigate, onLoginSuccess }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState('login'); // login | forgot | reset
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const go = (next) => { setStep(next); setError(''); setNote(''); };

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
      setError(err?.response?.data?.message || t('signin.invalid_credentials'));
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
      setError(err?.response?.data?.message || t('signin.send_failed'));
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
      setError(err?.response?.data?.message || t('signin.reset_failed'));
    } finally { setBusy(false); }
  };

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
    </AuthShell>
  );
};

export default PublicLogin;
