import { BadRequestException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { MAX_KEY_PAIRS } from './logistics-location-context';
import { LocationCandidate } from '../location-intelligence/location-provider.interface';

const MBEZI: LocationCandidate = {
  displayLabel: 'Mbezi, Ubungo, Dar es Salaam', latitude: -6.72, longitude: 39.08, regionId: 1, regionName: 'Dar es Salaam',
  districtId: 3, districtName: 'Ubungo', wardId: 56, wardName: 'Mbezi', providerKey: 'tz_seed', providerPlaceId: 'ward:56', resolutionMethod: 'admin_seed',
};
const UBUNGO: LocationCandidate = { ...MBEZI, displayLabel: 'Ubungo, Dar es Salaam', wardId: undefined, wardName: undefined, providerPlaceId: 'district:3' };
const MWANZA: LocationCandidate = {
  displayLabel: 'Mwanza', latitude: -2.5, longitude: 32.9, regionId: 9, regionName: 'Mwanza', providerKey: 'tz_seed', providerPlaceId: 'region:9', resolutionMethod: 'admin_seed',
};
const KILI: LocationCandidate = { ...MWANZA, displayLabel: 'Kilimanjaro', regionId: 5, regionName: 'Kilimanjaro', providerPlaceId: 'region:5' };
const KIBOSHO: LocationCandidate = { ...MBEZI, displayLabel: 'Kibosho, Moshi Rural, Kilimanjaro', regionName: 'Kilimanjaro', districtName: 'Moshi Rural', wardName: 'Kibosho', providerPlaceId: 'ward:900' };
const REGIONLESS: LocationCandidate = { ...MBEZI, regionName: undefined, providerPlaceId: 'ward:77' };
const BY_REF: Record<string, LocationCandidate> = {
  'tz_seed|ward:56': MBEZI, 'tz_seed|district:3': UBUNGO, 'tz_seed|region:9': MWANZA, 'tz_seed|region:5': KILI, 'tz_seed|ward:900': KIBOSHO, 'tz_seed|ward:77': REGIONLESS,
};

const trip = (id: number, date = '2026-09-25', time = '08:00') => ({
  id, providerId: 5, routeId: null, date, departureTime: time, arrivalEstimate: null, totalSlots: 5, usedSlots: 1, totalCapacityKg: 100, usedCapacityKg: 10,
  provider: { name: 'P' }, route: null,
});
const prov = (id: number, rating = 4) => ({ id, name: `P${id}`, type: 'bus', logoUrl: null, rating, whatsappPhone: null, contactPhone: null });

describe('ShipmentsService.findAvailableRoutesForSides — candidates, never a decision', () => {
  let transport: any;
  let li: any;
  let superAgentRepo: any;
  let service: ShipmentsService;
  let byPair: Record<string, { published: any[]; providers: any[] }>;

  beforeEach(() => {
    byPair = {};
    transport = {
      findAvailableForRoute: jest.fn(async (from: string, to: string) => byPair[`${from}>${to}`] ?? { published: [], providers: [] }),
    };
    li = { resolve: jest.fn(async (ref: any) => BY_REF[`${ref.providerKey}|${ref.providerPlaceId}`] ?? null) };
    superAgentRepo = { findOne: jest.fn(() => { throw new Error('hub lookup must not happen in discovery'); }), find: jest.fn(() => { throw new Error('hub lookup must not happen in discovery'); }) };
    service = new ShipmentsService({} as any, {} as any, {} as any, superAgentRepo, transport, { search: jest.fn() } as any, li);
  });

  const pairs = () => transport.findAvailableForRoute.mock.calls.map((c: any[]) => `${c[0]}>${c[1]}`);
  const place = (providerPlaceId: string, extra: object = {}) => ({ place: { providerKey: 'tz_seed', providerPlaceId, ...extra } });

  describe('key expansion matrix (ward / district / region / partial / free text)', () => {
    it('ward -> region: Mbezi -> Mwanza tries (Mbezi, Ubungo, Dar es Salaam) x (Mwanza), origin-major', async () => {
      await service.findAvailableRoutesForSides(place('ward:56'), place('region:9'));
      expect(pairs()).toEqual(['Mbezi>Mwanza', 'Ubungo>Mwanza', 'Dar es Salaam>Mwanza']);
    });

    it('district -> district: (Ubungo, Dar es Salaam) x (Ubungo, Dar es Salaam)', async () => {
      await service.findAvailableRoutesForSides(place('district:3'), place('district:3'));
      expect(pairs()).toEqual(['Ubungo>Ubungo', 'Ubungo>Dar es Salaam', 'Dar es Salaam>Ubungo', 'Dar es Salaam>Dar es Salaam']);
    });

    it('region with a differing capital: Kilimanjaro -> Mwanza also tries the shared-policy alias Moshi', async () => {
      await service.findAvailableRoutesForSides(place('region:5'), place('region:9'));
      expect(pairs()).toEqual(['Kilimanjaro>Mwanza', 'Moshi>Mwanza']);
    });

    it('partial selection = the selected resolved place EXACTLY; unmatched locality text contributes zero routing authority', async () => {
      const plain = await service.findAvailableRoutesForSides(place('ward:56'), place('region:9'));
      const firstCalls = pairs();
      transport.findAvailableForRoute.mockClear();
      const partial = await service.findAvailableRoutesForSides(place('ward:56', { localityText: 'Mwisho', label: 'Mbezi Mwisho' }), place('region:9'));
      expect(pairs()).toEqual(firstCalls);
      expect(JSON.stringify(partial)).not.toContain('Mwisho');
      expect(partial.origin).toEqual(plain.origin);
    });

    it('free text is used exactly as typed and labelled unresolved: NO region/district/capital alias is derived from it', async () => {
      const r = await service.findAvailableRoutesForSides({ text: ' Kilimanjaro ' }, { text: 'Mbezi' });
      expect(pairs()).toEqual(['Kilimanjaro>Mbezi']); // not Moshi, not Ubungo, not Dar es Salaam
      expect(r.origin).toEqual({ source: 'text', resolved: false, keys: [{ key: 'Kilimanjaro', kind: 'text' }] });
      expect(r.destination.source).toBe('text');
    });

    it('mixed place + text is allowed', async () => {
      await service.findAvailableRoutesForSides(place('ward:56'), { text: 'Arusha' });
      expect(pairs()).toEqual(['Mbezi>Arusha', 'Ubungo>Arusha', 'Dar es Salaam>Arusha']);
    });

    it('a place WINS over text for its side (the text is ignored, not validated, not used)', async () => {
      await service.findAvailableRoutesForSides({ place: { providerKey: 'tz_seed', providerPlaceId: 'region:9' }, text: 'Something Else' }, { text: 'Arusha' });
      expect(pairs()).toEqual(['Mwanza>Arusha']);
    });
  });

  describe('bounded, deterministic fan-out', () => {
    it('worst case (ward with capital on both sides) is exactly 4x4 = MAX_KEY_PAIRS and never more', async () => {
      await service.findAvailableRoutesForSides(place('ward:900'), place('ward:900'));
      expect(transport.findAvailableForRoute).toHaveBeenCalledTimes(16);
      expect(MAX_KEY_PAIRS).toBe(16);
      expect(transport.findAvailableForRoute.mock.calls.length).toBeLessThanOrEqual(MAX_KEY_PAIRS);
    });

    it('union/dedupe is deterministic: each trip/provider once, matchedOn lists every matching pair in pair order, stable across runs', async () => {
      byPair['Mbezi>Mwanza'] = { published: [trip(1)], providers: [prov(7)] };
      byPair['Dar es Salaam>Mwanza'] = { published: [trip(1), trip(2, '2026-09-24')], providers: [prov(7), prov(8, 5)] };
      const run = () => service.findAvailableRoutesForSides(place('ward:56'), place('region:9'));
      const a = await run();
      const b = await run();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.availableTrips.map((t) => t.availabilityId)).toEqual([2, 1]); // date asc then id
      expect(a.availableTrips.find((t) => t.availabilityId === 1)!.matchedOn.map((m) => `${m.originKind}:${m.originKey}`)).toEqual(['ward:Mbezi', 'region:Dar es Salaam']);
      expect(a.providers.map((p) => p.id)).toEqual([8, 7]); // rating desc then id
      expect(a.providers.find((p) => p.id === 7)!.matchedOn).toHaveLength(2);
    });
  });

  describe('0 / 1 / many are all candidate lists — no selection, no inference', () => {
    it.each([
      ['0', {}, 0],
      ['1', { 'Mbezi>Mwanza': { published: [trip(1)], providers: [prov(7)] } }, 1],
      ['many', { 'Mbezi>Mwanza': { published: [trip(1), trip(2), trip(3)], providers: [prov(7), prov(8), prov(9)] } }, 3],
    ])('%s matches', async (_n, data: any, count) => {
      byPair = data;
      const r = await service.findAvailableRoutesForSides(place('ward:56'), place('region:9'));
      expect(r.availableTrips).toHaveLength(count);
      expect(r.providers).toHaveLength(count);
      expect(Object.keys(r).sort()).toEqual(['availableTrips', 'destination', 'origin', 'providers']);
      const json = JSON.stringify(r);
      for (const decision of ['"selected"', '"chosen"', '"recommended"', '"best"', '"default"']) expect(json).not.toContain(decision);
    });

    it('never binds anything: discovery never touches shipment/route/parcel storage or a hub lookup', async () => {
      byPair['Mbezi>Mwanza'] = { published: [trip(1)], providers: [prov(7)] };
      await service.findAvailableRoutesForSides(place('ward:56'), place('region:9'));
      expect(superAgentRepo.findOne).not.toHaveBeenCalled();
      expect(superAgentRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('fail closed', () => {
    it('an unresolvable / unknown / wrong-provider reference is a 400 and NOTHING is queried', async () => {
      for (const ref of [{ providerKey: 'tz_seed', providerPlaceId: 'ward:99999' }, { providerKey: 'google', providerPlaceId: 'ward:56' }]) {
        await expect(service.findAvailableRoutesForSides({ place: ref }, { text: 'Mwanza' })).rejects.toThrow(BadRequestException);
        await expect(service.findAvailableRoutesForSides({ text: 'Mwanza' }, { place: ref })).rejects.toThrow(BadRequestException);
      }
      expect(transport.findAvailableForRoute).not.toHaveBeenCalled();
    });

    it('a resolved place without region context is a 400 (never borrows typed text)', async () => {
      await expect(service.findAvailableRoutesForSides({ place: { providerKey: 'tz_seed', providerPlaceId: 'ward:77' }, text: 'Dar es Salaam' }, { text: 'Mwanza' })).rejects.toThrow('no usable city context');
      expect(transport.findAvailableForRoute).not.toHaveBeenCalled();
    });

    it.each([[{}], [{ text: '' }], [{ text: '   ' }], [{ text: undefined }]])('a side with neither a place nor text (%p) is a 400', async (side: any) => {
      await expect(service.findAvailableRoutesForSides(side, { text: 'Mwanza' })).rejects.toThrow(BadRequestException);
      expect(transport.findAvailableForRoute).not.toHaveBeenCalled();
    });

    it('hardened text input errors from the shared path propagate as 400 (e.g. "%", one character)', async () => {
      transport.findAvailableForRoute.mockRejectedValue(new BadRequestException('A city must be at least 2 characters'));
      await expect(service.findAvailableRoutesForSides({ text: '%' }, { text: 'Mwanza' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('public payload', () => {
    it('describes each side without coordinates or internal ids', async () => {
      const r = await service.findAvailableRoutesForSides(place('ward:56'), place('region:9'));
      expect(r.origin).toEqual({
        source: 'place', resolved: true, label: 'Mbezi, Ubungo, Dar es Salaam', level: 'ward',
        placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:56' },
        keys: [{ key: 'Mbezi', kind: 'ward' }, { key: 'Ubungo', kind: 'district' }, { key: 'Dar es Salaam', kind: 'region' }],
      });
      expect(JSON.stringify(r)).not.toMatch(/latitude|longitude|regionId|districtId|wardId|hubCompatibilityKey|resolutionMethod/);
    });
  });

  describe('legacy string API (both sides text)', () => {
    it('findAvailableRoutes keeps its signature and result fields, adding only explanatory blocks', async () => {
      byPair['Dar es Salaam>Mwanza'] = { published: [trip(1)], providers: [prov(7)] };
      const r = await service.findAvailableRoutes(' Dar es Salaam ', 'Mwanza', 25);
      expect(transport.findAvailableForRoute).toHaveBeenCalledWith('Dar es Salaam', 'Mwanza', 25);
      expect(r.availableTrips[0]).toMatchObject({ availabilityId: 1, providerId: 5, slotsAvailable: 4, capacityAvailableKg: 90 });
      expect(r.availableTrips[0].matchedOn).toEqual([{ originKey: 'Dar es Salaam', originKind: 'text', destinationKey: 'Mwanza', destinationKind: 'text' }]);
      expect(r.origin.source).toBe('text');
    });
    it('blank origin/destination are still a 400', async () => {
      await expect(service.findAvailableRoutes('', 'Mwanza')).rejects.toThrow(BadRequestException);
      await expect(service.findAvailableRoutes('Dar', '  ')).rejects.toThrow(BadRequestException);
    });
  });
});

describe('ShipmentsController GET /shipments/routes — parameter contract', () => {
  let svc: any;
  let controller: ShipmentsController;
  beforeEach(() => {
    svc = { findAvailableRoutesForSides: jest.fn(async () => ({ ok: true })) };
    controller = new ShipmentsController(svc);
  });
  const sides = () => svc.findAvailableRoutesForSides.mock.calls[0];

  it('legacy origin/destination text works exactly as before', () => {
    controller.findRoutes('Dar es Salaam', 'Mwanza', undefined, undefined, '12');
    expect(sides()).toEqual([{ text: 'Dar es Salaam' }, { text: 'Mwanza' }, 12]);
  });

  it('place references are split only at the FIRST ":" and win over text; mixed sides are fine', () => {
    controller.findRoutes('Ignored Text', 'Mwanza', 'tz_seed:ward:56', undefined);
    expect(sides()).toEqual([{ place: { providerKey: 'tz_seed', providerPlaceId: 'ward:56' } }, { text: 'Mwanza' }, 0]);
    svc.findAvailableRoutesForSides.mockClear();
    controller.findRoutes(undefined, undefined, 'tz_seed:region:5', 'tz_seed:region:9');
    expect(sides()[0].place.providerPlaceId).toBe('region:5');
    expect(sides()[1].place.providerPlaceId).toBe('region:9');
  });

  it.each([['tz_seed'], [':ward:56'], ['tz_seed:'], ['Tz_Seed:ward:56'], ['tz_seed:ward:56;x'], [' tz_seed:ward:56'], [''], [['a:b', 'c:d'] as any]])(
    'a malformed place reference %p is a 400 and is NOT reinterpreted as text (even when text is supplied)',
    (bad) => {
      expect(() => controller.findRoutes('Dar es Salaam', 'Mwanza', bad as any, undefined)).toThrow(BadRequestException);
      expect(svc.findAvailableRoutesForSides).not.toHaveBeenCalled();
    },
  );

  it.each([[undefined, undefined], ['', ''], ['  ', 'Mwanza']])('neither place nor text on a side (%p, %p) is a 400', (o, d) => {
    expect(() => controller.findRoutes(o as any, d as any)).toThrow(BadRequestException);
    expect(svc.findAvailableRoutesForSides).not.toHaveBeenCalled();
  });

  it('is public and additive: the four query parameters are the only new surface', () => {
    expect(Reflect.getMetadata('__guards__', ShipmentsController.prototype.findRoutes)).toBeUndefined();
    expect(ShipmentsController.prototype.findRoutes.length).toBe(5);
  });
});
