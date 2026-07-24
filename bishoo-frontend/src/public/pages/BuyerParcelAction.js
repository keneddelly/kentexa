/**
 * BuyerParcelAction.js — Buyer decides what to do with arrived parcel
 *
 * Shown when buyer receives SMS: "Bidhaa yako imefika Musoma"
 * They log in, see the parcel, and choose:
 *   A) Self-pickup — "Nitachukua mwenyewe" — closes tracking
 *   B) Request delivery — browses available agents in their city,
 *      sees each agent's rate, agrees with one, agent gets notified
 *
 * All agents are independent — buyer negotiates rate by picking from listed prices.
 * KenteXa earns nothing from the delivery fee — purely agent's income.
 */
import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer from '../components/Footer';
import api from '../../api/api';

const STATUS_LABELS = {
  pending:         { label: 'Inasubiri',        color: '#64748b', bg: '#f1f5f9' },
  in_transit:      { label: '🚌 Ipo Njiani',    color: '#ca8a04', bg: '#fef9c3' },
  arrived_at_hub:  { label: '🏢 Imefika Hub',   color: '#7c3aed', bg: '#ede9fe' },
  awaiting_buyer:  { label: '⏳ Inakusubiri!',  color: '#dc2626', bg: '#fee2e2' },
  out_for_delivery:{ label: '🏍️ Inakuja Kwako', color: '#f59e0b', bg: '#fef9c3' },
  delivered:       { label: '✅ Imefikishwa',   color: '#16a34a', bg: '#dcfce7' },
  self_pickup:     { label: '✅ Ulichukua',      color: '#16a34a', bg: '#dcfce7' },
};

const TIER_ICON = { basic: '🥉', silver: '🥈', gold: '🥇' };

