/**
 * SocialSignIn.js — "Endelea na Google" / "Endelea na Facebook" (owner 2026-11-17: "its time to
 * allow login with google, facebook").
 *  - SocialButtons: shown on Ingia and Fungua akaunti, only for providers KenteXa has keys for
 *    (GET /auth/social/config). Google's own button; Facebook through its login window.
 *    The token goes to POST /auth/social; the server checks it with Google / Facebook.
 *  - A person new to KenteXa gets an account at once (owner 2026-11-17: no phone at sign-up, so
 *    people outside Tanzania can join communities); a phone is asked later by the features that
 *    need one. SocialFinish (phone + SMS code) stays for older answers of the server.
 * Works in the Android app too (it opens in Chrome).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { AUTH, AuthButton, AuthError, AuthField, AuthLink, AuthShell, CodeBoxes, phoneForServer } from './AuthShell';
import { authErrorText } from '../utils/authErrors';

let configPromise = null;
export const loadSocialConfig = () => {
  if (!configPromise) {
    configPromise = Promise.resolve()
      .then(() => api.get('/auth/social/config'))
      .then((r) => ({ google: r?.data?.google || null, facebook: r?.data?.facebook || null }))
      .catch(() => { configPromise = null; return { google: null, facebook: null }; });
  }
  return configPromise;
};
export const resetSocialConfig = () => { configPromise = null; };

const loadScript = (src, ready) => new Promise((resolve, reject) => {
  if (ready()) { resolve(); return; }
  const found = document.querySelector(`script[src="${src}"]`);
  const s = found || document.createElement('script');
  s.addEventListener('load', () => resolve());
  s.addEventListener('error', () => reject(new Error('script')));
  if (!found) { s.src = src; s.async = true; s.defer = true; document.head.appendChild(s); }
});

const FacebookMark = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#fff" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
  </svg>
);

/** The buttons. onResult(data) gets the server's answer: signed in, or a ticket that needs a phone. */
export function SocialButtons({ onResult }) {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const googleBox = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const send = async (provider, token) => {
    if (!token) return;
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/social', { provider, token, deviceId: undefined });
      await onResultRef.current?.(res.data);
    } catch (err) {
      setError(authErrorText(err, t, 'signin.social.failed'));
    } finally { setBusy(false); }
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    let live = true;
    loadSocialConfig().then((c) => { if (live) setCfg(c); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!cfg?.google || !googleBox.current) return;
    let live = true;
    loadScript('https://accounts.google.com/gsi/client', () => Boolean(window.google?.accounts?.id))
      .then(() => {
        if (!live || !googleBox.current) return;
        window.google.accounts.id.initialize({ client_id: cfg.google, callback: (r) => sendRef.current('google', r?.credential), ux_mode: 'popup' });
        const width = Math.min(400, Math.max(240, googleBox.current.offsetWidth || 320));
        window.google.accounts.id.renderButton(googleBox.current, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width, locale: 'sw' });
      })
      .catch(() => { if (live) setError(t('signin.social.load_failed', 'Google haikufunguka. Angalia mtandao kisha jaribu tena.')); });
    return () => { live = false; };
  }, [cfg, t]);

  const facebook = async () => {
    setError('');
    try {
      await loadScript('https://connect.facebook.net/en_US/sdk.js', () => Boolean(window.FB));
      window.FB.init({ appId: cfg.facebook, version: 'v19.0', xfbml: false, cookie: false });
      window.FB.login((r) => {
        const token = r?.authResponse?.accessToken;
        if (token) send('facebook', token);
      }, { scope: 'public_profile,email' });
    } catch {
      setError(t('signin.social.load_failed', 'Facebook haikufunguka. Angalia mtandao kisha jaribu tena.'));
    }
  };

  if (!cfg || (!cfg.google && !cfg.facebook)) return null;
  return (
    <div data-testid="social-buttons" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
      {cfg.google && <div ref={googleBox} data-testid="social-google" style={{ display: 'flex', justifyContent: 'center', minHeight: 44, opacity: busy ? 0.6 : 1 }} />}
      {cfg.facebook && (
        <button type="button" onClick={facebook} disabled={busy} data-testid="social-facebook"
          style={{ height: 44, borderRadius: 22, border: 'none', background: '#1877f2', color: '#fff', fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
          <FacebookMark />{t('signin.social.facebook', 'Endelea na Facebook')}
        </button>
      )}
      {busy && <span style={{ fontSize: 14, color: AUTH.MUTED, textAlign: 'center' }}>{t('signin.social.checking', 'Tunathibitisha…')}</span>}
      <AuthError>{error}</AuthError>
      <span style={{ fontSize: 12, color: AUTH.MUTED, textAlign: 'center', lineHeight: '17px' }}>
        {t('signin.social.terms', 'Ukiendelea unakubali Masharti ya KenteXa na Sera ya Faragha.')}
      </span>
    </div>
  );
}

/** A person new to KenteXa: phone, then the SMS code. */
export function SocialFinish({ info, onLoginSuccess, onCancel, onNavigate }) {
  const { t } = useTranslation();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [existing, setExisting] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [smsFailed, setSmsFailed] = useState(false);
  const who = info?.provider === 'facebook' ? 'Facebook' : 'Google';
  const first = String(info?.name || '').trim().split(/\s+/)[0];

  const sendPhone = async (e) => {
    e?.preventDefault?.();
    const p = phoneForServer(phone);
    if (!/^255\d{9}$/.test(p)) { setError(t('signin.social.phone_bad', 'Weka namba sahihi ya simu (mf. 0712345678).')); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/social/phone', { ticket: info.ticket, phone: p });
      setSentTo(res?.data?.phone || p);
      setExisting(Boolean(res?.data?.existing));
      setSmsFailed(res?.data?.otpSent === false);
      setCode(''); setStep('code');
    } catch (err) {
      setError(authErrorText(err, t, 'signin.send_failed'));
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.length !== 6) { setError(t('signin.need_code')); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/social/verify', { ticket: info.ticket, phone: sentTo, otp: code });
      if (onLoginSuccess) await onLoginSuccess(res.data, existing ? undefined : { targetPage: 'AddProfilePhoto' });
    } catch (err) {
      setError(authErrorText(err, t, 'signin.invalid_code'));
    } finally { setBusy(false); }
  };

  if (step === 'code') {
    return (
      <AuthShell title={t('signin.code_title')} subtitle={t('signin.code_desc', { identifier: phone.trim() })} onLogo={() => onNavigate?.('Home')}>
        {existing && <p data-testid="social-link-note" style={{ margin: 0, fontSize: 14, color: AUTH.MUTED }}>{t('signin.social.link_note', { who, defaultValue: `Namba hii tayari ina akaunti ya KenteXa. Ukiandika namba ya siri, akaunti yako ya ${who} itaunganishwa nayo.` })}</p>}
        {smsFailed && <p role="alert" style={{ margin: 0, fontSize: 14, color: AUTH.RED }}>{t('signin.sms_not_sent')}</p>}
        <CodeBoxes value={code} onChange={setCode} label={t('signin.code_label')} testId="social-code" />
        <AuthError>{error}</AuthError>
        <AuthButton onClick={verify} disabled={busy || code.length !== 6} testId="social-verify">{busy ? t('signin.verifying') : t('signin.verify_button')}</AuthButton>
        <AuthLink onClick={() => { setStep('phone'); setError(''); }}>{t('signin.change_number')}</AuthLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={first ? t('signin.social.hello', { name: first, defaultValue: `Karibu, ${first}` }) : t('signin.social.hello_plain', 'Karibu KenteXa')}
      subtitle={t('signin.social.phone_desc', { who, defaultValue: `Umeingia na ${who}. Weka namba yako ya simu mara moja tu: tutakutumia namba ya siri kwa SMS. Simu inahitajika kwa malipo na usafirishaji.` })}
      onLogo={() => onNavigate?.('Home')}>
      <form onSubmit={sendPhone} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AuthField label={t('signin.phone_label')} value={phone} onChange={setPhone} type="tel" inputMode="tel" autoComplete="tel" testId="social-phone" autoFocus />
        <AuthError>{error}</AuthError>
        <AuthButton type="submit" disabled={busy} testId="social-phone-send">{busy ? t('signin.sending') : t('signin.continue')}</AuthButton>
        <AuthLink onClick={onCancel}>{t('signin.back_to_login')}</AuthLink>
      </form>
    </AuthShell>
  );
}
