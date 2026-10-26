/**
 * SendShipment.js — "Tuma mzigo", send form v2 (owner-approved mockup, 2026-10-13;
 * built 2026-10-23). Any logged-in user can send a parcel.
 *
 *   1 Nini        what, kg, pieces, declared value (TZS), type
 *   2 Wapi        from, to, receiver (and sender when sending for someone else)
 *   3 Huduma      start: office or "Njoo uchukue kwangu" (pin + landmark);
 *                 end: collect at the office or door delivery
 *   4 Ofa         only offers that can do everything chosen in step 3
 *   5 Thibitisha  summary and bill, then send
 *   6 Imetumwa    the waybill and the parcel's journey with "Hatua inayofuata"
 *
 * The form decides same-city vs other-city by itself after step 2: same city is
 * door to door by an agent; other cities go through a transporter and offices.
 * The server calls are unchanged (api/shipmentRequests.js, pinned by a contract
 * test shared with the backend): service-offers discover/commit, quote, shipment,
 * confirm-and-activate. Prices shown are only the ones the server knows; nothing
 * is invented. Swahili first, no emojis.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/api';
import {
  shipmentBody, canDeliverDirect, isDirectDelivery, searchOutcome, serviceOfferCommitBody,
} from '../../api/shipmentRequests';
import { formatWaybill } from '../../utils/waybill';
import PickupPinFields from '../components/PickupPinFields';
import NoAgentOfficeCard from '../components/NoAgentOfficeCard';
import InviteCarrier from '../components/InviteCarrier';
import { landmarkOk } from '../../utils/phoneLocation';

const BLUE = '#1d4ed8';
const INK = '#0f172a';
const GREY = '#475569';
const LINE = '#e2e8f0';
const FIELD = '#cbd5e1';
const PAPER = '#f8fafc';
const WHITE = '#ffffff';
const FONT = 'inherit';
const TOTAL_STEPS = 5;
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const digits = (v) => String(v ?? '').replace(/[^0-9]/g, '');
const withCommas = (v) => (digits(v) ? Number(digits(v)).toLocaleString('en-US') : '');

export const CARGO_TYPE_LABELS = [
  ['kawaida', 'Kawaida'], ['kinavunjika', 'Kinavunjika'], ['chakula', 'Chakula'], ['nyaraka', 'Nyaraka'],
];

const input = {
  width: '100%', height: 52, boxSizing: 'border-box', border: `1px solid ${FIELD}`, borderRadius: 12,
  padding: '0 14px', fontFamily: 'inherit', fontSize: 16, color: INK, background: WHITE, outline: 'none',
};
const label = { display: 'block', fontSize: 14, fontWeight: 600, color: INK, marginBottom: 6 };
const field = { display: 'flex', flexDirection: 'column', marginBottom: 18 };
const h1 = { margin: '0 0 6px', fontSize: 26, fontWeight: 800, lineHeight: 1.2, color: INK };
const sub = { fontSize: 15, color: GREY, lineHeight: 1.45, margin: '0 0 20px' };
const card = { background: WHITE, border: `1px solid ${LINE}`, borderRadius: 16, padding: 14 };

const BackIcon = () => (
  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
);

/** A radio-style choice card (step 3). */
const Choice = ({ selected, title, hint, onClick, testId }) => (
  <button type="button" role="radio" aria-checked={selected} onClick={onClick} data-testid={testId}
    style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, width: '100%', padding: '8px 14px', marginBottom: 8,
      borderRadius: 14, border: selected ? `2px solid ${BLUE}` : `1px solid ${FIELD}`, background: selected ? '#eff6ff' : WHITE,
      fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
    <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, boxSizing: 'border-box', flexShrink: 0, background: WHITE,
      border: selected ? `6px solid ${BLUE}` : '2px solid #94a3b8' }} />
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: INK }}>{title}</span>
      {hint && <span style={{ fontSize: 13, color: GREY }}>{hint}</span>}
    </span>
  </button>
);