const BuyerParcelAction = ({ onNavigate, isLoggedIn, onLogout, userRole, trackingNumber }) => {
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
    } catch { setError('Parcel haikupatikana. Angalia namba ya kufuatilia.'); }
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
      setSuccess('Umesajili kukichukua mwenyewe. Asante kwa kutumia KenteXa! 🎉');
      fetchParcel();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa');
    } finally { setActionLoading(false); }
  };

  const handleRequestDelivery = async () => {
    if (!selectedAgent) { setError('Chagua wakala kwanza'); return; }
    try {
      setActionLoading(true); setError('');
      await api.post(`/super-agents/shipments/${trackingNumber}/request-delivery`, {
        agentId:   selectedAgent.id,
        agreedFee: selectedAgent.deliveryFee,
        address:   customAddress.trim() || parcel.deliveryAddress,
      });
      setSuccess(
        `Ombi limetumwa kwa ${selectedAgent.fullName}! ` +
        `Atawasiliana nawe hivi karibuni. Ada: TZS ${Number(selectedAgent.deliveryFee).toLocaleString()}`
      );
      setView('parcel');
      fetchParcel();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kutuma ombi');
    } finally { setActionLoading(false); }
  };

  const st = parcel ? (STATUS_LABELS[parcel.status] || { label: parcel.status, color: '#64748b', bg: '#f1f5f9' }) : null;
  const isAwaiting = parcel?.status === 'awaiting_buyer';
  const isActionable = ['awaiting_buyer', 'arrived_at_hub'].includes(parcel?.status);

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="BuyerParcelAction" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ Inapakia...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="BuyerParcelAction" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => view === 'agents' ? setView('parcel') : onNavigate('Home')}
        title={view === 'agents' ? '← Rudi' : '📦 Kifurushi Chako'} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
            ✅ {success}
          </div>
        )}

        {/* ── PARCEL VIEW ─────────────────────────────────────────────────── */}
        {view === 'parcel' && parcel && (
          <>
            {/* Status hero */}
            <div style={{ backgroundColor: st.bg, borderRadius: 20, padding: 24, textAlign: 'center', marginBottom: 16, border: `2px solid ${st.color}20` }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>
                {parcel.status === 'awaiting_buyer' ? '🔔' :
                 parcel.status === 'delivered' || parcel.status === 'self_pickup' ? '🎉' : '📦'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: st.color, marginBottom: 4 }}>
                {st.label}
              </div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#94a3b8' }}>{trackingNumber}</div>
            </div>

            {/* Alert if awaiting action */}
            {isAwaiting && (
              <div style={{ backgroundColor: '#fff7ed', border: '2px solid #fed7aa', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#c2410c', marginBottom: 6 }}>
                  📍 Bidhaa yako ipo {parcel.destinationCity} — Chagua jinsi ya kuipata!
                </div>
                <div style={{ fontSize: 12, color: '#92400e' }}>
                  Inakusubiri. Chagua moja ya chaguzi hapa chini.
                </div>
              </div>
            )}

            {/* Parcel details */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>📋 Maelezo ya Kifurushi</div>
              {[
                ['Bidhaa', parcel.description || '—'],
                ['Kutoka', parcel.originCity || '—'],
                ['Kwenda', parcel.destinationCity || '—'],
                ...(parcel.transitCity ? [['Via', parcel.transitCity]] : []),
                ['Mtumaji', parcel.senderName || '—'],
                ...(parcel.expectedArrival ? [['Tarehe ya Kuwasili', new Date(parcel.expectedArrival).toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long' })]] : []),
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Tracking history */}
            {parcel.history?.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>🗺️ Historia ya Safari</div>
                {[...parcel.history].reverse().map((event, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: i === 0 ? '#16a34a' : '#e2e8f0', marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        {event.note || event.status?.replace(/_/g, ' ')}
                      </div>
                      {event.updatedBy && event.handlerType !== 'system' && (
                        <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>
                          {event.handlerType === 'super_agent' ? '🏢' : '🤝'} {event.updatedBy}
                          {event.handlerPhone && (
                            <a href={`tel:${event.handlerPhone}`} style={{ marginLeft: 8, color: '#1d4ed8', textDecoration: 'none' }}>
                              📞 {event.handlerPhone}
                            </a>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {event.city && `📍 ${event.city} · `}
                        {event.createdAt && new Date(event.createdAt).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons — only when awaiting */}
            {isActionable && !parcel.buyerRequestedDelivery && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => { setView('agents'); fetchAgents(); }}
                  style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 16, borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 900, boxShadow: '0 4px 12px rgba(29,78,216,0.3)' }}>
                  🏍️ Omba Delivery — Tazama Mawakala
                </button>
                <button
                  onClick={handleSelfPickup} disabled={actionLoading}
                  style={{ width: '100%', background: '#fff', color: '#475569', border: '2px solid #e2e8f0', padding: 14, borderRadius: 14, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  {actionLoading ? '⏳' : '🚶 Nitachukua Mwenyewe'}
                </button>
                <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                  Mawakala ni biashara huru — bei unazozipata ni zao wenyewe
                </div>
              </div>
            )}

            {/* Delivery already requested */}
            {parcel.buyerRequestedDelivery && parcel.status !== 'delivered' && parcel.status !== 'self_pickup' && (
              <div style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#15803d' }}>
                ✅ Umeomba delivery kwa <strong>{parcel.localAgentName || 'wakala'}</strong>.
                {parcel.agreedDeliveryFee && ` Ada iliyokubaliwa: TZS ${Number(parcel.agreedDeliveryFee).toLocaleString()}.`}
                {' '}Wakala atawasiliana nawe hivi karibuni.
              </div>
            )}
          </>
        )}

        {/* ── AGENTS VIEW ──────────────────────────────────────────────────── */}
        {view === 'agents' && (
          <>
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
              🏍️ Mawakala hawa wako <strong>{parcel?.destinationCity}</strong>. Bei ni zao wenyewe — chagua unayempendelea.
              KenteXa haichukui sehemu ya ada ya delivery.
            </div>

            {/* Custom delivery address */}
            <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>📍 Anwani ya Delivery</div>
              <input type="text"
                placeholder={parcel?.deliveryAddress || 'Weka anwani yako ya delivery (au acha tupu kwa anwani iliyosajiliwa)'}
                value={customAddress} onChange={e => setCustomAddress(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            {agentsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Inatafuta mawakala...</div>
            ) : agents.length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>😔</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                  Hakuna mawakala {parcel?.destinationCity} kwa sasa
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                  Unaweza kuchukua mwenyewe au jaribu tena baadaye
                </div>
                <button onClick={handleSelfPickup} disabled={actionLoading}
                  style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                  🚶 Nitachukua Mwenyewe
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {agents.map(agent => (
                    <div key={agent.id}
                      onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                      style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        border: selectedAgent?.id === agent.id ? '2px solid #1d4ed8' : '2px solid transparent' }}>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{agent.fullName}</span>
                            {agent.tier && <span style={{ fontSize: 12 }}>{TIER_ICON[agent.tier]}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            📍 {agent.city || '—'} · ⭐ {Number(agent.rating).toFixed(1)} · {agent.totalDeliveriesCompleted} zimefishwa
                          </div>
                          {agent.agentCode && (
                            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', marginTop: 2 }}>{agent.agentCode}</div>
                          )}
                        </div>
                        {/* Delivery fee — the main number buyer sees */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 20, fontWeight: 900, color: '#1d4ed8' }}>
                            TZS {Number(agent.deliveryFee).toLocaleString()}
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>ada ya delivery</div>
                        </div>
                      </div>

                      {selectedAgent?.id === agent.id && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                          <div style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#15803d', marginBottom: 10 }}>
                            ✅ Umechagua <strong>{agent.fullName}</strong> kwa TZS {Number(agent.deliveryFee).toLocaleString()}.
                            Baada ya kuthibitisha, atatumwa SMS na maelezo ya delivery.
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {selectedAgent && (
                  <button onClick={handleRequestDelivery} disabled={actionLoading}
                    style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 16, borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 900, boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}>
                    {actionLoading ? '⏳ Inatuma ombi...' : `✅ Omba Delivery — TZS ${Number(selectedAgent.deliveryFee).toLocaleString()}`}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default BuyerParcelAction;