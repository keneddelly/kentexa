import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { KENTEXA_SUPPORT } from '../utils/whatsapp-link';
import { Spinner } from '../components/Loading';
import { normalizeWaybill, formatWaybill } from '../../utils/waybill';

/**
 * TrackParcel — Fuatilia mzigo (owner 2026-10-27 redesign, same look as Soko and
 * Ujumbe). Shows only what the public tracking projection really returns: no
 * guessed arrival days, no empty contact boxes, no adverts, no emoji. One timeline
 * of real milestones; when the parcel reaches the office, the receiver chooses
 * pickup or delivery.
 */
export const INK = '#0f1419';
export const MUTED = '#536471';
export const LINE = '#eff3f4';
export const BLUE = '#1d4ed8';

// Milestones a person understands, in order. Every parcel/batch status maps to one.
export const MILESTONES = [
  'Ombi limeundwa',
  'Umepokelewa ofisini',
  'Tayari kusafirishwa',
  'Uko safarini',
  'Umefika ofisi ya kupokelea',
  'Unaletwa kwako',
  'Umepokelewa',
];
const MILESTONE_OF = {
  pending: 0, collection_requested: 0, awaiting_handover: 0, confirmed: 0,
  collected_by_agent: 1, received_at_hub: 1, verified: 1, at_hub: 1, collected: 1,
  ready_for_dispatch: 2,
  dispatched: 3, in_transit: 3, transferred_hub: 3, on_van: 3,
  arrived_at_hub: 4, awaiting_buyer: 4, at_zone: 4,
  out_for_delivery: 5,
  delivered: 6, self_pickup: 6, completed: 6,
};
// Handover events (custody) recorded by offices, agents and transporters.
const CUSTODY = {
  origin_hub_received: ['Umepokelewa ofisini', 1],
  collection_received_at_origin_hub: ['Umepokelewa ofisini', 1],
  seller_collected_by_agent: ['Wakala ameuchukua kwa mtumaji', 1],
  origin_agent_collected: ['Wakala ameuchukua kwa mtumaji', 1],
  transport_provider_collected: ['Msafirishaji ameuchukua', 3],
  parcel_run_loaded: ['Umepakiwa kwenye gari', 3],
  parcel_run_unloaded: ['Umeshushwa kwenye gari', 3],
  parcel_run_received: ['Umepokelewa kutoka garini', 3],
  destination_hub_received: ['Umefika ofisi ya kupokelea', 4],
  destination_agent_received: ['Wakala wa mwisho ameupokea', 5],
  recipient_agent_delivery: ['Umekabidhiwa kwa mpokeaji', 6],
  recipient_self_pickup: ['Mpokeaji ameuchukua ofisini', 6],
};
// The headline for the current status.
export const STATUS_TITLE = {
  pending: 'Unasubiri kufikishwa ofisini', collection_requested: 'Wakala atakuja kuuchukua', awaiting_handover: 'Unasubiri kukabidhiwa',
  confirmed: 'Tunajiandaa kuuchukua', collected: 'Mzigo umechukuliwa', collected_by_agent: 'Wakala ameuchukua',
  received_at_hub: 'Umepokelewa ofisini', verified: 'Umekaguliwa ofisini', at_hub: 'Uko ofisini',
  ready_for_dispatch: 'Tayari kusafirishwa', dispatched: 'Safari imeanza', in_transit: 'Uko safarini', transferred_hub: 'Uko safarini',
  on_van: 'Uko safarini', arrived_at_hub: 'Mzigo wako umefika', awaiting_buyer: 'Mzigo wako umefika', at_zone: 'Umefika eneo lako',
  out_for_delivery: 'Unaletwa kwako', delivered: 'Umepokelewa', self_pickup: 'Umechukuliwa ofisini', completed: 'Imekamilika',
  returned: 'Umerudishwa kwa mtumaji', disputed: 'Kuna tatizo limeripotiwa', cancelled: 'Imeghairiwa',
};
export const eventLabel = (e) => CUSTODY[e.status]?.[0] || STATUS_TITLE[e.status] || 'Taarifa mpya';
const eventMilestone = (e) => (CUSTODY[e.status] ? CUSTODY[e.status][1] : MILESTONE_OF[e.status]);