/** Place search: the selection (with its place reference) is the source of truth. */
const PlaceInput = ({ id, labelText, value, onChange, onResolved, resolved, placeholder, marker }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!value?.trim() || value.trim().length < 2 || resolved) { setSuggestions([]); return undefined; }
    const timer = setTimeout(() => {
      api.get('/location-intelligence/places', { params: { q: value.trim(), limit: 8 } })
        .then((r) => setSuggestions(r.data?.candidates || []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [value, resolved]);
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0' }}>
      {marker}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0 }}>
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: GREY }}>{labelText}</label>
        <input id={id} value={value} placeholder={placeholder} autoComplete="off"
          onChange={(e) => { onChange(e.target.value); onResolved(null); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ border: 0, outline: 0, padding: 0, fontFamily: 'inherit', fontSize: 16, fontWeight: 600, color: INK, background: 'transparent', minWidth: 0 }} />
        {value?.trim() && !resolved && (
          <span style={{ fontSize: 12, color: '#b45309' }}>Chagua mahali kwenye orodha</span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: WHITE, borderRadius: 12,
          boxShadow: '0 8px 24px rgba(15,23,42,0.14)', maxHeight: 240, overflowY: 'auto' }}>
          {suggestions.map((s, i) => (
            <button type="button" role="option" aria-selected="false" key={i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s.displayLabel); onResolved(s); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '10px 14px', border: 0,
                borderBottom: `1px solid #f1f5f9`, background: WHITE, fontFamily: 'inherit', fontSize: 15, color: INK, cursor: 'pointer' }}>
              {s.displayLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Office offers (Super Agents) from the same discovery answer: each office once, with its own price. */
export function officeOffers(offers) {
  return (Array.isArray(offers) ? offers : [])
    .filter((o) => o?.serviceType === 'office' && o.fulfillment?.officeOption?.officeId)
    .map((o) => ({
      office: true,
      officeId: o.fulfillment.officeOption.officeId,
      providerName: o.name,
      officeCity: o.fulfillment.officeOption.officeCity,
      officeAddress: o.fulfillment.officeOption.officeAddress,
      rating: o.fulfillment.officeOption.rating,
      totalRatings: o.fulfillment.officeOption.totalRatings,
      chargeText: o.fulfillment.officeOption.chargeText,
      pickupBy: o.fulfillment.officeOption.pickupBy || null,
      quote: o.fulfillment.officeOption.quote,
      servicePrice: o.price,
      etaLabel: o.etaLabel,
      fulfillmentStatus: o.fulfillmentStatus,
    }))
    // Cheapest first; an office with no price yet last.
    .sort((a, b) => (a.servicePrice == null ? Infinity : a.servicePrice) - (b.servicePrice == null ? Infinity : b.servicePrice));
}

const offerKey = (o) => (o?.office ? `office-${o.officeId}` : `t-${o?.providerId}-${o?.routeId}`);

/** "About 12 hours linehaul" -> "Takriban saa 12 safarini". */
const etaText = (label) => {
  const m = /([0-9]+(?:\.[0-9]+)?)\s*hours?/i.exec(String(label || ''));
  if (m) return `Takriban saa ${m[1]} safarini`;
  if (/same day/i.test(String(label || ''))) return 'Leo hii';
  return null;
};

/** The parcel's journey after sending, with the step happening now highlighted. */
export function journeySteps({ direct, pickupOption, deliveryOption, providerName, destinationLabel, receiverName, nextAction }) {
  const who = receiverName || 'Mpokeaji';
  const steps = [{ text: 'Ombi limepokelewa', done: true }];
  if (pickupOption === 'door' && nextAction?.type === 'office_pickup') steps.push({ text: `${providerName || 'Ofisi'} inachukua mzigo kwako`, key: 'pickup' });
  else if (pickupOption === 'door') steps.push({ text: 'Wakala anachukua mzigo kwako', key: 'pickup' });
  else steps.push({ text: 'Unapeleka mzigo ofisini', key: 'dropoff' });
  if (!direct) steps.push({ text: `${providerName || 'Msafirishaji'} anausafirisha kwenda ${destinationLabel || 'unakoenda'}`, key: 'linehaul' });
  if (direct || deliveryOption === 'door') steps.push({ text: `${who} anapokea mzigo mlangoni kwa namba ya siri`, key: 'deliver' });
  else steps.push({ text: `${who} anachukua mzigo ofisini kwa namba ya siri`, key: 'collect' });

  const type = nextAction?.type;
  let now = 1;
  let next = '';
  if (type === 'agent_pickup') {
    next = Number(nextAction?.agentsAlerted) === 0
      ? 'Hakuna wakala aliye mtandaoni sasa hivi. Wakala wa kwanza akiingia ataona kazi yako; utapata SMS akikubali.'
      : 'Wakala wa karibu ameshaarifiwa. Akikubali, utapata SMS yenye jina na simu yake.';
  } else if (type === 'office_pickup') {
    next = `${providerName || 'Ofisi'} imearifiwa kwa SMS na itakupigia kupanga muda wa kuchukua mzigo.`;
  } else if (type === 'agent_pickup_pending') {
    next = 'Ofisi au msafirishaji atakupigia kupanga kuchukua mzigo.';
  } else if (type === 'customer_dropoff' || type === 'customer_dropoff_pending') {
    next = 'Peleka mzigo ofisini. Mpe mhudumu namba ya mzigo.';
  } else {
    next = 'Tunapanga hatua inayofuata. Utapata SMS.';
  }
  return { steps, now, next };
}

const SendShipment = ({ onNavigate, isLoggedIn, currentUser, navParams }) => {
  const [step, setStep] = useState(1);

  // 1 Nini
  const [itemDescription, setItemDescription] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [pieces, setPieces] = useState('1');
  const [declaredValue, setDeclaredValue] = useState('');
  const [cargoType, setCargoType] = useState('kawaida');

  // 2 Wapi
  const [origin, setOrigin] = useState(navParams?.origin || '');
  const [destination, setDestination] = useState(navParams?.destination || '');
  const [originResolved, setOriginResolved] = useState(null);
  const [destinationResolved, setDestinationResolved] = useState(null);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [senderName, setSenderName] = useState(currentUser?.name || '');
  const [senderPhone, setSenderPhone] = useState(currentUser?.phone || '');

  // 3 Huduma
  const [pickupOption, setPickupOption] = useState('door');
  const [deliveryOption, setDeliveryOption] = useState('station');
  const [pickupPin, setPickupPin] = useState(null);
  const [pickupLandmark, setPickupLandmark] = useState('');

  // 4 Ofa
  const [searching, setSearching] = useState(false);
  const [searchReason, setSearchReason] = useState(null);
  const [offers, setOffers] = useState([]);
  const [directOffer, setDirectOffer] = useState(null);
  const [doorCheck, setDoorCheck] = useState(null);
  const [selected, setSelected] = useState(null);

  // 5-6
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [noAgentAtConfirm, setNoAgentAtConfirm] = useState(null);
  const [confirmed, setConfirmed] = useState(null);

  const sameCity = canDeliverDirect({ originResolved, destinationResolved });
  const fromCity = originResolved?.regionName || originResolved?.districtName || origin.trim();
  const toCity = destinationResolved?.regionName || destinationResolved?.districtName || destination.trim();
  const toShort = destinationResolved?.districtName || destinationResolved?.regionName || destination.split(',')[0]?.trim();

  // Same city is door to door by an agent; the defaults follow the trip.
  useEffect(() => {
    if (sameCity) { setPickupOption('door'); setDeliveryOption('door'); }
    else setDeliveryOption('station');
  }, [sameCity]);

  const requestState = {
    itemDescription, weightKg, pieces, declaredValue: digits(declaredValue), cargoType,
    origin, destination, originResolved, destinationResolved,
    receiverName, receiverPhone,
    senderName: forSomeoneElse ? senderName : (currentUser?.name || senderName),
    senderPhone: forSomeoneElse ? senderPhone : (currentUser?.phone || senderPhone),
    pickupOption, deliveryOption, pickupPin, pickupLandmark,
    transportProviderId: navParams?.transportProviderId,
  };

  const findOffers = useCallback(async () => {
    setSearching(true); setSearchReason(null); setOffers([]); setDirectOffer(null); setDoorCheck(null);
    setSelected(null);
    try {
      const side = (resolved, text) => (resolved?.placeRef
        ? { place: { providerKey: resolved.placeRef.providerKey, providerPlaceId: resolved.placeRef.providerPlaceId } }
        : { text: text.trim() });
      const res = await api.post('/transport/service-offers/discover', {
        fromCity, toCity, weightKg: Number(weightKg) || 0,
        pickup: pickupOption === 'door' ? 'door' : 'point',
        delivery: deliveryOption === 'door' ? 'door' : 'collect',
        origin: side(originResolved, origin), destination: side(destinationResolved, destination),
        providerId: navParams?.transportProviderId ? Number(navParams.transportProviderId) : undefined,
        declaredValue: Number(digits(declaredValue)) || undefined,
        // An office that collects only near itself needs the sender's pin.
        pickupPoint: pickupOption === 'door' && pickupPin ? { latitude: pickupPin.latitude, longitude: pickupPin.longitude } : undefined,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      if (sameCity) {
        const direct = list.find((o) => o.serviceType === 'direct_delivery') || null;
        // Offices that chose same-city delivery compete with the agent (owner 2026-10-24).
        const offices = officeOffers(list);
        setDirectOffer(direct);
        setOffers(offices);
        if (direct) setSelected({ direct: true });
        else if (offices.length) setSelected(offices[0]);
        if (!direct && !offices.length) {
          const check = await api.post('/transport/service-offers/door-check', {
            fromCity, weightKg: Number(weightKg) || 0, origin: side(originResolved, origin),
          }).then((r) => r.data).catch(() => null);
          setDoorCheck(check || { available: false, nearestOffice: null });
        }
        setSearchReason(direct || offices.length ? 'available' : 'no_agent');
      } else {
        // The customer faces offices and agents, never a transporter directly (owner
        // 2026-10-26): a transporter reaches customers through its own office. Booking
        // the transport is the office staff's work, and its fare stays with them.
        const complete = officeOffers(list);
        setOffers(complete);
        const first = complete[0] || null;
        if (first) setSelected(first);
        setSearchReason(complete.length ? 'available' : 'no_route');
      }
    } catch (err) {
      setSearchReason(searchOutcome(null, err));
    } finally {
      setSearching(false);
    }
  }, [fromCity, toCity, weightKg, declaredValue, pickupPin, pickupOption, deliveryOption, originResolved, destinationResolved, origin, destination, sameCity, navParams?.transportProviderId]);

  const choose = (offer) => setSelected(offer);

  const valueOk = Number(digits(declaredValue)) > 0;
  const step1Ok = itemDescription.trim() && Number(weightKg) > 0 && Number(pieces) >= 1 && valueOk;
  const step2Ok = origin.trim() && destination.trim() && originResolved && destinationResolved
    && receiverName.trim() && digits(receiverPhone).length >= 9
    && (!forSomeoneElse || (senderName.trim() && digits(senderPhone).length >= 9));
  const step3Ok = pickupOption !== 'door' || landmarkOk(pickupLandmark);
  const step4Ok = Boolean(selected);

  // Known prices only: the fare (or the agent's fee for same city). An agent's fee for
  // a door leg of an intercity trip is paid to the agent and shown as such, never guessed.
  const bill = useMemo(() => {
    if (isDirectDelivery(selected)) {
      const fee = directOffer?.price != null ? Number(directOffer.price) : null;
      return { lines: [['Wakala: kuchukua na kufikisha mlangoni', fee != null ? tzs(fee) : 'Inathibitishwa na wakala']], total: fee };
    }
    if (!selected) return { lines: [], total: null };
    if (selected.office) {
      const q = selected.quote || {};
      const lines = [];
      if (pickupOption === 'door') {
        lines.push(selected.pickupBy === 'office'
          ? [`Kuchukua kwako (${selected.providerName})`, Number(q.pickup) > 0 ? tzs(q.pickup) : 'Bure']
          : ['Kuchukua kwako', Number(q.pickup) > 0 ? tzs(q.pickup) : 'Ada ya wakala (unamlipa wakala)']);
      }
      else lines.push(['Kupeleka ofisini', 'Bure']);
      lines.push([`Usafiri${selected.chargeText ? ` (${selected.chargeText})` : ''}`, selected.servicePrice != null ? tzs(q.transport ?? selected.servicePrice) : 'Ofisi itakuambia']);
      if (deliveryOption === 'door') lines.push([`Kufikishwa mlangoni ${toShort || ''}`.trim(), 'Ada ya wakala (inalipwa kwa wakala)']);
      else lines.push([`Kuchukua ofisini ${toShort || ''}`.trim(), 'Bure']);
      return { lines, total: selected.servicePrice != null ? Number(selected.servicePrice) : null };
    }
    return { lines: [], total: null };
  }, [selected, directOffer, pickupOption, deliveryOption, toShort]);

  const handleConfirm = async () => {
    setSubmitting(true); setError(''); setNoAgentAtConfirm(null);
    try {
      let journeySelection = null;
      const direct = isDirectDelivery(selected);
      const office = Boolean(selected?.office);
      if (office) {
        // The server re-prices this office now and composes the journey; nothing priced here is trusted.
        const journey = await api.post('/transport/service-offers/commit', {
          ...serviceOfferCommitBody(requestState, selected, false),
          serviceType: 'office', officeId: Number(selected.officeId),
          providerId: undefined, routeId: undefined, runId: undefined,
          declaredValue: Number(digits(declaredValue)) || undefined,
        });
        journeySelection = journey.data;
      }
      if (direct) {
        const journey = await api.post('/transport/service-offers/commit', serviceOfferCommitBody(requestState, selected, true));
        journeySelection = journey.data;
      }
      // The customer books an agent or an office only (owner 2026-10-26); the office
      // books the transport itself. An office journey decides its own origin office.
      const res = await api.post('/shipments', shipmentBody(requestState, selected, null, journeySelection));
      const final = await api.patch(`/shipments/${res.data.id}/confirm-and-activate`, {});
      setConfirmed({
        trackingNumber: final.data.shipment?.trackingNumber,
        waybillNumber: final.data.parcel?.waybillNumber || null,
        nextAction: final.data.nextAction || null,
        total: bill.total,
        direct,
        office: office ? { name: selected.providerName, address: selected.officeAddress || selected.officeCity || null } : null,
      });
      setStep(6);
    } catch (err) {
      if (err?.response?.data?.code === 'NO_AGENT_NOW') setNoAgentAtConfirm({ office: err.response.data.nearestOffice || null });
      else setError(err?.response?.data?.message && /[a-z]/i.test(err.response.data.message)
        ? `Haikutumwa: ${err.response.data.message}` : 'Haikutumwa. Jaribu tena.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: PAPER, fontFamily: FONT }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <h1 style={{ ...h1, fontSize: 22 }}>Tuma mzigo</h1>
          <p style={sub}>Ingia kwanza ili kutuma mzigo.</p>
          <button type="button" onClick={() => onNavigate('PublicLogin')}
            style={{ height: 52, padding: '0 28px', border: 0, borderRadius: 14, background: BLUE, color: WHITE, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            Ingia
          </button>
        </div>
      </div>
    );
  }

  const goBack = () => (step > 1 && step < 6 ? setStep(step - 1) : onNavigate('back'));
  const next = (to) => { setError(''); setStep(to); if (to === 4) findOffers(); window.scrollTo?.(0, 0); };

  const footer = (text, onClick, enabled, testId) => (
    <div data-testid="form-footer" style={{ position: 'sticky', bottom: 0, zIndex: 40, padding: '12px 16px calc(20px + env(safe-area-inset-bottom, 0px))', background: WHITE, borderTop: `1px solid ${LINE}` }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <button type="button" onClick={onClick} disabled={!enabled} data-testid={testId}
          style={{ width: '100%', height: 54, border: 0, borderRadius: 14, background: BLUE, color: WHITE, fontFamily: 'inherit',
            fontSize: 17, fontWeight: 700, cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5 }}>
          {text}
        </button>
      </div>
    </div>
  );

  // ── 6 Imetumwa ──────────────────────────────────────────────────────────
  if (step === 6 && confirmed) {
    const journey = journeySteps({
      direct: confirmed.direct, pickupOption, deliveryOption, providerName: selected?.providerName,
      destinationLabel: toShort, receiverName: receiverName.trim(), nextAction: confirmed.nextAction,
    });
    const number = confirmed.waybillNumber ? formatWaybill(confirmed.waybillNumber) : confirmed.trackingNumber;
    return (
      <div data-testid="send-form-v2" style={{ minHeight: '100vh', background: PAPER, fontFamily: FONT, color: INK }}>
        <div style={{ background: WHITE, borderBottom: `1px solid ${LINE}`, padding: '28px 20px 22px', textAlign: 'center' }}>
          <div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 28, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h1 style={{ ...h1, fontSize: 24 }}>Mzigo umetumwa</h1>
          <div style={{ fontSize: 13, fontWeight: 600, color: GREY, marginTop: 8 }}>Namba ya mzigo</div>
          <div data-testid="waybill" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{number}</div>
          <div style={{ fontSize: 14, color: GREY, lineHeight: 1.45, maxWidth: 340, margin: '6px auto 0' }}>
            Namba moja kuanzia sasa hadi {receiverName.trim() || 'mpokeaji'} anaupokea. Tumeituma kwa SMS kwako na kwake.
          </div>
          {confirmed.total != null && <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>Jumla: {tzs(confirmed.total)}</div>}
          {confirmed.office && pickupOption === 'station' && (
            <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.45 }}>
              Peleka mzigo: <strong>{confirmed.office.name}</strong>{confirmed.office.address ? `, ${confirmed.office.address}` : ''}
            </div>
          )}
        </div>
        <div style={{ padding: '18px 20px', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>Safari ya mzigo</div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {journey.steps.map((s, i) => {
              const done = s.done; const now = i === journey.now; const last = i === journey.steps.length - 1;
              return (
                <li key={s.text} style={{ display: 'flex', gap: 12 }}>
                  <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 8, boxSizing: 'border-box',
                      background: done ? '#15803d' : WHITE, border: done ? 0 : now ? `4px solid ${BLUE}` : '2px solid #94a3b8' }} />
                    {!last && <div style={{ width: 2, flexGrow: 1, minHeight: 24, background: done ? '#15803d' : FIELD }} />}
                  </div>
                  <div style={{ paddingBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: now ? 700 : done ? 600 : 400, color: now ? BLUE : done ? INK : GREY }}>
                      {now ? `Sasa: ${s.text.charAt(0).toLowerCase()}${s.text.slice(1)}` : s.text}
                    </div>
                    {now && (
                      <div data-testid="next-step" style={{ fontSize: 13, color: '#334155', background: '#eff6ff', borderRadius: 8, padding: '8px 10px', lineHeight: 1.4 }}>
                        Hatua inayofuata: {journey.next}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div style={{ padding: '12px 16px 24px', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={() => onNavigate(`TrackParcel-${confirmed.trackingNumber}`)}
            style={{ height: 54, border: 0, borderRadius: 14, background: BLUE, color: WHITE, fontFamily: 'inherit', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
            Fuatilia mzigo
          </button>
          <button type="button" onClick={() => onNavigate('MyShipments')}
            style={{ height: 48, border: `1px solid ${FIELD}`, borderRadius: 14, background: WHITE, color: INK, fontFamily: 'inherit', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            Mizigo yangu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="send-form-v2" style={{ minHeight: '100vh', background: PAPER, fontFamily: FONT, color: INK, display: 'flex', flexDirection: 'column' }}>
      {/* Header: back, title, "Hatua n kati ya 5", progress */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: WHITE, borderBottom: `1px solid ${LINE}`, padding: '12px 16px 14px' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" aria-label="Rudi" onClick={goBack}
              style={{ width: 44, height: 44, border: 0, background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <BackIcon />
            </button>
            <div style={{ fontSize: 19, fontWeight: 700, flexGrow: 1 }}>Tuma mzigo</div>
            <div style={{ fontSize: 14, color: GREY }}>Hatua {step} kati ya {TOTAL_STEPS}</div>
          </div>
          <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: `repeat(${TOTAL_STEPS}, minmax(0, 1fr))`, gap: 6, marginTop: 10 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} style={{ height: 4, borderRadius: 2, background: i < step ? BLUE : LINE }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ flexGrow: 1, padding: '24px 16px', maxWidth: 520, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {navParams?.transportProviderId && (
          <div style={{ ...card, background: '#eff6ff', borderColor: '#bfdbfe', marginBottom: 16, fontSize: 14 }}>
            Unatuma kupitia <strong>{navParams.transportProviderName || 'msafirishaji uliyemchagua'}</strong>
          </div>
        )}

        {/* ── 1 Nini ── */}
        {step === 1 && (
          <div>
            <h1 style={h1}>Unatuma nini?</h1>
            <p style={sub}>Tunauliza haya ili tukuonyeshe watoa huduma wanaoweza kuubeba.</p>
            {/* Large goods, a container or a whole vehicle are priced by asking (owner 2026-10-26). */}
            <button type="button" data-testid="go-quote" onClick={() => onNavigate('QuoteRequest', { kind: 'goods' })}
              style={{ width: '100%', textAlign: 'left', background: '#f7f9f9', border: '1px solid #eff3f4', borderRadius: 12,
                padding: '12px 14px', marginBottom: 16, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, color: '#0f1419' }}>
              Mzigo mkubwa, kontena au gari zima? <b>Omba bei</b>
            </button>
            <div style={field}>
              <label htmlFor="kitu" style={label}>Maelezo ya mzigo</label>
              <input id="kitu" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Mfano: nguo, boksi moja" style={input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div style={field}>
                <label htmlFor="uzito" style={label}>Uzito (kg)</label>
                <input id="uzito" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="2" style={input} />
              </div>
              <div style={field}>
                <label htmlFor="vipande" style={label}>Vipande</label>
                <input id="vipande" inputMode="numeric" value={pieces} onChange={(e) => setPieces(digits(e.target.value))} placeholder="1" style={input} />
              </div>
            </div>
            <div style={field}>
              <label htmlFor="thamani" style={label}>Thamani ya mzigo</label>
              <div style={{ display: 'flex', alignItems: 'center', height: 52, boxSizing: 'border-box', border: `2px solid ${BLUE}`, borderRadius: 12, padding: '0 14px', background: WHITE, gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: GREY }}>TZS</span>
                <input id="thamani" inputMode="numeric" value={withCommas(declaredValue)} onChange={(e) => setDeclaredValue(digits(e.target.value))} placeholder="150,000"
                  style={{ flexGrow: 1, minWidth: 0, border: 0, outline: 0, fontFamily: 'inherit', fontSize: 16, color: INK, background: 'transparent' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#eff6ff', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /></svg>
                <div style={{ fontSize: 14, lineHeight: 1.45, color: '#1e3a8a' }}>Hiki ndicho kiasi cha juu kulipwa mzigo ukipotea. Hakibadiliki baada ya kutuma.</div>
              </div>
            </div>
            <div style={field}>
              <div style={label} id="aina-label">Aina</div>
              <div role="radiogroup" aria-labelledby="aina-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CARGO_TYPE_LABELS.map(([value, text]) => (
                  <button key={value} type="button" role="radio" aria-checked={cargoType === value} onClick={() => setCargoType(value)}
                    style={{ height: 44, padding: '0 16px', borderRadius: 22, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
                      border: `1px solid ${cargoType === value ? BLUE : FIELD}`, background: cargoType === value ? BLUE : WHITE,
                      color: cargoType === value ? WHITE : INK, fontWeight: cargoType === value ? 600 : 500 }}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 2 Wapi ── */}
        {step === 2 && (
          <div>
            <h1 style={h1}>Kutoka wapi, kwenda kwa nani?</h1>
            <div style={{ ...card, padding: '4px 14px', marginTop: 16, marginBottom: 20 }}>
              <PlaceInput id="kutoka" labelText="Kutoka" value={origin} onChange={setOrigin} onResolved={setOriginResolved} resolved={originResolved}
                placeholder="Mtaa, kata au wilaya"
                marker={<div aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, border: `3px solid ${BLUE}`, boxSizing: 'border-box', flexShrink: 0 }} />} />
              <div style={{ height: 1, background: LINE, marginLeft: 24 }} />
              <PlaceInput id="kwenda" labelText="Kwenda" value={destination} onChange={setDestination} onResolved={setDestinationResolved} resolved={destinationResolved}
                placeholder="Mtaa, kata au wilaya"
                marker={<div aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 2, background: '#f97316', flexShrink: 0 }} />} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>Mpokeaji</div>
            <div style={field}>
              <label htmlFor="jina" style={label}>Jina</label>
              <input id="jina" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} autoComplete="off" style={input} />
            </div>
            <div style={field}>
              <label htmlFor="simu" style={label}>Simu ya mpokeaji</label>
              <input id="simu" type="tel" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} placeholder="0712 000 222" style={input} />
              <div style={{ fontSize: 13, color: GREY, lineHeight: 1.4, marginTop: 6 }}>Atapokea SMS yenye namba ya mzigo na namba ya siri ya kuuchukua.</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 15, cursor: 'pointer' }}>
              <input type="checkbox" checked={forSomeoneElse} onChange={(e) => setForSomeoneElse(e.target.checked)} style={{ width: 20, height: 20 }} />
              Natuma kwa niaba ya mtu mwingine
            </label>
            {forSomeoneElse && (
              <div style={{ marginTop: 8 }}>
                <div style={field}>
                  <label htmlFor="mtumaji" style={label}>Jina la mtumaji</label>
                  <input id="mtumaji" value={senderName} onChange={(e) => setSenderName(e.target.value)} style={input} />
                </div>
                <div style={field}>
                  <label htmlFor="simu-mtumaji" style={label}>Simu ya mtumaji</label>
                  <input id="simu-mtumaji" type="tel" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} style={input} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 3 Huduma ── */}
        {step === 3 && (
          <div>
            <h1 style={h1}>Huduma gani?</h1>
            {sameCity ? (
              <>
                <p style={sub}>Ndani ya mji mmoja: wakala anachukua mzigo kwako na kumfikishia {receiverName.trim() || 'mpokeaji'} mlangoni.</p>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Mahali pa kuchukua mzigo</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, margin: '14px 0 8px' }}>Mzigo unaanzia wapi?</div>
                <Choice testId="start-office" selected={pickupOption === 'station'} onClick={() => setPickupOption('station')}
                  title="Nitaupeleka ofisini" hint="Unaleta mzigo kwenye ofisi utakayochagua" />
                <Choice testId="start-door" selected={pickupOption === 'door'} onClick={() => setPickupOption('door')}
                  title="Njoo uchukue kwangu" hint="Wakala anakuja mahali ulipo" />
              </>
            )}
            {pickupOption === 'door' && (
              <PickupPinFields pin={pickupPin} onPin={setPickupPin} landmark={pickupLandmark} onLandmark={setPickupLandmark} />
            )}
            {!sameCity && (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 8px' }}>Mpokeaji atauchukuaje?</div>
                <Choice testId="end-office" selected={deliveryOption === 'station'} onClick={() => setDeliveryOption('station')}
                  title={`Atachukua ofisini ${toShort || ''}`.trim()} hint="Kwa namba ya siri atakayopokea kwa SMS" />
                <Choice testId="end-door" selected={deliveryOption === 'door'} onClick={() => setDeliveryOption('door')}
                  title="Uletwe mlangoni kwake" hint={`Wakala wa ${toShort || 'huko'} anampelekea`} />
              </>
            )}
          </div>
        )}

        {/* ── 4 Ofa ── */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 13, color: GREY, lineHeight: 1.5, marginBottom: 8 }}>
              {[itemDescription.trim(), `${weightKg} kg`, `thamani ${tzs(digits(declaredValue))}`,
                `${(origin.split(',')[0] || '').trim()} → ${toShort || ''}`,
                pickupOption === 'door' ? 'kuchukuliwa kwako' : 'unapeleka ofisini',
                deliveryOption === 'door' ? 'mlangoni' : 'mpokeaji anachukua ofisini'].join(' · ')}
            </div>
            {searching && <div role="status" style={{ ...card, color: GREY }}>Tunatafuta huduma…</div>}

            {!searching && (searchReason === 'request_failed' || searchReason === 'invalid_location') && (
              <div role="alert" style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>
                {searchReason === 'invalid_location' ? 'Mahali hapajulikani. Rudi na uchague mahali kwenye orodha.' : 'Imeshindikana kutafuta. Jaribu tena.'}
                <div><button type="button" onClick={findOffers} style={{ marginTop: 8, minHeight: 44, border: 0, background: 'none', color: BLUE, fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer', padding: 0 }}>Jaribu tena</button></div>
              </div>
            )}

            {!searching && sameCity && searchReason === 'available' && directOffer && (
              <>
                <h1 style={{ ...h1, fontSize: 22 }}>Mlango kwa mlango</h1>
                <button type="button" role="radio" aria-checked={isDirectDelivery(selected)} onClick={() => setSelected({ direct: true })}
                  data-testid="direct-option" style={{ ...card, border: isDirectDelivery(selected) ? `2px solid ${BLUE}` : `1px solid ${FIELD}`,
                    display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', fontFamily: 'inherit', color: INK, cursor: 'pointer', width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Wakala wa karibu</div>
                    <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }}>{directOffer.price != null ? tzs(directOffer.price) : 'Bei: wakala'}</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#334155' }}>Anachukua kwako na kumfikishia mpokeaji mlangoni</div>
                  <div style={{ fontSize: 13, color: GREY }}>{etaText(directOffer.etaLabel) || 'Leo hii'}</div>
                </button>
              </>
            )}
            {!searching && sameCity && searchReason === 'no_agent' && <NoAgentOfficeCard office={doorCheck?.nearestOffice || null} />}

            {!searching && searchReason === 'available' && (!sameCity || offers.length > 0) && (
              <>
                <h1 style={{ ...h1, fontSize: 22 }}>{sameCity
                  ? (directOffer ? 'Au ofisi inayosafirisha ndani ya mji' : 'Ofisi zinazosafirisha ndani ya mji')
                  : offers.length === 1 ? 'Ofa 1 inayoweza kufanya yote' : `Ofa ${offers.length} zinazoweza kufanya yote`}</h1>
                <div role="radiogroup" aria-label="Ofa" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                  {offers.map((o) => {
                    const on = selected && !isDirectDelivery(selected) && offerKey(selected) === offerKey(o);
                    const eta = o.office ? o.etaLabel : etaText(o.etaLabel);
                    return (
                      <button key={offerKey(o)} type="button" role="radio" aria-checked={!!on} onClick={() => choose(o)} data-testid="offer"
                        style={{ ...card, border: on ? `2px solid ${BLUE}` : `1px solid ${FIELD}`, display: 'flex', flexDirection: 'column', gap: 8,
                          textAlign: 'left', fontFamily: 'inherit', color: INK, cursor: 'pointer', width: '100%' }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', width: '100%' }}>
                          <span style={{ fontSize: 16, fontWeight: 700, overflowWrap: 'anywhere' }}>{o.providerName || 'Msafirishaji'}</span>
                          <span style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }}>{o.servicePrice != null ? tzs(o.servicePrice) : 'Bei: ofisi'}</span>
                        </span>
                        {o.office && (
                          <span style={{ fontSize: 13, color: GREY }}>
                            Ofisi · {o.officeCity}{o.chargeText ? ` · ${o.chargeText}` : ''}
                          </span>
                        )}
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 13, color: '#334155' }}>
                          <span>{pickupOption === 'door'
                            ? (o.office && o.pickupBy === 'office'
                              ? (Number(o.quote?.pickup) > 0 ? `Ofisi inachukua: ${Math.round(o.quote.pickup).toLocaleString('en-US')}` : 'Ofisi inachukua bure')
                              : o.office && Number(o.quote?.pickup) > 0 ? `Kuchukua ${Math.round(o.quote.pickup).toLocaleString('en-US')}` : 'Kuchukua: ada ya wakala')
                            : 'Kupeleka ofisini: bure'}</span>
                          <span>Usafiri {o.office
                            ? (o.servicePrice != null ? Math.round(o.quote?.transport ?? o.servicePrice).toLocaleString('en-US') : 'ofisi itakuambia')
                            : (o.servicePrice != null ? Math.round(o.servicePrice).toLocaleString('en-US') : 'inathibitishwa')}</span>
                          <span>{deliveryOption === 'door' ? 'Mlangoni: ada ya wakala' : `Ofisini ${toShort || ''}: bure`}</span>
                        </span>
                        {(o.loadHub?.name || o.unloadHub?.name) && (
                          <span style={{ fontSize: 13, color: GREY }}>{[o.loadHub?.name, o.unloadHub?.name].filter(Boolean).join(' → ')}</span>
                        )}
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span style={{ fontSize: 13, color: GREY }}>
                            {eta || 'Safari imepangwa'}
                            {Number(o.rating) > 0 && Number(o.totalRatings) > 0 ? ` · ${Number(o.rating).toFixed(1)} (${o.totalRatings} mizigo)` : ''}
                          </span>
                          {on && <span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', borderRadius: 6, padding: '3px 8px' }}>Imechaguliwa</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selected?.office && pickupOption === 'station' && (
                  <div style={{ ...card, marginTop: 16, fontSize: 14, lineHeight: 1.5 }}>
                    Utapeleka mzigo: <strong>{selected.providerName}</strong>{selected.officeAddress ? `, ${selected.officeAddress}` : ''}
                  </div>
                )}
                {selected?.office && deliveryOption === 'station' && (
                  <div style={{ fontSize: 13, color: GREY, lineHeight: 1.45, marginTop: 8 }}>
                    {selected.providerName} atamtumia {receiverName.trim() || 'mpokeaji'} SMS ya ofisi ya kuchukulia {toShort || ''}.
                  </div>
                )}
                <div style={{ fontSize: 13, color: GREY, lineHeight: 1.45, marginTop: 12 }}>Huduma zisizoweza kufanya yote uliyochagua hazionyeshwi hapa.</div>
              </>
            )}
            {!searching && !sameCity && searchReason === 'no_route' && (
              <div style={{ ...card, color: '#334155', lineHeight: 1.5 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: INK, marginBottom: 4 }}>Hakuna ofa inayoweza kufanya yote kwa sasa</div>
                Hakuna safari iliyopangwa kwenda {toShort || 'huko'} inayoweza kufanya huduma ulizochagua. Rudi ubadilishe huduma (mfano "Nitaupeleka ofisini"), au jaribu tena baadaye.
                <div style={{ marginTop: 6 }}><InviteCarrier shopName={null} destCity={toShort} /></div>
              </div>
            )}
          </div>
        )}

        {/* ── 5 Thibitisha ── */}
        {step === 5 && (
          <div>
            <h1 style={{ ...h1, fontSize: 24 }}>Angalia kabla ya kutuma</h1>
            <div style={{ ...card, padding: '4px 14px', marginTop: 12 }}>
              {[
                ['Mzigo', `${itemDescription.trim()} · ${weightKg} kg${Number(pieces) > 1 ? ` · vipande ${pieces}` : ''} · ${tzs(digits(declaredValue))}`],
                ['Aina', (CARGO_TYPE_LABELS.find(([v]) => v === cargoType) || [null, 'Kawaida'])[1]],
                ['Njia', `${origin.trim()} → ${destination.trim()}`],
                ['Kuchukuliwa', pickupOption === 'door' ? `Kwako: ${pickupLandmark.trim()}` : 'Unapeleka ofisini'],
                ['Mpokeaji', `${receiverName.trim()} · ${receiverPhone.trim()}`],
                ['Kufika', deliveryOption === 'door' ? 'Mlangoni kwa mpokeaji' : `Anachukua ofisini ${toShort || ''}`.trim()],
                [isDirectDelivery(selected) ? 'Huduma' : selected?.office ? 'Ofisi' : 'Msafirishaji', isDirectDelivery(selected) ? 'Wakala wa karibu' : (selected?.providerName || '—')],
              ].map(([k, v], i, all) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: i < all.length - 1 ? '1px solid #f1f5f9' : 0 }}>
                  <span style={{ fontSize: 14, color: GREY, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ ...card, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Ankara</div>
              {bill.lines.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                  <span style={{ color: '#334155' }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span>
                </div>
              ))}
              <div style={{ height: 1, background: LINE }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800 }}>
                <span>Jumla</span><span data-testid="bill-total">{bill.total != null ? tzs(bill.total) : 'Inathibitishwa'}</span>
              </div>
              {!isDirectDelivery(selected) && (pickupOption === 'door' || deliveryOption === 'door') && (
                <div style={{ fontSize: 13, color: GREY, lineHeight: 1.4 }}>Ada ya wakala hailipwi hapa: unamlipa wakala moja kwa moja.</div>
              )}
            </div>
            <div style={{ ...card, marginTop: 14, fontSize: 14, lineHeight: 1.5, color: '#334155' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 2 }}>
                {pickupOption === 'door' ? 'Utalipa wakala akija kuchukua' : 'Utalipa ofisini ukipeleka mzigo'}
              </div>
              Taslimu au pesa kwa simu. KenteXa haishikilii pesa yako.
            </div>
            {error && <div role="alert" style={{ fontSize: 14, color: '#b91c1c', marginTop: 12 }}>{error}</div>}
            {noAgentAtConfirm && <div style={{ marginTop: 12 }}><NoAgentOfficeCard office={noAgentAtConfirm.office} /></div>}
          </div>
        )}
      </div>

      {step === 1 && footer('Endelea', () => next(2), step1Ok, 'next-1')}
      {step === 2 && footer('Endelea', () => next(3), step2Ok, 'next-2')}
      {step === 3 && footer('Ona ofa', () => next(4), step3Ok, 'next-3')}
      {step === 4 && footer(selected && !isDirectDelivery(selected) ? `Chagua ${selected.providerName || 'ofa hii'}${selected.servicePrice != null ? ` · ${tzs(selected.servicePrice)}` : ''}` : 'Endelea',
        () => next(5), step4Ok && !searching, 'next-4')}
      {step === 5 && footer(submitting ? 'Inatuma…' : 'Thibitisha na tuma', handleConfirm, !submitting, 'confirm')}
    </div>
  );
};

export default SendShipment;
