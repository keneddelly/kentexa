import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './entities/shipment.entity';
import { buildLocationSnapshot } from './shipment-location-snapshot';
import { SHIPMENT_LOCATION_SNAPSHOT_COLUMNS } from '../database/migrations/1788271200000-AddShipmentLocationSnapshot';

describe('Shipment historical location snapshot (Stage 2B)', () => {
  let shipmentRepo: any;
  let parcelRepo: any;
  let superAgentRepo: any;
  let transportService: any;
  let tzLocation: any;
  let service: ShipmentsService;

  const baseDto = () => ({
    receiverName: 'Amina',
    receiverPhone: '0700000000',
    originCity: 'Dar es Salaam',
    destinationCity: 'Mwanza',
    itemDescription: 'Clothes',
  });

  const seedCandidate = () => ({
    displayLabel: 'Mbezi, Kinondoni, Dar es Salaam',
    latitude: -6.75,
    longitude: 39.2,
    regionName: 'Dar es Salaam',
    districtName: 'Kinondoni',
    providerKey: 'tz_seed',
    resolutionMethod: 'admin_seed',
  });

  beforeEach(() => {
    let nextId = 1;
    shipmentRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => ({ ...v })),
      save: jest.fn(async (v) => ({ ...v, id: v.id ?? nextId++ })),
      update: jest.fn(),
      find: jest.fn(),
    };
    parcelRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ ...v, id: v.id ?? 500 })),
    };
    superAgentRepo = { findOne: jest.fn().mockResolvedValue(null) };
    transportService = {
      assertEligibleProvider: jest.fn(),
      reserveCapacity: jest.fn(),
      releaseCapacity: jest.fn(),
    };
    tzLocation = { search: jest.fn().mockResolvedValue([]) };
    service = new ShipmentsService(
      shipmentRepo,
      {} as any,
      parcelRepo,
      superAgentRepo,
      transportService,
      tzLocation,
    );
  });

  const created = () => shipmentRepo.create.mock.calls[0][0];

  // 1 ─────────────────────────────────────────────────────────────────────
  it('a valid normalized candidate becomes a by-value snapshot on each side', async () => {
    await service.createShipment(7, {
      ...baseDto(),
      originLocation: seedCandidate(),
      destinationLocation: { ...seedCandidate(), displayLabel: 'Ilemela, Mwanza', latitude: -2.5, longitude: 32.9, regionName: 'Mwanza', districtName: 'Ilemela' },
    });
    expect(created()).toMatchObject({
      originLocationLabel: 'Mbezi, Kinondoni, Dar es Salaam',
      originLatitude: -6.75,
      originLongitude: 39.2,
      originRegionName: 'Dar es Salaam',
      originDistrictName: 'Kinondoni',
      originProviderKey: 'tz_seed',
      originResolutionMethod: 'admin_seed',
      destinationLocationLabel: 'Ilemela, Mwanza',
      destinationLatitude: -2.5,
      destinationLongitude: 32.9,
      destinationRegionName: 'Mwanza',
      destinationDistrictName: 'Ilemela',
    });
  });

  // 2 ─────────────────────────────────────────────────────────────────────
  it('a label/admin-only location with no coordinates is valid and creates the shipment', async () => {
    const { latitude, longitude, ...labelOnly } = seedCandidate();
    const saved = await service.createShipment(7, { ...baseDto(), originLocation: labelOnly });
    expect(saved.id).toBeDefined();
    expect(created().originLocationLabel).toBe('Mbezi, Kinondoni, Dar es Salaam');
    expect(created().originLatitude).toBeNull();
    expect(created().originLongitude).toBeNull();
  });

  // 3 ─────────────────────────────────────────────────────────────────────
  it('a valid coordinate pair is preserved exactly', () => {
    const v = buildLocationSnapshot({ displayLabel: 'X', latitude: -6.7500001, longitude: 39.2000002 });
    expect(v.latitude).toBe(-6.7500001);
    expect(v.longitude).toBe(39.2000002);
  });

  // 4 ─────────────────────────────────────────────────────────────────────
  describe('partial / NaN / out-of-range coordinates are never persisted', () => {
    const cases: Array<[string, unknown, unknown]> = [
      ['lat only', -6.75, undefined],
      ['lng only', undefined, 39.2],
      ['NaN lat', NaN, 39.2],
      ['non-numeric lat', 'abc', 39.2],
      ['Infinity lng', -6.75, Infinity],
      ['lat > 90', 95, 39.2],
      ['lat < -90', -91, 39.2],
      ['lng > 180', -6.75, 181],
      ['lng < -180', -6.75, -181],
      ['null lat', null, 39.2],
    ];
    it.each(cases)('%s -> both dropped, label kept, shipment still created', async (_n, lat, lng) => {
      const saved = await service.createShipment(7, {
        ...baseDto(),
        originLocation: { displayLabel: 'Somewhere', latitude: lat as any, longitude: lng as any },
      });
      expect(saved.id).toBeDefined();
      expect(created().originLatitude).toBeNull();
      expect(created().originLongitude).toBeNull();
      expect(created().originLocationLabel).toBe('Somewhere');
      shipmentRepo.create.mockClear();
    });
  });

  // 5 ─────────────────────────────────────────────────────────────────────
  it('later mutation of the source candidate cannot change the persisted snapshot', async () => {
    const candidate = seedCandidate();
    await service.createShipment(7, { ...baseDto(), originLocation: candidate });
    const persisted = created();
    const before = JSON.stringify(persisted);

    candidate.displayLabel = 'CHANGED';
    candidate.latitude = 1;
    candidate.longitude = 1;
    candidate.regionName = 'CHANGED';
    candidate.providerKey = 'other';

    expect(JSON.stringify(persisted)).toBe(before);
    expect(persisted.originLocationLabel).toBe('Mbezi, Kinondoni, Dar es Salaam');
    expect(persisted.originLatitude).toBe(-6.75);
  });

  it('a candidate with no usable displayLabel, junk types, or oversized text is normalized safely', () => {
    expect(buildLocationSnapshot({ latitude: 1, longitude: 1 }).label).toBeNull();
    expect(buildLocationSnapshot({ displayLabel: '   ', latitude: 1, longitude: 1 })).toEqual(
      expect.objectContaining({ label: null, latitude: null, longitude: null }),
    );
    expect(buildLocationSnapshot('nope')).toEqual(expect.objectContaining({ label: null }));
    expect(buildLocationSnapshot(undefined)).toEqual(expect.objectContaining({ label: null }));
    expect(buildLocationSnapshot({ displayLabel: 123 as any }).label).toBeNull();
    const big = buildLocationSnapshot({ displayLabel: 'x'.repeat(500), providerKey: 'k'.repeat(99), regionName: 'r'.repeat(500) });
    expect(big.label).toHaveLength(200);
    expect(big.providerKey).toHaveLength(40);
    expect(big.regionName).toHaveLength(120);
  });

  // ── Confirmation boundary ────────────────────────────────────────────────
  const pendingShipment = () => ({
    id: 1,
    requestedByUserId: 7,
    status: ShipmentStatus.PENDING,
    providerId: null,
    availabilityId: null,
    routeId: null,
    weightKg: 2,
    orderId: null,
    originCity: 'Dar es Salaam',
    destinationCity: 'Mwanza',
    receiverName: 'Amina',
    receiverPhone: '0700000000',
    itemDescription: 'Clothes',
    originLocationLabel: 'Mbezi, Kinondoni, Dar es Salaam',
    originLatitude: -6.75,
    originLongitude: 39.2,
  });

  const snapshotKeys = new Set(SHIPMENT_LOCATION_SNAPSHOT_COLUMNS);
  const touchesSnapshot = (obj: any) => Object.keys(obj || {}).some((k) => snapshotKeys.has(k));

  // 6 ─────────────────────────────────────────────────────────────────────
  it('confirmation retry is idempotent and never writes a snapshot column', async () => {
    shipmentRepo.findOne
      .mockResolvedValueOnce(pendingShipment())
      .mockResolvedValueOnce({ ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5 });
    parcelRepo.findOne.mockResolvedValue(null);
    const first = await service.confirmShipment(7, 1, { providerId: 5 });

    // Retry: the shipment is already CONFIRMED -> rejected, nothing written.
    shipmentRepo.findOne.mockResolvedValue({ ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5 });
    shipmentRepo.update.mockClear();
    await expect(service.confirmShipment(7, 1, { providerId: 5 })).rejects.toThrow();
    expect(shipmentRepo.update).not.toHaveBeenCalled();

    expect(first.parcel).toBeDefined();
    for (const [, payload] of shipmentRepo.update.mock.calls) expect(touchesSnapshot(payload)).toBe(false);
  });

  // 7 ─────────────────────────────────────────────────────────────────────
  it('concurrent confirmation: no write ever carries a snapshot column and both callers converge on one Parcel', async () => {
    const confirmed = { ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5 };
    shipmentRepo.findOne.mockImplementation(async () => (shipmentRepo.update.mock.calls.length ? confirmed : pendingShipment()));
    const winner = { id: 500, trackingNumber: 'KTX-PCL-500' };
    let inserted = false;
    parcelRepo.findOne.mockImplementation(async () => (inserted ? winner : null));
    parcelRepo.save.mockImplementation(async (v: any) => {
      if (v.id) return v; // second save = tracking-number assignment
      if (inserted) {
        const err: any = new Error('duplicate key value violates unique constraint "UQ_parcel_shipmentId"');
        err.code = '23505';
        err.constraint = 'UQ_parcel_shipmentId';
        throw err;
      }
      inserted = true;
      return { ...v, id: 500 };
    });

    const [a, b] = await Promise.all([
      service.confirmShipment(7, 1, { providerId: 5 }),
      service.confirmShipment(7, 1, { providerId: 5 }),
    ]);

    expect(a.parcel.id).toBe(500);
    expect(b.parcel.id).toBe(500);
    for (const [, payload] of shipmentRepo.update.mock.calls) expect(touchesSnapshot(payload)).toBe(false);
    for (const [payload] of parcelRepo.create.mock.calls) expect(touchesSnapshot(payload)).toBe(false);
  });

  // 8 ─────────────────────────────────────────────────────────────────────
  it('a legacy row without any snapshot fields stays readable, confirmable and trackable', async () => {
    const legacy: any = {
      id: 9, requestedByUserId: 7, status: ShipmentStatus.PENDING, providerId: 5, availabilityId: null,
      routeId: null, weightKg: 1, orderId: null, originCity: 'Arusha', destinationCity: 'Dodoma',
      receiverName: 'R', receiverPhone: '0', itemDescription: 'Box', trackingNumber: 'KTX-SHP-9',
      pickupOption: 'agent', deliveryOption: 'agent',
    };
    shipmentRepo.findOne
      .mockResolvedValueOnce(legacy)
      .mockResolvedValueOnce({ ...legacy, status: ShipmentStatus.CONFIRMED });
    parcelRepo.findOne.mockResolvedValue(null);
    const result = await service.confirmShipment(7, 9, {});
    expect(result.parcel.originCity).toBe('Arusha');

    shipmentRepo.findOne.mockResolvedValue({ ...legacy, status: ShipmentStatus.CONFIRMED });
    parcelRepo.findOne.mockResolvedValue({ trackingNumber: 'KTX-PCL-1' });
    const tracked = await service.trackShipment('KTX-SHP-9');
    expect(tracked.originCity).toBe('Arusha');
    expect(tracked.destinationCity).toBe('Dodoma');
  });

  // 9 ─────────────────────────────────────────────────────────────────────
  it('existing city / region resolution behaviour is unchanged, with or without a snapshot', async () => {
    tzLocation.search.mockResolvedValue([{ regionId: 4 }]);
    await service.createShipment(7, { ...baseDto(), originCity: '  Dar es Salaam ', originWard: ' Mbezi ', originWardId: 12 });
    expect(created()).toMatchObject({
      originCity: 'Dar es Salaam', originRegionId: 4, originWard: 'Mbezi', originWardId: 12,
      destinationCity: 'Mwanza', destinationRegionId: 4,
    });
    // Free-text shipment: no snapshot at all.
    for (const col of SHIPMENT_LOCATION_SNAPSHOT_COLUMNS) expect(created()[col]).toBeNull();

    // A supplied snapshot does not cross-fill or override legacy ids.
    shipmentRepo.create.mockClear();
    await service.createShipment(7, { ...baseDto(), originRegionId: 9, originLocation: seedCandidate() });
    expect(created().originRegionId).toBe(9);
    expect(created().originWardId).toBeNull();
  });

  // 10 ────────────────────────────────────────────────────────────────────
  it('public tracking exposes exactly the existing allow-list and none of the snapshot values', async () => {
    shipmentRepo.findOne.mockResolvedValue({
      ...pendingShipment(),
      trackingNumber: 'KTX-SHP-1', pickupOption: 'agent', deliveryOption: 'agent',
      senderPhone: '0711111111', collectedAt: null, deliveredAt: null, completedAt: null, createdAt: new Date(),
      originLocationLabel: 'SECRET-LABEL', originLatitude: -6.123456, originLongitude: 39.654321,
      originRegionName: 'SECRET-REGION', originDistrictName: 'SECRET-DISTRICT',
      originProviderKey: 'secret_provider', originResolutionMethod: 'gps',
    });
    parcelRepo.findOne.mockResolvedValue(null);
    const tracked = await service.trackShipment('KTX-SHP-1');

    expect(Object.keys(tracked).sort()).toEqual(
      ['trackingNumber', 'status', 'originCity', 'destinationCity', 'itemDescription', 'weightKg', 'pickupOption',
        'deliveryOption', 'receiverName', 'collectedAt', 'deliveredAt', 'completedAt', 'createdAt', 'parcelTrackingNumber'].sort(),
    );
    const json = JSON.stringify(tracked);
    for (const leak of ['SECRET-LABEL', '-6.123456', '39.654321', 'SECRET-REGION', 'SECRET-DISTRICT', 'secret_provider', '0711111111']) {
      expect(json).not.toContain(leak);
    }
  });

  // 11 ────────────────────────────────────────────────────────────────────
  it('a personal (non-commerce) shipment still confirms with no Order or payment evidence', async () => {
    shipmentRepo.findOne
      .mockResolvedValueOnce(pendingShipment())
      .mockResolvedValueOnce({ ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5 });
    parcelRepo.findOne.mockResolvedValue(null);
    const { parcel } = await service.confirmShipment(7, 1, { providerId: 5 });
    expect(parcel.order).toBeNull();
    expect(parcel.source).toBe('shipment');
    // The service has no order/payment/wallet collaborator at all.
    expect(ShipmentsService.length).toBe(6);
  });

  // 12 ────────────────────────────────────────────────────────────────────
  it("Stage 1's UQ_parcel_shipmentId recovery is intact: an unrelated 23505 is not misread as the shipment race", async () => {
    shipmentRepo.findOne
      .mockResolvedValueOnce(pendingShipment())
      .mockResolvedValueOnce({ ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5 });
    parcelRepo.findOne.mockResolvedValue(null);
    const other: any = new Error('duplicate key value violates unique constraint "UQ_parcel_trackingNumber"');
    other.code = '23505';
    other.constraint = 'UQ_parcel_trackingNumber';
    parcelRepo.save.mockRejectedValueOnce(other);
    await expect(service.confirmShipment(7, 1, { providerId: 5 })).rejects.toBe(other);
  });

  // ── Immutability guard ───────────────────────────────────────────────────
  it('no production file that imports the Shipment entity (i.e. could write a Shipment) references a snapshot column, other than the entity and the snapshot helper', () => {
    const root = join(__dirname, '..');
    const allowed = new Set([
      join(root, 'shipments', 'entities', 'shipment.entity.ts'),
      join(root, 'shipments', 'shipment-location-snapshot.ts'),
      join(root, 'database', 'migrations', '1788271200000-AddShipmentLocationSnapshot.ts'),
    ]);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.ts$/.test(name) && !/\.spec\.ts$|\.integration\.ts$/.test(name)) files.push(full);
      }
    };
    walk(root);

    const offenders = files.filter(
      (f) => !allowed.has(f) && /entities\/shipment\.entity'/.test(readFileSync(f, 'utf8')) && SHIPMENT_LOCATION_SNAPSHOT_COLUMNS.some((c) => new RegExp(`\\b${c}\\b`).test(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('createShipment is the only ShipmentsService method that uses the snapshot helpers', () => {
    const src = readFileSync(join(__dirname, 'shipments.service.ts'), 'utf8');
    const uses = (src.match(/buildLocationSnapshot\(/g) || []).length;
    expect(uses).toBe(2); // origin + destination, both inside createShipment
    const createBody = src.slice(src.indexOf('async createShipment('), src.indexOf('async getMyShipments('));
    expect((createBody.match(/buildLocationSnapshot\(/g) || []).length).toBe(2);
  });
});
