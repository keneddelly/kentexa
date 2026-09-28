/**
 * RecipientJourney — the recipient's own view of a parcel: where it is now, who holds
 * it, and the one thing (if anything) they can do next. Read-only projection from
 * GET /super-agents/track/:tn/recipient-journey; the only write it can trigger is the
 * existing "choose delivery or pickup" page (BuyerParcelAction), and only when the
 * backend says the parcel lifecycle makes that choice valid.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { journeyView } from '../../context/recipientJourney';

export function useRecipientJourney(trackingNumber, enabled = true) {
  const [journey, setJourney] = useState(null);
  const load = useCallback(async () => {
    if (!enabled || !trackingNumber) { setJourney(null); return; }
    try {
      const res = await api.get(`/super-agents/track/${encodeURIComponent(trackingNumber)}/recipient-journey`);
      setJourney(res.data || null);
    } catch {
      setJourney(null); // fail closed: no journey, no action
    }
  }, [trackingNumber, enabled]);
  useEffect(() => { load(); }, [load]);
  return [journey, load];
}

const STEP_ICON = { done: '✓', current: '●', todo: '○' };
const STEP_COLOR = { done: '#16a34a', current: '#1d4ed8', todo: '#94a3b8' };

export const RecipientJourneyCard = ({ journey, onChoose }) => {
  const { t } = useTranslation();
  const view = journeyView(journey);
  if (!view) return null;
  const needsAttention = view.stage === 'attention';
  return (
    <div data-testid="recipient-journey" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 12,
      border: view.canChooseMethod ? '2px solid #1d4ed8' : '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{t('recipient_journey.heading')}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{t(view.titleKey)}</div>
      <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>{t(view.bodyKey)}</div>

      {!needsAttention && (
        <ol style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'grid', gap: 6 }}>
          {view.steps.map(step => (
            <li key={step.key} data-step={step.key} data-state={step.state}
              style={{ display: 'flex', gap: 8, fontSize: 13, color: STEP_COLOR[step.state],
                fontWeight: step.state === 'current' ? 800 : 500 }}>
              <span aria-hidden="true" style={{ width: 16, textAlign: 'center' }}>{STEP_ICON[step.state]}</span>
              <span>{t(`recipient_journey.step_${step.key}`)}</span>
            </li>
          ))}
        </ol>
      )}

      {view.holder && (
        <div data-testid="rj-custody" style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>
          📍 {t('recipient_journey.currently_with', { name: view.holder.name })}
        </div>
      )}
      {view.destinationHub && ['arriving', 'choose_method', 'pickup_planned'].includes(view.stage) && (
        <div style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>
          🏢 {t('recipient_journey.destination_hub', { name: view.destinationHub.name })}
          {view.destinationHub.address ? ` — ${view.destinationHub.address}` : ''}
        </div>
      )}
      {view.delivery?.agentName && ['delivery_requested', 'out_for_delivery'].includes(view.stage) && (
        <div style={{ fontSize: 13, color: '#334155', marginBottom: 8 }}>
          🏍️ {t('recipient_journey.delivery_by', { name: view.delivery.agentName })}
          {view.delivery.fee != null ? ` · ${t('recipient_journey.agreed_fee', { fee: Number(view.delivery.fee).toLocaleString() })}` : ''}
        </div>
      )}
      {view.codAmount != null && (
        <div data-testid="rj-cod" style={{ fontSize: 13, fontWeight: 700, color: '#92400e', backgroundColor: '#fffbeb',
          border: '1px solid #fde68a', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
          💵 {t('recipient_journey.cod_due', { amount: view.codAmount.toLocaleString() })}
        </div>
      )}
      {view.codeNotice && (
        <div data-testid="rj-code" style={{ fontSize: 13, color: '#1e3a8a', backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
          🔐 {t(`recipient_journey.code_${view.codeNotice}`)}
        </div>
      )}

      {view.canChooseMethod && onChoose && (
        <button onClick={onChoose}
          style={{ width: '100%', minHeight: 48, border: 0, borderRadius: 10, background: '#1d4ed8',
            color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
          {t('recipient_journey.choose_button')}
        </button>
      )}
    </div>
  );
};

/**
 * Tracking-page entry: fetches the projection for a signed-in viewer. A signed-out
 * viewer only sees a sign-in prompt for parcels that reached the destination side;
 * a signed-in viewer who is not the recipient sees nothing (public tracking below
 * is unchanged).
 */
const RecipientJourney = ({ trackingNumber, status, isLoggedIn, onNavigate }) => {
  const { t } = useTranslation();
  const [journey] = useRecipientJourney(trackingNumber, !!isLoggedIn);
  if (!isLoggedIn) {
    if (!['arrived_at_hub', 'awaiting_buyer', 'out_for_delivery'].includes(status)) return null;
    return (
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t('recipient_journey.signin_prompt')}</div>
        <button onClick={() => onNavigate('PublicLogin')}
          style={{ width: '100%', minHeight: 44, border: 0, borderRadius: 10, background: '#1d4ed8', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
          {t('recipient_journey.signin_button')}
        </button>
      </div>
    );
  }
  return <RecipientJourneyCard journey={journey}
    onChoose={() => onNavigate(`BuyerParcelAction-${trackingNumber}`)} />;
};

export default RecipientJourney;
