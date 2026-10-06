import axios from 'axios';
import fs from 'fs';
import path from 'path';
import {
  routeSearchParams, hubSearchParams, selectJourneyBody, quoteBody, shipmentBody,
  confirmBody, placeRefParam, journeySide, searchOutcome,
} from './shipmentRequests';

// The contract both test suites share. Read from disk (it lives outside
// src/ so the backend spec can read the very same file).
const contract = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../contracts/send-shipment-requests.json'), 'utf8'),
);
const { state, selected, journeySelection, acceptedQuote, requests } = contract;
const now = new Date(contract.now);

// What actually goes on the wire: the same serialisation the app's axios
// instance applies to `params`, and JSON for a body (undefined keys dropped).
const queryString = (params) => axios.getUri({ url: '/x', params }).split('?')[1] || '';
const wire = (body) => JSON.parse(JSON.stringify(body));

describe('send-shipment request contract', () => {
  test('route search sends each selected place as ONE canonical string', () => {
    expect(queryString(routeSearchParams(state))).toBe(requests.routeSearch.queryString);
  });

  test('route search never sends a place as an object (the bug the audit found)', () => {
    const qs = queryString(routeSearchParams(state));
    expect(qs).not.toMatch(/%5B|\[/); // no bracketed keys
    expect(typeof routeSearchParams(state).originPlace).toBe('string');
  });

  test('route search with typed text sends text and no place', () => {
    const typed = { ...state, origin: ' Kariakoo ', destination: 'Mbagala', originResolved: null, destinationResolved: null };
    expect(queryString(routeSearchParams(typed))).toBe(requests.routeSearchTyped.queryString);
  });

  test('a transporter profile entry adds providerId', () => {
    expect(queryString(routeSearchParams({ ...state, transportProviderId: 31 }))).toBe(
      `${requests.routeSearch.queryString}&providerId=31`,
    );
  });

  test('hub search sends the place as the same canonical string', () => {
    expect(queryString(hubSearchParams(state.originResolved, 'origin'))).toBe(requests.hubSearchOrigin.queryString);
  });

  test('journey selection names an offered option and never writes legs', () => {
    const body = wire(selectJourneyBody(state, selected, now));
    expect(body).toEqual(requests.selectJourney.body);
    expect(body.legs).toBeUndefined();
    expect(body.originSnapshot).toBeUndefined();
  });

  test('a typed side is sent as text', () => {
    expect(journeySide(null, '  Mbagala ')).toEqual({ text: 'Mbagala' });
  });

  test('quote carries ids and weight only; cities come from the stored journey', () => {
    expect(wire(quoteBody(journeySelection, selected, state))).toEqual(requests.quote.body);
  });

  test('shipment body', () => {
    expect(wire(shipmentBody(state, selected, acceptedQuote))).toEqual(requests.shipment.body);
  });

  test('without a quote the shipment carries the bare selection', () => {
    const body = wire(shipmentBody(state, { providerId: 31 }, null));
    expect(body.providerId).toBe(31);
    expect(body.quoteId).toBeUndefined();
  });

  test('confirm body: no hub chosen sends nothing; a chosen hub is requested explicitly', () => {
    expect(wire(confirmBody(state))).toEqual(requests.confirm.body);
    expect(wire(confirmBody({ originHubId: '4', destinationHubId: '' }))).toEqual({ originHubId: 4, requestOriginHub: true });
  });

  test('placeRefParam is undefined for anything incomplete', () => {
    expect(placeRefParam(null)).toBeUndefined();
    expect(placeRefParam({ providerKey: 'tz_seed' })).toBeUndefined();
  });

  describe('search outcome is never "no transporter" for a failed request', () => {
    test('network or server failure', () => {
      expect(searchOutcome(null, new Error('Network Error'))).toBe('request_failed');
      expect(searchOutcome(null, { response: { status: 500 } })).toBe('request_failed');
    });
    test('the API rejecting the location', () => {
      expect(searchOutcome(null, { response: { status: 400 } })).toBe('invalid_location');
    });
    test.each(['available', 'no_open_trip', 'no_capacity_for_weight', 'provider_does_not_serve_route', 'no_route'])(
      'the server reason %s is passed through',
      (reason) => expect(searchOutcome({ availability: { reason } })).toBe(reason),
    );
  });
});
