/**
 * Tuma bidhaa: the seller sends goods to a customer (owner 2026-10-25, approved
 * mockup "Tuma bidhaa — seller form"). "KenteXa is a simple door to a complex
 * engine": four short screens, everything else is filled in the background.
 *
 *   1 Unauza nini?   product / listing / typed item, quantity
 *   2 Kwa nani?      recent customers in one tap, name, phone, place (place search)
 *   3 Malipo         paid, or pays on delivery (boda fee and shop place pre-filled)
 *   4 Thibitisha     summary, the delivery KenteXa chose, the customer's SMS
 *   then Imetumwa    the waybill and what happens next
 *
 * Never asked any more: the seller's city and shop place (remembered), weight and
 * size (from the product), the boda fee (rate card), the delivery method (agent in
 * the city, the office to another city), bus/courier details (the office adds them).
 *
 * From POS ("Ship It"): the items, the customer and the payment are already known,
 * so the form opens at the first thing still missing (usually the customer's place).
 *
 * One shipment engine (owner 2026-10-25: "parcel shipping should be the same for all
 * orders regardless where it comes from"): step 4 asks the same engine as the customer
 * send form for offers (service-offers discover), books the chosen one (commit, quote),
 * creates the Shipment (POST /shipments), then hands it to POST /super-agents/shipments,
 * which adds the sale (order, pay-on-delivery, the customer's SMS) and starts it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import PlaceSearchField, { placeLabel, fromCandidate } from '../components/PlaceSearchField';
import IntelligentLocationInput from '../components/IntelligentLocationInput';
import { serviceOfferCommitBody, shipmentBody, quoteBody, confirmBody } from '../../api/shipmentRequests';
import { officeOffers, allOffers } from './SendShipment';

const BLUE = '#1d4ed8';
const INK = '#0f172a';
const GREY = '#475569';
const LINE = '#e2e8f0';
const FIELD = '#cbd5e1';
const PAPER = '#f8fafc';
const WHITE = '#ffffff';
const FONT = 'Manrope, -apple-system, sans-serif';
const STEPS = 4;
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const digits = (v) => String(v ?? '').replace(/[^0-9]/g, '');
const withCommas = (v) => (digits(v) ? Number(digits(v)).toLocaleString('en-US') : '');
const key = (v) => String(v || '').toLowerCase().replace(/[^a-z]/g, '');
const isDar = (v) => key(v).startsWith('dar');
/** Same city (Dar es Salaam however it is written). */
export const sameCity = (a, b) => (isDar(a) && isDar(b)) || (key(a).length > 1 && key(a) === key(b));

const input = { width: '100%', boxSizing: 'border-box', height: 52, border: `1px solid ${FIELD}`, borderRadius: 12, padding: '0 14px',
  fontFamily: FONT, fontSize: 16, color: INK, background: WHITE };
const label = { display: 'block', fontSize: 14, fontWeight: 600, color: INK, marginBottom: 6 };
const card = { background: WHITE, border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 };
const h1 = { margin: '0 0 16px', fontSize: 26, fontWeight: 800, color: INK };
const linkBtn = { background: 'none', border: 0, padding: 0, minHeight: 44, color: BLUE, fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: 'pointer', textAlign: 'left' };

/** Which step to open at: from POS / a customer, the first thing still missing. */
export function firstStep({ items, name, phone, place, paymentKnown }) {
  if (!items?.length) return 1;
  if (!String(name || '').trim() || digits(phone).length < 9 || !placeLabel(place)) return 2;
  return paymentKnown ? 4 : 3;
}

/**
 * A saved customer's (or a POS sale's) place, written as names, matched to one known
 * place so the engine knows exactly where it is: the same ward (or district, when no
 * ward is saved) in the same region. Anything less certain is left as typed.
 */
