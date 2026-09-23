import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import {
  MAX_LOCALITY_TEXT,
  UNVERIFIED_TEXT_MARKER,
  cleanLocalityText,
  composeSnapshotLabel,
  deriveLegacyRoutingCity,
  snapshotFromFreeText,
  snapshotFromResolvedPlace,
} from './shipment-location-snapshot';
import { SHIPMENT_LOCATION_SNAPSHOT_COLUMNS } from '../database/migrations/1788271200000-AddShipmentLocationSnapshot';
import { LocationCandidate } from '../location-intelligence/location-provider.interface';

/**
 * Stage 2D: a Shipment's location snapshot is server-derived. The client only
 * names WHICH place it selected (a reference); the server re-resolves it
 * exactly and takes every fact from that resolution. Free text gets
 * server-authored 'user_typed' provenance and no coordinates.
 */
const MBEZI: LocationCandidate = {
  displayLabel: 'Mbezi, Ubungo, Dar es Salaam', latitude: -6.72, longitude: 39.08,
  regionId: 1, regionName: 'Dar es Salaam', districtId: 3, districtName: 'Ubungo', wardId: 56, wardName: 'Mbezi',
  providerKey: 'tz_seed', providerPlaceId: 'ward:56', resolutionMethod: 'admin_seed',
};
const MWANZA_REGION: LocationCandidate = {
  displayLabel: 'Mwanza', latitude: -2.52, longitude: 32.9, regionId: 9, regionName: 'Mwanza',
  providerKey: 'tz_seed', providerPlaceId: 'region:9', resolutionMethod: 'admin_seed',
};
const CANDIDATES: Record<string, LocationCandidate> = { 'tz_seed|ward:56': MBEZI, 'tz_seed|region:9': MWANZA_REGION };

