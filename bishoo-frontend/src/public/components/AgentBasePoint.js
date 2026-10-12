import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { getPhonePosition } from '../../utils/phoneLocation';

// "📍 Weka kituo changu" (NEXT_STEPS.md section 18 b): the agent's fixed base
// point, set once with the phone's GPS. Required to go online and to accept
// pickups; pickups are offered to the nearest agents first. No live tracking.
export default function AgentBasePoint({ hasBasePoint, baseSetAt, onSaved, getPosition = getPhonePosition }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text }

  const save = async () => {
    setBusy(true); setMessage(null);
    try {
      const pos = await getPosition();
      const res = await api.patch('/agents/my-base', { latitude: pos.latitude, longitude: pos.longitude, accuracyM: pos.accuracyM });
      setMessage({ ok: true, text: res.data?.message || t('agent_base.saved') });
      if (onSaved) onSaved(res.data);
    } catch (err) {
      const text = err?.response?.data?.message || (err?.code ? t(`pickup_pin.error_${err.code}`) : t('pickup_pin.error_unavailable'));
      setMessage({ ok: false, text: Array.isArray(text) ? text.join(', ') : text });
    } finally { setBusy(false); }
  };

  if (hasBasePoint) {
    return (
      <div data-testid="agent-base-point" style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
        📍 {t('agent_base.set_on', { date: baseSetAt ? new Date(baseSetAt).toLocaleDateString('sw-TZ') : '' })}{' '}
        <button type="button" onClick={save} disabled={busy}
          style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
          {busy ? '⏳' : t('agent_base.change')}
        </button>
        {message && <div role={message.ok ? 'status' : 'alert'} style={{ marginTop: 4, color: message.ok ? '#16a34a' : '#b91c1c' }}>{message.text}</div>}
      </div>
    );
  }
  return (
    <div data-testid="agent-base-point" style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#9A3412' }}>{t('agent_base.title')}</div>
      <div style={{ fontSize: 12, color: '#7C2D12', margin: '6px 0 10px' }}>{t('agent_base.explain')}</div>
      <button type="button" onClick={save} disabled={busy}
        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', background: '#EA580C', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
        {busy ? t('pickup_pin.locating') : t('agent_base.button')}
      </button>
      {message && <div role={message.ok ? 'status' : 'alert'} style={{ marginTop: 8, fontSize: 12, color: message.ok ? '#16a34a' : '#b91c1c' }}>{message.text}</div>}
    </div>
  );
}
