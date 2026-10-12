/**
 * Door pickup by location pin (NEXT_STEPS.md section 18, step 1).
 *
 * The sender gives a landmark note (required for door pickup) and, strongly
 * asked for but optional until the map exists, the phone's GPS position with
 * its accuracy. Both are SENDER-GIVEN: stored apart from the server-derived
 * place coordinates and shown to an agent only after they accepted the job.
 */
import { BadRequestException } from '@nestjs/common';

export interface PickupPinInput {
  latitude?: unknown;
  longitude?: unknown;
  accuracyM?: unknown;
  capturedAt?: unknown;
}

export interface PickupPinValues {
  pickupLandmark: string | null;
  pickupPinLatitude: number | null;
  pickupPinLongitude: number | null;
  pickupPinAccuracyM: number | null;
  pickupPinCapturedAt: Date | null;
}

// Tanzania with a margin (mainland, Zanzibar, Pemba, Mafia).
const TZ_BOX = { minLat: -12.6, maxLat: -0.8, minLng: 28.9, maxLng: 41.0 };
const MAX_ACCURACY_M = 5000;
const NONE: PickupPinValues = {
  pickupLandmark: null, pickupPinLatitude: null, pickupPinLongitude: null,
  pickupPinAccuracyM: null, pickupPinCapturedAt: null,
};

export const PICKUP_PIN_MESSAGES = {
  landmarkRequired: 'Andika alama ya mahali pa kuchukua mzigo (herufi 5 hadi 160), mfano "Geti jeusi karibu na msikiti".',
  pinOutsideTanzania: 'Mahali ulipotoa hapakuonekana Tanzania. Jaribu "Tumia mahali nilipo" tena.',
  pinInvalid: 'Mahali ulipotoa si sahihi. Jaribu "Tumia mahali nilipo" tena.',
  noPin: 'Hakuna pin — piga simu kwa mtumaji',
} as const;

/** The door-pickup point from the request, validated; nothing for other pickup options. */
export function readPickupPin(
  isDoorPickup: boolean, landmark: unknown, pin: PickupPinInput | null | undefined, now: Date = new Date(),
): PickupPinValues {
  if (!isDoorPickup) return { ...NONE };
  const note = String(landmark ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (note.length < 5 || note.length > 160) throw new BadRequestException(PICKUP_PIN_MESSAGES.landmarkRequired);
  const out: PickupPinValues = { ...NONE, pickupLandmark: note };
  if (pin == null || (pin.latitude == null && pin.longitude == null)) return out; // optional until the map exists

  const lat = Number(pin.latitude);
  const lng = Number(pin.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequestException(PICKUP_PIN_MESSAGES.pinInvalid);
  if (lat < TZ_BOX.minLat || lat > TZ_BOX.maxLat || lng < TZ_BOX.minLng || lng > TZ_BOX.maxLng) {
    throw new BadRequestException(PICKUP_PIN_MESSAGES.pinOutsideTanzania);
  }
  const accuracy = pin.accuracyM == null ? null : Math.round(Number(pin.accuracyM));
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_M)) {
    throw new BadRequestException(PICKUP_PIN_MESSAGES.pinInvalid);
  }
  // A capture time from the phone is kept only when it is plausible (last 24 hours).
  const captured = pin.capturedAt ? new Date(String(pin.capturedAt)) : null;
  const plausible = captured && Number.isFinite(captured.getTime()) &&
    captured.getTime() <= now.getTime() + 5 * 60_000 && captured.getTime() >= now.getTime() - 24 * 3600_000;
  return {
    ...out,
    pickupPinLatitude: Math.round(lat * 1e6) / 1e6,
    pickupPinLongitude: Math.round(lng * 1e6) / 1e6,
    pickupPinAccuracyM: accuracy,
    pickupPinCapturedAt: plausible ? captured : now,
  };
}

/** SQL for the nearest ward centre point within $3 metres of ($1 lat, $2 lng). */
export const NEAREST_WARD_SQL = `
  SELECT id, name, dist FROM (
    SELECT w.id, w.name,
           2 * 6371000 * asin(least(1, sqrt(
             power(sin(radians((w.lat::float8 - $1) / 2)), 2) +
             cos(radians($1)) * cos(radians(w.lat::float8)) * power(sin(radians((w.lng::float8 - $2) / 2)), 2)))) AS dist
      FROM public.tz_ward w
     WHERE w.lat IS NOT NULL AND w.lng IS NOT NULL
  ) x WHERE dist <= $3 ORDER BY dist ASC LIMIT 1`;
export const NEAREST_WARD_MAX_M = 3000;

