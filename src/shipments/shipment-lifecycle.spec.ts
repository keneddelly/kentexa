import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './entities/shipment.entity';
import { SHIPMENT_LOCATION_SNAPSHOT_COLUMNS } from '../database/migrations/1788271200000-AddShipmentLocationSnapshot';

/**
 * Stage 2B correction: createShipment never mints CONFIRMED; confirmShipment
 * is the single canonical boundary (atomic PENDING->CONFIRMED claim, capacity
 * side effects only for the claim winner, exactly one Parcel).
 *
 * The harness below is a tiny in-memory stand-in for the repositories and the
 * transport capacity ledger, so create -> confirm sequences, retries and
 * concurrent confirmations are exercised against shared state rather than
 * against pre-canned mock return values. update() honours the WHERE status
 * criteria exactly like the real conditional UPDATE does.
 */
describe('Shipment lifecycle — create/confirm boundary (Stage 2B correction)', () => {
  let rows: Map<number, any>;
  let parcels: any[];
  let capacity: { reserve: Array<[number, number]>; release: Array<[number, number]> };
  let eligibleProviders: Set<number>;
  let updateCalls: Array<[any, any]>;
  let service: ShipmentsService;
  let nextShipmentId: number;

  const snapshotKeys = new Set(SHIPMENT_LOCATION_SNAPSHOT_COLUMNS);
  const touchesSnapshot = (o: any) => Object.keys(o || {}).some((k) => snapshotKeys.has(k));

  const dto = (extra: Record<string, unknown> = {}) => ({
    receiverName: 'Amina',
    receiverPhone: '0700000000',
    originCity: 'Dar es Salaam',
    destinationCity: 'Mwanza',
    itemDescription: 'Clothes',
    weightKg: 2,
    ...extra,
  });

  beforeEach(() => {
    rows = new Map();
    parcels = [];
    capacity = { reserve: [], release: [] };
    eligibleProviders = new Set([5, 6]);
    updateCalls = [];
    nextShipmentId = 1;

    const shipmentRepo: any = {
      create: (v: any) => ({ ...v }),
      save: async (v: any) => {
        const id = v.id ?? nextShipmentId++;
        const row = { ...v, id };
        rows.set(id, row);
        return { ...row };
      },
      findOne: async ({ where }: any) => {
        const r = rows.get(where.id);
        return r ? { ...r } : null;
      },
      // Conditional update: applies only if every criteria key matches.
      update: async (criteria: any, values: any) => {
        updateCalls.push([criteria, values]);
        const id = typeof criteria === 'number' ? criteria : criteria.id;
        const r = rows.get(id);
        if (!r) return { affected: 0 };
        if (typeof criteria === 'object') {
          for (const [k, v] of Object.entries(criteria)) {
            if (r[k] !== v) return { affected: 0 };
          }
        }
        Object.assign(r, values);
        return { affected: 1 };
      },
    };
    const parcelRepo: any = {
      create: (v: any) => ({ ...v }),
      findOne: async ({ where }: any) =>
        parcels.find((p) => p.shipment?.id === where.shipment.id) ?? null,
      save: async (v: any) => {
        if (v.id) return v;
        // UQ_parcel_shipmentId
        if (parcels.some((p) => p.shipment?.id === v.shipment?.id)) {
          const e: any = new Error('duplicate key value violates unique constraint "UQ_parcel_shipmentId"');
          e.code = '23505';
          e.constraint = 'UQ_parcel_shipmentId';
          throw e;
        }
        const saved = { ...v, id: parcels.length + 500 };
        parcels.push(saved);
        return saved;
      },
    };
    const transportService: any = {
      assertEligibleProvider: async (id: number) => {
        if (!eligibleProviders.has(id)) throw new BadRequestException('provider not eligible');
        return { id };
      },
      reserveCapacity: async (id: number, kg: number) => void capacity.reserve.push([id, kg]),
      releaseCapacity: async (id: number, kg: number) => void capacity.release.push([id, kg]),
    };
    service = new ShipmentsService(
      shipmentRepo,
      { findOne: async () => ({ pricePerKg: 1000, fixedFee: 0 }) } as any,
      parcelRepo,
      { findOne: async () => null } as any,
      transportService,
      { search: async () => [] } as any,
    );
  });

  // ── create never confirms ───────────────────────────────────────────────
  it('create with a provider selection stays PENDING, creates no Parcel, and keeps the selection', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    expect(s.status).toBe(ShipmentStatus.PENDING);
    expect(s.providerId).toBe(5);
    expect(parcels).toHaveLength(0);
  });

  it('create without a provider remains PENDING and compatible', async () => {
    const s = await service.createShipment(7, dto());
    expect(s.status).toBe(ShipmentStatus.PENDING);
    expect(s.providerId).toBeNull();
    expect(s.trackingNumber).toBe(`KTX-SHP-${s.id}`);
  });

  it.each([
    ['nonexistent', 999],
    ['unverified / suspended (not in eligible set)', 77],
  ])('create rejects a %s provider: nothing inserted, nothing reserved', async (_n, providerId) => {
    await expect(
      service.createShipment(7, dto({ providerId, availabilityId: 3 })),
    ).rejects.toThrow(BadRequestException);
    expect(rows.size).toBe(0);
    expect(capacity.reserve).toHaveLength(0);
    expect(parcels).toHaveLength(0);
  });

  it('an ineligible provider can never become CONFIRMED through confirm either: stays PENDING, no write', async () => {
    const s = await service.createShipment(7, dto());
    updateCalls.length = 0;
    await expect(service.confirmShipment(7, s.id, { providerId: 999 })).rejects.toThrow(BadRequestException);
    expect(rows.get(s.id).status).toBe(ShipmentStatus.PENDING);
    expect(updateCalls).toHaveLength(0);
    expect(parcels).toHaveLength(0);
  });

  // ── canonical confirm ───────────────────────────────────────────────────
  it('canonical confirm moves PENDING -> CONFIRMED and creates exactly one Parcel', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    const { shipment, parcel } = await service.confirmShipment(7, s.id, {});
    expect(shipment.status).toBe(ShipmentStatus.CONFIRMED);
    expect(parcels).toHaveLength(1);
    expect(parcel.id).toBe(parcels[0].id);
    expect(parcels[0].order).toBeNull(); // personal shipment: no Order required
  });

  it('confirm retry is an idempotent no-write: same Parcel, no Shipment write, no capacity change', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
    const first = await service.confirmShipment(7, s.id, {});
    updateCalls.length = 0;
    const before = { reserve: [...capacity.reserve], release: [...capacity.release] };

    const retry = await service.confirmShipment(7, s.id, { providerId: 6, availabilityId: 9, routeId: 4 });

    expect(retry.parcel.id).toBe(first.parcel.id);
    expect(parcels).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
    expect(capacity).toEqual(before);
    // The retry's provider/slot/route were ignored: a confirmed shipment isn't editable here.
    expect(rows.get(s.id)).toMatchObject({ providerId: 5, availabilityId: 3, routeId: null });
  });

  it('a non-PENDING/non-CONFIRMED status (e.g. CANCELLED, COLLECTED) still cannot be confirmed', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    for (const status of [ShipmentStatus.CANCELLED, ShipmentStatus.COLLECTED, ShipmentStatus.COMPLETED]) {
      rows.get(s.id).status = status;
      await expect(service.confirmShipment(7, s.id, {})).rejects.toThrow(BadRequestException);
    }
    expect(parcels).toHaveLength(0);
  });

  it('unknown shipment / other users\' shipment behaviour is unchanged', async () => {
    await expect(service.confirmShipment(7, 12345, {})).rejects.toThrow(NotFoundException);
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    await expect(service.confirmShipment(8, s.id, {})).rejects.toThrow();
    expect(parcels).toHaveLength(0);
  });

  // ── legacy born-CONFIRMED rows ──────────────────────────────────────────
  it('a legacy row born CONFIRMED with no Parcel is completed by confirm: one Parcel, no Shipment write, no capacity change', async () => {
    rows.set(40, {
      id: 40, requestedByUserId: 7, status: ShipmentStatus.CONFIRMED, providerId: 5, availabilityId: 3,
      routeId: null, weightKg: 2, orderId: null, originCity: 'Arusha', destinationCity: 'Dodoma',
      receiverName: 'R', receiverPhone: '0', itemDescription: 'Box',
    });
    const { parcel } = await service.confirmShipment(7, 40, {});
    expect(parcel.originCity).toBe('Arusha');
    expect(parcels).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
    expect(capacity.reserve).toHaveLength(0);
  });

  it('a legacy born-CONFIRMED row whose provider is no longer eligible fails closed: no Parcel', async () => {
    rows.set(41, {
      id: 41, requestedByUserId: 7, status: ShipmentStatus.CONFIRMED, providerId: 999, availabilityId: null,
      weightKg: 1, originCity: 'A', destinationCity: 'B', receiverName: 'R', receiverPhone: '0', itemDescription: 'x',
    });
    await expect(service.confirmShipment(7, 41, {})).rejects.toThrow(BadRequestException);
    expect(parcels).toHaveLength(0);
  });

  // ── capacity: at most once ──────────────────────────────────────────────
  it('create(availabilityId) -> confirm(same slot): the slot is reserved exactly once in total', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
    expect(capacity.reserve).toEqual([[3, 2]]);
    await service.confirmShipment(7, s.id, { availabilityId: 3 });
    await service.confirmShipment(7, s.id, { availabilityId: 3 }); // retry
    expect(capacity.reserve).toEqual([[3, 2]]);
    expect(capacity.release).toHaveLength(0);
  });

  it('create(no slot) -> confirm(slot): reserved exactly once, at confirm', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    expect(capacity.reserve).toHaveLength(0);
    await service.confirmShipment(7, s.id, { availabilityId: 4 });
    await service.confirmShipment(7, s.id, { availabilityId: 4 }); // retry
    expect(capacity.reserve).toEqual([[4, 2]]);
  });

  it('confirm that switches slot reserves the new one and releases the superseded one (no leaked reservation)', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
    await service.confirmShipment(7, s.id, { availabilityId: 4 });
    expect(capacity.reserve).toEqual([[3, 2], [4, 2]]);
    expect(capacity.release).toEqual([[3, 2]]);
    expect(rows.get(s.id).availabilityId).toBe(4);
  });

  it('concurrent confirmations (slot switch): exactly one claim winner, one reservation, one Parcel, both converge', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    const [a, b] = await Promise.all([
      service.confirmShipment(7, s.id, { availabilityId: 4 }),
      service.confirmShipment(7, s.id, { availabilityId: 4 }),
    ]);
    expect(capacity.reserve.filter(([id]) => id === 4)).toHaveLength(1);
    expect(parcels).toHaveLength(1);
    expect(a.parcel.id).toBe(b.parcel.id);
    expect(rows.get(s.id).status).toBe(ShipmentStatus.CONFIRMED);
  });

  it('concurrent confirmations with DIFFERENT slots: only the claim winner\'s slot is reserved; the loser reserves nothing', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    await Promise.all([
      service.confirmShipment(7, s.id, { availabilityId: 4 }),
      service.confirmShipment(7, s.id, { availabilityId: 8 }),
    ]);
    expect(capacity.reserve).toHaveLength(1);
    expect(capacity.reserve[0][0]).toBe(rows.get(s.id).availabilityId);
    expect(parcels).toHaveLength(1);
  });

  // ── snapshot survives the whole corrected lifecycle ─────────────────────
  it('the location snapshot is unchanged through create -> confirm -> retry -> concurrent confirm', async () => {
    const s = await service.createShipment(
      7,
      dto({
        providerId: 5,
        availabilityId: 3,
        originLocation: { displayLabel: 'Mbezi, Kinondoni', latitude: -6.75, longitude: 39.2, providerKey: 'tz_seed', resolutionMethod: 'admin_seed' },
        destinationLocation: { displayLabel: 'Ilemela, Mwanza' },
      }),
    );
    const snap = (id: number) =>
      Object.fromEntries(SHIPMENT_LOCATION_SNAPSHOT_COLUMNS.map((c) => [c, rows.get(id)[c]]));
    const frozen = snap(s.id);
    expect(frozen.originLocationLabel).toBe('Mbezi, Kinondoni');
    expect(frozen.originLatitude).toBe(-6.75);
    expect(frozen.destinationLocationLabel).toBe('Ilemela, Mwanza');
    expect(frozen.destinationLatitude).toBeNull();

    await Promise.all([
      service.confirmShipment(7, s.id, { availabilityId: 4 }),
      service.confirmShipment(7, s.id, { availabilityId: 4 }),
    ]);
    await service.confirmShipment(7, s.id, {});

    expect(snap(s.id)).toEqual(frozen);
    for (const [, values] of updateCalls) expect(touchesSnapshot(values)).toBe(false);
  });
});
