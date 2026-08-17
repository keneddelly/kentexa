/**
 * SendShipment.js — "Send Something": any authenticated Kentexa user can
 * request a shipment, independent of being a seller, a business, or a
 * Transport Provider. Place at: src/public/pages/SendShipment.js
 *
 * Flow: what + how much (weight known FIRST, so route search can exclude
 * anything that structurally can't carry it — a 20ft container should
 * never surface a boda or courier) -> origin/destination, selected from
 * the real location engine (not just typed text) -> real available
 * routes/providers filtered by that weight (never invented) -> receiver +
 * pickup/delivery -> review (price from the selected route, never
 * guessed) -> confirm.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const OR = '#EA580C';
const fmt = n => Number(n || 0).toLocaleString();

// Matches ProviderType on the backend (transport-provider.entity.ts) —
// showing a bus icon for every provider regardless of what they actually
// operate told a shipper nothing true about who they were picking.
const PROVIDER_TYPE_ICON = {
  bus: '🚌', van: '🚐', courier: '📦', truck: '🚛',
  boda: '🏍️', rail: '🚆', air: '✈️', boat: '⛵',
};

const inputSt = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1px solid #E2E8F0', fontSize: 14, outline: 'none',
  fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box',
  display: 'block', backgroundColor: WH,
};

// onResolved receives the FULL structured suggestion {type, regionId,
// districtId?, wardId?, region, district?, ward?, fullAddress} — the
// actual selection, not just a nicer string. Callers must use it as the
// source of truth; the text box is just its display.
const LocationInput = ({ label, value, onChange, onResolved, placeholder, resolved }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    if (!value?.trim() || value.trim().length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      api.get('/locations/search', { params: { q: value.trim() } })
        .then(r => setSuggestions(r.data || []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div style={{ position: 'relative', marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: GR, display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input value={value} placeholder={placeholder}
          onChange={e => { onChange(e.target.value); onResolved(null); setShowList(true); }}
          onFocus={() => setShowList(true)}
          onBlur={() => setTimeout(() => setShowList(false), 150)}
          style={{ ...inputSt, marginBottom: 0, paddingRight: 32 }} />
        {resolved && (
          <span title="Selected from location list" style={{ position: 'absolute', right: 10,
            top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#16A34A' }}>✓</span>
        )}
      </div>
      {showList && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          backgroundColor: WH, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          marginTop: 4, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
          {suggestions.map((s, i) => (
            <button key={i}
              onClick={() => { onChange(s.region || s.fullAddress); onResolved(s); setShowList(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                border: 'none', borderBottom: '1px solid #F1F5F9', backgroundColor: WH,
                cursor: 'pointer', fontSize: 13, color: DK }}>
              {s.fullAddress}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SendShipment = ({ onNavigate, isLoggedIn, currentUser, navParams }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);

  // Step 1 — what & how much. Captured first so the route search (step 2)
  // can exclude anything that can't actually carry it.
  const [itemDescription, setItemDescription] = useState('');
  const [weightKg, setWeightKg] = useState('');

  // Step 2 — origin/destination, ideally SELECTED (structured), not just typed.
  const [origin, setOrigin] = useState(navParams?.origin || '');
  const [destination, setDestination] = useState(navParams?.destination || '');
  const [originResolved, setOriginResolved] = useState(null);
  const [destinationResolved, setDestinationResolved] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [trips, setTrips] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selected, setSelected] = useState(null); // { availabilityId?, routeId?, providerId?, pricePerKg?, fixedFee? }

  // Step 3 — receiver + handoff.
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [senderName, setSenderName] = useState(currentUser?.name || '');
  const [senderPhone, setSenderPhone] = useState(currentUser?.phone || '');
  const [pickupOption, setPickupOption] = useState('agent');
  const [deliveryOption, setDeliveryOption] = useState('agent');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);

  const searchRoutes = useCallback(async () => {
    if (!origin.trim() || !destination.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await api.get('/shipments/routes', {
        params: {
          origin: origin.trim(),
          destination: destination.trim(),
          weightKg: Number(weightKg) || undefined,
        },
      });
      setTrips(res.data?.availableTrips || []);
      setProviders(res.data?.providers || []);
    } catch {
      setTrips([]);
      setProviders([]);
    } finally {
      setSearching(false);
    }
  }, [origin, destination, weightKg]);

  // If arriving from a Transport Profile's route/trip card, jump straight
  // to the route step with that context pre-filled (weight isn't known
  // yet in that case, so the search runs unfiltered until the user sets one).
  useEffect(() => {
    if (navParams?.origin && navParams?.destination) {
      setStep(2);
      searchRoutes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceEstimate = (() => {
    if (!selected) return null;
    const w = Number(weightKg) || 0;
    const byWeight = (selected.pricePerKg || 0) * w;
    return Math.max(byWeight, selected.fixedFee || 0);
  })();

  const canContinueStep1 = itemDescription.trim() && Number(weightKg) > 0;
  const canContinueStep3 = receiverName.trim() && receiverPhone.trim();

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/shipments', {
        senderName: senderName.trim() || undefined,
        senderPhone: senderPhone.trim() || undefined,
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim(),
        originCity: origin.trim(),
        // Only send structured IDs when the user actually selected a
        // suggestion — never a stale one left over from a different typed
        // string (onResolved(null) clears this the moment the text changes).
        originRegionId: originResolved?.regionId || undefined,
        originWardId: originResolved?.wardId || undefined,
        destinationCity: destination.trim(),
        destinationRegionId: destinationResolved?.regionId || undefined,
        destinationWardId: destinationResolved?.wardId || undefined,
        itemDescription: itemDescription.trim(),
        weightKg: Number(weightKg) || 0,
        routeId: selected?.routeId || undefined,
        availabilityId: selected?.availabilityId || undefined,
        providerId: selected?.providerId || undefined,
        pickupOption,
        deliveryOption,
      });
      setConfirmed(res.data);
      setStep(5);
    } catch (err) {
      setError(err?.response?.data?.message || t('send_shipment.post_error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
          <div style={{ fontSize: 15, color: GR, marginBottom: 16 }}>{t('send_shipment.login_required')}</div>
          <button onClick={() => onNavigate('PublicLogin')}
            style={{ backgroundColor: B, color: WH, border: 'none', borderRadius: 12,
              padding: '12px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            {t('send_shipment.login_button')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: 100,
      fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: WH,
        borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center',
        gap: 12, padding: '12px 16px' }}>
        <button onClick={() => step > 1 && step < 5 ? setStep(step - 1) : onNavigate('back')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={DK} strokeWidth="2.5">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div style={{ fontSize: 15, fontWeight: 900, color: DK }}>
          🚚 {t('send_shipment.title')}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 520, margin: '0 auto' }}>

        {/* Step 1 — what & how much, captured before any route is shown */}
        {step === 1 && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: GR, display: 'block', marginBottom: 6 }}>
              {t('send_shipment.item_description_label')}
            </label>
            <textarea value={itemDescription} onChange={e => setItemDescription(e.target.value)}
              placeholder={t('send_shipment.item_description_placeholder')}
              style={{ ...inputSt, minHeight: 70, resize: 'vertical' }} />

            <label style={{ fontSize: 12, fontWeight: 700, color: GR, display: 'block', marginBottom: 6 }}>
              {t('send_shipment.weight_label')}
            </label>
            <input type="number" min="0" step="0.1" value={weightKg}
              onChange={e => setWeightKg(e.target.value)}
              placeholder={t('send_shipment.weight_placeholder')} style={inputSt} />
            <div style={{ fontSize: 11, color: GR, marginTop: -6, marginBottom: 16 }}>
              {t('send_shipment.weight_hint')}
            </div>

            <button onClick={() => setStep(2)} disabled={!canContinueStep1}
              style={{ width: '100%', backgroundColor: B, color: WH, border: 'none',
                borderRadius: 12, padding: '13px 0', cursor: 'pointer', fontSize: 14,
                fontWeight: 800, opacity: canContinueStep1 ? 1 : 0.5 }}>
              {t('send_shipment.find_options_button')}
            </button>
          </div>
        )}

        {/* Step 2 — origin/destination (selected, not just typed) + real
            available options, already filtered to what can carry this weight */}
        {step === 2 && (
          <div>
            <div style={{ backgroundColor: WH, borderRadius: 14, padding: 14, marginBottom: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', fontSize: 13, fontWeight: 700, color: DK }}>
              📦 {itemDescription} · {weightKg} kg
            </div>

            <LocationInput label={t('send_shipment.origin_label')} value={origin}
              onChange={setOrigin} onResolved={setOriginResolved} resolved={originResolved}
              placeholder={t('send_shipment.origin_placeholder')} />
            <LocationInput label={t('send_shipment.destination_label')} value={destination}
              onChange={setDestination} onResolved={setDestinationResolved} resolved={destinationResolved}
              placeholder={t('send_shipment.destination_placeholder')} />
            <button onClick={searchRoutes} disabled={!origin.trim() || !destination.trim() || searching}
              style={{ width: '100%', backgroundColor: B, color: WH, border: 'none',
                borderRadius: 12, padding: '13px 0', cursor: 'pointer', fontSize: 14,
                fontWeight: 800, marginBottom: 20,
                opacity: (!origin.trim() || !destination.trim()) ? 0.5 : 1 }}>
              {searching ? t('send_shipment.searching') : t('send_shipment.search_routes_button')}
            </button>

            {searched && !searching && trips.length === 0 && providers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: GR, fontSize: 13 }}>
                {Number(weightKg) > 0
                  ? t('send_shipment.no_options_found_weight', { weight: weightKg })
                  : t('send_shipment.no_options_found')}
              </div>
            )}

            {trips.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: GR, textTransform: 'uppercase',
                  letterSpacing: 0.4, marginBottom: 8 }}>
                  {t('send_shipment.available_trips_label')}
                </div>
                {trips.map(trip => (
                  <div key={trip.availabilityId}
                    onClick={() => { setSelected(trip); setStep(3); }}
                    style={{ backgroundColor: WH, borderRadius: 14, padding: 14, marginBottom: 8,
                      cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      border: selected?.availabilityId === trip.availabilityId ? `2px solid ${B}` : '2px solid transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden',
                        backgroundColor: '#FFF7ED', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                        {trip.providerLogo
                          ? <img src={trip.providerLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (PROVIDER_TYPE_ICON[trip.providerType] || '🚚')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: DK }}>
                          {trip.providerName || t('send_shipment.provider_fallback')}
                          {trip.providerType && (
                            <span style={{ fontWeight: 700, color: GR, textTransform: 'capitalize' }}> · {trip.providerType}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>
                          {new Date(trip.date).toLocaleDateString('sw-TZ')}
                          {trip.departureTime ? ` · ${trip.departureTime}` : ''}
                          {' · '}{t('send_shipment.slots_left', { count: trip.slotsAvailable })}
                          {trip.capacityAvailableKg ? ` · ${t('send_shipment.capacity_available', { kg: fmt(trip.capacityAvailableKg) })}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: OR }}>
                          {trip.pricePerKg ? `TZS ${fmt(trip.pricePerKg)}/kg` : t('send_shipment.price_negotiable')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {providers.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: GR, textTransform: 'uppercase',
                  letterSpacing: 0.4, marginBottom: 8 }}>
                  {t('send_shipment.other_providers_label')}
                </div>
                {providers.map(p => (
                  <div key={p.id}
                    onClick={() => { setSelected({ providerId: p.id }); setStep(3); }}
                    style={{ backgroundColor: WH, borderRadius: 14, padding: 14, marginBottom: 8,
                      cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      border: selected?.providerId === p.id && !selected?.availabilityId ? `2px solid ${B}` : '2px solid transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden',
                        backgroundColor: '#FFF7ED', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                        {p.logoUrl
                          ? <img src={p.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (PROVIDER_TYPE_ICON[p.type] || '🚚')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: DK }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: GR, marginTop: 2, textTransform: 'capitalize' }}>
                          {p.type}{p.rating > 0 ? ` · ⭐ ${p.rating.toFixed(1)}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: OR }}>{t('send_shipment.select_button')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3 — receiver + pickup/delivery */}
        {step === 3 && (
          <div>
            <div style={{ backgroundColor: WH, borderRadius: 14, padding: 14, marginBottom: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', fontSize: 13, fontWeight: 700, color: DK }}>
              {origin} → {destination}
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: GR, display: 'block', marginBottom: 6 }}>
              {t('send_shipment.receiver_name_label')}
            </label>
            <input value={receiverName} onChange={e => setReceiverName(e.target.value)}
              placeholder={t('send_shipment.receiver_name_placeholder')} style={inputSt} />

            <label style={{ fontSize: 12, fontWeight: 700, color: GR, display: 'block', marginBottom: 6 }}>
              {t('send_shipment.receiver_phone_label')}
            </label>
            <input value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)}
              placeholder={t('send_shipment.receiver_phone_placeholder')} style={inputSt} />

            <details style={{ marginBottom: 14 }}>
              <summary style={{ fontSize: 12, fontWeight: 700, color: B, cursor: 'pointer' }}>
                {t('send_shipment.sending_on_behalf_toggle')}
              </summary>
              <div style={{ marginTop: 10 }}>
                <input value={senderName} onChange={e => setSenderName(e.target.value)}
                  placeholder={t('send_shipment.sender_name_placeholder')} style={inputSt} />
                <input value={senderPhone} onChange={e => setSenderPhone(e.target.value)}
                  placeholder={t('send_shipment.sender_phone_placeholder')} style={inputSt} />
              </div>
            </details>

            <div style={{ fontSize: 12, fontWeight: 700, color: GR, marginBottom: 8 }}>
              {t('send_shipment.pickup_label')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['door', 'agent', 'station'].map(opt => (
                <button key={opt} onClick={() => setPickupOption(opt)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${pickupOption === opt ? B : '#E2E8F0'}`,
                    backgroundColor: pickupOption === opt ? '#EFF6FF' : WH,
                    fontSize: 12, fontWeight: 700, color: pickupOption === opt ? B : GR }}>
                  {t(`send_shipment.option_${opt}`)}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: GR, marginBottom: 8 }}>
              {t('send_shipment.delivery_label')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['door', 'agent', 'station'].map(opt => (
                <button key={opt} onClick={() => setDeliveryOption(opt)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${deliveryOption === opt ? B : '#E2E8F0'}`,
                    backgroundColor: deliveryOption === opt ? '#EFF6FF' : WH,
                    fontSize: 12, fontWeight: 700, color: deliveryOption === opt ? B : GR }}>
                  {t(`send_shipment.option_${opt}`)}
                </button>
              ))}
            </div>

            <button onClick={() => setStep(4)} disabled={!canContinueStep3}
              style={{ width: '100%', backgroundColor: B, color: WH, border: 'none',
                borderRadius: 12, padding: '13px 0', cursor: 'pointer', fontSize: 14,
                fontWeight: 800, opacity: canContinueStep3 ? 1 : 0.5 }}>
              {t('send_shipment.review_button')}
            </button>
          </div>
        )}

        {/* Step 4 — review + confirm */}
        {step === 4 && (
          <div>
            <div style={{ backgroundColor: WH, borderRadius: 16, padding: 18,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              {[
                [t('send_shipment.review_route'), `${origin} → ${destination}`],
                [t('send_shipment.review_item'), itemDescription],
                [t('send_shipment.review_weight'), `${weightKg} kg`],
                [t('send_shipment.review_receiver'), `${receiverName} · ${receiverPhone}`],
                [t('send_shipment.review_pickup'), t(`send_shipment.option_${pickupOption}`)],
                [t('send_shipment.review_delivery'), t(`send_shipment.option_${deliveryOption}`)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                  gap: 12, padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 12, color: GR, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: DK, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
              {priceEstimate != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: DK }}>{t('send_shipment.review_price')}</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: OR }}>TZS {fmt(priceEstimate)}</span>
                </div>
              )}
              {priceEstimate == null && (
                <div style={{ fontSize: 12, color: GR, paddingTop: 10, fontStyle: 'italic' }}>
                  {t('send_shipment.price_to_be_confirmed')}
                </div>
              )}
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 12, fontWeight: 600 }}>{error}</div>
            )}

            <button onClick={handleConfirm} disabled={submitting}
              style={{ width: '100%', background: 'linear-gradient(135deg,#EA580C,#DC2626)',
                color: WH, border: 'none', borderRadius: 12, padding: '14px 0',
                cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800 }}>
              {submitting ? t('send_shipment.confirming') : t('send_shipment.confirm_button')}
            </button>
          </div>
        )}

        {/* Step 5 — confirmed */}
        {step === 5 && confirmed && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: DK, marginBottom: 8 }}>
              {t('send_shipment.confirmed_title')}
            </div>
            <div style={{ fontSize: 13, color: GR, marginBottom: 20 }}>
              {t('send_shipment.tracking_number_label')}: <strong>{confirmed.trackingNumber}</strong>
            </div>
            <button onClick={() => onNavigate(`TrackParcel-${confirmed.trackingNumber}`)}
              style={{ width: '100%', maxWidth: 300, backgroundColor: B, color: WH, border: 'none',
                borderRadius: 12, padding: '13px 0', cursor: 'pointer', fontSize: 14, fontWeight: 800,
                marginBottom: 10 }}>
              {t('send_shipment.track_button')}
            </button>
            <button onClick={() => onNavigate('Home')}
              style={{ width: '100%', maxWidth: 300, backgroundColor: WH, color: GR,
                border: '1px solid #E2E8F0', borderRadius: 12, padding: '13px 0',
                cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {t('send_shipment.done_button')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SendShipment;