describe('snapshot construction (pure)', () => {
  it('a resolved place copies EVERY value from the server candidate', () => {
    expect(snapshotFromResolvedPlace(MBEZI)).toEqual({
      label: 'Mbezi, Ubungo, Dar es Salaam', latitude: -6.72, longitude: 39.08,
      regionName: 'Dar es Salaam', districtName: 'Ubungo', providerKey: 'tz_seed', resolutionMethod: 'admin_seed',
    });
  });

  it('a candidate without coordinates stays coordinate-free (never fabricates 0/0)', () => {
    const { latitude, longitude, ...noCoords } = MBEZI;
    expect(snapshotFromResolvedPlace(noCoords)).toMatchObject({ latitude: null, longitude: null, label: 'Mbezi, Ubungo, Dar es Salaam' });
  });

  it('invalid candidate coordinates are still dropped as a pair (Stage 2A validator reused)', () => {
    for (const bad of [{ latitude: 95, longitude: 39 }, { latitude: NaN, longitude: 39 }, { latitude: -6, longitude: undefined }]) {
      expect(snapshotFromResolvedPlace({ ...MBEZI, ...bad } as any)).toMatchObject({ latitude: null, longitude: null });
    }
  });

  describe('unverified locality text stays distinguishable from the trusted part', () => {
    it('is appended AFTER the trusted label inside an explicit marker; nothing else changes', () => {
      const s = snapshotFromResolvedPlace(MBEZI, 'Mwisho');
      expect(s.label).toBe(`Mbezi, Ubungo, Dar es Salaam${UNVERIFIED_TEXT_MARKER}Mwisho)`);
      expect(s.label!.startsWith(MBEZI.displayLabel)).toBe(true);
      // resolution method, coordinates and names are the selected ADMIN AREA's, unchanged by the typed text
      expect(s).toMatchObject({ resolutionMethod: 'admin_seed', latitude: -6.72, longitude: 39.08, regionName: 'Dar es Salaam', districtName: 'Ubungo' });
    });

    it('no invented provenance method: partial selections keep the resolved place\'s own method', () => {
      expect(snapshotFromResolvedPlace(MBEZI, 'Mwisho').resolutionMethod).toBe('admin_seed');
      expect(readFileSync(join(__dirname, 'shipment-location-snapshot.ts'), 'utf8')).not.toMatch(/admin_seed_partial|_partial/);
    });

    it('is cleaned and bounded: control chars/whitespace collapsed, capped, empty -> nothing', () => {
      expect(cleanLocalityText('  Mwisho \n\t stand  ')).toBe('Mwisho stand');
      expect(cleanLocalityText('x'.repeat(500))).toHaveLength(MAX_LOCALITY_TEXT);
      for (const empty of ['', '   ', '\n\t', null, undefined, 42, {}]) expect(cleanLocalityText(empty as any)).toBeNull();
      expect(snapshotFromResolvedPlace(MBEZI, '   ').label).toBe('Mbezi, Ubungo, Dar es Salaam');
    });

    it('the whole label stays within the column cap and keeps the marked suffix intact', () => {
      const label = composeSnapshotLabel('L'.repeat(400), 'Mwisho');
      expect(label).toHaveLength(200);
      expect(label.endsWith(`${UNVERIFIED_TEXT_MARKER}Mwisho)`)).toBe(true);
    });
  });

  describe('free text: server-authored provenance, no geographic claims', () => {
    it('has a bounded label, no coordinates, no admin names, provenance authored by the server', () => {
      expect(snapshotFromFreeText('Kijiji cha Mwenge, Songea')).toEqual({
        label: 'Kijiji cha Mwenge, Songea', latitude: null, longitude: null, regionName: null, districtName: null,
        providerKey: 'user', resolutionMethod: 'user_typed',
      });
      expect(snapshotFromFreeText('x'.repeat(500)).label).toHaveLength(200);
    });
    it('blank / non-string text yields the all-null snapshot', () => {
      for (const v of ['', '  ', null, undefined, 7, {}]) {
        expect(Object.values(snapshotFromFreeText(v as any)).every((x) => x === null)).toBe(true);
      }
    });
    it('the pure builders take no provenance input at all (a provider key/method cannot be passed in)', () => {
      expect(snapshotFromFreeText.length).toBe(1);
      expect(snapshotFromResolvedPlace.length).toBeLessThanOrEqual(2);
    });
  });

  describe('legacy routing city: an explicit compatibility policy', () => {
    it('is the resolved region name (what production hubs are keyed by), from the resolved hierarchy only', () => {
      expect(deriveLegacyRoutingCity(MBEZI)).toBe('Dar es Salaam');
      expect(deriveLegacyRoutingCity(MWANZA_REGION)).toBe('Mwanza');
    });
    it('is null without region context and never invents one from the label', () => {
      const { regionName, ...noRegion } = MBEZI;
      expect(deriveLegacyRoutingCity(noRegion)).toBeNull();
    });
    it('does not redefine the provider contract: the helper is documented as compatibility, and the interface has no "city" concept', () => {
      const src = readFileSync(join(__dirname, 'shipment-location-snapshot.ts'), 'utf8');
      expect(src).toMatch(/COMPATIBILITY POLICY, not a location rule/);
      const iface = readFileSync(join(__dirname, '..', 'location-intelligence', 'location-provider.interface.ts'), 'utf8');
      expect(iface).not.toMatch(/\bcity\b\??:/i);
    });
  });
});