const DAY_SW = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
const MONTH_SW = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
const pad = (n) => String(n).padStart(2, '0');
/** "leo 09:05", "jana 16:20", "Jumamosi 10:12", "24 Okt 10:12". */
export const when = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const start = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const days = Math.round((start(new Date()) - start(d)) / 86400000);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days <= 0) return `leo ${time}`;
  if (days === 1) return `jana ${time}`;
  if (days < 7) return `${DAY_SW[d.getDay()]} ${time}`;
  return `${d.getDate()} ${MONTH_SW[d.getMonth()]} ${time}`;
};
const dateLong = (value) => { const d = new Date(value); return `${DAY_SW[d.getDay()]}, ${d.getDate()} ${MONTH_SW[d.getMonth()]}`; };

export const Icon = ({ d, size = 20, color = MUTED, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
export const IC = {
  back: 'M15 6l-6 6 6 6', share: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6', copy: 'M8 8h11v13H8zM5 16V3h11',
  arrow: 'M5 12h14M13 6l6 6-6 6', check: 'M5 12.5l4.5 4.5L19 7', box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  office: 'M4 21V6.2L12 3l8 3.2V21h-6v-5h-4v5z', home: 'M3.5 10.2L12 3.3l8.5 6.9V20a1 1 0 01-1 1h-5v-6.5h-5V21h-5a1 1 0 01-1-1z',
  chat: 'M12 3.5c4.97 0 9 3.6 9 8.05 0 4.45-4.03 8.05-9 8.05-1.1 0-2.15-.17-3.12-.5L3.5 20.5l1.45-4.1A7.6 7.6 0 013 11.55C3 7.1 7.03 3.5 12 3.5z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5', alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
};
export const card = { border: `1px solid ${LINE}`, borderRadius: 16, padding: 14 };
export const pill = (bg, fg = '#fff', border = 'none') => ({ height: 48, borderRadius: 24, border, backgroundColor: bg, color: fg, fontSize: 15, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', padding: '0 18px' });
export const tone = (status) => {
  const m = MILESTONE_OF[status];
  if (status === 'returned' || status === 'disputed' || status === 'cancelled') return ['#fef2f2', '#b91c1c'];
  if (m === 4) return ['#fffbeb', '#92400e'];
  if (m === 6) return ['#ecfdf3', '#166534'];
  return ['#eff6ff', BLUE];
};

const TrackParcel = ({ onNavigate, isLoggedIn, trackingNumber: propTracking, orderId: propOrderId }) => {
  const { t } = useTranslation();
  const [trackingInput, setTrackingInput] = useState(propTracking || (propOrderId ? `KTX-ORD-${propOrderId}` : ''));
  const [result, setResult]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [notice, setNotice]               = useState('');
  const [phoneResults, setPhoneResults]   = useState(null);
  const [phoneLoading, setPhoneLoading]   = useState(false);
  const [phoneError, setPhoneError]       = useState('');
  const [copied, setCopied]               = useState(false);

  useEffect(() => {
    if (propTracking) handleTrack(propTracking);
    else if (propOrderId) handleTrackByOrderId(propOrderId);
  }, [propTracking, propOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Signed in with nothing to look up yet: show my parcels straight away.
  useEffect(() => {
    if (isLoggedIn && !propTracking && !propOrderId) handlePhoneSearch();
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unified search — detects input type and routes correctly ──
  const handleSearch = async (input) => {
    const raw = (typeof input === 'string' ? input : null) || trackingInput;
    const val = String(raw || '').trim().toUpperCase();
    if (!val) { setError(t('track_parcel.error_empty')); return; }

    setLoading(true); setError(''); setNotice(''); setResult(null);

    try {
      // 0. Waybill (KTX + 10 digits, spaces allowed, check digit valid).
      // Checked before "pure number" so the 10 digits alone are not read as
      // an order ID. The server turns it into the parcel's own number.
      const waybill = normalizeWaybill(String(raw || ''));
      if (waybill) {
        const res = await api.get(`/super-agents/track/${waybill}`);
        setResult({ ...res.data, _source: 'superagent' });
        return;
      }

      // 1. Pure number or KTX-ORD-n → the order's number (KTX-ORD-n). Its
      // parcel carries the same number once handed to an office; before
      // that there is nothing to track yet. (The old public lookup by order
      // ID, /super-agents/track-order, was removed on purpose: 13bd3eb.)
      const orderMatch = val.match(/^(?:KTX-ORD-)?(\d+)$/);
      if (orderMatch) {
        await trackOrderNumber(`KTX-ORD-${orderMatch[1]}`);
        return;
      }

      // 2e. KTX-SHP-xxx → standalone Shipment request. Before it's confirmed
      // there's no Parcel yet (nothing to show beyond the request itself);
      // once confirmed, reach for the same tracking experience an
      // Order-based delivery already gets, rather than a second, differently
      // shaped view — a shipment requester shouldn't need to know their
      // package became "a Parcel" internally.
      if (val.startsWith('KTX-SHP-')) {
        const shipRes = await api.get(`/shipments/track/${val}`);
        if (shipRes.data?.parcelTrackingNumber) {
          const res = await api.get(`/super-agents/track/${shipRes.data.parcelTrackingNumber}`);
          // The Parcel number is an internal/operational child identifier.
          // A sender or receiver who entered KTX-SHP-* must keep seeing the
          // SAME customer-facing Shipment number throughout the journey.
          setResult({ ...res.data, trackingNumber:shipRes.data.trackingNumber, shipmentTrackingNumber:shipRes.data.trackingNumber, _source:'shipment-parcel' });
        } else {
          setResult({ ...shipRes.data, _source: 'shipment' });
        }
        return;
      }

      // 3. KTX-XXX-XXX-xxxxxx (also KTX-BATCH-… / KTX-OFFLINE-…) → the parcel's own number
      if (val.startsWith('KTX-')) {
        const res = await api.get(`/super-agents/track/${val}`);
        setResult({ ...res.data, _source: 'superagent' });
        return;
      }

      // 4. Anything else — try super agent first
      try {
        const res = await api.get(`/super-agents/track/${val}`);
        setResult({ ...res.data, _source: 'superagent' });
      } catch {
        // 5. Last resort — an order's own tracking number (or waybill)
        try {
          const searchRes = await api.get(`/orders/by-tracking/${encodeURIComponent(val)}`);
          if (searchRes.data?.trackingNumber) await trackOrderNumber(searchRes.data.trackingNumber);
          else setError(t('track_parcel.error_not_found', { val }));
        } catch {
          setError(t('track_parcel.error_not_found', { val }));
        }
      }

    } catch (err) {
      setError(err?.response?.data?.message || t('track_parcel.error_generic'));
    } finally {
      setLoading(false);
    }
  };

  // An order number (KTX-ORD-n): its parcel, if it has one yet.
  const trackOrderNumber = async (orderNumber) => {
    try {
      const res = await api.get(`/super-agents/track/${orderNumber}`);
      setResult({ ...res.data, _source: 'superagent' });
      return;
    } catch { /* no parcel with this number yet */ }
    try {
      await api.get(`/orders/by-tracking/${encodeURIComponent(orderNumber)}`);
      setNotice(t('track_parcel.order_not_shipped_yet', { val: orderNumber }));
    } catch {
      setError(t('track_parcel.error_not_found', { val: orderNumber }));
    }
  };

  // Keep handleTrack as alias for backward compat (used in useEffect)
  const handleTrack = (tn) => handleSearch(typeof tn === 'string' ? tn : null);

  // Lookup by the logged-in user's own account phone — for a buyer who
  // never got/kept their tracking number. Scoped server-side to the
  // caller's own phone (no free-text phone input — that would let anyone
  // look up a stranger's parcels).
  const handlePhoneSearch = async () => {
    setPhoneLoading(true); setPhoneError(''); setPhoneResults(null);
    try {
      const res = await api.get('/super-agents/shipments/buyer');
      setPhoneResults(res.data || []);
    } catch (err) {
      setPhoneError(err?.response?.data?.message || t('track_parcel.error_generic'));
    } finally {
      setPhoneLoading(false);
    }
  };
  const handleTrackByOrderId = (id) => handleSearch(`KTX-ORD-${id}`);

  // ── What the result says, from real fields only ──────────────────────────
  const status = result?.status;
  const history = Array.isArray(result?.history) ? [...result.history]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) : []; // newest first
  const latest = history[0];
  const current = status != null ? (MILESTONE_OF[status] ?? (latest ? eventMilestone(latest) : -1)) : -1;
  const problem = ['returned', 'disputed', 'cancelled'].includes(status);
  const arrived = ['superagent', 'shipment-parcel'].includes(result?._source) && ['arrived_at_hub', 'awaiting_buyer'].includes(status)
    && result?.buyerRequestedDelivery == null;
  const shownNumber = result ? (result.waybillNumber ? formatWaybill(result.waybillNumber) : (result.shipmentTrackingNumber || result.trackingNumber)) : '';
  const shareLink = result ? `${window.location.origin}/?track=${encodeURIComponent(result.shipmentTrackingNumber || result.trackingNumber || '')}` : '';
  const askHref = result ? `https://wa.me/${KENTEXA_SUPPORT}?text=${encodeURIComponent(`Habari KenteXa, naomba msaada kuhusu mzigo ${shownNumber}.`)}` : '#';
  const stepMeta = (i) => {
    const e = history.find((h) => eventMilestone(h) === i);
    return e ? [e.city, when(e.createdAt)].filter(Boolean).join(' · ') : '';
  };
  const copy = () => { try { navigator.clipboard?.writeText(shownNumber); } catch { /* still visible */ } setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const share = () => {
    if (navigator.share) navigator.share({ title: 'Fuatilia mzigo', text: `Mzigo ${shownNumber}`, url: shareLink }).catch(() => {});
    else { try { navigator.clipboard?.writeText(shareLink); } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };
  const details = result ? [
    ['Kitu', result.description || result.product || result.manualProductName],
    ['Ofisi ya kutuma', result.originAgent],
    ['Ofisi ya kupokelea', result.destinationAgent],
    ['Usafiri', result.busCompany],
    ['Muda wa safari', result.estimatedDays ? `Siku ${result.estimatedDays}` : null],
  ].filter(([, v]) => v && v !== '—') : [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff', color: INK, fontFamily: 'inherit', paddingBottom: 96 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px',
        backgroundColor: 'rgba(255,255,255,0.97)', borderBottom: `1px solid ${LINE}` }}>
        <button type="button" aria-label={t('common.back')} onClick={() => onNavigate('back')}
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={IC.back} size={22} color={INK} sw={2.2} />
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, flex: 1 }}>{t('track_parcel.header_title')}</h1>
        {result && (
          <button type="button" aria-label="Shiriki" onClick={share}
            style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={IC.share} color={INK} />
          </button>
        )}
      </header>

      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* ── Search ── */}
        <form role="search" onSubmit={(e) => { e.preventDefault(); handleSearch(); }} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label htmlFor="track-input" style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>Namba iliyo kwenye risiti au SMS</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="track-input" value={trackingInput} placeholder={t('track_parcel.search_placeholder')} autoCapitalize="characters"
              onChange={(e) => setTrackingInput(e.target.value.toUpperCase())}
              style={{ flex: 1, minWidth: 0, height: 52, border: '1px solid #cfd9de', borderRadius: 14, padding: '0 14px', fontSize: 17, fontWeight: 700,
                letterSpacing: 0.5, fontFamily: 'inherit', outline: 'none', color: INK }} />
            <button type="submit" disabled={loading} style={{ ...pill(BLUE), height: 52, borderRadius: 14, flexShrink: 0 }}>
              {loading ? <Spinner size={18} color="#fff" /> : null}{t('track_parcel.track_button')}
            </button>
          </div>
          {error && <div role="alert" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 12px', borderRadius: 12, fontSize: 14 }}>{error}</div>}
          {notice && <div data-testid="track-notice" style={{ backgroundColor: '#fffbeb', color: '#854d0e', padding: '10px 12px', borderRadius: 12, fontSize: 14, lineHeight: 1.45 }}>{notice}</div>}
        </form>

        {/* ── Result ── */}
        {result && (
          <div data-testid="track-result" style={{ borderTop: `8px solid #f7f9f9` }}>
            <section style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, color: MUTED }}>Namba ya mzigo</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span data-testid="track-number" style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{shownNumber}</span>
                <button type="button" aria-label="Nakili namba" onClick={copy}
                  style={{ width: 32, height: 32, borderRadius: 16, border: 'none', backgroundColor: '#f7f9f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon d={copied ? IC.check : IC.copy} size={16} color={copied ? '#166534' : MUTED} />
                </button>
              </span>
              {result.waybillNumber && result.trackingNumber && <span style={{ fontSize: 12, color: MUTED }}>{result.trackingNumber}</span>}
              <span data-testid="track-status" style={{ marginTop: 8, fontSize: 26, fontWeight: 800, letterSpacing: -0.3, color: problem ? '#b91c1c' : INK }}>
                {STATUS_TITLE[status] || 'Inaendelea'}
              </span>
              {latest && <span style={{ fontSize: 15, color: MUTED }}>{[eventLabel(latest), latest.city, when(latest.createdAt)].filter(Boolean).join(' · ')}</span>}
            </section>

            {/* The receiver chooses once the parcel is at the office. */}
            {arrived && (
              <section style={{ margin: '0 16px 16px', padding: 16, borderRadius: 16, backgroundColor: '#eff6ff', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>Ungependa kuupokeaje?</span>
                <button type="button" onClick={() => onNavigate(isLoggedIn ? `BuyerParcelAction-${result.trackingNumber}` : 'PublicLogin')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, border: 'none', backgroundColor: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: INK }}>
                  <span style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon d={IC.office} color={BLUE} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}><strong style={{ fontSize: 15 }}>Nitachukua ofisini</strong>
                    {result.destinationAgent && <span style={{ fontSize: 13, color: MUTED }}>{result.destinationAgent}</span>}</span>
                </button>
                <button type="button" onClick={() => onNavigate(isLoggedIn ? `BuyerParcelAction-${result.trackingNumber}` : 'PublicLogin')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, border: 'none', backgroundColor: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: INK }}>
                  <span style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon d={IC.home} color={BLUE} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}><strong style={{ fontSize: 15 }}>Niletewe nyumbani</strong>
                    <span style={{ fontSize: 13, color: MUTED }}>Wakala atakupigia kupanga muda</span></span>
                </button>
                <span style={{ fontSize: 13, color: MUTED }}>Ingia kwa akaunti ya mpokeaji kuthibitisha chaguo.</span>
              </section>
            )}

            {problem && (
              <section role="status" style={{ margin: '0 16px 16px', padding: 14, borderRadius: 16, backgroundColor: '#fef2f2', color: '#7f1d1d', display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45 }}>
                <Icon d={IC.alert} color="#b91c1c" />
                <span>{status === 'returned' ? 'Mzigo huu umerudishwa kwa mtumaji.' : status === 'cancelled' ? 'Ombi hili limeghairiwa.' : 'Tatizo limeripotiwa kuhusu mzigo huu.'} Uliza KenteXa kwa msaada.</span>
              </section>
            )}

            {(result.originCity || result.destinationCity) && (
              <section style={{ ...card, margin: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: MUTED }}>Kutoka</span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{result.originCity || '—'}</span>
                  </span>
                  <Icon d={IC.arrow} color={BLUE} size={22} />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'right' }}>
                    <span style={{ fontSize: 12, color: MUTED }}>Kwenda</span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{result.destinationCity || '—'}</span>
                  </span>
                </div>
                {current >= 0 && (
                  <div aria-hidden="true" style={{ height: 6, borderRadius: 3, backgroundColor: LINE, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round((current / (MILESTONES.length - 1)) * 100)}%`, borderRadius: 3, backgroundColor: problem ? '#b91c1c' : BLUE }} />
                  </div>
                )}
                {(result.transitCity || result.expectedArrival) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, color: MUTED }}>
                    {result.transitCity ? <span>Kupitia {result.transitCity}</span> : <span />}
                    {/* Only a real expected date from the parcel record, never a guess. */}
                    {result.expectedArrival && current < 6 && <span>Inatarajiwa: <strong style={{ color: INK }}>{dateLong(result.expectedArrival)}</strong></span>}
                  </div>
                )}
              </section>
            )}

            {/* ── Timeline of real milestones ── */}
            {result._source !== 'shipment' && current >= 0 && (
              <section style={{ padding: '4px 16px 8px' }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800 }}>Safari ya mzigo</h2>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {MILESTONES.map((label, i) => {
                    const done = i < current || (i === current && current === MILESTONES.length - 1);
                    const now = i === current && !done;
                    const meta = stepMeta(i);
                    return (
                      <li key={label} data-testid={`milestone-${i}`} aria-current={now ? 'step' : undefined} style={{ display: 'flex', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 12, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backgroundColor: done ? BLUE : '#fff', border: done ? 'none' : now ? `3px solid ${problem ? '#b91c1c' : BLUE}` : '2px solid #cfd9de' }}>
                            {done && <Icon d={IC.check} size={14} color="#fff" sw={3} />}
                          </span>
                          {i < MILESTONES.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: i < current ? BLUE : LINE }} />}
                        </div>
                        <div style={{ paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 15, fontWeight: now ? 800 : 600, color: i > current ? '#8b98a5' : INK }}>{label}</span>
                          {meta && <span style={{ fontSize: 13, color: MUTED }}>{meta}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {details.length > 0 && (
              <section style={{ ...card, margin: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 13, color: MUTED }}>Kuhusu mzigo</span>
                {details.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 15 }}>
                    <span style={{ color: MUTED, flexShrink: 0 }}>{k}</span><strong style={{ textAlign: 'right' }}>{v}</strong>
                  </div>
                ))}
              </section>
            )}

            {history.length > 0 && (
              <details style={{ margin: '0 16px 16px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: '8px 0' }}>Taarifa zote ({history.length})</summary>
                <ul data-testid="track-history" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {history.map((e, i) => (
                    <li key={i} style={{ padding: '10px 0', borderTop: i ? `1px solid ${LINE}` : 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: i === 0 ? 700 : 500 }}>{eventLabel(e)}</span>
                      <span style={{ fontSize: 13, color: MUTED }}>{[e.city, when(e.createdAt)].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div style={{ padding: '0 16px 16px', display: 'flex', gap: 10 }}>
              <a href={askHref} target="_blank" rel="noreferrer" style={{ ...pill('#fff', INK, '1px solid #cfd9de'), flex: 1 }}>
                <Icon d={IC.chat} size={18} color={INK} />Uliza KenteXa
              </a>
              <button type="button" onClick={share} style={{ ...pill(INK), flex: 1 }}>{copied ? 'Imenakiliwa' : 'Shiriki namba'}</button>
            </div>
          </div>
        )}

        {/* ── My parcels (signed in) ── */}
        {!result && isLoggedIn && (
          <section style={{ borderTop: `8px solid #f7f9f9`, paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 16px 8px', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Mizigo yangu</h2>
              <span style={{ fontSize: 13, color: MUTED }}>Kwa namba yako ya simu</span>
            </div>
            {phoneLoading && <div role="status" style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', color: MUTED }}><Spinner size={16} color={BLUE} />Inapakia…</div>}
            {phoneError && <div role="alert" style={{ margin: '0 16px', backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 12px', borderRadius: 12, fontSize: 14 }}>{phoneError}</div>}
            {phoneResults && phoneResults.length === 0 && (
              <div style={{ padding: '8px 16px 16px', fontSize: 14, color: MUTED }}>Hakuna mizigo inayokuja kwa namba yako kwa sasa.</div>
            )}
            {phoneResults && phoneResults.map((p) => {
              const [bg, fg] = tone(p.status);
              return (
                <button type="button" key={p.trackingNumber} onClick={() => { setTrackingInput(p.trackingNumber); handleSearch(p.trackingNumber); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
                    background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: INK }}>
                  <span style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon d={IC.box} color={fg} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{[p.originCity, p.destinationCity].filter(Boolean).join(' → ') || p.trackingNumber}</span>
                    <span style={{ fontSize: 13, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[p.waybillNumber ? formatWaybill(p.waybillNumber) : p.trackingNumber, p.senderName].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: fg, textAlign: 'right', flexShrink: 0, maxWidth: 110 }}>{STATUS_TITLE[p.status] || 'Inaendelea'}</span>
                </button>
              );
            })}
          </section>
        )}

        {/* ── Nothing yet, signed out ── */}
        {!result && !isLoggedIn && !loading && !error && !notice && (
          <section style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10, color: MUTED, fontSize: 14, lineHeight: 1.5 }}>
            <span>Namba ya mzigo iko kwenye risiti ya ofisi au kwenye SMS uliyotumiwa, mfano <strong style={{ color: INK }}>KTX 4821 0937 52</strong>.</span>
            <span>Umenunua mtandaoni? Weka namba ya agizo lako, mfano <strong style={{ color: INK }}>1234</strong>.</span>
            <button type="button" onClick={() => onNavigate('PublicLogin')} style={{ ...pill('#fff', INK, '1px solid #cfd9de'), alignSelf: 'flex-start' }}>Ingia uone mizigo yako</button>
          </section>
        )}
      </div>
    </div>
  );
};

export default TrackParcel;