// Off until the ward list is complete: with only 64 Dar es Salaam wards seeded,
// "nearest ward centre" named the wrong ward for Posta, Kariakoo and Mbezi
// (tested 2026-10-12). The ward id is still saved, so it can be shown later.
export const SHOW_PIN_WARD = false;

/** Google Maps directions link (an ordinary link: no key, no account). */
export function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * What an agent sees AFTER accepting a pickup: the exact pin, landmark, ward
 * and a directions link — or, with no pin, the landmark and "call the sender".
 */
export function pickupPointForAgent(r: {
  pickupPinLatitude?: unknown; pickupPinLongitude?: unknown; pickupPinAccuracyM?: unknown;
  pickupLandmark?: string | null; pickupWardName?: string | null;
}) {
  const lat = r.pickupPinLatitude == null ? null : Number(r.pickupPinLatitude);
  const lng = r.pickupPinLongitude == null ? null : Number(r.pickupPinLongitude);
  const hasPin = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  return {
    hasPin,
    latitude: hasPin ? lat : null,
    longitude: hasPin ? lng : null,
    accuracyM: hasPin && r.pickupPinAccuracyM != null ? Number(r.pickupPinAccuracyM) : null,
    landmark: r.pickupLandmark ?? null,
    ward: SHOW_PIN_WARD ? r.pickupWardName ?? null : null,
    mapsUrl: hasPin ? mapsDirectionsUrl(lat!, lng!) : null,
    note: hasPin ? null : PICKUP_PIN_MESSAGES.noPin,
  };
}

// ── Section 18 (b): agent base point and nearest-first ─────────────────────

export const AGENT_BASE_MESSAGES = {
  required: 'Weka kituo chako kwanza: bonyeza "📍 Weka kituo changu" ukiwa mahali unapoanzia kazi.',
  saved: 'Kituo chako kimehifadhiwa.',
  weak: 'Usahihi wa GPS ni mdogo (zaidi ya mita 500). Jaribu ukiwa nje, kisha bonyeza tena.',
} as const;
const MAX_BASE_ACCURACY_M = 500;

/** The agent's base point from the phone, validated (inside Tanzania, accuracy <= 500 m). */
export function readAgentBasePoint(body: { latitude?: unknown; longitude?: unknown; accuracyM?: unknown }) {
  const lat = Number(body?.latitude);
  const lng = Number(body?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequestException(PICKUP_PIN_MESSAGES.pinInvalid);
  if (lat < TZ_BOX.minLat || lat > TZ_BOX.maxLat || lng < TZ_BOX.minLng || lng > TZ_BOX.maxLng) {
    throw new BadRequestException(PICKUP_PIN_MESSAGES.pinOutsideTanzania);
  }
  const accuracy = body?.accuracyM == null ? null : Number(body.accuracyM);
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy > MAX_BASE_ACCURACY_M)) {
    throw new BadRequestException(AGENT_BASE_MESSAGES.weak);
  }
  return { latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6 };
}

/** Straight-line distance in metres (haversine). */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance for the open-jobs list BEFORE accepting: rounded, never the exact point. */
export function roughDistanceLabel(metres: number | null | undefined): string | null {
  if (metres == null || !Number.isFinite(metres)) return null;
  if (metres < 1000) return `~${Math.max(100, Math.round(metres / 100) * 100)} m`;
  return `~${(Math.round(metres / 500) * 0.5).toFixed(1)} km`;
}

/**
 * SQL distance (metres) between a pickup point and an agent base, for ORDER BY.
 * The pickup point is the sender's pin, else the server-derived place point.
 * NULL when either side has no point.
 */
export const PICKUP_TO_BASE_DISTANCE_SQL = `
  CASE WHEN a."baseLatitude" IS NULL OR a."baseLongitude" IS NULL
         OR COALESCE(s."pickupPinLatitude", s."originLatitude") IS NULL
         OR COALESCE(s."pickupPinLongitude", s."originLongitude") IS NULL
       THEN NULL  -- no distance at all (LEAST() would otherwise ignore the NULL and return half the Earth)
       ELSE 2 * 6371000 * asin(least(1, sqrt(
         power(sin(radians((a."baseLatitude" - COALESCE(s."pickupPinLatitude", s."originLatitude")) / 2)), 2) +
         cos(radians(COALESCE(s."pickupPinLatitude", s."originLatitude"))) * cos(radians(a."baseLatitude")) *
         power(sin(radians((a."baseLongitude" - COALESCE(s."pickupPinLongitude", s."originLongitude")) / 2)), 2))))
  END`;
