import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// Agent work for Shipments (logistics repair Gate 4): pickup jobs the Agent
// can claim, and the Agent's own jobs with the one next action each needs.
//
//   claimed    -> collect from the sender (enter the code the SENDER gives)
//   collected  -> direct delivery: send the recipient their code, then enter
//                 the code the RECIPIENT gives; hub pickup: tell the hub
//   awaiting_hub -> the hub confirms receipt on its own screen
//
// The server decides what is allowed; this only shows what it returns
// (`nextAction`) and never holds a code longer than the input field.
const card = { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const btn = (primary) => ({
  border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer',
  backgroundColor: primary ? '#2563eb' : '#EFF6FF', color: primary ? '#fff' : '#1d4ed8',
});
const input = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 16, letterSpacing: 4, textAlign: 'center', margin: '8px 0' };

const STEP = {
  collect_from_sender: 'Collect from the sender',
  deliver_to_recipient: 'Deliver to the recipient',
  take_to_hub: 'Take to the hub',
  wait_for_hub: 'Waiting for the hub to confirm receipt',
};

export default function ShipmentPickupQueue({ onChanged, onCount }) {
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [codes, setCodes] = useState({});
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [a, m] = await Promise.allSettled([api.get('/pickup-tasks/available'), api.get('/pickup-tasks/mine')]);
    setAvailable(a.status === 'fulfilled' ? a.value.data || [] : []);
    setMine(m.status === 'fulfilled' ? m.value.data || [] : []);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Jobs that need the Agent: claimable ones plus their own open ones.
  const workCount = available.length + mine.filter((j) => j.nextAction).length;
  useEffect(() => { if (onCount) onCount(workCount); }, [onCount, workCount]);

  const act = async (taskId, request, okText) => {
    setBusy(taskId); setMessage(null);
    try {
      await request();
      setMessage({ type: 'ok', text: okText });
      setCodes((c) => ({ ...c, [taskId]: '' }));
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err?.response?.data?.message || 'That did not work. Try again.' });
    } finally { setBusy(null); }
  };
  const code = (id) => (codes[id] || '').trim();
  const codeInput = (id, placeholder) => (
    <input inputMode="numeric" maxLength={6} placeholder={placeholder} value={codes[id] || ''} style={input}
      onChange={(e) => setCodes((c) => ({ ...c, [id]: e.target.value.replace(/\D/g, '') }))} />
  );

  const open = mine.filter((j) => j.nextAction);
  const done = mine.filter((j) => !j.nextAction);
  if (!loaded || (available.length === 0 && mine.length === 0)) return null;

  return (
    <div style={{ marginBottom: 16 }} data-testid="shipment-pickup-queue">
      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
        Shipment pickups
      </div>
      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'} style={{ ...card, padding: 10, fontSize: 12, fontWeight: 700,
          color: message.type === 'error' ? '#B91C1C' : '#065F46', backgroundColor: message.type === 'error' ? '#FEF2F2' : '#ECFDF5' }}>
          {message.text}
        </div>
      )}

      {open.map((job) => (
        <div key={job.id} style={{ ...card, border: '2px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{job.itemDescription || 'Parcel'}</strong>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb' }}>{job.trackingNumber}</span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
            {job.pickupArea} → {job.deliverTo === 'recipient' ? job.destinationArea : (job.originHub?.name || 'Kentexa hub')}
            {job.weightKg > 0 ? ` · ${job.weightKg} kg` : ''}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 10 }}>{STEP[job.nextAction]}</div>

          {job.nextAction === 'collect_from_sender' && (
            <>
              {job.pickupContact && (
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  Sender: {job.pickupContact.name} · <a href={`tel:${job.pickupContact.phone}`}>{job.pickupContact.phone}</a>
                </div>
              )}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Ask the sender for their 6-digit handover code when you take the parcel.</div>
              {codeInput(job.id, 'Sender code')}
              <button style={btn(true)} disabled={busy === job.id || code(job.id).length !== 6}
                onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/collect`, { code: code(job.id) }), 'Parcel collected from the sender.')}>
                Confirm collection
              </button>
            </>
          )}

          {job.nextAction === 'deliver_to_recipient' && (
            <>
              {job.recipient && (
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  Recipient: {job.recipient.name} · <a href={`tel:${job.recipient.phone}`}>{job.recipient.phone}</a> · {job.recipient.area}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                When you are with the recipient, send them their code by SMS. Hand over the parcel only when they tell you the code.
              </div>
              <div style={{ marginTop: 8 }}>
                <button style={btn(false)} disabled={busy === job.id}
                  onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/delivery-code`), 'Code sent to the recipient by SMS.')}>
                  {job.recipientCodeIssued ? 'Send the code again' : 'Send code to recipient'}
                </button>
              </div>
              {codeInput(job.id, 'Recipient code')}
              <button style={btn(true)} disabled={busy === job.id || code(job.id).length !== 6}
                onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/deliver`, { code: code(job.id) }), 'Delivered. The recipient has the parcel.')}>
                Confirm delivery
              </button>
            </>
          )}

          {job.nextAction === 'take_to_hub' && (
            <>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                {job.originHub?.name}{job.originHub?.address ? ` · ${job.originHub.address}` : ''}
              </div>
              <div style={{ marginTop: 8 }}>
                <button style={btn(true)} disabled={busy === job.id}
                  onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/handover-request`), 'The hub has been asked to confirm receipt.')}>
                  I am at the hub
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {available.map((job) => (
        <div key={job.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{job.itemDescription || 'Parcel'}</strong>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>{job.deliverTo === 'recipient' ? 'Direct delivery' : 'To hub'}</span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
            {job.pickupArea} → {job.deliverTo === 'recipient' ? job.destinationArea : (job.originHubName || 'Kentexa hub')}
            {job.weightKg > 0 ? ` · ${job.weightKg} kg` : ''}
          </div>
          <div style={{ marginTop: 10 }}>
            <button style={btn(true)} disabled={busy === job.id}
              onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/claim`), 'Job claimed. Contact the sender to collect.')}>
              Claim this pickup
            </button>
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          Completed in the last 7 days: {done.map((j) => j.trackingNumber).join(', ')}
        </div>
      )}
    </div>
  );
}
