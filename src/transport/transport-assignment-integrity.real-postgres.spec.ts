import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, EntityManager } from 'typeorm';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { TransportService } from './transport.service';
import { AssignmentStatus, TransportAssignment } from './entities/transport-assignment.entity';
import { TransportProvider, ProviderStatus, ConfirmMode, ProviderType } from './entities/transport-provider.entity';
import { AvailabilityStatus } from './entities/provider-availability.entity';
import { SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

/**
 * Stage 3S-B1 — Transport Assignment Integrity, proved against REAL
 * PostgreSQL: real transactions (BEGIN/COMMIT/ROLLBACK), real row locks
 * (SELECT ... FOR UPDATE), real concurrency, exercised through the REAL
 * TransportService.createAssignment/respondToAssignment/updateAssignmentStatus.
 *
 * Only Parcel/TransportAssignment/TransportProvider/ProviderAvailability/
 * SuperAgent are given tables here (plain raw SQL, not the full TypeORM
 * entity graph -- Parcel/Order/Shipment's real relation graph is far larger
 * than this slice touches; see shipment-capacity.real-postgres.spec.ts for
 * the same reasoning applied to Shipment). The REAL service methods run
 * unmodified against these tables through thin repository/EntityManager
 * shims that translate to plain SQL -- the atomic capacity primitives
 * (reserveSlotAtomic/releaseSlotAtomic) are untouched and run their own raw
 * SQL exactly as in production.
 *
 * Runs only against the repository's dedicated kentexa_b5b_test database
 * (resetB5BTestSchema's own safety gate); skipped, never failed, when
 * B5B_TEST_DB_PASSWORD is not configured. Never touches production or the
 * isolated Stage3KR staging environment. Does not implement or exercise
 * departSlot()/Movement/Run -- out of scope for this slice.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

// Same ambiguity slot-capacity.ts's own rowsOf() exists to handle: TypeORM
// returns either the plain row array, or [rows, affectedCount], for a
// DML query with RETURNING, depending on version/driver path. Every
// INSERT/UPDATE ... RETURNING below must normalise through this, or an
// occasional result silently comes back as [[{...}], N] instead of [{...}].
function rowsOf(result: any): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

/** Thin shim: TransportAssignment table access via plain SQL, bound to whatever
 * query runner (the outer DataSource or a transaction's EntityManager) is given. */
function assignmentRepoFor(runner: { query: (sql: string, params?: any[]) => Promise<any[]> }) {
  return {
    create: (v: any) => ({ ...v }),
    findOne: async ({ where = {}, order, lock }: any = {}) => {
      const conds: string[] = [];
      const params: any[] = [];
      for (const [col, val] of Object.entries(where)) {
        if (val === undefined) continue;
        params.push(val);
        conds.push(`"${col}" = $${params.length}`);
      }
      const orderSql = order?.id === 'DESC' ? 'ORDER BY id DESC' : '';
      const forUpdate = lock?.mode === 'pessimistic_write' ? 'FOR UPDATE' : '';
      const sql = `SELECT * FROM public.transport_assignment WHERE ${conds.join(' AND ') || 'true'} ${orderSql} LIMIT 1 ${forUpdate}`;
      const rows = rowsOf(await runner.query(sql, params));
      return rows[0] ?? null;
    },
    save: async (v: any) => {
      if ((assignmentRepoFor as any)._forceInsertFailure) {
        (assignmentRepoFor as any)._forceInsertFailure = false;
        throw new Error('connection terminated unexpectedly');
      }
      if (v.id != null) {
        // `v` here is the full row previously read back from the DB (it
        // already carries its own createdAt/updatedAt) -- exclude those plus
        // the primary key from the SET list so "updatedAt" is only ever
        // assigned once, by this method's own `now()`.
        const cols = Object.keys(v).filter((k) => !['id', 'createdAt', 'updatedAt'].includes(k));
        const set = cols.map((c, i) => `"${c}" = $${i + 2}`).join(', ');
        const rows = rowsOf(await runner.query(
          `UPDATE public.transport_assignment SET ${set}, "updatedAt" = now() WHERE id = $1 RETURNING *`,
          [v.id, ...cols.map((c) => (v[c] === undefined ? null : v[c]))],
        ));
        return rows[0];
      }
      const cols = Object.keys(v);
      const colNames = cols.map((c) => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const rows = rowsOf(await runner.query(
        `INSERT INTO public.transport_assignment (${colNames}) VALUES (${placeholders}) RETURNING *`,
        cols.map((c) => (v[c] === undefined ? null : v[c])),
      ));
      return rows[0];
    },
  };
}

function providerRepoFor(runner: { query: (sql: string, params?: any[]) => Promise<any[]> }) {
  return {
    findOne: async ({ where }: any) => {
      const rows = await runner.query(`SELECT * FROM public.transport_provider WHERE id = $1`, [where.id]);
      return rows[0] ?? null;
    },
    find: async ({ where }: any) => {
      const rows = await runner.query(`SELECT * FROM public.transport_provider WHERE "userId" = $1 ORDER BY id ASC`, [where.userId]);
      return rows;
    },
    update: async (id: number, patch: Record<string, any>) => {
      const sets: string[] = [];
      const params: any[] = [id];
      for (const [k, v] of Object.entries(patch)) {
        if (typeof v === 'function') sets.push(`"${k}" = ${v()}`);
        else { params.push(v); sets.push(`"${k}" = $${params.length}`); }
      }
      await runner.query(`UPDATE public.transport_provider SET ${sets.join(', ')} WHERE id = $1`, params);
    },
  };
}

suite('Stage 3S-B1 — TransportAssignment capacity/authority integrity, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let transport: TransportService;

  const mkProvider = async (o: Partial<{ status: ProviderStatus; confirmMode: ConfirmMode; businessId: number | null }> = {}) => {
    const rows = await ds.query(
      `INSERT INTO public.transport_provider (name, type, status, "confirmMode", "businessId") VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      ['Test Carrier', ProviderType.BUS, o.status ?? ProviderStatus.VERIFIED, o.confirmMode ?? ConfirmMode.MANUAL, o.businessId ?? null],
    );
    return rows[0] as TransportProvider;
  };
  const mkHub = async (o: Partial<{ userId: number; workspaceId: number | null; status: SuperAgentStatus }> = {}) => {
    const rows = await ds.query(
      `INSERT INTO public.super_agent ("userId", "workspaceId", status) VALUES ($1,$2,$3) RETURNING *`,
      [o.userId ?? 7, o.workspaceId ?? null, o.status ?? SuperAgentStatus.ACTIVE],
    );
    return rows[0] as any;
  };
  const mkSlot = async (providerId: number, o: Partial<{ totalSlots: number; totalCapacityKg: number; status: AvailabilityStatus }> = {}) => {
    const rows = await ds.query(
      `INSERT INTO public.provider_availability ("providerId", date, "totalSlots", "usedSlots", "totalCapacityKg", "usedCapacityKg", status)
       VALUES ($1, CURRENT_DATE, $2, 0, $3, 0, $4) RETURNING *`,
      [providerId, o.totalSlots ?? 5, o.totalCapacityKg ?? 100, o.status ?? AvailabilityStatus.OPEN],
    );
    return rows[0] as any;
  };
  const mkParcel = async (superAgentId: number, o: Partial<{ destinationSuperAgentId: number | null; weightKg: number }> = {}) => {
    const rows = await ds.query(
      `INSERT INTO public.parcel ("trackingNumber", "superAgentId", "destinationSuperAgentId", "originCity", "destinationCity", "weightKg")
       VALUES ($1,$2,$3,'Dar es Salaam','Mwanza',$4) RETURNING *`,
      [`KTX-TEST-${Math.random().toString(36).slice(2, 10)}`, superAgentId, o.destinationSuperAgentId ?? null, o.weightKg ?? null],
    );
    return rows[0] as any;
  };
  const slotRow = async (id: number) => {
    const [r] = await ds.query(
      `SELECT "usedSlots"::int AS used, "usedCapacityKg"::text AS kg, status FROM public.provider_availability WHERE id = $1`, [id]);
    return r as { used: number; kg: string; status: string };
  };
  const assignmentsFor = async (parcelId: number) =>
    ds.query(`SELECT * FROM public.transport_assignment WHERE "parcelRefId" = $1 ORDER BY id ASC`, [parcelId]);
  const settle = async <T,>(ps: Array<Promise<T>>) => {
    const r = await Promise.allSettled(ps);
    return { ok: r.filter((x): x is PromiseFulfilledResult<T> => x.status === 'fulfilled'), bad: r.filter((x) => x.status === 'rejected') as PromiseRejectedResult[] };
  };
  // Deliberately `any` and minimal, matching this codebase's other real-PG
  // RoleContext fixtures (e.g. super-agents.agent-delivery.real-postgres.spec.ts):
  // only the fields resolveAssigningHub()/updateAssignmentStatus() actually read.
  const ctx = (o: Partial<{ userId: number; roleType: AccountRoleType; profileId: number; workspaceId: number | null }> = {}): any => ({
    userId: o.userId ?? 7, roleType: o.roleType ?? AccountRoleType.SUPER_AGENT,
    profileId: o.profileId ?? 0, workspaceId: o.workspaceId ?? null,
  });

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: false, extra: { max: 30 }, entities: [],
    });
    await ds.initialize();

    await ds.query(`CREATE TABLE public.transport_provider (
      id serial PRIMARY KEY, "userId" int, name varchar, type varchar, status varchar NOT NULL,
      "confirmMode" varchar NOT NULL DEFAULT 'manual', "businessId" int,
      "totalAssignments" int NOT NULL DEFAULT 0, "completedAssignments" int NOT NULL DEFAULT 0)`);
    await ds.query(`CREATE TABLE public.super_agent (
      id serial PRIMARY KEY, "userId" int, "workspaceId" int, status varchar NOT NULL)`);
    await ds.query(`CREATE TABLE public.provider_availability (
      id serial PRIMARY KEY, "providerId" int NOT NULL, "routeId" int, date date NOT NULL,
      "totalSlots" int NOT NULL DEFAULT 0, "usedSlots" int NOT NULL DEFAULT 0,
      "totalCapacityKg" numeric(8,2) NOT NULL DEFAULT 0, "usedCapacityKg" numeric(8,2) NOT NULL DEFAULT 0,
      status varchar NOT NULL DEFAULT 'open',
      "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`);
    await ds.query(`CREATE TABLE public.parcel (
      id serial PRIMARY KEY, "trackingNumber" varchar, "superAgentId" int, "destinationSuperAgentId" int,
      "orderId" int, "shipmentId" int, "originCity" varchar, "destinationCity" varchar, "weightKg" numeric(8,2))`);
    await ds.query(`CREATE TABLE public.transport_assignment (
      id serial PRIMARY KEY, "trackingNumber" varchar, "orderId" int, "parcelId" int, "shipmentId" int,
      "parcelRefId" int, "orderRefId" int, "shipmentRefId" int, "assignedById" int NOT NULL,
      "providerId" int NOT NULL, "availabilityId" int, "fromCity" varchar, "toCity" varchar,
      status varchar NOT NULL, "parcelCount" int NOT NULL DEFAULT 1, "weightKg" numeric(8,2) NOT NULL DEFAULT 0,
      "agreedPrice" numeric(10,2), "scheduledDeparture" varchar, "superAgentNotes" text,
      "acceptedAt" timestamp, "collectedAt" timestamp, "collectionProofUrl" varchar,
      "departedAt" timestamp, "departureProofUrl" varchar, "arrivedAt" timestamp, "arrivalProofUrl" varchar,
      "completedAt" timestamp, "providerNotes" text, "declineReason" varchar,
      "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`);

    // Wraps a REAL transaction's EntityManager so getRepository(TransportAssignment /
    // TransportProvider) resolves to the plain-SQL shims above, bound to THIS
    // transaction's own connection (so locks/atomicity are the genuine article) --
    // everything else (manager.query, used directly by createAssignment's row lock
    // and by slot-capacity.ts's atomic UPDATEs) passes straight through untouched.
    const wrapManager = (m: EntityManager) =>
      new Proxy(m, {
        get(target, prop, recv) {
          if (prop === 'getRepository') {
            return (cls: any) => {
              if (cls === TransportAssignment) return assignmentRepoFor(target);
              if (cls === TransportProvider) return providerRepoFor(target);
              throw new Error(`unexpected getRepository(${cls?.name}) in this slice's test double`);
            };
          }
          return Reflect.get(target, prop, recv);
        },
      });
    const fakeDataSource: any = {
      transaction: (fn: any) => ds.transaction((m) => fn(wrapManager(m))),
    };

    const args: any[] = new Array(15).fill({});
    args[0] = providerRepoFor(ds); // providerRepo
    args[2] = { findOne: async ({ where }: any) => (await ds.query(`SELECT * FROM public.provider_availability WHERE id = $1`, [where.id]))[0] ?? null }; // availabilityRepo
    args[3] = assignmentRepoFor(ds); // assignmentRepo (unlocked pre-checks only)
    args[6] = {
      findOne: async ({ where }: any) => {
        const row = (await ds.query(
          `SELECT * FROM public.parcel WHERE ${where.id != null ? 'id = $1' : '"trackingNumber" = $1'}`,
          [where.id ?? where.trackingNumber],
        ))[0];
        if (!row) return null;
        return {
          ...row,
          superAgent: row.superAgentId != null ? { id: row.superAgentId } : null,
          destinationSuperAgent: row.destinationSuperAgentId != null ? { id: row.destinationSuperAgentId } : null,
          order: row.orderId != null ? { id: row.orderId } : null,
          shipment: row.shipmentId != null ? { id: row.shipmentId } : null,
        };
      },
    }; // parcelRepo
    args[8] = {
      findOne: async ({ where }: any) => {
        const rows = await ds.query(
          `SELECT * FROM public.super_agent WHERE id = $1 AND "userId" = $2 AND status = $3`,
          [where.id, where.userId, where.status],
        );
        return rows[0] ?? null;
      },
      find: async ({ where }: any) => {
        const uid = where.user?.id ?? where.userId;
        return ds.query(`SELECT * FROM public.super_agent WHERE "userId" = $1 ORDER BY id ASC`, [uid]);
      },
    }; // superAgentRepo
    args[10] = { award: async () => {} }; // reputationService
    args[14] = fakeDataSource; // dataSource
    transport = new (TransportService as any)(...args);
  });

  afterAll(async () => {
    if (ds) await ds.destroy().catch(() => {});
  });

  beforeEach(async () => {
    await ds.query(`TRUNCATE TABLE public.transport_assignment RESTART IDENTITY`);
    await ds.query(`TRUNCATE TABLE public.parcel, public.provider_availability, public.super_agent, public.transport_provider RESTART IDENTITY CASCADE`);
    (assignmentRepoFor as any)._forceInsertFailure = false;
  });

  // ── 1. concurrency: only one of two DIFFERENT parcels can win the final slot ──
  it('two concurrent requests for DIFFERENT parcels competing for the final slot: exactly one succeeds', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 1 });
    const [pa, pb] = await Promise.all([mkParcel(hub.id), mkParcel(hub.id)]);
    const context = ctx({ profileId: hub.id });

    const { ok, bad } = await settle([
      transport.createAssignment({ id: 7 } as any, { parcelId: pa.id, providerId: provider.id, availabilityId: slot.id }, context),
      transport.createAssignment({ id: 7 } as any, { parcelId: pb.id, providerId: provider.id, availabilityId: slot.id }, context),
    ]);
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBeInstanceOf(ConflictException);
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '1.00', status: 'full' });
    const [wonParcel, lostParcel] = ok[0].value.parcelRefId === pa.id ? [pa, pb] : [pb, pa];
    expect(await assignmentsFor(wonParcel.id)).toHaveLength(1);
    expect(await assignmentsFor(lostParcel.id)).toHaveLength(0);
  });

  it('the KG bound cannot be oversubscribed under concurrency (N parcels, room for fewer)', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 100, totalCapacityKg: 10 });
    const parcels = await Promise.all(Array.from({ length: 8 }, () => mkParcel(hub.id, { weightKg: 3 })));
    const context = ctx({ profileId: hub.id });

    const { ok } = await settle(
      parcels.map((p) => transport.createAssignment({ id: 7 } as any, { parcelId: p.id, providerId: provider.id, availabilityId: slot.id }, context)),
    );
    expect(ok).toHaveLength(3); // 3 x 3kg = 9kg fits; a 4th (12kg) never does
    expect(await slotRow(slot.id)).toEqual({ used: 3, kg: '9.00', status: 'open' });
  });

  // ── 2. reservation failure creates no assignment ──────────────────────────
  it('reservation failure (slot already full) creates no assignment and leaves the slot untouched', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const full = await mkSlot(provider.id, { totalSlots: 1 });
    await ds.query(`UPDATE public.provider_availability SET "usedSlots" = 1, status = 'full' WHERE id = $1`, [full.id]);
    const parcel = await mkParcel(hub.id);
    const context = ctx({ profileId: hub.id });

    await expect(transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: full.id }, context))
      .rejects.toThrow(ConflictException);
    expect(await assignmentsFor(parcel.id)).toHaveLength(0);
    expect(await slotRow(full.id)).toEqual({ used: 1, kg: '0.00', status: 'full' });
  });

  // ── 3. a failure AFTER reservation rolls the reservation back too ─────────
  it('an assignment-insert failure after a successful reservation rolls the reservation back (all-or-nothing)', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 5 });
    const parcel = await mkParcel(hub.id, { weightKg: 4 });
    const context = ctx({ profileId: hub.id });

    (assignmentRepoFor as any)._forceInsertFailure = true;
    await expect(transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id }, context))
      .rejects.toThrow('connection terminated unexpectedly');
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' }); // reservation rolled back WITH the failed insert
    expect(await assignmentsFor(parcel.id)).toHaveLength(0);

    // and a clean retry afterwards succeeds normally, reserving exactly once
    await transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id }, context);
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '4.00', status: 'open' });
  });

  // ── 4. retry does not double-reserve ───────────────────────────────────────
  it('a sequential retry (same dto, e.g. after a client timeout) reuses the SAME assignment, never a second reservation', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 5 });
    const parcel = await mkParcel(hub.id, { weightKg: 4 });
    const context = ctx({ profileId: hub.id });
    const dto = { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id };

    const first = await transport.createAssignment({ id: 7 } as any, dto, context);
    const retried = await transport.createAssignment({ id: 7 } as any, dto, context);
    expect(retried.id).toBe(first.id);
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '4.00', status: 'open' });
    expect(await assignmentsFor(parcel.id)).toHaveLength(1);
  });

  it('a CONCURRENT retry (same dto fired twice at once) still reuses one assignment, never double-reserves', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 5 });
    const parcel = await mkParcel(hub.id, { weightKg: 4 });
    const context = ctx({ profileId: hub.id });
    const dto = { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id };

    const { ok, bad } = await settle([
      transport.createAssignment({ id: 7 } as any, dto, context),
      transport.createAssignment({ id: 7 } as any, dto, context),
    ]);
    expect(bad).toHaveLength(0); // a genuine retry of the SAME request never fails
    expect(ok[0].value.id).toBe(ok[1].value.id);
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '4.00', status: 'open' });
    expect(await assignmentsFor(parcel.id)).toHaveLength(1);
  });

  it('two DIFFERENT slots (different providers) racing for the SAME parcel at once: only one wins, never both', async () => {
    // Unlike the slot-capacity race above, reserveSlotAtomic's own UPDATE
    // cannot serialise this by itself -- it touches two DIFFERENT
    // provider_availability rows, one per call. The parcel row lock
    // (SELECT ... FOR UPDATE at the top of the transaction) is what actually
    // prevents a parcel from being reserved on two different carriers'
    // capacity at once.
    const [p1, p2] = await Promise.all([mkProvider(), mkProvider()]);
    const hub = await mkHub();
    const [s1, s2] = await Promise.all([mkSlot(p1.id), mkSlot(p2.id)]);
    const parcel = await mkParcel(hub.id);
    const context = ctx({ profileId: hub.id });

    const { ok, bad } = await settle([
      transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: p1.id, availabilityId: s1.id }, context),
      transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: p2.id, availabilityId: s2.id }, context),
    ]);
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBeInstanceOf(ConflictException);
    expect(await assignmentsFor(parcel.id)).toHaveLength(1);
    // exactly one of the two slots was actually reserved -- never both
    const usedTotal = (await slotRow(s1.id)).used + (await slotRow(s2.id)).used;
    expect(usedTotal).toBe(1);
  });

  it('a DIFFERENT provider/slot for the SAME parcel while a live assignment exists is a real conflict, not a retry', async () => {
    const [p1, p2] = await Promise.all([mkProvider(), mkProvider()]);
    const hub = await mkHub();
    const [s1, s2] = await Promise.all([mkSlot(p1.id), mkSlot(p2.id)]);
    const parcel = await mkParcel(hub.id);
    const context = ctx({ profileId: hub.id });

    await transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: p1.id, availabilityId: s1.id }, context);
    await expect(transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: p2.id, availabilityId: s2.id }, context))
      .rejects.toThrow('This parcel already has an active transport assignment');
    expect(await slotRow(s2.id)).toEqual({ used: 0, kg: '0.00', status: 'open' }); // never reserved for the rejected request
  });

  // ── 5. cancellation releases exactly once, idempotently ───────────────────
  it('N concurrent + retried cancellations of the SAME assignment release capacity exactly once', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 5 });
    const parcel = await mkParcel(hub.id, { weightKg: 3 });
    const context = ctx({ profileId: hub.id });
    const assignment = await transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id }, context);
    await ds.query(`UPDATE public.transport_assignment SET status = 'accepted' WHERE id = $1`, [assignment.id]);

    const { ok, bad } = await settle(
      Array.from({ length: 6 }, () => transport.updateAssignmentStatus({ id: 7 } as any, assignment.id, { status: AssignmentStatus.CANCELLED }, context)),
    );
    expect(bad).toHaveLength(0); // every retry succeeds -- idempotent, not rejected
    expect(ok.every((r) => r.value.status === AssignmentStatus.CANCELLED)).toBe(true);
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' }); // released exactly once, not 6 times
  });

  it('a sequential re-cancel after the first commits is a pure no-op (no second release, no error)', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 5 });
    const parcel = await mkParcel(hub.id, { weightKg: 3 });
    const context = ctx({ profileId: hub.id });
    const assignment = await transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id }, context);
    await ds.query(`UPDATE public.transport_assignment SET status = 'accepted' WHERE id = $1`, [assignment.id]);

    await transport.updateAssignmentStatus({ id: 7 } as any, assignment.id, { status: AssignmentStatus.CANCELLED }, context);
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
    const again = await transport.updateAssignmentStatus({ id: 7 } as any, assignment.id, { status: AssignmentStatus.CANCELLED }, context);
    expect(again.status).toBe(AssignmentStatus.CANCELLED);
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' }); // still 0, never went negative
  });

  // ── respondToAssignment: decline releases exactly once, idempotently ─────
  it('N concurrent decline responses on the SAME pending assignment release capacity exactly once', async () => {
    const provider = await mkProvider({ confirmMode: ConfirmMode.MANUAL });
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 5 });
    const parcel = await mkParcel(hub.id, { weightKg: 2 });
    const assignment = await transport.createAssignment(
      { id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id }, ctx({ profileId: hub.id }),
    );
    expect(assignment.status).toBe(AssignmentStatus.PENDING);
    await ds.query(`UPDATE public.transport_provider SET "userId" = 3 WHERE id = $1`, [provider.id]);

    const { ok, bad } = await settle(
      Array.from({ length: 6 }, () => transport.respondToAssignment(3, assignment.id, false, 'no capacity')),
    );
    expect(bad).toHaveLength(0); // every retry succeeds -- idempotent, not rejected
    expect(ok.every((r) => r.value.status === AssignmentStatus.DECLINED)).toBe(true);
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' }); // released exactly once
  });

  it('accepting after a decline already committed is refused, not silently re-accepted', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalSlots: 5 });
    const parcel = await mkParcel(hub.id);
    const assignment = await transport.createAssignment(
      { id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id }, ctx({ profileId: hub.id }),
    );
    await ds.query(`UPDATE public.transport_provider SET "userId" = 3 WHERE id = $1`, [provider.id]);
    await transport.respondToAssignment(3, assignment.id, false);
    await expect(transport.respondToAssignment(3, assignment.id, true)).rejects.toThrow();
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
  });

  // ── 6. wrong Business/workspace/Super-Agent context fails closed ──────────
  describe('canonical RoleContext authority fails closed', () => {
    it('impersonation: RoleContext.userId does not match the caller', async () => {
      const provider = await mkProvider();
      const hub = await mkHub({ userId: 7 });
      const slot = await mkSlot(provider.id);
      const parcel = await mkParcel(hub.id);
      await expect(transport.createAssignment({ id: 999 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id },
        ctx({ userId: 7, profileId: hub.id }))).rejects.toThrow(ForbiddenException);
      expect(await assignmentsFor(parcel.id)).toHaveLength(0);
    });

    it('a SUSPENDED/PENDING hub profile cannot create an assignment even if it is the caller\'s own row', async () => {
      const provider = await mkProvider();
      const hub = await mkHub({ status: SuperAgentStatus.SUSPENDED });
      const slot = await mkSlot(provider.id);
      const parcel = await mkParcel(hub.id);
      await expect(transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id },
        ctx({ profileId: hub.id }))).rejects.toThrow(ForbiddenException);
      expect(await assignmentsFor(parcel.id)).toHaveLength(0);
    });

    it('a workspace mismatch between the acting context and the hub profile fails closed', async () => {
      const provider = await mkProvider();
      const hub = await mkHub({ workspaceId: 42 });
      const slot = await mkSlot(provider.id);
      const parcel = await mkParcel(hub.id);
      await expect(transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id },
        ctx({ profileId: hub.id, workspaceId: 99 }))).rejects.toThrow(ForbiddenException);
      expect(await assignmentsFor(parcel.id)).toHaveLength(0);
    });

    it('an unrelated active role (buyer) with no admin/manager authority is rejected', async () => {
      const provider = await mkProvider();
      const hub = await mkHub();
      const slot = await mkSlot(provider.id);
      const parcel = await mkParcel(hub.id);
      await expect(transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id },
        ctx({ profileId: hub.id, roleType: AccountRoleType.BUYER }))).rejects.toThrow(ForbiddenException);
      expect(await assignmentsFor(parcel.id)).toHaveLength(0);
    });

    it('a hub profile id that is not the caller\'s own is rejected even with the right role type', async () => {
      const provider = await mkProvider();
      const otherHub = await mkHub({ userId: 8 });
      const slot = await mkSlot(provider.id);
      const parcel = await mkParcel(otherHub.id);
      await expect(transport.createAssignment({ id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id },
        ctx({ userId: 7, profileId: otherHub.id }))).rejects.toThrow(ForbiddenException);
      expect(await assignmentsFor(parcel.id)).toHaveLength(0);
    });
  });

  // ── 7. same Business legitimately owning BOTH capabilities is not penalised ──
  it('a Business that owns BOTH a Super Agent hub and a Transport Provider is unaffected — capability-scoped, not identity-scoped', async () => {
    const businessId = 42;
    const ownProvider = await mkProvider({ businessId }); // the SAME business's own transport arm
    const otherCarrier = await mkProvider(); // an unrelated carrier being booked
    const hub = await mkHub({ workspaceId: businessId }); // the SAME business's hub
    const slot = await mkSlot(otherCarrier.id);
    const parcel = await mkParcel(hub.id);

    const assignment = await transport.createAssignment(
      { id: 7 } as any,
      { parcelId: parcel.id, providerId: otherCarrier.id, availabilityId: slot.id },
      ctx({ profileId: hub.id, workspaceId: businessId }),
    );
    expect(assignment.status).toBe(AssignmentStatus.PENDING);
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '1.00', status: 'open' });
    expect(ownProvider.businessId).toBe(businessId); // sanity: really is the same Business's own transport arm
  });

  // ── administrative fallback (unchanged legacy behaviour) ──────────────────
  it('an admin who themself unambiguously owns exactly one Super Agent row may still create an assignment', async () => {
    const provider = await mkProvider();
    const hub = await mkHub({ userId: 55 });
    const slot = await mkSlot(provider.id);
    const parcel = await mkParcel(hub.id);
    const assignment = await transport.createAssignment(
      { id: 55 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id },
      ctx({ userId: 55, roleType: AccountRoleType.ADMIN }),
    );
    expect(assignment).toBeDefined();
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '1.00', status: 'open' });
  });

  it('an admin with no Super Agent row at all is rejected (unchanged legacy behaviour)', async () => {
    const provider = await mkProvider();
    const hub = await mkHub({ userId: 7 });
    const slot = await mkSlot(provider.id);
    const parcel = await mkParcel(hub.id);
    await expect(transport.createAssignment(
      { id: 999 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id },
      ctx({ userId: 999, roleType: AccountRoleType.ADMIN }),
    )).rejects.toThrow(ForbiddenException);
    expect(await assignmentsFor(parcel.id)).toHaveLength(0);
  });

  // ── KG weight consistency (fixed alongside the transaction wrap) ──────────
  it('an omitted weightKg reserves capacity for the PARCEL\'s own declared weight, not a flat 1kg default', async () => {
    const provider = await mkProvider();
    const hub = await mkHub();
    const slot = await mkSlot(provider.id, { totalCapacityKg: 10 });
    const parcel = await mkParcel(hub.id, { weightKg: 7 });
    const assignment = await transport.createAssignment(
      { id: 7 } as any, { parcelId: parcel.id, providerId: provider.id, availabilityId: slot.id }, // no weightKg in dto
      ctx({ profileId: hub.id }),
    );
    expect(Number(assignment.weightKg)).toBe(7);
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '7.00', status: 'open' });
  });
});
