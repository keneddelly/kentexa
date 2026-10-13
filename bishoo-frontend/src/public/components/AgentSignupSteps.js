import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import IntelligentLocationInput from './IntelligentLocationInput';
import VerifyIdentityModal from './VerifyIdentityModal';
import { getPhonePosition } from '../../utils/phoneLocation';
import { identityState, needsIdentityStep, afterIdentitySent } from '../../utils/identityState';
import useIdentityRefresh from '../../utils/useIdentityRefresh';
import { pickAccountPlace } from '../../utils/accountPlace';

// Agent sign-up on ONE screen (audit B step 3; owner 2026-10-13: ask only
// what is new, verify a person once):
//   - name and phone come from the account and are shown, not asked;
//   - the ID screen appears only when no ID was sent (or it was rejected);
//     a waiting ID may apply, approval waits until it is verified;
//   - the city is pre-filled from the account when it matches the place list;
//   - asked: place, base point (GPS), vehicle, maximum weight.
// The server re-checks everything; this only guides.
const VEHICLES = ['boda', 'car', 'van', 'truck', 'foot'];
const card = { background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' };
const input = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit' };
const heading = { fontSize: 14, fontWeight: 900, margin: '16px 0 8px', color: '#1e293b' };
const primary = (on) => ({ width: '100%', padding: 14, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
  background: on ? 'linear-gradient(135deg,#f7971e,#ffd200)' : '#e2e8f0', color: on ? '#1e293b' : '#94a3b8', cursor: on ? 'pointer' : 'not-allowed' });

export default function AgentSignupSteps({ currentUser, onSubmitted, getPosition = getPhonePosition }) {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState(null);           // { status, level } from /identity/me
  useIdentityRefresh(setIdentity, true);
  const [showIdentity, setShowIdentity] = useState(false);
  const [placeText, setPlaceText] = useState('');
  const [place, setPlace] = useState(null);                  // picked place (placeRef + regionName)
  const [base, setBase] = useState(null);                    // { latitude, longitude, accuracyM }
  const [locating, setLocating] = useState(false);
  const [agentType, setAgentType] = useState('');
  const [maxWeightKg, setMaxWeightKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/identity/me').then((r) => setIdentity(r.data)).catch(() => setIdentity({ status: 'not_submitted', level: 0 }));
  }, []);

  // Pre-fill the place from the account's city, only when the place list has an exact match.
  const accountCity = (currentUser?.city || '').trim();
  useEffect(() => {
    if (!accountCity) return;
    let alive = true;
    setPlaceText((prev) => prev || accountCity);
    api.get('/location-intelligence/places', { params: { q: accountCity, limit: 8 } })
      .then((r) => {
        const match = pickAccountPlace(r.data?.candidates, accountCity);
        if (!alive || !match) return;
        setPlace((prev) => prev || match);
        setPlaceText((prev) => (prev === accountCity ? match.displayLabel : prev));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [accountCity]);

  const idState = identityState(identity);
  const name = currentUser?.name || '';
  const phone = currentUser?.phone || '';
  const ready = !!place?.placeRef && !!base && !!agentType && Number(maxWeightKg) >= 1 && !!phone;

  const takeBase = async () => {
    setLocating(true); setError('');
    try { setBase(await getPosition()); }
    catch (err) { setError(err?.code ? t(`pickup_pin.error_${err.code}`) : t('pickup_pin.error_unavailable')); }
    finally { setLocating(false); }
  };

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.post('/agents/register', {
        place: { providerKey: place.placeRef.providerKey, providerPlaceId: place.placeRef.providerPlaceId },
        base: { latitude: base.latitude, longitude: base.longitude, accuracyM: base.accuracyM },
        agentType, maxWeightKg: Number(maxWeightKg),
      });
      if (onSubmitted) onSubmitted(res.data?.message, res.data);
    } catch (err) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : (m || t('become_agent.submit_failed')));
    } finally { setBusy(false); }
  };

  const errorBox = error && <div role="alert" style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>;
  const account = (
    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
      <strong>{name || '—'}</strong> · {phone || '—'}
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{t('agent_signup.from_account')}</div>
    </div>
  );
  const identityModal = showIdentity && (
    <VerifyIdentityModal onClose={() => setShowIdentity(false)}
      onVerified={() => { setShowIdentity(false); setIdentity((p) => afterIdentitySent(p)); }} />
  );

  if (!identity) return <div data-testid="agent-signup" style={{ ...card, color: '#64748b' }}>⏳</div>;

  // The one ID screen: only when no ID was sent, or it was rejected.
  if (needsIdentityStep(identity)) {
    return (
      <div data-testid="agent-signup" style={card}>
        {account}
        <div data-testid="agent-identity-step" style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: 12, borderRadius: 10, fontSize: 13, color: '#7c2d12', marginTop: 12 }}>
          {idState === 'rejected' ? t('agent_signup.identity_rejected') : t('agent_signup.identity_missing')}
          <button type="button" onClick={() => setShowIdentity(true)} style={{ ...primary(true), marginTop: 10 }}>
            {t('agent_signup.identity_button')}
          </button>
        </div>
        {identityModal}
      </div>
    );
  }

  return (
    <div data-testid="agent-signup" style={card}>
      {errorBox}
      {account}
      {idState === 'waiting' && (
        <div role="status" style={{ background: '#fef9c3', color: '#854d0e', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginTop: 10 }}>
          <strong>{t('agent_signup.identity_pending')}</strong><br />{t('agent_signup.identity_pending_note')}
        </div>
      )}
      {!phone && <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 10 }}>{t('agent_signup.no_phone')}</div>}

      <h3 style={heading}>{t('agent_signup.step2_title')}</h3>
      <IntelligentLocationInput label={t('agent_signup.city_label')} value={placeText} onTextChange={setPlaceText}
        onResolved={setPlace} placeholder={t('agent_signup.city_placeholder')} required />
      {place?.regionName && <div style={{ fontSize: 12, color: '#16a34a', margin: '-6px 0 10px' }}>✔ {place.regionName}</div>}
      <div style={{ fontSize: 12, color: '#475569', margin: '6px 0 8px' }}>{t('agent_base.explain')}</div>
      <button type="button" data-testid="agent-base-button" onClick={takeBase} disabled={locating}
        style={{ ...primary(true), background: base ? '#ecfdf5' : '#ea580c', color: base ? '#065f46' : '#fff' }}>
        {locating ? t('pickup_pin.locating') : base ? `✔ ${t('agent_signup.base_taken', { m: Math.round(base.accuracyM || 0) })}` : t('agent_base.button')}
      </button>

      <h3 style={heading}>{t('agent_signup.step3_title')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))', gap: 8, marginBottom: 14 }}>
        {VEHICLES.map((v) => (
          <button type="button" key={v} onClick={() => setAgentType(v)} aria-pressed={agentType === v}
            style={{ padding: '12px 6px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer',
              border: agentType === v ? '2px solid #f59e0b' : '2px solid #e2e8f0', background: agentType === v ? '#fffbeb' : '#fff', color: '#1e293b' }}>
            {t(`agent_signup.vehicle_${v}`)}
          </button>
        ))}
      </div>
      <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 700, marginBottom: 5 }}>{t('agent_signup.max_kg_label')}</label>
      <input type="number" inputMode="numeric" min="1" max="5000" value={maxWeightKg}
        onChange={(e) => setMaxWeightKg(e.target.value)} placeholder="20" style={input} />
      <button type="button" disabled={busy || !ready} onClick={submit} style={{ ...primary(!busy && ready), marginTop: 14 }}>
        {busy ? t('become_agent.submitting_button') : t('agent_signup.submit')}
      </button>
      {identityModal}
    </div>
  );
}
