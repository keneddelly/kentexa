import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// The sender's side of an Agent pickup (logistics repair Gate 4): ask for an
// Agent, see who is coming, and get the one-time code to give them in person.
// The server decides every state; this shows `task.status` / `nextAction`.
const small = { fontSize: 12, color: '#475569', lineHeight: 1.5 };
const btn = (primary) => ({
  border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', marginRight: 8, marginTop: 8,
  backgroundColor: primary ? '#2563eb' : '#EFF6FF', color: primary ? '#fff' : '#1d4ed8',
});

const newRequestKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
};

// Which kind of pickup this Shipment can ask for, from its own stored hub
// decision: to its chosen origin hub, or (no hub, one city) straight to the
// recipient. The server re-checks the same rule.
export const pickupPathFor = (shipment) => {
  if (!shipment || shipment.status !== 'confirmed') return null;
  if (shipment.originHubId) return 'hub_routed';
  const same = String(shipment.originCity || '').trim().toLowerCase() === String(shipment.destinationCity || '').trim().toLowerCase();
  if (same && shipment.originHubSource === 'not_required' && shipment.destinationHubSource === 'not_required') return 'direct_delivery';
  return null;
};

export default function ShipmentPickupPanel({ shipment }) {
  const [task, setTask] = useState(undefined); // undefined = loading, null = none
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestKey] = useState(newRequestKey);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/shipments/${shipment.id}/pickup-task`);
      setTask(res.data?.task ?? null);
    } catch { setTask(null); }
  }, [shipment.id]);
  useEffect(() => { load(); }, [load]);

  const run = async (request, after) => {
    setBusy(true); setError('');
    try { const res = await request(); if (after) after(res); await load(); }
    catch (err) { setError(err?.response?.data?.message || 'That did not work. Try again.'); }
    finally { setBusy(false); }
  };

  if (task === undefined) return null;
  const path = pickupPathFor(shipment);
  const active = task && ['requested', 'claimed', 'collected', 'awaiting_hub'].includes(task.status);
  if (!active && !path) return null;

  return (
    <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 10, paddingTop: 10 }} onClick={(e) => e.stopPropagation()}>
      {!active && path && (
        <>
          <div style={small}>
            {path === 'direct_delivery'
              ? 'Kentexa inaweza kuja kuchukua mzigo hapa na kuupeleka moja kwa moja kwa mpokeaji.'
              : 'Kentexa inaweza kuja kuchukua mzigo hapa na kuupeleka kituoni kwa safari yake.'}
          </div>
          <button style={btn(true)} disabled={busy || !shipment.senderPhone}
            onClick={() => run(() => api.post(`/shipments/${shipment.id}/pickup-task`, {
              requestKey, servicePath: path,
              pickupContactName: (shipment.senderName || '').trim() || 'Sender',
              pickupContactPhone: (shipment.senderPhone || '').trim(),
            }))}>
            Njoo chukua mzigo
          </button>
          {!shipment.senderPhone && <div style={{ ...small, color: '#B91C1C' }}>Weka namba ya simu ya mtumaji ili anayekuja kuchukua mzigo aweze kuwasiliana nawe.</div>}
        </>
      )}

      {task?.status === 'requested' && (
        <>
          <div style={small}>Tunatafuta mtu wa Kentexa aliye karibu aje kuchukua mzigo.</div>
          <button style={btn(false)} disabled={busy} onClick={() => run(() => api.post(`/shipments/${shipment.id}/pickup-task/cancel`))}>
            Ghairi ombi
          </button>
        </>
      )}

      {task?.status === 'claimed' && (
        <>
          <div style={small}>
            Anayekuja kuchukua: <strong>{task.agent?.name || 'Kentexa'}</strong>
            {task.agent?.phone ? <> · <a href={`tel:${task.agent.phone}`}>{task.agent.phone}</a></> : null}
          </div>
          <div style={small}>Akifika na kukabidhi mzigo, mpe namba hii. Usimpe kabla hajafika.</div>
          {code ? (
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 6, color: '#0f172a', margin: '8px 0' }} aria-label="Handover code">
              {code.value}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0, color: '#64748b' }}>Inatumika kwa dakika {Math.round(code.seconds / 60)} </div>
            </div>
          ) : (
            <button style={btn(true)} disabled={busy}
              onClick={() => run(() => api.post(`/shipments/${shipment.id}/pickup-task/handoff-code`),
                (res) => setCode({ value: res.data.code, seconds: res.data.expiresInSeconds }))}>
              Onyesha namba ya kukabidhi
            </button>
          )}
          <button style={btn(false)} disabled={busy} onClick={() => run(() => api.post(`/shipments/${shipment.id}/pickup-task/cancel`), () => setCode(null))}>
            Ghairi
          </button>
        </>
      )}

      {(task?.status === 'collected' || task?.status === 'awaiting_hub') && (
        <div style={small}>
          {task.agent?.name || 'Kentexa'} ana mzigo wako
          {task.servicePath === 'direct_delivery' ? ' na anaupeleka kwa mpokeaji.' : ' na anaupeleka kituoni kwa safari yake.'}
        </div>
      )}

      {error && <div role="alert" style={{ ...small, color: '#B91C1C', marginTop: 6 }}>{error}</div>}
    </div>
  );
}
