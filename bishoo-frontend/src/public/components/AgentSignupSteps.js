import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import IntelligentLocationInput from './IntelligentLocationInput';
import VerifyIdentityModal from './VerifyIdentityModal';
import { getPhonePosition } from '../../utils/phoneLocation';

// Agent sign-up in 3 short steps (owner 2026-10-13: "simple door, complex
// engine"; verify a person once, reuse it everywhere):
//   1. Wewe ni nani    — name/phone from the account, identity from the account
//   2. Unafanya kazi wapi — city from the place list + "📍 Weka kituo changu"
//   3. Unabeba nini    — vehicle type + maximum weight (no fees here)
// The server re-checks everything; this only guides.
const VEHICLES = ['boda', 'car', 'van', 'truck', 'foot'];
const card = { background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' };
const input = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit' };
const primary = (on) => ({ width: '100%', padding: 14, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
  background: on ? 'linear-gradient(135deg,#f7971e,#ffd200)' : '#e2e8f0', color: on ? '#1e293b' : '#94a3b8', cursor: on ? 'pointer' : 'not-allowed' });

export default function AgentSignupSteps({ currentUser, onSubmitted, getPosition = getPhonePosition }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState(null);           // { status, level } from /identity/me
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

  const identityOk = identity && (identity.status === 'verified' || identity.status === 'pending');
  const name = currentUser?.name || '';
  const phone = currentUser?.phone || '';

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
      if (onSubmitted) onSubmitted(res.data?.message);
    } catch (err) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : (m || t('become_agent.submit_failed')));
    } finally { setBusy(false); }
  };

  const stepDots = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }} aria-label={t('agent_signup.step_of', { step })}>
      {[1, 2, 3].map((n) => (
        <div key={n} style={{ flex: 1, height: 5, borderRadius: 3, background: n <= step ? '#f59e0b' : '#e2e8f0' }} />
      ))}
    </div>
  );
  const errorBox = error && <div role="alert" style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>;
  const back = (to) => (
    <button type="button" onClick={() => { setError(''); setStep(to); }}
      style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '10px 0 0' }}>
      ← {t('agent_signup.back')}
    </button>
  );

  return (
    <div data-testid="agent-signup" style={card}>
      {stepDots}
      {errorBox}

      {step === 1 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 12px', color: '#1e293b' }}>1. {t('agent_signup.step1_title')}</h3>
          <div style={{ fontSize: 14, color: '#1e293b', lineHeight: 1.7 }}>
            <div><strong>{t('agent_signup.name')}:</strong> {name || '—'}</div>
            <div><strong>{t('agent_signup.phone')}:</strong> {phone || '—'}</div>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 12px' }}>{t('agent_signup.from_account')}</div>
          {!identity ? (
            <div style={{ fontSize: 13, color: '#64748b' }}>⏳</div>
          ) : identity.status === 'verified' ? (
            <div data-testid="identity-ok" style={{ background: '#dcfce7', color: '#166534', padding: '10px 12px', borderRadius: 10, fontWeight: 800, fontSize: 14 }}>
              ✔ {t('agent_signup.identity_verified')}
            </div>
          ) : identity.status === 'pending' ? (
            <div style={{ background: '#fef9c3', color: '#854d0e', padding: '10px 12px', borderRadius: 10, fontSize: 13 }}>
              <strong>⏳ {t('agent_signup.identity_pending')}</strong><br />{t('agent_signup.identity_pending_note')}
            </div>
          ) : (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '12px', borderRadius: 10, fontSize: 13, color: '#7c2d12' }}>
              {identity.status === 'rejected' ? t('agent_signup.identity_rejected') : t('agent_signup.identity_missing')}
              <button type="button" onClick={() => setShowIdentity(true)} style={{ ...primary(true), marginTop: 10 }}>
                🪪 {t('agent_signup.identity_button')}
              </button>
            </div>
          )}
          {!phone && <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 10 }}>{t('agent_signup.no_phone')}</div>}
          <button type="button" disabled={!identityOk || !phone} onClick={() => setStep(2)} style={{ ...primary(identityOk && !!phone), marginTop: 14 }}>
            {t('agent_signup.next')}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 12px', color: '#1e293b' }}>2. {t('agent_signup.step2_title')}</h3>
          <IntelligentLocationInput label={t('agent_signup.city_label')} value={placeText} onTextChange={setPlaceText}
            onResolved={setPlace} placeholder={t('agent_signup.city_placeholder')} required />
          {place?.regionName && <div style={{ fontSize: 12, color: '#16a34a', margin: '-6px 0 10px' }}>✔ {place.regionName}</div>}
          <div style={{ fontSize: 12, color: '#475569', margin: '6px 0 8px' }}>{t('agent_base.explain')}</div>
          <button type="button" onClick={takeBase} disabled={locating}
            style={{ ...primary(true), background: base ? '#ecfdf5' : '#ea580c', color: base ? '#065f46' : '#fff' }}>
            {locating ? t('pickup_pin.locating') : base ? `✔ ${t('agent_signup.base_taken', { m: Math.round(base.accuracyM || 0) })}` : t('agent_base.button')}
          </button>
          <button type="button" disabled={!place?.placeRef || !base} onClick={() => { setError(''); setStep(3); }}
            style={{ ...primary(!!place?.placeRef && !!base), marginTop: 14 }}>
            {t('agent_signup.next')}
          </button>
          {back(1)}
        </>
      )}

      {step === 3 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 12px', color: '#1e293b' }}>3. {t('agent_signup.step3_title')}</h3>
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
          <button type="button" disabled={busy || !agentType || !(Number(maxWeightKg) >= 1)} onClick={submit}
            style={{ ...primary(!busy && !!agentType && Number(maxWeightKg) >= 1), marginTop: 14 }}>
            {busy ? t('become_agent.submitting_button') : t('agent_signup.submit')}
          </button>
          {back(2)}
        </>
      )}

      {showIdentity && (
        <VerifyIdentityModal onClose={() => setShowIdentity(false)}
          onVerified={() => { setShowIdentity(false); setIdentity((p) => ({ ...(p || {}), status: 'pending', level: 1 })); }} />
      )}
    </div>
  );
}