describe('ShipmentsService.createShipment — server-resolved places', () => {
  let rows: any[];
  let resolveCalls: any[];
  let service: ShipmentsService;
  let reserveCalls: number;
  let tz: any;

  const base = (extra: Record<string, unknown> = {}) => ({
    receiverName: 'Amina', receiverPhone: '0700000000', itemDescription: 'Clothes', weightKg: 2, ...extra,
  });
  const created = () => rows[rows.length - 1];

  beforeEach(() => {
    rows = []; resolveCalls = []; reserveCalls = 0;
    const shipmentRepo: any = { create: (v: any) => ({ ...v }), save: async (v: any) => ({ ...v, id: v.id ?? rows.push({ ...v }) }), update: jest.fn(), findOne: jest.fn() };
    const pending: any[] = [];
    shipmentRepo.save = async (v: any) => {
      if (v.id) { const i = rows.findIndex((r) => r.id === v.id); rows[i] = { ...v }; return { ...v }; }
      const row = { ...v, id: rows.length + 1 }; rows.push(row); pending.push(row); return { ...row };
    };
    shipmentRepo.manager = { transaction: (cb: any) => cb({ getRepository: () => shipmentRepo }) };
    tz = { search: jest.fn().mockResolvedValue([{ regionId: 77 }]) };
    const li: any = {
      resolve: jest.fn(async (ref: any) => { resolveCalls.push(ref); return CANDIDATES[`${ref?.providerKey}|${ref?.providerPlaceId}`] ?? null; }),
    };
    const transport: any = {
      assertEligibleProvider: jest.fn(),
      reserveSlot: jest.fn(async () => { reserveCalls++; }),
    };
    service = new ShipmentsService(shipmentRepo, { findOne: async () => ({ pricePerKg: 1, fixedFee: 0 }) } as any, {} as any, {} as any, transport, tz, li);
  });

  it('a selected place is re-resolved by the server and the snapshot + legacy columns come from that resolution', async () => {
    await service.createShipment(7, base({
      originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:56' },
      destinationPlace: { providerKey: 'tz_seed', providerPlaceId: 'region:9' },
    }));
    expect(resolveCalls).toEqual([
      { providerKey: 'tz_seed', providerPlaceId: 'ward:56' },
      { providerKey: 'tz_seed', providerPlaceId: 'region:9' },
    ]);
    expect(created()).toMatchObject({
      originCity: 'Dar es Salaam', originRegionId: 1, originWard: 'Mbezi', originWardId: 56,
      originLocationLabel: 'Mbezi, Ubungo, Dar es Salaam', originLatitude: -6.72, originLongitude: 39.08,
      originRegionName: 'Dar es Salaam', originDistrictName: 'Ubungo', originProviderKey: 'tz_seed', originResolutionMethod: 'admin_seed',
      destinationCity: 'Mwanza', destinationRegionId: 9, destinationWard: null, destinationWardId: null,
      destinationLocationLabel: 'Mwanza', destinationLatitude: -2.52, destinationProviderKey: 'tz_seed', destinationResolutionMethod: 'admin_seed',
    });
    expect(tz.search).not.toHaveBeenCalled(); // no fuzzy first-result guess on the resolved path
  });

  it('the legacy free-text fields are ignored when a place is selected (one source of truth)', async () => {
    await service.createShipment(7, base({
      originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:56' },
      originCity: 'Somewhere Else', originWard: 'Fake Ward', originRegionId: 999, originWardId: 999,
      destinationCity: 'Mwanza',
    }));
    expect(created()).toMatchObject({ originCity: 'Dar es Salaam', originWard: 'Mbezi', originRegionId: 1, originWardId: 56 });
  });

  describe('forgery attempts: nothing the client asserts about a place is trusted', () => {
    const forged = {
      providerKey: 'tz_seed', providerPlaceId: 'ward:56',
      // extra properties a hostile client might add; none may reach the row
      latitude: 1.11, longitude: 2.22, regionName: 'FORGED', districtName: 'FORGED', resolutionMethod: 'gps', displayLabel: 'FORGED',
    } as any;

    it('extra coordinates / names / method / label on a place reference are ignored (the resolved candidate wins)', async () => {
      await service.createShipment(7, base({ originPlace: forged, destinationCity: 'Mwanza' }));
      expect(created()).toMatchObject({
        originLatitude: -6.72, originLongitude: 39.08, originRegionName: 'Dar es Salaam', originDistrictName: 'Ubungo',
        originResolutionMethod: 'admin_seed', originLocationLabel: 'Mbezi, Ubungo, Dar es Salaam',
      });
      expect(JSON.stringify(created())).not.toContain('FORGED');
    });

    it('the retired Stage 2B originLocation/destinationLocation input is ignored, whatever it claims', async () => {
      await service.createShipment(7, base({
        originCity: 'Dar es Salaam', destinationCity: 'Mwanza',
        originLocation: { displayLabel: 'FORGED', latitude: 1, longitude: 2, providerKey: 'tz_seed', resolutionMethod: 'admin_seed', regionName: 'FORGED' },
        destinationLocation: { displayLabel: 'FORGED', providerKey: 'tz_seed', resolutionMethod: 'admin_seed' },
      }));
      const row = created();
      expect(JSON.stringify(row)).not.toContain('FORGED');
      expect(row).toMatchObject({
        originProviderKey: 'user', originResolutionMethod: 'user_typed', originLatitude: null, originLongitude: null,
        destinationProviderKey: 'user', destinationResolutionMethod: 'user_typed', destinationLatitude: null,
      });
    });

    it('a reference to a place that only EXISTS as a client-claimed candidate is rejected: unknown ref => 400, nothing written or reserved', async () => {
      await expect(service.createShipment(7, base({
        originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:999999', latitude: 1, longitude: 2 } as any,
        destinationCity: 'Mwanza', availabilityId: 3,
      }))).rejects.toThrow(BadRequestException);
      expect(rows).toHaveLength(0);
      expect(reserveCalls).toBe(0);
    });

    it.each([
      ['wrong provider', { providerKey: 'google', providerPlaceId: 'ward:56' }],
      ['malformed id', { providerKey: 'tz_seed', providerPlaceId: 'ward:56; DROP' }],
      ['missing id', { providerKey: 'tz_seed' }],
      ['missing key', { providerPlaceId: 'ward:56' }],
      ['non-object', 'ward:56'],
      ['numeric id', { providerKey: 'tz_seed', providerPlaceId: 56 }],
    ])('rejects a %s selection with 400 and no write', async (_n, sel: any) => {
      await expect(service.createShipment(7, base({ originPlace: sel, destinationCity: 'Mwanza' }))).rejects.toThrow(BadRequestException);
      expect(rows).toHaveLength(0);
    });

    it('an ambiguous name is never auto-picked: only an explicit reference resolves, and no name search runs', async () => {
      await service.createShipment(7, base({ originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:56' }, destinationCity: 'Mwanza' }));
      expect(resolveCalls).toHaveLength(1);
      expect(tz.search).toHaveBeenCalledTimes(1); // only the FREE-TEXT destination's legacy region hint
      expect(tz.search).toHaveBeenCalledWith('Mwanza');
    });
  });

  describe('partial selection: unverified remainder stays marked', () => {
    it('stores the trusted label + a marked typed remainder; provenance and coordinates are the resolved area\'s', async () => {
      await service.createShipment(7, base({
        originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:56', localityText: 'Mwisho' },
        destinationCity: 'Mwanza',
      }));
      expect(created()).toMatchObject({
        originLocationLabel: `Mbezi, Ubungo, Dar es Salaam${UNVERIFIED_TEXT_MARKER}Mwisho)`,
        originResolutionMethod: 'admin_seed', originLatitude: -6.72, originLongitude: 39.08, originWard: 'Mbezi', originWardId: 56,
      });
    });
    it('hostile locality text is bounded and cannot alter any other column', async () => {
      await service.createShipment(7, base({
        originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:56', localityText: `x\n\u0000${'y'.repeat(500)}` },
        destinationCity: 'Mwanza',
      }));
      expect(created().originLocationLabel!.length).toBeLessThanOrEqual(200);
      expect(created()).toMatchObject({ originLatitude: -6.72, originResolutionMethod: 'admin_seed', originCity: 'Dar es Salaam' });
    });
  });

  describe('free text (no place selected)', () => {
    it('keeps working: typed city required, server-authored user_typed snapshot, no coordinates/admin claims', async () => {
      await service.createShipment(7, base({ originCity: 'Songea', originWard: 'Mwenge', destinationCity: 'Mwanza' }));
      expect(created()).toMatchObject({
        originCity: 'Songea', originWard: 'Mwenge', originRegionId: 77,
        originLocationLabel: 'Mwenge, Songea', originProviderKey: 'user', originResolutionMethod: 'user_typed',
        originLatitude: null, originLongitude: null, originRegionName: null, originDistrictName: null,
      });
    });
    it('a side with neither a place nor a typed city is rejected', async () => {
      await expect(service.createShipment(7, base({ destinationCity: 'Mwanza' }))).rejects.toThrow(BadRequestException);
      await expect(service.createShipment(7, base({ originCity: 'Songea' }))).rejects.toThrow(BadRequestException);
      expect(rows).toHaveLength(0);
    });
    it('the legacy client-supplied region/ward ids are hints only and never appear as provenance', async () => {
      await service.createShipment(7, base({ originCity: 'Songea', originRegionId: 5, originWardId: 6, destinationCity: 'Mwanza' }));
      expect(created()).toMatchObject({ originRegionId: 5, originWardId: 6, originProviderKey: 'user', originRegionName: null });
    });
  });

  it('mixed: one side resolved, the other free text, both snapshots individually correct', async () => {
    await service.createShipment(7, base({ originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:56' }, destinationCity: 'Songea' }));
    expect(created()).toMatchObject({ originResolutionMethod: 'admin_seed', destinationResolutionMethod: 'user_typed', destinationCity: 'Songea' });
  });

  it('routing/provider/availability selection is untouched: routeId, providerId, availabilityId are stored exactly as sent', async () => {
    await service.createShipment(7, base({
      originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:56' },
      destinationPlace: { providerKey: 'tz_seed', providerPlaceId: 'region:9' },
      routeId: 8, providerId: 5, availabilityId: 3,
    }));
    expect(created()).toMatchObject({ routeId: 8, providerId: 5, availabilityId: 3, status: 'pending' });
    expect(reserveCalls).toBe(1);
  });
});

describe('trust boundary is structural', () => {
  it('no production source outside the snapshot helper reads client-supplied provenance into the snapshot', () => {
    const root = join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.ts$/.test(name) && !/\.spec\.ts$|\.integration\.ts$/.test(name)) {
          const src = readFileSync(full, 'utf8');
          if (/\b(originLocation|destinationLocation)\b/.test(src) && !full.endsWith('shipments.service.ts')) offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
    // and the service itself no longer READS them (only mentions the retirement in a comment)
    const svc = readFileSync(join(__dirname, 'shipments.service.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(svc).not.toMatch(/dto\.(origin|destination)Location/);
    expect(svc).not.toMatch(/buildLocationSnapshot/);
  });

  it('only createShipment uses the snapshot builders', () => {
    const src = readFileSync(join(__dirname, 'shipments.service.ts'), 'utf8');
    const createBody = src.slice(src.indexOf('async createShipment('), src.indexOf('async getMyShipments('));
    const total = (src.match(/snapshotFrom(ResolvedPlace|FreeText)\(/g) || []).length;
    const inCreate = (createBody.match(/snapshotFrom(ResolvedPlace|FreeText)\(/g) || []).length;
    expect(total).toBe(2);
    expect(inCreate).toBe(2);
  });

  it('snapshot column names appear only in the entity, the helper and the migration (never in confirm/cancel/transport)', () => {
    const src = readFileSync(join(__dirname, 'shipments.service.ts'), 'utf8');
    for (const col of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) expect(src).not.toMatch(new RegExp(`\\b${col}\\b`));
  });
});
