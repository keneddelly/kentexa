import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPhonePosition, LANDMARK_MAX, WEAK_ACCURACY_M } from '../../utils/phoneLocation';

// Door pickup (NEXT_STEPS.md section 18, step 1): "Tumia mahali nilipo" — strongly
// asked for, not required until the map exists — and a required landmark note.
export default function PickupPinFields({ pin, onPin, landmark, onLandmark, getPosition = getPhonePosition }) {
  const { t } = useTranslation();
  const [state, setState] = useState('idle'); // idle | locating | error
  const [errorCode, setErrorCode] = useState(null);

  const locate = async () => {
    setState('locating'); setErrorCode(null);
    try {
      onPin(await getPosition());
      setState('idle');
    } catch (err) {
      setErrorCode(err?.code || 'unavailable');
      setState('error');
    }
  };

  const box = { borderRadius: 12, padding: 12, marginBottom: 16, background: '#F8FAFC', border: '1px solid #E2E8F0' };
  return (
    <div style={box} data-testid="pickup-pin-fields">
      <div style={{ fontSize: 12, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>{t('pickup_pin.title')}</div>

      {pin ? (
        <div style={{ fontSize: 13, color: '#166534', fontWeight: 700 }}>
          ✅ {t('pickup_pin.found', { m: pin.accuracyM })}
          {pin.accuracyM > WEAK_ACCURACY_M && (
            <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600, marginTop: 4 }}>{t('pickup_pin.weak')}</div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <button type="button" onClick={locate} disabled={state === 'locating'}
              style={{ background: 'none', border: 'none', padding: 0, color: '#2563EB', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {t('pickup_pin.retry')}
            </button>
            <button type="button" onClick={() => onPin(null)}
              style={{ background: 'none', border: 'none', padding: 0, color: '#64748B', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {t('pickup_pin.remove')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" onClick={locate} disabled={state === 'locating'}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', background: '#2563EB',
              color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: state === 'locating' ? 0.7 : 1 }}>
            {state === 'locating' ? t('pickup_pin.locating') : t('pickup_pin.use_location')}
          </button>
          {state === 'error' && (
            <div role="alert" style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}>{t(`pickup_pin.error_${errorCode}`)}</div>
          )}
          <div style={{ fontSize: 12, color: '#B45309', marginTop: 8 }}>{t('pickup_pin.ask')}</div>
        </>
      )}

      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F172A', marginTop: 12, marginBottom: 4 }}>
        {t('pickup_pin.landmark_label')}
      </label>
      <textarea value={landmark} maxLength={LANDMARK_MAX} rows={2} onChange={(e) => onLandmark(e.target.value)}
        placeholder={t('pickup_pin.landmark_placeholder')}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 15 }} />
      <div style={{ fontSize: 11, color: '#64748B' }}>{t('pickup_pin.landmark_hint')}</div>
    </div>
  );
}
