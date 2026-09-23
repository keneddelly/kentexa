import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { Shipment, ShipmentStatus } from './entities/shipment.entity';
import { SHIPMENT_LOCATION_SNAPSHOT_COLUMNS } from '../database/migrations/1788271200000-AddShipmentLocationSnapshot';
import { capacityWeightKg } from '../transport/slot-capacity';

/**
 * Shipment create/confirm/cancel orchestration (Stage 2B lifecycle + Stage 2C
 * capacity attachment).
 *
 * The harness below is an in-memory stand-in for the repositories, the
 * transaction manager and the capacity ledger. It models exactly the things
 * these tests are about -- transaction boundaries (with an undo log, so a
 * throw rolls capacity AND shipment writes back together), row locks, atomic
 * conditional UPDATE, and the rule that the capacity primitives must be given
 * the transaction's EntityManager. Two guards make "same EntityManager"
 * checkable: the injected (global) repository refuses writes while a
 * transaction is open, and the fake transport primitives refuse to run without
 * the transaction's EntityManager. The real SQL semantics (atomic conditional
 * UPDATE, numeric arithmetic, true rollback, real concurrency) are proven
 * against PostgreSQL in shipment-capacity.real-postgres.spec.ts.
 */
type SlotStatus = 'open' | 'full' | 'departed' | 'cancelled';
interface Slot {
  id: number; providerId: number; routeId: number | null; status: SlotStatus; date: string;
  totalSlots: number; usedSlots: number; totalKg: number; usedKg: number;
}

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function cloneMap<T>(m: Map<number, T>): Array<[number, T]> {
  return [...m.entries()].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]);
}

