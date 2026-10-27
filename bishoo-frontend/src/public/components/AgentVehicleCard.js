import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { VEHICLES } from './AgentSignupSteps';
import { Spinner } from './Loading';

// "Usafiri wangu" (owner 2026-10-27: an agent is not only a boda): the agent changes their
// vehicle and the heaviest load they carry. Any vehicle is last mile and may collect
// pay-on-delivery cash. Saved with PATCH /agents/my-profile (the server keeps the list).
const PATHS = {
  boda: 'M5 18a3 3 0 100-6 3 3 0 000 6zM19 18a3 3 0 100-6 3 3 0 000 6zM8 15h6l3-6h-4M14 9l-2-4H9',
  bajaji: 'M4 16V9l4-4h9l3 5v6M4 16h16M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  bicycle: 'M5 18a3 3 0 100-6 3 3 0 000 6zM19 18a3 3 0 100-6 3 3 0 000 6zM5 15l4-7h6l4 7M9 8l3 7',
  car: 'M5 11l2-5h10l2 5M3 11h18v6H3zM7 17v2M17 17v2',
  van: 'M2 7h13v10H2zM15 10h4l3 3v4h-7M6 19a2 2 0 100-4 2 2 0 000 4zM18 19a2 2 0 100-4 2 2 0 000 4z',
  truck: 'M2 6h12v10H2zM14 10h4l3 3v3h-7M6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  foot: 'M13 4a2 2 0 100 4 2 2 0 000-4zM10 21l2-6 3 3v3M9 12l3-3 3 2 3 1M12 15l-3-3',
};

export default function AgentVehicleCard({ agentType, maxWeightKg, onSaved }) {
  const { t } = useTranslation();
  const [type, setType] = useState(agentType || '');
  const [kg, setKg] = useState(maxWeightKg != null ? String(maxWeightKg) : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const changed = type !== (agentType || '') || String(kg) !== (maxWeightKg != null ? String(maxWeightKg) : '');

  const save = async () => {
    setBusy(true); setMessage(null);
    try {
      await api.patch('/agents/my-profile', { agentType: type || undefined, maxWeightKg: kg ? Number(kg) : undefined });
      setMessage({ ok: true, text: t('agent_vehicle.saved') });
      if (onSaved) onSaved({ agentType: type, maxWeightKg: kg ? Number(kg) : null });
    } catch (err) {
      const text = err?.response?.data?.message || t('agent_vehicle.failed');
      setMessage({ ok: false, text: Array.isArray(text) ? text.join(', ') : text });
    } finally { setBusy(false); }
  };

  return (
    <section data-testid="agent-vehicle" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f1419' }}>{t('agent_vehicle.title')}</h2>
      <div role="radiogroup" aria-label={t('agent_vehicle.title')} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {VEHICLES.map((v) => {
          const on = type === v;
          return (
            <button key={v} type="button" role="radio" aria-checked={on} data-testid={`vehicle-${v}`} onClick={() => setType(v)}
              style={{ minHeight: 64, borderRadius: 14, border: on ? '2px solid #1d4ed8' : '1px solid #cfd9de', background: on ? '#eff6ff' : '#fff',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#0f1419', padding: 4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f1419" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[v]} /></svg>
              {t(`agent_signup.vehicle_${v}`)}
            </button>
          );
        })}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#536471' }}>{t('agent_vehicle.max_kg')}</span>
        <input type="number" inputMode="numeric" min="1" max="5000" value={kg} onChange={(e) => setKg(e.target.value)}
          style={{ height: 48, border: '1px solid #cfd9de', borderRadius: 14, padding: '0 14px', fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </label>
      <span style={{ fontSize: 13, color: '#536471' }}>{t('agent_vehicle.any_vehicle')}</span>
      {message && <div role={message.ok ? 'status' : 'alert'} style={{ fontSize: 14, color: message.ok ? '#166534' : '#b91c1c' }}>{message.text}</div>}
      {changed && (
        <button type="button" onClick={save} disabled={busy || !type}
          style={{ height: 48, borderRadius: 24, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {busy ? <Spinner size={18} color="#fff" /> : t('agent_vehicle.save')}
        </button>
      )}
    </section>
  );
}
