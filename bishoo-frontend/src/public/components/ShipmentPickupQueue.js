import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
// Texts follow the app language (pickup_queue.* in locales).
const card = { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const btn = (primary) => ({
  border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer',
  backgroundColor: primary ? '#2563eb' : '#EFF6FF', color: primary ? '#fff' : '#1d4ed8',
});
const input = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 16, letterSpacing: 4, textAlign: 'center', margin: '8px 0' };

// The exact pickup point, shown only after the agent accepted (section 18).
// No pin: the landmark note and "call the sender".
export function PickupPoint({ point }) {
  const { t } = useTranslation();
  return (
    <div data-testid="pickup-point" style={{ marginTop: 8, padding: 10, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      {point.landmark && <div style={{ fontSize: 13, color: '#0f172a' }}><strong>{t('pickup_queue.landmark')}:</strong> {point.landmark}</div>}
      {point.ward && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{t('pickup_queue.ward_near')}: {point.ward}</div>}
      {point.hasPin ? (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <a href={point.mapsUrl} target="_blank" rel="noopener noreferrer"
            style={{ ...btn(true), textDecoration: 'none', display: 'inline-block' }}>📍 {t('pickup_queue.open_map')}</a>
          {point.accuracyM != null && <span style={{ fontSize: 11, color: '#64748b' }}>{t('pickup_queue.pin_accuracy', { m: point.accuracyM })}</span>}
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#b45309' }}>{point.note || t('pickup_queue.no_pin')}</div>
      )}
    </div>
  );
}

export default function ShipmentPickupQueue({ onChanged, onCount }) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [codes, setCodes] = useState({});
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }
  const [loaded, setLoaded] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(null); // D2: job id awaiting "Una uhakika?"

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
      setMessage({ type: 'error', text: err?.response?.data?.message || t('pickup_queue.failed') });
    } finally { setBusy(null); }
  };
  const code = (id) => (codes[id] || '').trim();
  const codeInput = (id, placeholder) => (
    <input inputMode="numeric" maxLength={6} placeholder={placeholder} value={codes[id] || ''} style={input}
      onChange={(e) => setCodes((c) => ({ ...c, [id]: e.target.value.replace(/\D/g, '') }))} />
  );

  const open = mine.filter((j) => j.nextAction);
  const done = mine.filter((j) => !j.nextAction);
  // Keep the last message visible even when no job is left (e.g. after "Siwezi kufika").
  if (!loaded || (available.length === 0 && mine.length === 0 && !message)) return null;

  return (
    <div style={{ marginBottom: 16 }} data-testid="shipment-pickup-queue">
      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
        {t('pickup_queue.title')}
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
            <strong style={{ fontSize: 14 }}>{job.itemDescription || t('pickup_queue.parcel')}</strong>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb' }}>{job.trackingNumber}</span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
            {job.pickupArea} → {job.deliverTo === 'recipient' ? job.destinationArea : (job.originHub?.name || t('pickup_queue.default_hub'))}
            {job.weightKg > 0 ? ` · ${job.weightKg} kg` : ''}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 10 }}>{job.nextAction ? t(`pickup_queue.step_${job.nextAction}`) : ''}</div>

          {job.nextAction === 'collect_from_sender' && (
            <>
              {job.pickupContact && (
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  {t('pickup_queue.sender')}: {job.pickupContact.name} · <a href={`tel:${job.pickupContact.phone}`}>{job.pickupContact.phone}</a>
                </div>
              )}
              {job.pickupPoint && <PickupPoint point={job.pickupPoint} />}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{t('pickup_queue.ask_sender_code')}</div>
              {codeInput(job.id, t('pickup_queue.sender_code'))}
              <button style={btn(true)} disabled={busy === job.id || code(job.id).length !== 6}
                onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/collect`, { code: code(job.id) }), t('pickup_queue.collected_ok'))}>
                {t('pickup_queue.confirm_collection')}
              </button>
              {/* D2: give the job back before collecting; an on-page confirmation, never a browser pop-up. */}
              {confirmRelease === job.id ? (
                <div data-testid="release-confirm" style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <div style={{ fontSize: 13, color: '#7F1D1D', marginBottom: 8 }}>{t('pickup_queue.cannot_come_confirm')}</div>
                  <button style={{ ...btn(true), backgroundColor: '#DC2626', marginRight: 8 }} disabled={busy === job.id}
                    onClick={() => { setConfirmRelease(null); act(job.id, () => api.post(`/pickup-tasks/${job.id}/release`), t('pickup_queue.released_ok')); }}>
                    {t('pickup_queue.cannot_come_yes')}
                  </button>
                  <button style={btn(false)} onClick={() => setConfirmRelease(null)}>{t('pickup_queue.cannot_come_no')}</button>
                </div>
              ) : (
                <button data-testid="release-button" style={{ ...btn(false), marginTop: 10, display: 'block', color: '#B91C1C', backgroundColor: '#FEF2F2' }}
                  disabled={busy === job.id} onClick={() => setConfirmRelease(job.id)}>
                  {t('pickup_queue.cannot_come')}
                </button>
              )}
            </>
          )}

          {job.nextAction === 'deliver_to_recipient' && (
            <>
              {job.recipient && (
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  {t('pickup_queue.recipient')}: {job.recipient.name} · <a href={`tel:${job.recipient.phone}`}>{job.recipient.phone}</a> · {job.recipient.area}
                </div>
              )}
              {/* COD: what to collect at the door (goods + the rider's boda fee). */}
              {job.cod && (
                <div data-testid="pickup-cod" style={{ fontSize: 13, fontWeight: 800, color: '#b45309', backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
                  {t('pickup_queue.cod_collect', {
                    total: Number(job.cod.total).toLocaleString('en-US'),
                    goods: Number(job.cod.goods).toLocaleString('en-US'),
                    boda: Number(job.cod.bodaFee).toLocaleString('en-US'),
                  })}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                {job.cod && job.recipientCodeIssued ? t('pickup_queue.cod_code_sent') : t('pickup_queue.recipient_explain')}
              </div>
              {/* A COD buyer got their code when the rider accepted; it is never sent again. */}
              {!(job.cod && job.recipientCodeIssued) && (
                <div style={{ marginTop: 8 }}>
                  <button style={btn(false)} disabled={busy === job.id}
                    onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/delivery-code`), t('pickup_queue.code_sent_ok'))}>
                    {job.recipientCodeIssued ? t('pickup_queue.send_code_again') : t('pickup_queue.send_code')}
                  </button>
                </div>
              )}
              {codeInput(job.id, t('pickup_queue.recipient_code'))}
              <button style={btn(true)} disabled={busy === job.id || code(job.id).length !== 6}
                onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/deliver`, { code: code(job.id) }), t('pickup_queue.delivered_ok'))}>
                {t('pickup_queue.confirm_delivery')}
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
                  onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/handover-request`), t('pickup_queue.hub_asked_ok'))}>
                  {t('pickup_queue.at_hub')}
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {available.map((job) => (
        <div key={job.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{job.itemDescription || t('pickup_queue.parcel')}</strong>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>{job.deliverTo === 'recipient' ? t('pickup_queue.direct_delivery') : t('pickup_queue.to_hub')}</span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
            {job.pickupArea} → {job.deliverTo === 'recipient' ? job.destinationArea : (job.originHubName || t('pickup_queue.default_hub'))}
            {job.weightKg > 0 ? ` · ${job.weightKg} kg` : ''}
          </div>
          {/* Before accepting: the ward only — the exact pin comes after accepting. */}
          {job.pickupWard && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{t('pickup_queue.ward_near')}: {job.pickupWard}</div>}
          {job.distance && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>📍 {t('pickup_queue.distance')}: {job.distance}</div>}
          <div style={{ marginTop: 10 }}>
            <button style={btn(true)} disabled={busy === job.id}
              onClick={() => act(job.id, () => api.post(`/pickup-tasks/${job.id}/claim`), t('pickup_queue.claimed_ok'))}>
              {t('pickup_queue.claim')}
            </button>
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          {t('pickup_queue.completed_7_days')}: {done.map((j) => j.trackingNumber).join(', ')}
        </div>
      )}
    </div>
  );
}