describe('Shipment lifecycle — create/confirm/cancel boundary (Stage 2B + 2C)', () => {
  let rows: Map<number, any>;
  let slots: Map<number, Slot>;
  let parcels: any[];
  let calls: { reserve: any[]; release: any[]; held: any[] };
  let eligibleProviders: Set<number>;
  let updateCalls: Array<[any, any]>;
  let service: ShipmentsService;
  let nextShipmentId: number;
  let txDepth: number;
  let failSaveAt: number | null; // fail the Nth save() executed inside a transaction
  let saveCount: number;
  let parcelSaveFailures: number;
  let locks: Map<number, Promise<void>>;

  const snapshotKeys = new Set(SHIPMENT_LOCATION_SNAPSHOT_COLUMNS);
  const touchesSnapshot = (o: any) => Object.keys(o || {}).some((k) => snapshotKeys.has(k));
  const slot = (o: Partial<Slot> & { id: number }): Slot => ({
    providerId: 5, routeId: null, status: 'open', date: TODAY, totalSlots: 5, usedSlots: 0, totalKg: 100, usedKg: 0, ...o,
  });
  const dto = (extra: Record<string, unknown> = {}) => ({
    receiverName: 'Amina', receiverPhone: '0700000000', originCity: 'Dar es Salaam',
    destinationCity: 'Mwanza', itemDescription: 'Clothes', weightKg: 2, ...extra,
  });
  const slotState = (id: number) => { const s = slots.get(id)!; return { used: s.usedSlots, kg: s.usedKg, status: s.status }; };

  beforeEach(() => {
    rows = new Map(); slots = new Map(); parcels = [];
    calls = { reserve: [], release: [], held: [] };
    eligibleProviders = new Set([5, 6]);
    updateCalls = []; nextShipmentId = 1; txDepth = 0; failSaveAt = null; saveCount = 0;
    parcelSaveFailures = 0; locks = new Map();
    slots.set(3, slot({ id: 3 })); slots.set(4, slot({ id: 4 }));

    // ── repositories ─────────────────────────────────────────────────────
    const makeRepo = (tx: { undo: Map<number, any>; mine: Set<number>; held: Array<() => void> } | null) => {
      const remember = (id: number) => {
        if (tx && !tx.undo.has(id)) tx.undo.set(id, rows.has(id) ? { ...rows.get(id) } : null);
      };
      const guardWrite = () => {
        if (!tx && txDepth > 0) throw new Error('GLOBAL repository written inside a transaction (must use the tx EntityManager)');
      };
      const waitUnlocked = async (id: number) => {
        while (locks.has(id) && !(tx && tx.mine.has(id))) await locks.get(id);
      };
      return {
        create: (v: any) => ({ ...v }),
        save: async (v: any) => {
          guardWrite();
          if (tx) { saveCount++; if (failSaveAt === saveCount) throw new Error('simulated insert failure'); }
          const id = v.id ?? nextShipmentId++;
          remember(id);
          rows.set(id, { ...(rows.get(id) || {}), ...v, id });
          return { ...rows.get(id) };
        },
        findOne: async ({ where, lock }: any) => {
          if (lock && tx) {
            // check-and-take must be atomic (no await between the last check
            // and the set), exactly like a real row lock.
            while (locks.has(where.id) && !tx.mine.has(where.id)) await locks.get(where.id);
            if (!tx.mine.has(where.id)) {
              let release!: () => void;
              locks.set(where.id, new Promise<void>((r) => (release = r)));
              tx.mine.add(where.id);
              tx.held.push(() => { locks.delete(where.id); release(); });
            }
          }
          const r = rows.get(where.id);
          return r ? { ...r } : null;
        },
        update: async (criteria: any, values: any) => {
          guardWrite();
          updateCalls.push([criteria, values]);
          const id = typeof criteria === 'number' ? criteria : criteria.id;
          await waitUnlocked(id);
          const r = rows.get(id);
          if (!r) return { affected: 0 };
          if (typeof criteria === 'object') {
            for (const [k, v] of Object.entries(criteria)) if (r[k] !== v) return { affected: 0 };
          }
          remember(id);
          Object.assign(r, values);
          return { affected: 1 };
        },
      };
    };
    const shipmentRepo: any = makeRepo(null);
    shipmentRepo.manager = {
      transaction: async (cb: any) => {
        const tx = { undo: new Map<number, any>(), mine: new Set<number>(), held: [] as Array<() => void>, slotUndo: new Map<number, Slot>() };
        const em: any = { __tx: tx, getRepository: (cls: any) => (cls === Shipment ? makeRepo(tx) : ({} as any)) };
        txDepth++;
        try {
          return await cb(em);
        } catch (e) {
          for (const [id, prev] of tx.undo) prev ? rows.set(id, prev) : rows.delete(id);
          for (const [id, prev] of tx.slotUndo) slots.set(id, prev);
          throw e;
        } finally {
          txDepth--;
          tx.held.forEach((r) => r());
        }
      },
    };
    const parcelRepo: any = {
      create: (v: any) => ({ ...v }),
      findOne: async ({ where }: any) => parcels.find((p) => p.shipment?.id === where.shipment.id) ?? null,
      save: async (v: any) => {
        if (v.id) return v;
        if (parcelSaveFailures > 0) { parcelSaveFailures--; throw new Error('connection terminated unexpectedly'); }
        if (parcels.some((p) => p.shipment?.id === v.shipment?.id)) {
          const e: any = new Error('duplicate key value violates unique constraint "UQ_parcel_shipmentId"');
          e.code = '23505'; e.constraint = 'UQ_parcel_shipmentId'; throw e;
        }
        const saved = { ...v, id: parcels.length + 500 };
        parcels.push(saved);
        return saved;
      },
    };

    // ── fake transport primitives (same contract as the real ones) ───────
    const needTx = (em: any, what: string) => {
      if (!em?.__tx) throw new Error(`${what} called WITHOUT the transaction EntityManager`);
      return em.__tx;
    };
    const rememberSlot = (tx: any, s: Slot) => { if (!tx.slotUndo.has(s.id)) tx.slotUndo.set(s.id, { ...s }); };
    const lookup = (id: number, ctx: any) => {
      const s = slots.get(id);
      if (!s) throw new NotFoundException('Availability slot not found');
      if (ctx.providerId && s.providerId !== ctx.providerId) throw new BadRequestException("slot doesn't belong to the selected provider");
      if (ctx.routeId && s.routeId && s.routeId !== ctx.routeId) throw new BadRequestException("slot isn't for the selected route");
      return s;
    };
    const transportService: any = {
      assertEligibleProvider: async (id: number) => {
        if (!eligibleProviders.has(id)) throw new BadRequestException('provider not eligible');
        return { id };
      },
      reserveSlot: async (id: number, kg: number, ctx: any, em: any) => {
        const tx = needTx(em, 'reserveSlot');
        calls.reserve.push([id, kg]);
        const w = capacityWeightKg(kg);
        const s = lookup(id, ctx);
        if (s.status !== 'open' || s.date < TODAY) throw new BadRequestException('That slot is no longer available');
        if (s.usedSlots >= s.totalSlots) throw new ConflictException('That slot is full');
        if (s.totalKg > 0 && s.totalKg - s.usedKg < w) throw new ConflictException('That slot is full or no longer available');
        rememberSlot(tx, s);
        s.usedSlots += 1; s.usedKg += w;
        if (s.usedSlots >= s.totalSlots) s.status = 'full';
      },
      releaseCapacity: async (id: number, kg: number, em: any) => {
        const tx = needTx(em, 'releaseCapacity');
        calls.release.push([id, kg]);
        const s = slots.get(id);
        if (!s || s.usedSlots <= 0) return;
        rememberSlot(tx, s);
        s.usedSlots -= 1; s.usedKg = Math.max(0, s.usedKg - capacityWeightKg(kg));
        if (s.status === 'full' && s.usedSlots < s.totalSlots) s.status = 'open';
      },
      assertHeldSlotMatches: async (id: number, ctx: any, em: any) => {
        needTx(em, 'assertHeldSlotMatches');
        calls.held.push(id);
        const s = lookup(id, ctx);
        if (s.status === 'departed' || s.status === 'cancelled') throw new BadRequestException('That slot is no longer available');
      },
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

  // ═══ Stage 2B: create never confirms ═══════════════════════════════════
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
    expect(calls.reserve).toHaveLength(0);
  });

  it.each([['nonexistent', 999], ['unverified / suspended', 77]])(
    'create rejects a %s provider: nothing inserted, nothing reserved',
    async (_n, providerId) => {
      await expect(service.createShipment(7, dto({ providerId, availabilityId: 3 }))).rejects.toThrow(BadRequestException);
      expect(rows.size).toBe(0);
      expect(calls.reserve).toHaveLength(0);
      expect(slotState(3)).toEqual({ used: 0, kg: 0, status: 'open' });
    },
  );

  it('an ineligible provider can never become CONFIRMED through confirm either: stays PENDING, no write', async () => {
    const s = await service.createShipment(7, dto());
    updateCalls.length = 0;
    await expect(service.confirmShipment(7, s.id, { providerId: 999 })).rejects.toThrow(BadRequestException);
    expect(rows.get(s.id).status).toBe(ShipmentStatus.PENDING);
    expect(updateCalls).toHaveLength(0);
    expect(parcels).toHaveLength(0);
  });

  // ═══ canonical confirm ═════════════════════════════════════════════════
  it('canonical confirm moves PENDING -> CONFIRMED and creates exactly one Parcel (no Order)', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    const { shipment, parcel } = await service.confirmShipment(7, s.id, {});
    expect(shipment.status).toBe(ShipmentStatus.CONFIRMED);
    expect(parcels).toHaveLength(1);
    expect(parcel.id).toBe(parcels[0].id);
    expect(parcels[0].order).toBeNull();
  });

  it('confirm retry is an idempotent no-write: same Parcel, no Shipment write, no capacity change', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
    const first = await service.confirmShipment(7, s.id, {});
    updateCalls.length = 0;
    const before = { reserve: [...calls.reserve], release: [...calls.release], slot: slotState(3) };

    const retry = await service.confirmShipment(7, s.id, { providerId: 6, availabilityId: 4, routeId: 4 });

    expect(retry.parcel.id).toBe(first.parcel.id);
    expect(parcels).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
    expect({ reserve: calls.reserve, release: calls.release, slot: slotState(3) }).toEqual(before);
    expect(rows.get(s.id)).toMatchObject({ providerId: 5, availabilityId: 3, routeId: null });
  });

  it('a non-PENDING/non-CONFIRMED status (CANCELLED, COLLECTED, COMPLETED) still cannot be confirmed', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    for (const status of [ShipmentStatus.CANCELLED, ShipmentStatus.COLLECTED, ShipmentStatus.COMPLETED]) {
      rows.get(s.id).status = status;
      await expect(service.confirmShipment(7, s.id, {})).rejects.toThrow(BadRequestException);
    }
    expect(parcels).toHaveLength(0);
  });

  it("unknown shipment / other users' shipment behaviour is unchanged", async () => {
    await expect(service.confirmShipment(7, 12345, {})).rejects.toThrow(NotFoundException);
    await expect(service.cancelShipment(7, 12345)).rejects.toThrow(NotFoundException);
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    await expect(service.confirmShipment(8, s.id, {})).rejects.toThrow();
    await expect(service.cancelShipment(8, s.id)).rejects.toThrow();
    expect(parcels).toHaveLength(0);
    expect(rows.get(s.id).status).toBe(ShipmentStatus.PENDING);
  });

  // ═══ legacy born-CONFIRMED rows ════════════════════════════════════════
  it('a legacy row born CONFIRMED with no Parcel is completed by confirm: one Parcel, no Shipment write, no capacity change', async () => {
    rows.set(40, {
      id: 40, requestedByUserId: 7, status: ShipmentStatus.CONFIRMED, providerId: 5, availabilityId: 3, routeId: null,
      weightKg: 2, orderId: null, originCity: 'Arusha', destinationCity: 'Dodoma', receiverName: 'R', receiverPhone: '0', itemDescription: 'Box',
    });
    const { parcel } = await service.confirmShipment(7, 40, {});
    expect(parcel.originCity).toBe('Arusha');
    expect(parcels).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
    expect(calls.reserve).toHaveLength(0);
    expect(calls.release).toHaveLength(0);
  });

  it('a legacy born-CONFIRMED row whose provider is no longer eligible fails closed: no Parcel', async () => {
    rows.set(41, {
      id: 41, requestedByUserId: 7, status: ShipmentStatus.CONFIRMED, providerId: 999, availabilityId: null,
      weightKg: 1, originCity: 'A', destinationCity: 'B', receiverName: 'R', receiverPhone: '0', itemDescription: 'x',
    });
    await expect(service.confirmShipment(7, 41, {})).rejects.toThrow(BadRequestException);
    expect(parcels).toHaveLength(0);
  });

  // ═══ Stage 2C: validated, fail-closed attach at create ═════════════════
  describe('create with a slot: validated attach, all-or-nothing', () => {
    it('reserves inside the transaction (with the transaction EntityManager) and inserts the shipment', async () => {
      const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3, weightKg: 12.5 }));
      expect(calls.reserve).toEqual([[3, 12.5]]);
      expect(slotState(3)).toEqual({ used: 1, kg: 12.5, status: 'open' });
      expect(rows.get(s.id).availabilityId).toBe(3);
    });

    it.each([
      ['a missing slot', 99, {}],
      ['a slot of another provider', 3, { providerId: 6 }],
      ['a slot of another route', 3, { routeId: 9, _slot: { routeId: 2 } }],
      ['a CANCELLED slot', 3, { _slot: { status: 'cancelled' } }],
      ['a DEPARTED slot', 3, { _slot: { status: 'departed' } }],
      ['a past-dated slot', 3, { _slot: { date: YESTERDAY } }],
      ['a FULL slot', 3, { _slot: { status: 'full', usedSlots: 5 } }],
      ['a slot without room for the weight', 3, { weightKg: 50, _slot: { totalKg: 40 } }],
    ])('rejects %s: nothing inserted, counters unchanged', async (_n, slotId, extra: any) => {
      if (extra._slot) slots.set(3, slot({ id: 3, ...extra._slot }));
      const before = cloneMap(slots);
      const { _slot, ...rest } = extra;
      await expect(
        service.createShipment(7, dto({ providerId: 5, availabilityId: slotId, ...rest })),
      ).rejects.toThrow();
      expect(rows.size).toBe(0);
      expect(cloneMap(slots)).toEqual(before);
    });

    it('a kg bound of 0 means "not declared" and does not block (slots are still counted)', async () => {
      slots.set(3, slot({ id: 3, totalKg: 0 }));
      await service.createShipment(7, dto({ providerId: 5, availabilityId: 3, weightKg: 500 }));
      expect(slotState(3).used).toBe(1);
    });

    it('unspecified weight (0) reserves the agreed 1 kg fallback; the shipment keeps weight 0', async () => {
      const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3, weightKg: 0 }));
      expect(slotState(3)).toEqual({ used: 1, kg: 1, status: 'open' });
      expect(rows.get(s.id).weightKg).toBe(0);
    });

    it.each([['NaN', NaN], ['negative', -3], ['non-numeric', 'abc'], ['Infinity', Infinity]])(
      'rejects a %s weight before touching anything',
      async (_n, weightKg) => {
        await expect(
          service.createShipment(7, dto({ providerId: 5, availabilityId: 3, weightKg })),
        ).rejects.toThrow(BadRequestException);
        expect(rows.size).toBe(0);
        expect(calls.reserve).toHaveLength(0);
        expect(slotState(3)).toEqual({ used: 0, kg: 0, status: 'open' });
      },
    );

    it('rolls the reservation back if the shipment insert fails', async () => {
      failSaveAt = 1; // first save inside the transaction = the insert
      await expect(service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }))).rejects.toThrow('simulated insert failure');
      expect(rows.size).toBe(0);
      expect(slotState(3)).toEqual({ used: 0, kg: 0, status: 'open' });
    });

    it('rolls the reservation (and the row) back if the tracking-number write fails', async () => {
      failSaveAt = 2; // second save = KTX-SHP-{id}
      await expect(service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }))).rejects.toThrow('simulated insert failure');
      expect(rows.size).toBe(0);
      expect(slotState(3)).toEqual({ used: 0, kg: 0, status: 'open' });
    });
  });

  // ═══ capacity across create -> confirm ═════════════════════════════════
  it('create(slot) -> confirm(same slot) -> retry: exactly one reservation in total', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
    await service.confirmShipment(7, s.id, { availabilityId: 3 });
    await service.confirmShipment(7, s.id, { availabilityId: 3 });
    expect(calls.reserve).toEqual([[3, 2]]);
    expect(calls.release).toHaveLength(0);
    expect(slotState(3).used).toBe(1);
    expect(calls.held).toEqual([3]); // the held slot was re-validated against the provider, no capacity change
  });

  it('create(no slot) -> confirm(slot) -> retry: reserved exactly once, at confirm', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    await service.confirmShipment(7, s.id, { availabilityId: 4 });
    await service.confirmShipment(7, s.id, { availabilityId: 4 });
    expect(calls.reserve).toEqual([[4, 2]]);
    expect(slotState(4)).toEqual({ used: 1, kg: 2, status: 'open' });
  });

  it('confirm that switches slot: reserve new + release old + claim commit together', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
    await service.confirmShipment(7, s.id, { availabilityId: 4 });
    expect(slotState(3)).toEqual({ used: 0, kg: 0, status: 'open' });
    expect(slotState(4)).toEqual({ used: 1, kg: 2, status: 'open' });
    expect(rows.get(s.id)).toMatchObject({ availabilityId: 4, status: ShipmentStatus.CONFIRMED });
  });

  it('slot-switch is ALL-OR-NOTHING: if the new slot cannot be reserved, the claim and every capacity change roll back', async () => {
    slots.set(4, slot({ id: 4, status: 'full', usedSlots: 5 }));
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
    await expect(service.confirmShipment(7, s.id, { availabilityId: 4 })).rejects.toThrow();
    expect(rows.get(s.id)).toMatchObject({ status: ShipmentStatus.PENDING, providerId: 5, availabilityId: 3 });
    expect(slotState(3)).toEqual({ used: 1, kg: 2, status: 'open' }); // old reservation intact
    expect(slots.get(4)!.usedSlots).toBe(5);
    expect(parcels).toHaveLength(0);
  });

  it("confirming with a provider different from the held slot's provider is rejected and rolled back", async () => {
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 })); // slot 3 belongs to provider 5
    await expect(service.confirmShipment(7, s.id, { providerId: 6 })).rejects.toThrow(BadRequestException);
    expect(rows.get(s.id)).toMatchObject({ status: ShipmentStatus.PENDING, providerId: 5 });
    expect(slotState(3).used).toBe(1);
    expect(parcels).toHaveLength(0);
  });

  it('concurrent confirmations (slot switch): one committed outcome, exact counters, one Parcel, both converge', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
    const [a, b] = await Promise.all([
      service.confirmShipment(7, s.id, { availabilityId: 4 }),
      service.confirmShipment(7, s.id, { availabilityId: 4 }),
    ]);
    expect(slotState(4)).toEqual({ used: 1, kg: 2, status: 'open' });
    expect(slotState(3)).toEqual({ used: 0, kg: 0, status: 'open' });
    expect(calls.reserve.filter(([id]) => id === 4)).toHaveLength(1);
    expect(calls.release).toHaveLength(1);
    expect(parcels).toHaveLength(1);
    expect(a.parcel.id).toBe(b.parcel.id);
  });

  it('concurrent confirmations with DIFFERENT slots: only the claim winner reserves; the loser changes nothing', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    await Promise.all([
      service.confirmShipment(7, s.id, { availabilityId: 4 }),
      service.confirmShipment(7, s.id, { availabilityId: 3 }),
    ]);
    expect(calls.reserve).toHaveLength(1);
    expect(slotState(3).used + slotState(4).used).toBe(1);
    expect(parcels).toHaveLength(1);
  });

  it('Parcel failure after commit: confirm rejects but capacity stays committed once; retry completes the Parcel without touching capacity', async () => {
    const s = await service.createShipment(7, dto({ providerId: 5 }));
    parcelSaveFailures = 1;
    await expect(service.confirmShipment(7, s.id, { availabilityId: 4 })).rejects.toThrow('connection terminated unexpectedly');
    expect(rows.get(s.id).status).toBe(ShipmentStatus.CONFIRMED);
    expect(slotState(4).used).toBe(1);
    expect(parcels).toHaveLength(0);

    const retry = await service.confirmShipment(7, s.id, { availabilityId: 4 });
    expect(retry.parcel).toBeDefined();
    expect(parcels).toHaveLength(1);
    expect(calls.reserve).toEqual([[4, 2]]); // never reserved again
    expect(slotState(4).used).toBe(1);
  });

  // ═══ cancel ════════════════════════════════════════════════════════════
  describe('cancel: transition + release exactly once, in one transaction', () => {
    it('releases the held slot once and cancels', async () => {
      const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
      const cancelled = await service.cancelShipment(7, s.id);
      expect(cancelled.status).toBe(ShipmentStatus.CANCELLED);
      expect(slotState(3)).toEqual({ used: 0, kg: 0, status: 'open' });
      expect(calls.release).toEqual([[3, 2]]);
    });

    it('a retried cancel is rejected by the transition rule and never double-releases', async () => {
      const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
      await service.cancelShipment(7, s.id);
      await expect(service.cancelShipment(7, s.id)).rejects.toThrow(BadRequestException);
      expect(calls.release).toHaveLength(1);
      expect(slotState(3).used).toBe(0);
    });

    it('concurrent cancels: one succeeds, one is rejected, exactly one release', async () => {
      const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
      const results = await Promise.allSettled([service.cancelShipment(7, s.id), service.cancelShipment(7, s.id)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(calls.release).toHaveLength(1);
      expect(slotState(3).used).toBe(0);
    });

    it('cancel racing a confirm never leaks: whichever commits first wins, the slot ends consistent', async () => {
      const s = await service.createShipment(7, dto({ providerId: 5, availabilityId: 3 }));
      await Promise.allSettled([service.cancelShipment(7, s.id), service.confirmShipment(7, s.id, {})]);
      const status = rows.get(s.id).status;
      expect([ShipmentStatus.CANCELLED, ShipmentStatus.CONFIRMED]).toContain(status);
      expect(slotState(3).used).toBe(status === ShipmentStatus.CANCELLED ? 0 : 1);
    });

    it('cancelling a shipment with no slot changes no capacity', async () => {
      const s = await service.createShipment(7, dto());
      await service.cancelShipment(7, s.id);
      expect(calls.release).toHaveLength(0);
    });
  });

  // ═══ snapshot immutability across the whole lifecycle ══════════════════
  it('the location snapshot is unchanged through create -> confirm -> retry -> concurrent confirm', async () => {
    const s = await service.createShipment(
      7,
      dto({
        providerId: 5, availabilityId: 3,
        originLocation: { displayLabel: 'Mbezi, Kinondoni', latitude: -6.75, longitude: 39.2, providerKey: 'tz_seed', resolutionMethod: 'admin_seed' },
        destinationLocation: { displayLabel: 'Ilemela, Mwanza' },
      }),
    );
    const snap = (id: number) => Object.fromEntries(SHIPMENT_LOCATION_SNAPSHOT_COLUMNS.map((c) => [c, rows.get(id)[c]]));
    const frozen = snap(s.id);
    expect(frozen.originLocationLabel).toBe('Mbezi, Kinondoni');
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
