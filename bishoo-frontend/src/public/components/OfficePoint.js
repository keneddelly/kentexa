import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { getPhonePosition } from '../../utils/phoneLocation';

// "📍 Weka mahali pa ofisi": the office's exact map point, set once with the
// phone's GPS (same rules as the agent base point: inside Tanzania, accuracy
// up to 500 m). Customers see it as "Fungua ramani" on the no-agent office card.
// officePointByGps: set with this button; officePointSet only: an approximate
// place centre from the place picker.
export default function OfficePoint({ officePointSet, officePointByGps, onSaved, getPosition = getPhonePosition }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text }

  const save = async () => {
    setBusy(true); setMessage(null);
    try {
      const pos = await getPosition();
      const res = await api.patch('/super-agents/my-profile/office-point', { latitude: pos.latitude, longitude: pos.longitude, accuracyM: pos.accuracyM });
      setMessage({ ok: true, text: res.data?.message || t('office_point.saved') });
      if (onSaved) onSaved(res.data);
    } catch (err) {
      const text = err?.response?.data?.message || (err?.code ? t(`pickup_pin.error_${err.code}`) : t('pickup_pin.error_unavailable'));
      setMessage({ ok: false, text: Array.isArray(text) ? text.join(', ') : text });
    } finally { setBusy(false); }
  };

  const note = message && (
    <div role={message.ok ? 'status' : 'alert'} style={{ marginTop: 6, fontSize: 12, color: message.ok ? '#16a34a' : '#b91c1c' }}>{message.text}</div>
  );

  if (officePointByGps) {
    return (
      <div data-testid="office-point" style={{ fontSize: 12, color: '#475569', marginBottom: 14 }}>
        {t('office_point.set_gps')}{' '}
        <button type="button" onClick={save} disabled={busy}
          style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
          {busy ? '⏳' : t('office_point.change')}
        </button>
        {note}
      </div>
    );
  }
  return (
    <div data-testid="office-point" style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#9A3412' }}>{t('office_point.title')}</div>
      <div style={{ fontSize: 12, color: '#7C2D12', margin: '6px 0 10px' }}>
        {officePointSet ? t('office_point.only_place') : t('office_point.explain')}
      </div>
      <button type="button" onClick={save} disabled={busy}
        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', background: '#EA580C', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
        {busy ? t('pickup_pin.locating') : t('office_point.button')}
      </button>
      {note}
    </div>
  );
}
