/**
 * BuyerParcelAction.js — Buyer decides what to do with arrived parcel
 *
 * Shown when buyer receives SMS: "Bidhaa yako imefika Musoma"
 * They log in, see the parcel, and choose:
 *   A) Self-pickup — "Nitachukua mwenyewe" — hub still holds the parcel
 *   B) Request delivery — browses available agents in their city,
 *      sees each agent's rate, agrees with one, agent gets notified
 *
 * All agents are independent — buyer negotiates rate by picking from listed prices.
 * KenteXa earns nothing from the delivery fee — purely agent's income.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import { PageLoading, Spinner } from '../components/Loading';
import api from '../../api/api';
import { INK, MUTED, LINE, BLUE, eventLabel, when, Icon, IC, card, pill, tone } from './TrackParcel';

const STATUS_KEY = ['pending', 'in_transit', 'arrived_at_hub', 'awaiting_buyer', 'out_for_delivery', 'delivered', 'self_pickup'];

const Notice = ({ kind, children, onClose }) => {
  const [bg, fg] = kind === 'error' ? ['#fef2f2', '#b91c1c'] : kind === 'ok' ? ['#ecfdf3', '#166534'] : ['#eff6ff', BLUE];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{ backgroundColor: bg, color: fg, padding: '12px 14px', borderRadius: 12, fontSize: 14,
      display: 'flex', gap: 10, alignItems: 'flex-start', lineHeight: 1.4 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && <button type="button" aria-label="Funga" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: fg, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>}
    </div>
  );
};

const BuyerParcelAction = ({ onNavigate, isLoggedIn, trackingNumber }) => {
  const { t } = useTranslation();
  const [parcel, setParcel]         = useState(null);
  const [agents, setAgents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [view, setView]             = useState('parcel'); // 'parcel' | 'agents'
  const [customAddress, setCustomAddress] = useState('');

  useEffect(() => {
    if (!isLoggedIn) {
      localStorage.setItem('kentexa_after_login', `BuyerParcelAction-${trackingNumber}`);
      onNavigate('PublicLogin');
      return;
    }
    fetchParcel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchParcel = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/super-agents/track/${trackingNumber}`);
      setParcel(res.data);
    } catch { setError(t('buyer_parcel_action.parcel_not_found')); }
    finally { setLoading(false); }
  };

  const fetchAgents = async () => {
    if (!parcel?.destinationCity) return;
    try {
      setAgentsLoading(true);
      const res = await api.get(`/super-agents/shipments/agents/${encodeURIComponent(parcel.destinationCity)}`);
      setAgents(res.data || []);
    } catch { setAgents([]); }
    finally { setAgentsLoading(false); }
  };

  const handleSelfPickup = async () => {
    try {
      setActionLoading(true); setError('');
      await api.post(`/super-agents/shipments/${trackingNumber}/self-pickup`);
      setSuccess(t('buyer_parcel_action.self_pickup_success'));
      fetchParcel();
    } catch (err) {
      setError(err?.response?.data?.message || t('buyer_parcel_action.action_failed'));
    } finally { setActionLoading(false); }
  };

  const handleRequestDelivery = async () => {
    if (!selectedAgent) { setError(t('buyer_parcel_action.select_agent_first')); return; }
    try {
      setActionLoading(true); setError('');
      const response = await api.post(`/super-agents/shipments/${trackingNumber}/request-delivery`, {
        agentId:   selectedAgent.id,
        address:   customAddress.trim() || parcel.deliveryAddress,
      });
      setSuccess(t('buyer_parcel_action.request_delivery_success', {
        name: selectedAgent.fullName,
        fee: Number(response.data.agreedFee).toLocaleString(),
      }));
      setView('parcel');
      fetchParcel();
    } catch (err) {
      setError(err?.response?.data?.message || t('buyer_parcel_action.request_delivery_failed'));
    } finally { setActionLoading(false); }
  };

  const status = parcel?.status;
  const statusLabel = STATUS_KEY.includes(status) ? t(`buyer_parcel_action.status_${status}`) : (status || '');
  const [, toneFg] = tone(status);
  const isAwaiting = status === 'awaiting_buyer' && parcel?.buyerRequestedDelivery == null;
  const isActionable = ['awaiting_buyer', 'arrived_at_hub'].includes(status);
  const history = Array.isArray(parcel?.history) ? [...parcel.history]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) : []; // newest first
  const fee = (n) => Number(n).toLocaleString();
  const row = (label, value) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 15, padding: '6px 0' }}>
      <span style={{ color: MUTED }}>{label}</span><strong style={{ textAlign: 'right' }}>{value}</strong>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff' }}>
      <BackBar onBack={() => onNavigate('Home')} title={t('buyer_parcel_action.page_title')} top={0} />
      <PageLoading label={t('buyer_parcel_action.loading')} />
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff', color: INK }}>
      <BackBar onBack={() => view === 'agents' ? setView('parcel') : onNavigate('Home')}
        title={view === 'agents' ? t('buyer_parcel_action.request_delivery_button') : t('buyer_parcel_action.page_title')} top={0} />

      <div style={{ padding: 16, maxWidth: 520, margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 32 }}>
        {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
        {success && <Notice kind="ok">{success}</Notice>}

        {view === 'parcel' && parcel && (
          <>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{trackingNumber}</span>
              <span data-testid="parcel-status" style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.3 }}>{statusLabel}</span>
              {history[0]?.createdAt && <span style={{ fontSize: 15, color: MUTED }}>{eventLabel(history[0])} · {when(history[0].createdAt)}</span>}
            </section>

            {isActionable && parcel.buyerRequestedDelivery == null && (
              <section style={{ padding: 16, borderRadius: 16, backgroundColor: '#eff6ff', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{isAwaiting ? t('buyer_parcel_action.alert_title', { city: parcel.destinationCity }) : t('buyer_parcel_action.alert_desc')}</span>
                {[
                  { key: 'pickup', icon: IC.office, label: t('buyer_parcel_action.self_pickup_button'), sub: parcel.destinationAgent || parcel.destinationCity, onClick: handleSelfPickup },
                  { key: 'deliver', icon: IC.home, label: t('buyer_parcel_action.request_delivery_button'), sub: t('buyer_parcel_action.independent_agents_note'), onClick: () => { setView('agents'); fetchAgents(); } },
                ].map((o) => (
                  <button key={o.key} type="button" onClick={o.onClick} disabled={actionLoading} data-testid={`choice-${o.key}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: '#fff', border: 'none',
                      textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
                    <span style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {actionLoading && o.key === 'pickup' ? <Spinner size={18} color={BLUE} /> : <Icon d={o.icon} color={BLUE} />}
                    </span>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ fontSize: 15 }}>{o.label}</strong>
                      {o.sub && <span style={{ fontSize: 13, color: MUTED }}>{o.sub}</span>}
                    </span>
                  </button>
                ))}
              </section>
            )}

            {isActionable && parcel.buyerRequestedDelivery === false && <Notice>{t('buyer_parcel_action.pickup_planned_notice')}</Notice>}

            {parcel.buyerRequestedDelivery && status !== 'delivered' && status !== 'self_pickup' && (
              <Notice kind="ok">
                {t('buyer_parcel_action.delivery_requested_notice', { name: parcel.localAgentName || t('buyer_parcel_action.default_agent_name') })}
                {parcel.agreedDeliveryFee && t('buyer_parcel_action.agreed_fee_notice', { fee: fee(parcel.agreedDeliveryFee) })}
                {t('buyer_parcel_action.agent_will_contact')}
              </Notice>
            )}

            <section style={{ ...card, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, color: MUTED, marginBottom: 4 }}>{t('buyer_parcel_action.parcel_details_title')}</span>
              {parcel.description && row(t('buyer_parcel_action.label_product'), parcel.description)}
              {parcel.originCity && row(t('buyer_parcel_action.label_from'), parcel.originCity)}
              {parcel.destinationCity && row(t('buyer_parcel_action.label_to'), parcel.destinationCity)}
              {parcel.transitCity && row(t('buyer_parcel_action.label_via'), parcel.transitCity)}
              {parcel.senderName && row(t('buyer_parcel_action.label_sender'), parcel.senderName)}
              {parcel.expectedArrival && row(t('buyer_parcel_action.label_expected_arrival'), when(parcel.expectedArrival))}
            </section>

            {history.length > 0 && (
              <section>
                <h2 style={{ margin: '4px 0 10px', fontSize: 17, fontWeight: 800 }}>{t('buyer_parcel_action.history_title')}</h2>
                <ul data-testid="parcel-history" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {history.map((e, i) => (
                    <li key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: i < history.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, flexShrink: 0, backgroundColor: i === 0 ? toneFg : '#cfd9de' }} />
                      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: i === 0 ? 700 : 600 }}>{e.note || eventLabel(e)}</span>
                        {e.updatedBy && e.handlerType !== 'system' && (
                          <span style={{ fontSize: 13, color: MUTED }}>
                            {e.updatedBy}
                            {e.handlerPhone && <> · <a href={`tel:${e.handlerPhone}`} style={{ color: BLUE, textDecoration: 'none' }}>{e.handlerPhone}</a></>}
                          </span>
                        )}
                        <span style={{ fontSize: 13, color: MUTED }}>{[e.city, e.createdAt && when(e.createdAt)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {view === 'agents' && (
          <>
            <Notice>{t('buyer_parcel_action.agents_intro', { city: parcel?.destinationCity })}</Notice>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>{t('buyer_parcel_action.delivery_address_title')}</span>
              <input type="text" placeholder={parcel?.deliveryAddress || t('buyer_parcel_action.delivery_address_placeholder')}
                value={customAddress} onChange={(e) => setCustomAddress(e.target.value)}
                style={{ height: 48, border: '1px solid #cfd9de', borderRadius: 14, padding: '0 14px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </label>

            {agentsLoading ? (
              <PageLoading label={t('buyer_parcel_action.finding_agents')} />
            ) : agents.length === 0 ? (
              <section style={{ ...card, textAlign: 'center', padding: 24, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 16 }}>{t('buyer_parcel_action.no_agents_title', { city: parcel?.destinationCity })}</strong>
                <span style={{ fontSize: 14, color: MUTED }}>{t('buyer_parcel_action.no_agents_desc')}</span>
                <button type="button" onClick={handleSelfPickup} disabled={actionLoading} style={{ ...pill(INK), marginTop: 8 }}>
                  {actionLoading ? <Spinner size={18} color="#fff" /> : t('buyer_parcel_action.self_pickup_button')}
                </button>
              </section>
            ) : (
              <>
                <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {agents.map((agent) => {
                    const on = selectedAgent?.id === agent.id;
                    const done = Number(agent.totalDeliveriesCompleted) || 0;
                    return (
                      <button key={agent.id} type="button" role="radio" aria-checked={on} data-testid={`agent-${agent.id}`}
                        onClick={() => setSelectedAgent(on ? null : agent)}
                        style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', cursor: 'pointer', backgroundColor: '#fff',
                          fontFamily: 'inherit', color: INK, border: on ? `2px solid ${BLUE}` : `1px solid ${LINE}` }}>
                        <span style={{ display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%' }}>
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <strong style={{ fontSize: 15 }}>{agent.fullName}</strong>
                            <span style={{ fontSize: 13, color: MUTED }}>
                              {[agent.city, done > 0 && `${done} ${t('buyer_parcel_action.deliveries_completed_suffix')}`,
                                done > 0 && Number(agent.rating) > 0 && `${Number(agent.rating).toFixed(1)} / 5`].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span style={{ textAlign: 'right', flexShrink: 0 }}>
                            <strong style={{ fontSize: 17, color: BLUE }}>TZS {fee(agent.deliveryFee)}</strong>
                            <span style={{ display: 'block', fontSize: 12, color: MUTED }}>{t('buyer_parcel_action.delivery_fee_label')}</span>
                          </span>
                        </span>
                        {on && <span style={{ fontSize: 13, color: '#166534' }}>{t('buyer_parcel_action.agent_selected_notice', { name: agent.fullName, fee: fee(agent.deliveryFee) })}</span>}
                      </button>
                    );
                  })}
                </div>

                {selectedAgent && (
                  <button type="button" onClick={handleRequestDelivery} disabled={actionLoading} style={{ ...pill(BLUE), width: '100%' }}>
                    {actionLoading ? <><Spinner size={18} color="#fff" />{t('buyer_parcel_action.sending_request')}</>
                      : t('buyer_parcel_action.request_delivery_price_button', { fee: fee(selectedAgent.deliveryFee) })}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BuyerParcelAction;