export function matchSavedPlace(candidates, { wardName, districtName, regionName }) {
  const n = (v) => String(v || '').trim().toLowerCase();
  const sameRegion = (c) => !n(regionName) || sameCity(c.regionName, regionName);
  const hits = (Array.isArray(candidates) ? candidates : []).filter((c) => c?.placeRef && sameRegion(c) && (n(wardName)
    ? n(c.wardName) === n(wardName) && (!n(districtName) || n(c.districtName) === n(districtName))
    : n(districtName) && !n(c.wardName) && n(c.districtName) === n(districtName)));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The offers the seller can pick from one discovery answer. Same city: the nearby agent
 * plus offices that chose same-city delivery. Another city: offices and transporters
 * (a transporter only when its drop-off and collection points are each a single one,
 * so nothing more has to be asked). Pay-on-delivery rides only on the agent.
 */
export function sellerOffers(list, { inCity, cod }) {
  const all = Array.isArray(list) ? list : [];
  const direct = all.find((o) => o?.serviceType === 'direct_delivery');
  const agent = direct ? [{ direct: true, key: 'direct', providerName: 'Wakala wa karibu', servicePrice: direct.price ?? null }] : [];
  if (cod) return inCity ? agent : [];
  const others = inCity ? officeOffers(all) : allOffers(all, { pickupOption: 'station', deliveryOption: 'station' })
    .filter((o) => o.office || (o.originPoints?.length === 1 && o.destinationPoints?.length === 1));
  return [...agent, ...others.map((o) => ({ ...o, key: o.office ? `office-${o.officeId}` : `t-${o.providerId}-${o.routeId}` }))];
}

const Choice = ({ selected, title, hint, onClick, testId }) => (
  <button type="button" role="radio" aria-checked={selected} onClick={onClick} data-testid={testId}
    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '10px 14px', marginBottom: 10,
      borderRadius: 14, border: selected ? `2px solid ${BLUE}` : `1px solid ${FIELD}`, background: selected ? '#eff6ff' : WHITE,
      fontFamily: FONT, textAlign: 'left', cursor: 'pointer' }}>
    <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, boxSizing: 'border-box', flexShrink: 0, background: WHITE,
      border: selected ? `6px solid ${BLUE}` : '2px solid #94a3b8' }} />
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>{title}</span>
      {hint && <span style={{ fontSize: 13, color: GREY }}>{hint}</span>}
    </span>
  </button>
);

const Row = ({ left, right, strong }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: strong ? 16 : 14, fontWeight: strong ? 800 : 400 }}>
    <span style={{ color: strong ? INK : GREY }}>{left}</span><span style={{ fontWeight: strong ? 800 : 700, textAlign: 'right' }}>{right}</span>
  </div>
);

