import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './entities/shipment.entity';
import { SHIPMENT_LOCATION_SNAPSHOT_COLUMNS } from '../database/migrations/1788271200000-AddShipmentLocationSnapshot';

// Stage 2F: a Shipment reaching Parcel creation always carries its durable hub
// decision (recorded inside the claim transaction). 'not_required' = no hub asked for.
const DECIDED: any = { originHubSource: 'not_required', destinationHubSource: 'not_required', originHubId: null, destinationHubId: null };

describe('Shipment location snapshot: confirmation boundary, immutability, tracking (Stage 2B, unchanged by 2D)', () => {
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
    shipmentRepo.manager = {
      transaction: (cb: any) => cb({ getRepository: () => shipmentRepo }),
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
      reserveSlot: jest.fn(),
      assertHeldSlotMatches: jest.fn(),
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
      { resolve: jest.fn() } as any,
    );
  });

  const created = () => shipmentRepo.create.mock.calls[0][0];

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
      .mockResolvedValueOnce({ ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5, ...DECIDED });
    parcelRepo.findOne.mockResolvedValue(null);
    const first = await service.confirmShipment(7, 1, { providerId: 5 });

    // Retry: the shipment is already CONFIRMED -> idempotent completion,
    // no Shipment write at all (so no snapshot write either).
    shipmentRepo.findOne.mockResolvedValue({ ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5, ...DECIDED });
    parcelRepo.findOne.mockResolvedValue({ id: 500 });
    shipmentRepo.update.mockClear();
    const retry = await service.confirmShipment(7, 1, { providerId: 5 });
    expect(retry.parcel.id).toBe(500);
    expect(shipmentRepo.update).not.toHaveBeenCalled();

    expect(first.parcel).toBeDefined();
    for (const [, payload] of shipmentRepo.update.mock.calls) expect(touchesSnapshot(payload)).toBe(false);
  });

  // 7 ─────────────────────────────────────────────────────────────────────
  it('concurrent confirmation: no write ever carries a snapshot column and both callers converge on one Parcel', async () => {
    const confirmed = { ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5, ...DECIDED };
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
      .mockResolvedValueOnce({ ...legacy, status: ShipmentStatus.CONFIRMED, ...DECIDED });
    parcelRepo.findOne.mockResolvedValue(null);
    const result = await service.confirmShipment(7, 9, {});
    expect(result.parcel.originCity).toBe('Arusha');

    shipmentRepo.findOne.mockResolvedValue({ ...legacy, status: ShipmentStatus.CONFIRMED, ...DECIDED });
    parcelRepo.findOne.mockResolvedValue({ trackingNumber: 'KTX-PCL-1' });
    const tracked = await service.trackShipment('KTX-SHP-9');
    expect(tracked.originCity).toBe('Arusha');
    expect(tracked.destinationCity).toBe('Dodoma');
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
      .mockResolvedValueOnce({ ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5, ...DECIDED });
    parcelRepo.findOne.mockResolvedValue(null);
    const { parcel } = await service.confirmShipment(7, 1, { providerId: 5 });
    expect(parcel.order).toBeNull();
    expect(parcel.source).toBe('shipment');
    // The service has no order/payment/wallet collaborator at all: its 7 injected
    // dependencies are the shipment/route/parcel/hub repositories, transport, tz-location
    // and (Stage 2D) location intelligence.
    expect(ShipmentsService.length).toBe(7);
    const src = require('fs')
      .readFileSync(require('path').join(__dirname, 'shipments.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, ''); // code only, not comments
    expect(src).not.toMatch(/OrdersService|PaymentsService|WalletService|MoneyRouting|PaymentEvidence/);
  });

  // 12 ────────────────────────────────────────────────────────────────────
  it("Stage 1's UQ_parcel_shipmentId recovery is intact: an unrelated 23505 is not misread as the shipment race", async () => {
    shipmentRepo.findOne
      .mockResolvedValueOnce(pendingShipment())
      .mockResolvedValueOnce({ ...pendingShipment(), status: ShipmentStatus.CONFIRMED, providerId: 5, ...DECIDED });
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

});
