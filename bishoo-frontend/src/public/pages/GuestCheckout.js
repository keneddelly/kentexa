/**
 * GuestCheckout.js — buying without signing up first (owner approved 2026-11-10). A person who
 * came from a link and is not signed in gives a name and phone here; one SMS code confirms the
 * phone, the account is made with no password to remember, and the checkout opens with the same
 * cart (a reseller's price and name stay on it). A number that already has an account signs in
 * with its password on this same screen. Server: POST /auth/checkout-phone, then the usual
 * /auth/verify-otp or /auth/login.
 */
import React, { useState } from 'react';
import api from '../../api/api';
import { useCart } from '../../context/CartContext';
import { referralCode as keptReferralCode } from '../../utils/referralLink';
import { markCheckoutBuyer } from '../../utils/checkoutBuyer';
import { AUTH, AuthButton, AuthError, AuthField, AuthLink, AuthNote, AuthShell, CodeBoxes, phoneForServer } from '../components/AuthShell';

const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

const GuestCheckout = ({ onNavigate, onLoginSuccess }) => {
  const { cart = [], cartCount = 0, cartTotal = 0 } = useCart() || {};
  const [step, setStep] = useState('phone'); // phone | code | password
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const go = (next) => { setStep(next); setError(''); setNote(''); };
  // The full sign-in page also comes back to the checkout afterwards.
  const toLogin = () => {
    try { localStorage.setItem('kentexa_after_login', 'Checkout'); } catch { /* storage blocked */ }
    onNavigate('PublicLogin');
  };
  const signedIn = async (data) => {
    markCheckoutBuyer();
    try { localStorage.setItem('kentexa_after_login', 'Checkout'); } catch { /* storage blocked */ }
    if (onLoginSuccess) await onLoginSuccess(data, { targetPage: 'Checkout' });
  };

  const sendCode = async (e) => {
    e?.preventDefault?.();
    if (name.trim().length < 2) { setError('Andika jina lako.'); return; }
    if (!/^255\d{9}$/.test(phoneForServer(phone))) { setError('Weka namba sahihi ya simu (mf. 0712345678).'); return; }
    setBusy(true); setError('');
    try {
      const body = { name: name.trim(), phone: phoneForServer(phone) };
      const ref = keptReferralCode();
      if (ref) body.referralCode = ref;
      const res = await api.post('/auth/checkout-phone', body);
      if (res.data?.status === 'has_account') { setPassword(''); go('password'); return; }
      setCode(''); go('code');
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana kutuma namba ya uthibitisho. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (code.length !== 6) { setError('Weka namba 6 ulizopokea kwa SMS.'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/verify-otp', { identifier: phoneForServer(phone), otp: code });
      await signedIn(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Namba si sahihi. Angalia SMS tena.');
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/auth/resend-otp', { identifier: phoneForServer(phone) });
      setCode(''); setNote('Tumetuma namba mpya.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana kutuma tena.');
    } finally { setBusy(false); }
  };

  const login = async (e) => {
    e?.preventDefault?.();
    if (!password) { setError('Weka nenosiri lako.'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/login', { phone: phoneForServer(phone), password });
      await signedIn(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Nenosiri si sahihi.');
    } finally { setBusy(false); }
  };

  const summary = cartCount > 0 ? (
    <div data-testid="guest-cart" style={{ border: `1px solid ${AUTH.LINE}`, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {cart.slice(0, 3).map((item) => (
        <div key={`${item.id}-${item.resaleOfferId || ''}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, color: AUTH.INK }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.quantity} × {item.name}</span>
          <span style={{ flexShrink: 0 }}>{tzs(Number(item.displayPrice || item.basePrice || item.price || 0) * item.quantity)}</span>
        </div>
      ))}
      {cart.length > 3 && <span style={{ fontSize: 13, color: AUTH.MUTED }}>na bidhaa {cart.length - 3} zaidi</span>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: AUTH.INK, borderTop: '1px solid #eff3f4', paddingTop: 6 }}>
        <span>Jumla ya bidhaa</span><span>{tzs(cartTotal)}</span>
      </div>
    </div>
  ) : null;

  if (step === 'code') {
    return (
      <AuthShell title="Thibitisha namba" subtitle={`Tumetuma namba 6 kwa SMS kwenda ${phone.trim()}.`} onLogo={() => onNavigate('Home')}>
        <CodeBoxes value={code} onChange={setCode} label="Namba ya uthibitisho" />
        <AuthError>{error}</AuthError>
        <AuthNote>{note}</AuthNote>
        <AuthButton testId="guest-verify" onClick={verify} disabled={busy}>{busy ? 'Subiri…' : 'Endelea na oda'}</AuthButton>
        <AuthLink testId="guest-resend" onClick={resend}>Tuma namba tena</AuthLink>
        <AuthLink onClick={() => go('phone')}>Badilisha namba</AuthLink>
      </AuthShell>
    );
  }

  if (step === 'password') {
    return (
      <AuthShell title="Namba hii ina akaunti" subtitle={`Weka nenosiri la ${phone.trim()} ili uendelee na oda. Bidhaa zako zimehifadhiwa.`} onLogo={() => onNavigate('Home')}>
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AuthField label="Nenosiri" type="password" value={password} onChange={setPassword} autoComplete="current-password" testId="guest-password" autoFocus />
          <AuthError>{error}</AuthError>
          <AuthButton type="submit" testId="guest-login" disabled={busy}>{busy ? 'Subiri…' : 'Ingia na uendelee'}</AuthButton>
        </form>
        <AuthLink onClick={toLogin}>Umesahau nenosiri?</AuthLink>
        <AuthLink onClick={() => go('phone')}>Badilisha namba</AuthLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Kamilisha oda" subtitle="Weka jina na namba ya simu. Tutakutumia namba ya uthibitisho kwa SMS, kisha utaweka mahali pa kupokea mzigo."
      onLogo={() => onNavigate('Home')}>
      {summary}
      <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AuthField label="Jina lako" value={name} onChange={setName} autoComplete="name" testId="guest-name" maxLength={100} />
        <AuthField label="Namba ya simu" value={phone} onChange={setPhone} type="tel" inputMode="tel" autoComplete="tel" testId="guest-phone" maxLength={16} />
        <AuthError>{error}</AuthError>
        <AuthButton type="submit" testId="guest-send" disabled={busy}>{busy ? 'Subiri…' : 'Tuma namba ya uthibitisho'}</AuthButton>
      </form>
      <p style={{ margin: 0, fontSize: 13, color: AUTH.MUTED, lineHeight: 1.45 }}>
        Huhitaji kufungua akaunti kwanza. Akaunti yako inafunguliwa kwa namba hii ili ufuatilie oda; unaweza kuweka nenosiri baadaye.
        Kwa kuendelea unakubali Masharti ya KenteXa.
      </p>
      <AuthLink testId="guest-have-account" onClick={toLogin}>Una akaunti? Ingia</AuthLink>
    </AuthShell>
  );
};

export default GuestCheckout;
