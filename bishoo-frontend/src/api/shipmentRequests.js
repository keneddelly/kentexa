// The exact requests the "send a shipment" flow makes, as pure functions.
//
// Why this file exists (logistics repair, Gate 1): the October 2026 audit
// found the send form and the API each reasonable on their own and
// incompatible together -- the form sent a place as an object where the API
// took a string, and sent journey nodes the server rejected. Both sides had
// passing tests. So the request shapes now live in ONE place:
//
//   - SendShipment.js builds every request with these functions;
//   - shipmentRequests.test.js pins their output to
//     /contracts/send-shipment-requests.json;
//   - the backend's booking-contract spec drives the real services with the
//     bodies from that same file.
//
// Change a shape here and both test suites must agree to it.

// A place the user picked from GET /location-intelligence/places comes back
// with placeRef = { providerKey, providerPlaceId }. Query strings carry it as
// the canonical "<providerKey>:<providerPlaceId>" string.
export const placeRefParam = (placeRef) =>
  placeRef && placeRef.providerKey && placeRef.providerPlaceId
    ? `${placeRef.providerKey}:${placeRef.providerPlaceId}`
    : undefined;

// One side of a journey for a request BODY: the selected place reference, or
// the text the user typed. Never names, coordinates or labels -- the server
// derives those itself.
export const journeySide = (resolved, typedText) =>
  resolved?.placeRef
    ? { place: { providerKey: resolved.placeRef.providerKey, providerPlaceId: resolved.placeRef.providerPlaceId } }
    : { text: (typedText || '').trim() };

const positiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// GET /shipments/routes
export const routeSearchParams = ({ origin, destination, originResolved, destinationResolved, weightKg, transportProviderId }) => ({
  origin: originResolved?.placeRef ? undefined : (origin || '').trim(),
  destination: destinationResolved?.placeRef ? undefined : (destination || '').trim(),
  originPlace: placeRefParam(originResolved?.placeRef),
  destinationPlace: placeRefParam(destinationResolved?.placeRef),
  weightKg: positiveNumber(weightKg),
  providerId: positiveNumber(transportProviderId),
});

// GET /shipments/hubs
export const hubSearchParams = (resolved, side) => ({ place: placeRefParam(resolved?.placeRef), side });

export const cargoRequirements = ({ itemDescription, weightKg }, now = new Date()) => ({
  description: (itemDescription || '').trim(),
  cargoClass: 'normal',
  quantity: 1,
  weightKg: Number(weightKg) || 0,
  evidenceLevel: 'declared',
  capturedAt: now.toISOString(),
});

// POST /transport/journeys/select-composed -- the client names an option the
// server offered (availabilityId); the server composes the legs.
export const selectJourneyBody = (state, selected, now = new Date()) => ({
  origin: journeySide(state.originResolved, state.origin),
  destination: journeySide(state.destinationResolved, state.destination),
  cargoRequirements: cargoRequirements(state, now),
  availabilityId: Number(selected.availabilityId),
  providerId: positiveNumber(state.transportProviderId),
});

// POST /transport/quotes -- origin/destination are NOT sent: a Journey-backed
// quote takes them from the Journey the server stored.
export const quoteBody = (journeySelection, selected, state) => ({
  journeySelectionId: journeySelection.id,
  providerId: Number(selected.providerId),
  routeId: Number(selected.routeId),
  availabilityId: Number(selected.availabilityId),
  weightKg: Number(state.weightKg) || 0,
});

// POST /shipments
export const shipmentBody = (state, selected, acceptedQuote) => ({
  senderName: (state.senderName || '').trim() || undefined,
  senderPhone: (state.senderPhone || '').trim() || undefined,
  receiverName: (state.receiverName || '').trim(),
  receiverPhone: (state.receiverPhone || '').trim(),
  originCity: (state.origin || '').trim(),
  originPlace: state.originResolved?.placeRef || undefined,
  destinationCity: (state.destination || '').trim(),
  destinationPlace: state.destinationResolved?.placeRef || undefined,
  itemDescription: (state.itemDescription || '').trim(),
  weightKg: Number(state.weightKg) || 0,
  quoteId: acceptedQuote?.id || undefined,
  routeId: acceptedQuote ? undefined : (selected?.routeId || undefined),
  availabilityId: acceptedQuote ? undefined : (selected?.availabilityId || undefined),
  providerId: acceptedQuote ? undefined : (selected?.providerId || undefined),
  pickupOption: state.pickupOption,
  deliveryOption: state.deliveryOption,
});

// PATCH /shipments/:id/confirm
export const confirmBody = ({ originHubId, destinationHubId }) => ({
  originHubId: originHubId ? Number(originHubId) : undefined,
  destinationHubId: destinationHubId ? Number(destinationHubId) : undefined,
  requestOriginHub: originHubId ? true : undefined,
  requestDestinationHub: destinationHubId ? true : undefined,
});

// What the server said about a route search, as a message key for the form.
// `failed` is a request that did not succeed at all -- it must never be shown
// as "no transporter".
export const searchOutcome = (response, error) => {
  if (error) {
    const status = error?.response?.status;
    if (status === 400) return 'invalid_location';
    return 'request_failed';
  }
  return response?.availability?.reason || 'available';
};