const SellerShipment = ({ onNavigate, isLoggedIn, prefill = null, activeProfileId }) => {
  const fromSale = Boolean(prefill?.saleId);
  const [sellerCity, setSellerCity] = useState('Dar es Salaam');
  const [products, setProducts] = useState([]);
  const [classifieds, setClassifieds] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [lastPickup, setLastPickup] = useState(null);

  // 1 Unauza nini?
  const [items, setItems] = useState(() => (prefill?.items || []).map((i, n) => ({
    id: `p${n}`, name: i.name, qty: Number(i.qty) || 1, price: Number(i.price) || 0, weight: Number(i.weight) || 0,
    productId: i.productId || null, classifiedId: i.classifiedId || null,
  })));
  const [search, setSearch] = useState('');
  const [typing, setTyping] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [typedPrice, setTypedPrice] = useState('');
  // 2 Kwa nani?
  const [name, setName] = useState(prefill?.name || '');
  const [phone, setPhone] = useState(prefill?.phone || '');
  const [place, setPlace] = useState(() => ({
    regionName: prefill?.region || '', districtName: prefill?.district || '', wardName: prefill?.ward || '',
  }));
  const [landmark, setLandmark] = useState(prefill?.address || '');
  // 3 Malipo (from POS the sale itself decides; the server re-reads it)
  const [payMode, setPayMode] = useState(fromSale ? (prefill?.isCod && Number(prefill?.balanceDue) > 0 ? 'cod' : 'paid') : '');
  const [paidPart, setPaidPart] = useState('');
  const [bodaFee, setBodaFee] = useState('');
  const [bodaFeeAuto, setBodaFeeAuto] = useState(null);
  const [editFee, setEditFee] = useState(false);
  const [changePickup, setChangePickup] = useState(false);
  const [pickupText, setPickupText] = useState('');
  const [pickupLoc, setPickupLoc] = useState(null);
  // 4 Thibitisha
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const [step, setStep] = useState(() => firstStep({
    items: prefill?.items, name: prefill?.name, phone: prefill?.phone,
    place: { regionName: prefill?.region, districtName: prefill?.district, wardName: prefill?.ward }, paymentKnown: fromSale,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  // The engine's offers for step 4.
  const [offers, setOffers] = useState([]);
  const [finding, setFinding] = useState(false);
  const [chosen, setChosen] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    const scope = activeProfileId ? { commerceProfileId: activeProfileId } : {};
    api.get('/store/profile').then((r) => {
      const city = String(r.data?.businessLocation || 'Dar es Salaam').split(',')[0].trim() || 'Dar es Salaam';
      setSellerCity(city);
    }).catch(() => {});
    api.get('/products/my/products', { params: scope }).then((r) => setProducts(r.data || [])).catch(() => setProducts([]));
    api.get('/classifieds/user/mine', { params: scope }).then((r) => setClassifieds(r.data || [])).catch(() => setClassifieds([]));
    api.get('/business/customers?page=1&limit=6').then((r) => setCustomers(r.data?.customers || [])).catch(() => setCustomers([]));
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/super-agents/shipments/last-pickup', { params: { city: sellerCity } })
      .then((r) => setLastPickup(r.data?.pickup || null)).catch(() => setLastPickup(null));
  }, [sellerCity]);

  // A place known only by its names (a saved customer, a POS sale) is looked up once.
  useEffect(() => {
    if (place.placeRef || !(place.wardName || place.districtName)) return undefined;
    let live = true;
    const want = { wardName: place.wardName, districtName: place.districtName, regionName: place.regionName };
    api.get('/location-intelligence/places', { params: { q: place.wardName || place.districtName, limit: 8 } })
      .then((r) => {
        const hit = live ? matchSavedPlace(r.data?.candidates, want) : null;
        if (hit) setPlace((cur) => (cur.placeRef || cur.wardName !== want.wardName || cur.districtName !== want.districtName ? cur : fromCandidate(hit)));
      }).catch(() => {});
    return () => { live = false; };
  }, [place.wardName, place.districtName, place.regionName, place.placeRef]);

  const destCity = place.regionName || place.districtName || place.wardName || '';
  const inCity = sameCity(destCity, sellerCity);
  const goods = items.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  const weight = items.reduce((t, i) => t + (Number(i.weight) || 0) * (Number(i.qty) || 1), 0);
  const address = [landmark.trim(), placeLabel(place)].filter(Boolean).join(', ');
  const cod = payMode === 'cod';
  const useLastPickup = Boolean(lastPickup) && !changePickup;
  const pickupRef = pickupLoc?.placeRef?.providerKey && pickupLoc?.placeRef?.providerPlaceId ? pickupLoc.placeRef : null;
  // The seller's shop: where the journey starts (remembered, or picked once).
  const shop = useLastPickup && lastPickup.placeRef
    ? { label: lastPickup.label, placeRef: lastPickup.placeRef, regionName: lastPickup.city || sellerCity, point: lastPickup.point }
    : pickupRef ? { label: pickupText, placeRef: pickupRef, regionName: pickupLoc.regionName || sellerCity,
      point: Number.isFinite(Number(pickupLoc.latitude)) && pickupLoc.latitude != null ? { latitude: Number(pickupLoc.latitude), longitude: Number(pickupLoc.longitude) } : null }
      : null;

  // The boda fee KenteXa would set (Dar rate card); the seller may change it.
  useEffect(() => {
    if (!cod || !inCity || !placeLabel(place)) { setBodaFeeAuto(null); return; }
    api.get('/super-agents/shipments/boda-fee', { params: { to: address, city: destCity } })
      .then((r) => setBodaFeeAuto(r.data?.fee ?? null)).catch(() => setBodaFeeAuto(null));
  }, [cod, inCity, address, destCity]); // eslint-disable-line react-hooks/exhaustive-deps
  const fee = digits(bodaFee) ? Number(digits(bodaFee)) : bodaFeeAuto;

  // The same request state the customer send form builds (api/shipmentRequests).
  const description = items.map((i) => `${i.name}${Number(i.qty) > 1 ? ` x${i.qty}` : ''}`).join(', ');
  const requestState = {
    itemDescription: description, weightKg: weight || 1, pieces: 1, declaredValue: goods, cargoType: 'kawaida',
    origin: shop?.label || sellerCity, originResolved: shop ? { placeRef: shop.placeRef, regionName: shop.regionName } : null,
    destination: placeLabel(place) || destCity,
    destinationResolved: place.placeRef ? { placeRef: place.placeRef, regionName: place.regionName || destCity } : null,
    receiverName: name.trim(), receiverPhone: phone.trim(),
    pickupOption: inCity ? 'door' : 'station', deliveryOption: inCity ? 'door' : 'station',
    pickupLandmark: inCity ? shop?.label : undefined, pickupPin: inCity ? shop?.point || null : null,
  };
  const needShop = inCity && !shop;

  // Step 4: ask the engine. Runs again when what it depends on changes.
  const findKey = step === 4 && !needShop ? [sellerCity, destCity, shop?.placeRef?.providerPlaceId, place.placeRef?.providerPlaceId, address, weight, goods, cod].join('|') : '';
  useEffect(() => {
    if (!findKey) return undefined;
    let live = true;
    setFinding(true); setOffers([]); setChosen(null);
    api.post('/transport/service-offers/discover', {
      fromCity: sellerCity, toCity: destCity, weightKg: weight || 1,
      pickup: inCity ? 'door' : 'point', delivery: inCity ? 'door' : 'collect',
      origin: shop ? { place: shop.placeRef } : { text: sellerCity },
      destination: place.placeRef ? { place: { providerKey: place.placeRef.providerKey, providerPlaceId: place.placeRef.providerPlaceId } } : { text: address || destCity },
      declaredValue: goods || undefined,
      pickupPoint: inCity && shop?.point ? shop.point : undefined,
    }).then((r) => {
      if (!live) return;
      const list = sellerOffers(r.data, { inCity, cod });
      setOffers(list); setChosen(list[0] || null);
    }).catch(() => { if (live) setOffers([]); })
      .finally(() => { if (live) setFinding(false); });
    return () => { live = false; };
  }, [findKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [
      ...products.map((p) => ({ k: `pr${p.id}`, name: p.name, price: Number(p.price || p.basePrice || 0), weight: Number(p.weightKg || 0), productId: p.id })),
      ...classifieds.map((c) => ({ k: `cl${c.id}`, name: c.title, price: Number(c.price || 0), weight: 0, classifiedId: c.id })),
    ];
    return (q ? list.filter((c) => String(c.name || '').toLowerCase().includes(q)) : list).slice(0, 6);
  }, [products, classifieds, search]);

  const pick = (c) => setItems([{ id: c.k, name: c.name, qty: 1, price: c.price, weight: c.weight, productId: c.productId || null, classifiedId: c.classifiedId || null }]);
  const setQty = (d) => setItems((list) => list.map((i, n) => (n === 0 ? { ...i, qty: Math.max(1, (Number(i.qty) || 1) + d) } : i)));
  const addTyped = () => {
    if (!typedName.trim() || !(Number(digits(typedPrice)) > 0)) return;
    setItems([{ id: 'typed', name: typedName.trim(), qty: 1, price: Number(digits(typedPrice)), weight: 0, productId: null, classifiedId: null }]);
    setTyping(false);
  };
  const chooseCustomer = (c) => {
    setName(c.name || ''); setPhone(c.phone || '');
    setPlace({ regionName: c.region || '', districtName: c.district || '', wardName: c.ward || '' });
    setLandmark(c.address || '');
  };

  const ok = {
    1: items.length > 0 && goods > 0,
    2: Boolean(name.trim() && digits(phone).length >= 9 && placeLabel(place)),
    3: payMode === 'paid' || (cod && inCity && fee != null && Boolean(useLastPickup || pickupRef)
      && (fromSale || (Number(digits(paidPart)) || 0) < goods)),
    4: Boolean(chosen) && !finding,
  };

  const send = async () => {
    setBusy(true); setError('');
    try {
      // 1 Book the chosen offer with the shipment engine, exactly as the customer form does.
      let journey = null;
      let acceptedQuote = null;
      if (chosen.direct) {
        journey = (await api.post('/transport/service-offers/commit', serviceOfferCommitBody(requestState, chosen, true))).data;
      } else if (chosen.office) {
        journey = (await api.post('/transport/service-offers/commit', {
          ...serviceOfferCommitBody(requestState, chosen, false),
          serviceType: 'office', officeId: Number(chosen.officeId), providerId: undefined, routeId: undefined, runId: undefined,
          declaredValue: goods || undefined,
        })).data;
      } else {
        const j = (await api.post('/transport/service-offers/commit', serviceOfferCommitBody(requestState, chosen, false))).data;
        const offered = await api.post('/transport/quotes', quoteBody(j, chosen, requestState));
        acceptedQuote = (await api.post(`/transport/quotes/${offered.data.id}/accept`)).data;
      }
      // 2 The Shipment, as the seller's.
      const shipment = (await api.post('/shipments', {
        ...shipmentBody(requestState, chosen, acceptedQuote, chosen.direct || chosen.office ? journey : null),
        senderPhone: undefined, senderName: undefined,
      })).data;
      const points = chosen.direct || chosen.office ? {} : confirmBody({
        originHubId: chosen.originPoints?.[0]?.hubId, destinationHubId: chosen.destinationPoints?.[0]?.hubId,
      });
      // 3 The sale on top: the order, pay-on-delivery and the customer's SMS; the server starts the Shipment.
      const res = await api.post('/super-agents/shipments', {
        shipmentId: shipment.id, confirm: points,
        description,
        items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, weight: i.weight, productId: i.productId, classifiedId: i.classifiedId })),
        classifiedId: items.find((i) => i.classifiedId)?.classifiedId || null,
        weightKg: weight || undefined, parcelSize: 'small',
        recipientName: name.trim(), recipientPhone: phone.trim(),
        destinationCity: destCity, deliveryAddress: address,
        regionName: place.regionName || null, districtName: place.districtName || null, wardName: place.wardName || null,
        originCity: sellerCity,
        // KenteXa decides: an agent inside the city, the office to another city.
        transportMethod: inCity ? 'boda' : 'super_agent',
        notes: notes.trim() || null,
        totalValue: goods,
        commerceProfileId: activeProfileId || undefined,
        paymentMethod: 'cash',
        saleId: prefill?.saleId || undefined,
        isCod: !fromSale && cod ? true : undefined,
        codAmountPaid: !fromSale && cod ? (Number(digits(paidPart)) || 0) : undefined,
        bodaFee: cod && digits(bodaFee) ? Number(digits(bodaFee)) : undefined,
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Haikutumwa. Jaribu tena.');
    } finally { setBusy(false); }
  };

  const restart = () => {
    setResult(null); setItems([]); setName(''); setPhone(''); setPlace({ regionName: '', districtName: '', wardName: '' });
    setLandmark(''); setPayMode(''); setPaidPart(''); setBodaFee(''); setNotes(''); setError(''); setStep(1);
  };

  const owed = Math.max(0, goods - (Number(digits(paidPart)) || 0));
  const total = (fromSale ? Number(prefill?.balanceDue) || 0 : owed) + (cod ? (fee || 0) : 0);
  // The customer's one SMS, as the server builds it for a COD sale (shown for trust).
  const smsPreview = cod
    ? `Oda yako imethibitishwa: ${items[0]?.name || 'Bidhaa'} ${(fromSale ? Number(prefill?.balanceDue) || 0 : owed).toLocaleString('en-US')} + usafiri ${(fee || 0).toLocaleString('en-US')} = ${tzs(total)}. Lipa ukipokea. Fuatilia: (namba ya mzigo)`
    : null;

  // ── Imetumwa ───────────────────────────────────────────────────────────────
  if (result) {
    const number = result.customerNumber || result.trackingNumber;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: PAPER, fontFamily: FONT, color: INK }}>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '56px 20px 20px', textAlign: 'center' }}>
          <h1 style={{ ...h1, margin: 0 }}>Imetumwa</h1>
          <div style={{ ...card, width: '100%', maxWidth: 480, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 13, color: GREY, fontWeight: 600 }}>Namba ya mzigo</div>
            <div data-testid="seller-send-number" style={{ fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>{number}</div>
          </div>
          <div style={{ width: '100%', maxWidth: 480, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15 }}>
            <div>{`${name || 'Mteja'} amepata SMS yenye ${cod ? 'bei na ' : ''}namba ya kufuatilia.`}</div>
            <div>{chosen?.direct ? 'Mawakala wa karibu wameambiwa; wa kwanza kukubali anakuja dukani kwako.'
              : chosen?.office ? `Peleka mzigo ${chosen.officeAddress || chosen.officeCity || 'ofisini'} (${chosen.providerName}).`
                : `Peleka mzigo ${chosen?.originPoints?.[0]?.name || 'kituoni'} (${chosen?.providerName || 'msafirishaji'}).`}</div>
            {result.billing && !result.billing.isFreeOrder && (
              <div style={{ color: GREY }}>Ada ya KenteXa {tzs(result.billing.platformFeeCharged)} imeongezwa kwenye deni lako.</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px 24px', background: WHITE, borderTop: `1px solid ${LINE}` }}>
          <button type="button" onClick={restart} style={{ height: 54, border: 0, borderRadius: 14, background: BLUE, color: WHITE, fontFamily: FONT, fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>Tuma nyingine</button>
          <button type="button" onClick={() => onNavigate(`TrackParcel-${result.trackingNumber}`)}
            style={{ height: 54, borderRadius: 14, border: `1px solid ${FIELD}`, background: WHITE, color: INK, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Fuatilia mzigo</button>
        </div>
      </div>
    );
  }

  // A POS sale already paid has nothing to ask on the payment screen: it is skipped.
  const skipPayment = fromSale && !cod;
  const next = () => { setError(''); if (step < STEPS) setStep(step === 2 && skipPayment ? 4 : step + 1); else send(); };
  const back = () => { setError(''); if (step > 1) setStep(step === 4 && skipPayment ? 2 : step - 1); else onNavigate('back'); };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: PAPER, fontFamily: FONT, color: INK }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px', background: WHITE, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label="Rudi" onClick={back} style={{ width: 44, height: 44, border: 0, background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div style={{ fontSize: 20, fontWeight: 800, flexGrow: 1 }}>Tuma bidhaa</div>
          <div style={{ fontSize: 14, color: GREY, fontWeight: 600 }}>Hatua {step} kati ya {STEPS}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STEPS}, minmax(0, 1fr))`, gap: 6 }}>
          {Array.from({ length: STEPS }, (_, n) => <div key={n} style={{ height: 4, borderRadius: 2, background: n < step ? BLUE : LINE }} />)}
        </div>
      </div>

      <div style={{ flexGrow: 1, padding: '20px 16px 120px', maxWidth: 520, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {step === 1 && (
          <>
            <h1 style={h1}>Unauza nini?</h1>
            {fromSale ? (
              <div style={{ ...card, marginBottom: 12, fontSize: 14, color: GREY }}>Kutoka kwenye mauzo ya POS.</div>
            ) : (
              <input aria-label="Tafuta bidhaa yako" placeholder="Tafuta bidhaa yako" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...input, marginBottom: 12 }} />
            )}
            <div role="radiogroup" aria-label="Bidhaa" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.length > 0 && !choices.some((c) => c.k === items[0].id) && (
                <div style={{ ...card, border: `2px solid ${BLUE}`, background: '#eff6ff' }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{items.map((i) => i.name).join(', ')}</div>
                  <div style={{ fontSize: 14, color: GREY }}>{tzs(goods)}</div>
                </div>
              )}
              {!fromSale && choices.map((c) => {
                const on = items[0]?.id === c.k;
                return (
                  <button key={c.k} type="button" role="radio" aria-checked={on} onClick={() => pick(c)}
                    style={{ ...card, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', fontFamily: FONT, cursor: 'pointer',
                      border: on ? `2px solid ${BLUE}` : `1px solid ${LINE}`, background: on ? '#eff6ff' : WHITE, color: INK }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</span>
                    <span style={{ fontSize: 14, color: GREY }}>{c.price > 0 ? tzs(c.price) : 'Weka bei'}{c.weight > 0 ? ` · kg ${c.weight}` : ''}</span>
                  </button>
                );
              })}
            </div>
            {!fromSale && (typing ? (
              <div style={{ ...card, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><label htmlFor="typed-name" style={label}>Bidhaa</label>
                  <input id="typed-name" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Mfano: Saa ya ukutani" style={input} /></div>
                <div><label htmlFor="typed-price" style={label}>Bei (TZS)</label>
                  <input id="typed-price" inputMode="numeric" value={withCommas(typedPrice)} onChange={(e) => setTypedPrice(digits(e.target.value))} placeholder="300,000" style={input} /></div>
                <button type="button" onClick={addTyped} disabled={!typedName.trim() || !(Number(digits(typedPrice)) > 0)}
                  style={{ height: 48, border: 0, borderRadius: 12, background: BLUE, color: WHITE, fontFamily: FONT, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Chagua</button>
              </div>
            ) : (
              <button type="button" onClick={() => setTyping(true)} style={{ ...linkBtn, marginTop: 8 }}>+ Andika kitu kingine</button>
            ))}
            {items.length === 1 && !fromSale && (
              <div style={{ ...card, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Idadi</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button type="button" aria-label="Punguza" onClick={() => setQty(-1)} style={{ width: 44, height: 44, borderRadius: 22, border: `1px solid ${FIELD}`, background: WHITE, fontSize: 20, cursor: 'pointer' }}>−</button>
                  <span data-testid="qty" style={{ fontSize: 18, fontWeight: 800 }}>{items[0].qty}</span>
                  <button type="button" aria-label="Ongeza" onClick={() => setQty(1)} style={{ width: 44, height: 44, borderRadius: 22, border: `1px solid ${FIELD}`, background: WHITE, fontSize: 20, cursor: 'pointer' }}>+</button>
                </span>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={h1}>Kwa nani?</h1>
            {customers.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GREY, marginBottom: 8 }}>Wateja wako wa karibuni</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {customers.filter((c) => c.name).slice(0, 5).map((c) => {
                    const on = Boolean(digits(c.phone)) && digits(c.phone) === digits(phone);
                    return (
                      <button key={c.id || c.phone} type="button" onClick={() => chooseCustomer(c)}
                        style={{ minHeight: 44, padding: '0 14px', borderRadius: 22, border: on ? `2px solid ${BLUE}` : `1px solid ${FIELD}`,
                          background: on ? '#eff6ff' : WHITE, fontFamily: FONT, fontSize: 14, fontWeight: 700, color: INK, cursor: 'pointer' }}>{c.name}</button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 16 }}><label htmlFor="c-name" style={label}>Jina</label>
              <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} style={input} /></div>
            <div style={{ marginBottom: 16 }}><label htmlFor="c-phone" style={label}>Simu</label>
              <input id="c-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" style={input} /></div>
            <div style={{ marginBottom: 16 }}><label htmlFor="c-place" style={label}>Mahali pa mteja</label>
              <PlaceSearchField id="c-place" value={place} onChange={setPlace} placeholder="Andika mahali, mfano Mbezi" /></div>
            <div><label htmlFor="c-landmark" style={label}>Alama ya karibu <span style={{ color: GREY, fontWeight: 400 }}>(hiari)</span></label>
              <input id="c-landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Mfano: karibu na kanisa" style={input} /></div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 style={h1}>Mteja analipaje?</h1>
            {fromSale ? (
              <div data-testid="pos-payment" style={{ ...card, fontSize: 15 }}>
                {cod ? `Atalipa akipokea: ${tzs(prefill?.balanceDue)} (kutoka kwenye mauzo ya POS).` : 'Ameshalipa kwenye POS.'}
              </div>
            ) : (
              <div role="radiogroup" aria-label="Malipo">
                <Choice selected={payMode === 'paid'} onClick={() => setPayMode('paid')} testId="pay-paid" title="Ameshalipa" hint="Taslimu au Lipa Namba, kabla ya kutuma" />
                <Choice selected={cod} onClick={() => setPayMode('cod')} testId="pay-cod" title="Atalipa akipokea" hint="Taslimu au Lipa Namba, mzigo ukifika" />
              </div>
            )}
            {cod && !inCity && (
              <div role="alert" style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginTop: 10, fontSize: 14 }}>
                Kulipa ukipokea ni ndani ya mji mmoja tu. Chagua "Ameshalipa" kwa mji mwingine.
              </div>
            )}
            {cod && inCity && (
              <div style={{ ...card, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: GREY }}>KenteXa imeshajaza</div>
                {editFee || bodaFeeAuto == null ? (
                  <div><label htmlFor="boda-fee" style={label}>Ada ya boda (TZS)</label>
                    <input id="boda-fee" inputMode="numeric" value={withCommas(bodaFee)} onChange={(e) => setBodaFee(digits(e.target.value))}
                      placeholder={bodaFeeAuto ? bodaFeeAuto.toLocaleString('en-US') : '3,000'} style={input} /></div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15 }}>Ada ya boda</span>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <strong data-testid="boda-fee">{tzs(fee)}</strong>
                      <button type="button" onClick={() => setEditFee(true)} style={{ ...linkBtn, fontSize: 14 }}>Badilisha</button>
                    </span>
                  </div>
                )}
                <div style={{ height: 1, background: LINE }} />
                {useLastPickup ? (
                  <div data-testid="last-pickup" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15 }}>Boda atachukua: <strong>{lastPickup.label}</strong></span>
                    <button type="button" onClick={() => setChangePickup(true)} style={{ ...linkBtn, fontSize: 14 }}>Badilisha</button>
                  </div>
                ) : (
                  <div><span style={label}>Duka lako (boda atachukua hapa)</span>
                    <IntelligentLocationInput label="Duka lako" value={pickupText}
                      onTextChange={(text) => { setPickupText(text); if (!text) setPickupLoc(null); }}
                      onResolved={(loc) => setPickupLoc(loc || null)} /></div>
                )}
                {!fromSale && (
                  <div><label htmlFor="paid-part" style={label}>Amelipa sehemu? <span style={{ color: GREY, fontWeight: 400 }}>(hiari)</span></label>
                    <input id="paid-part" inputMode="numeric" value={withCommas(paidPart)} onChange={(e) => setPaidPart(digits(e.target.value))} placeholder="0" style={input} /></div>
                )}
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h1 style={h1}>Angalia kabla ya kutuma</h1>
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              <Row left="Bidhaa" right={items.map((i) => `${i.name} × ${i.qty}`).join(', ')} />
              <Row left="Kwa" right={`${name} · ${placeLabel(place)}`} />
              <Row left="Malipo" right={cod ? 'Atalipa akipokea' : 'Ameshalipa'} />
            </div>
            {needShop ? (
              <div style={{ ...card, marginBottom: 12 }}>
                <span style={label}>Duka lako (mzigo unachukuliwa hapa)</span>
                <IntelligentLocationInput label="Duka lako" value={pickupText}
                  onTextChange={(text) => { setPickupText(text); if (!text) setPickupLoc(null); }}
                  onResolved={(loc) => setPickupLoc(loc || null)} />
                <div style={{ fontSize: 12, color: GREY, marginTop: 6 }}>Inaulizwa mara moja tu; KenteXa itakumbuka.</div>
              </div>
            ) : finding ? (
              <div data-testid="delivery-finding" style={{ ...card, marginBottom: 12, fontSize: 15, color: GREY }}>KenteXa inatafuta usafiri…</div>
            ) : offers.length === 0 ? (
              <div role="alert" data-testid="delivery-none" style={{ ...card, marginBottom: 12, borderColor: '#fde68a', background: '#fffbeb', fontSize: 14 }}>
                {cod ? 'Hakuna wakala wa karibu kwa sasa wa kulipa ukipokea. Chagua "Ameshalipa" au jaribu tena baadaye.' : `Hakuna usafiri kwenda ${destCity || 'huko'} kwa sasa. Jaribu tena baadaye.`}
              </div>
            ) : (
              <div role="radiogroup" aria-label="Usafiri" data-testid="delivery-choice" style={{ marginBottom: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GREY, marginBottom: 6 }}>Usafiri {offers.length > 1 ? '(KenteXa imechagua wa bei nafuu; unaweza kubadilisha)' : ''}</div>
                {offers.map((o) => (
                  <Choice key={o.key} testId={`offer-${o.key}`} selected={chosen?.key === o.key} onClick={() => setChosen(o)}
                    title={`${o.providerName}${cod && o.direct && fee != null ? ` · ${tzs(fee)}` : o.servicePrice != null ? ` · ${tzs(o.servicePrice)}` : ''}`}
                    hint={o.direct ? `Anachukua dukani kwako na kumfikishia ${name || 'mteja'} mlangoni`
                      : o.office ? `Peleka mzigo ${o.officeAddress || o.officeCity || 'ofisini'}; ofisi inaupeleka ${destCity}`
                        : `Peleka mzigo ${o.originPoints?.[0]?.name || 'kituoni'}; ${name || 'mteja'} anachukua ${o.destinationPoints?.[0]?.name || destCity}`} />
                ))}
              </div>
            )}
            <div style={{ ...card, background: '#f0fdf4', borderColor: '#bbf7d0', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <Row left="Bidhaa" right={goods.toLocaleString('en-US')} />
              {cod && <Row left="Usafiri" right={(fee || 0).toLocaleString('en-US')} />}
              <div style={{ height: 1, background: '#bbf7d0' }} />
              <Row strong left={cod ? `${name || 'Mteja'} atalipa` : 'Thamani ya mzigo'} right={tzs(cod ? total : goods)} />
            </div>
            {smsPreview && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GREY, marginBottom: 6 }}>SMS atakayopata {name || 'mteja'}</div>
                <div style={{ ...card, fontSize: 14, lineHeight: 1.45, color: '#334155' }}>{smsPreview}</div>
              </div>
            )}
            {showNotes ? (
              <div><label htmlFor="notes" style={label}>Maelezo (hiari)</label>
                <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mfano: kitu kinavunjika" style={input} /></div>
            ) : (
              <button type="button" onClick={() => setShowNotes(true)} style={linkBtn}>+ Ongeza maelezo (hiari)</button>
            )}
          </>
        )}

        {error && <div role="alert" style={{ ...card, marginTop: 12, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 14 }}>{error}</div>}
      </div>

      <div data-testid="form-footer" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 6, padding: '12px 16px calc(16px + env(safe-area-inset-bottom))', background: WHITE, borderTop: `1px solid ${LINE}` }}>
        <button type="button" data-testid={`next-${step}`} onClick={next} disabled={!ok[step] || busy}
          style={{ display: 'block', width: '100%', maxWidth: 520, margin: '0 auto', height: 54, border: 0, borderRadius: 14, background: BLUE, color: WHITE,
            fontFamily: FONT, fontSize: 17, fontWeight: 800, cursor: ok[step] && !busy ? 'pointer' : 'not-allowed', opacity: ok[step] && !busy ? 1 : 0.5 }}>
          {step === STEPS ? (busy ? 'Inatuma…' : 'Tuma') : 'Endelea'}
        </button>
      </div>
    </div>
  );
};

export default SellerShipment;
