/**
 * CompleteAccount.js — owner 2026-11-17: "for those who registered via Google, when they need to
 * perform a feature that requires phone and location, ask before starting, so the site does not
 * fail". Shown in place of such a feature (utils/accountGate.js) until the person has:
 *   - a phone, proved by an SMS code (POST /auth/phone/start, /auth/phone/confirm), and
 *   - their region (saved with the phone, or alone: POST /auth/city).
 * Then the feature they asked for opens by itself.
 */
import React, { useState } from 'react';
import api from '../../api/api';
import { AUTH, AuthButton, AuthError, AuthField, AuthLink, AuthShell, CodeBoxes, phoneForServer } from '../components/AuthShell';
import { TZ_REGIONS } from '../../utils/accountGate';

const WHY = {
  SendShipment: 'kutuma mzigo', Checkout: 'kununua', BecomeSeller: 'kuuza', BecomeSuperAgentInfo: 'kufungua ofisi ya mizigo',
  BecomeAgent: 'kuwa wakala', BecomeTransportProvider: 'kutoa usafiri', BecomeBusiness: 'kufungua biashara',
  PostService: 'kutangaza huduma', CreateClassified: 'kutangaza tangazo', UzaTena: 'kuuza tena', MyResales: 'kuuza tena',
};

const message = (e, fallback) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m.join(', ') : m) || fallback;
};

export default function CompleteAccount({ page, missing, onDone, onNavigate }) {
  const needPhone = missing.includes('phone');
  const [step, setStep] = useState(needPhone ? 'phone' : 'city');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [smsFailed, setSmsFailed] = useState(false);
  const why = WHY[String(page || '').split('-')[0]] || 'kuendelea';

  const regionSelect = (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: AUTH.INK }}>Mkoa wako</span>
      <select value={city} onChange={(e) => setCity(e.target.value)} data-testid="complete-city"
        style={{ height: 48, borderRadius: 12, border: '1px solid #cfd9de', padding: '0 12px', fontSize: 16, fontFamily: 'inherit', background: '#fff' }}>
        <option value="">Chagua mkoa</option>
        {TZ_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </label>
  );

  const sendCode = async (e) => {
    e?.preventDefault?.();
    const p = phoneForServer(phone);
    if (!/^255\d{9}$/.test(p)) { setError('Weka namba sahihi ya simu (mf. 0712345678).'); return; }
    if (missing.includes('city') && !city) { setError('Chagua mkoa wako.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/phone/start', { phone: p });
      setTicket(r?.data?.ticket || ''); setSmsFailed(r?.data?.otpSent === false); setCode(''); setStep('code');
    } catch (err) { setError(message(err, 'Imeshindikana kutuma namba ya siri.')); } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (code.length !== 6) { setError('Andika namba ya siri yenye tarakimu 6.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/phone/confirm', { ticket, otp: code, city: city || undefined });
      onDone(r?.data?.user || {});
    } catch (err) { setError(message(err, 'Namba ya siri si sahihi.')); } finally { setBusy(false); }
  };

  const saveCity = async (e) => {
    e?.preventDefault?.();
    if (!city) { setError('Chagua mkoa wako.'); return; }
    setBusy(true); setError('');
    try { const r = await api.post('/auth/city', { city }); onDone(r?.data?.user || { city }); }
    catch (err) { setError(message(err, 'Imeshindikana kuhifadhi.')); } finally { setBusy(false); }
  };

  const back = <AuthLink onClick={() => onNavigate('back')}>Si sasa, rudi</AuthLink>;

  if (step === 'code') {
    return (
      <AuthShell title="Andika namba ya siri" subtitle={`Tumetuma namba ya siri kwa SMS kwenda ${phone.trim()}.`} onLogo={() => onNavigate('Home')}>
        {smsFailed && <p role="alert" style={{ margin: 0, fontSize: 14, color: AUTH.RED }}>SMS haikutumwa. Jaribu tena baada ya muda mfupi.</p>}
        <CodeBoxes value={code} onChange={setCode} label="Namba ya siri" testId="complete-code" />
        <AuthError>{error}</AuthError>
        <AuthButton onClick={confirm} disabled={busy || code.length !== 6} testId="complete-confirm">{busy ? 'Inathibitisha…' : 'Thibitisha'}</AuthButton>
        <AuthLink onClick={() => { setStep('phone'); setError(''); }}>Badilisha namba</AuthLink>
      </AuthShell>
    );
  }

  if (step === 'city') {
    return (
      <AuthShell title="Uko mkoa gani?" subtitle={`Tunahitaji mkoa wako ili uweze ${why}: bei, ofisi na mawakala wa karibu nawe.`} onLogo={() => onNavigate('Home')}>
        <form onSubmit={saveCity} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {regionSelect}
          <AuthError>{error}</AuthError>
          <AuthButton type="submit" disabled={busy} testId="complete-city-save">{busy ? 'Inahifadhi…' : 'Endelea'}</AuthButton>
          {back}
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Ongeza namba ya simu" subtitle={`Ili uweze ${why}, weka namba yako ya simu mara moja. Tutakutumia namba ya siri kwa SMS; inatumika kwa malipo, mizigo na kuwasiliana na wateja.`} onLogo={() => onNavigate('Home')}>
      <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="complete-account">
        <AuthField label="Namba ya simu" value={phone} onChange={setPhone} type="tel" inputMode="tel" autoComplete="tel" testId="complete-phone" autoFocus />
        {missing.includes('city') && regionSelect}
        <AuthError>{error}</AuthError>
        <AuthButton type="submit" disabled={busy} testId="complete-send">{busy ? 'Inatuma…' : 'Tuma namba ya siri'}</AuthButton>
        {back}
      </form>
    </AuthShell>
  );
}
