# Stage 3S Transport/Movement Integration — implementation-readiness audit

Audit only. No production/staging touched, nothing deployed, Movement/Run not implemented.
Base: `feature/stage3s-a-collection-handoff` @ `1ff9233f` (production schema + #47 + #49 + PR#56 +
approved 3S-A), on branch `audit/stage3s-transport-movement-readiness`. Fully separate from
`feature/stage3kr-recipient-journey` (`e2205fd` → `be02e3b` → `385183f`), which this audit does not
touch, rebase, or mix with.

## 1. Architecture map — what exists today, wired end to end

```
Demand                    Capacity                 Assignment/movement          Custody (ledger)
──────                    ────────                 ────────────────────         ────────────────
Shipment (shipments/)     TransportProvider         TransportAssignment         parcel_custody_event
 .weightKg                 .defaultMaxWeightKg       (assigned->accepted->      (immutable; see below)
 .providerId (selection)   (informational only)       collected->departed->
 .routeId (selection)                                 arrived->completed)
 .availabilityId  ───┐     TransportRoute
                     │      (INTERCITY / LOCAL_LOOP
                     │       / LAST_MILE — a van
                     │       loop is already a
                     │       route TYPE, not a
                     │       separate table)
                     │
                     └──▶  ProviderAvailability   ◀── the actual "one physical trip"
                            .totalSlots/usedSlots      abstraction: N Shipments/
                            .totalCapacityKg/          TransportAssignments can
                             usedCapacityKg            already share one row
                            .status (open/full/
                             departed/cancelled)

Parcel (super-agents/)  ── 1:1 ──  Shipment (via shipment.entity's Parcel FK)
 .superAgent / .destinationSuperAgent  = origin/destination hub (Stage 2F decision)
 .status (PENDING … DELIVERED)

parcel_custody_event (immutable ledger; Stage 3K-3R + 3S-A)
 kinds relevant here: origin_hub_received, transport_provider_collected,
 destination_hub_received, destination_agent_received, recipient_agent_delivery, …
 3S-A additionally added: collection_received_at_origin_hub, seller_collected_by_agent
 (Agent → hub first mile, gated by first-mile-guard.ts's assertFirstMileComplete)
```

**Reused as-is, no redesign needed:**
- `Shipment` is already the generic "someone wants to move something" demand object — not
  parcel/product-specific. `createShipment`/`confirmShipment` in `shipments/shipments.service.ts`
  already do capacity-safe slot attach, Stage 2F hub decision, and idempotent Parcel creation.
- `ProviderAvailability` is already the "one physical departure" concept (a trip with slots +
  kg capacity that many demand rows can share). This is the natural Movement anchor — see §4.
- `parcel_custody_event` already has a `transport_provider_collected` kind and an
  `assignmentId` column, and `TransportService.collectAssignedParcel`
  (`src/transport/transport.service.ts:955`) already writes it, gated by
  `assertFirstMileComplete` (3S-A) before an assignment can even be marked COLLECTED. Reuse this
  gate; do not invent a second collection-evidence mechanism for Movement.
- `slot-capacity.ts`'s two atomic primitives (`reserveSlotAtomic`/`releaseSlotAtomic`, one
  conditional `UPDATE … RETURNING`, arithmetic done in Postgres) are the correct pattern for any
  future Movement capacity write. Reuse them; do not reintroduce JS read-modify-write.
- `TransportRoute.routeType` already has `LOCAL_LOOP` for "a van doing a daily circuit" — the Van
  case was already modeled as a `TransportProvider` route type, confirming the mission's own
  instruction ("Kentexa Van is one transport supply/use case, not a separate logistics domain")
  was the original intent, even though `daily-batches/` (built earlier) does not follow it — see §3.

## 2. Where KG/capacity is authoritative today

| Column | Role |
|---|---|
| `TransportProvider.defaultMaxWeightKg/defaultParcelCapacity` | informational defaults only; not read by any reservation code path |
| `ProviderAvailability.totalCapacityKg/usedCapacityKg`, `.totalSlots/usedSlots` | **the authoritative reservation ledger** — every real capacity check and mutation goes through `slot-capacity.ts` against these four columns |
| `Shipment.weightKg` | the demand figure passed into `reserveSlot`/`reserveCapacity` |
| `TransportAssignment.weightKg` | a **second, independently-settable** copy of the demand figure (`createAssignment` lets the caller override it via `dto.weightKg`, decoupled from `parcel.weightKg`/`shipment.weightKg`) — informational/display, not itself load-bearing for capacity math |
| `Parcel.weightKg` | physical-parcel record, used for display and as the createAssignment fallback when no override is given |

So there is one true capacity ledger (`ProviderAvailability`), fed by two independent call
sites with different safety guarantees (§3).

## 3. Is assignment capacity transaction-safe and concurrency-safe?

**The primitive is; one of its two callers is not, by an existing, deliberate design choice —
not a silent defect.**

- **Shipment path (`shipments.service.ts:465-526`, `confirmShipment` ~`607-717`) — safe.**
  Slot attach/switch is inside the same DB transaction as the Shipment write
  (`shipmentRepo.manager.transaction`), uses the **strict** `reserveSlotAtomic` (re-asserts
  status/date/provider/route/kg inside the `UPDATE`'s `WHERE`), and **throws** `ConflictException`
  when the conditional update matches nothing — so a lost race never silently proceeds. Slot
  switching even orders its two writes by slot id to avoid deadlocking against another shipment
  switching in the opposite direction (`shipments.service.ts:685-693`).
- **Legacy Super-Agent path (`transport.service.ts:1024-1143`, `createAssignment`) — not
  transactional, and its reservation result is discarded by design.** It pre-checks
  `availability.usedSlots >= availability.totalSlots` (a plain read, no lock), then calls
  `this.reserveCapacity(...)` — which wraps the **non-strict** `reserveSlotAtomic` (same one
  conditional `UPDATE`, so the counter itself can never go negative or over `totalSlots`) but
  **does not check its boolean return value**, and the `TransportAssignment` insert that follows
  is a separate statement, not part of a transaction with the reservation. This is confirmed as
  intentional, not an oversight: `transport-capacity.spec.ts:202-208` explicitly asserts
  `reserveCapacity` "keeps its no-throw contract." The practical consequence: two callers racing
  for the last slot can both have their `TransportAssignment` row created, even though the
  `usedSlots`/`usedCapacityKg` counters themselves stay correctly capped — i.e. the **ledger
  can't overflow, but assignment-vs-capacity can still disagree** on this path. `respondToAssignment`
  and `updateAssignmentStatus`'s CANCELLED branch do correctly call `releaseCapacity` to give
  slots back, using the same atomic primitive.
- **Practical exposure today:** low but real — `createAssignment` is the Super Agent's manual
  "assign this parcel to a provider" action (`transport.controller.ts:165`), used one parcel at a
  time by a human, not a high-concurrency path. It should be brought up to the Shipment path's
  standard (wrap in a transaction, use strict `reserveSlot` or at least check
  `reserveCapacity`'s/`reserveSlotAtomic`'s return and throw on `false`) before Movement/Run adds
  any higher-volume, multi-parcel attach flow on top of it — a Run that boards N parcels onto one
  trip must not inherit this gap at greater scale.

## 4. How one physical departure can already carry multiple shipments/parcels — without a new domain

It already can, today, through `ProviderAvailability`: any number of `Shipment`s (via
`availabilityId`) and any number of `TransportAssignment`s (via `availabilityId`) can point at the
**same** slot row, and each reservation/release only ever touches the aggregate counters — no
per-item vehicle/trip table is needed to represent "these N things are on the same departure."

**What is missing is a single, atomic, trip-level lifecycle event.** Today:
- `ProviderAvailability.status` includes `DEPARTED`/`CANCELLED`, but **grep across the whole
  codebase finds no writer that ever sets a slot to `DEPARTED`** — only `CANCELLED` is reachable
  (via provider-availability's own cancel path, not audited here) and `FULL`/`OPEN` (via the
  capacity primitives). A slot can be fully booked and every one of its assignments individually
  marked `DEPARTED`/`ARRIVED`/`COMPLETED` (`transport.service.ts:1224-1253`, one row at a time,
  no shared trip-level write) while the slot row itself never reflects that the vehicle actually
  left — there is no single fact "this trip departed at 18:05" that every attached parcel's
  custody/tracking can hang off atomically, and no enforcement that every assignment on one slot
  reaches DEPARTED together (an operator could depart 8 of 10 parcels' assignments and forget two).
  This is the concrete gap a Movement/Run entity should close: **not** a new place to hold
  parcels, but a **new event/lock boundary that closes a `ProviderAvailability` slot exactly
  once and fans that single fact out to every attached demand row and custody event**, mirroring
  how `syncParcelFromAssignment` (`transport.service.ts:908-950`) already fans a per-assignment
  `DEPARTED` out to its own Parcel/Shipment.

## 5. Where explicit carrier collection/custody already connects — reuse this, do not duplicate

`TransportService.collectAssignedParcel` (`transport.service.ts:955-1022`) is the existing,
correct pattern for a Movement/Run's own carrier-custody moment:
1. Locks the parcel and its assignment (`FOR UPDATE`, in a `dataSource.transaction`).
2. Requires the caller to be the **assigned provider acting in the `TRANSPORT_PROVIDER` role**
   (`context.profileId === provider.id`, `RoleContext`-checked in `updateAssignmentStatus:1188-1193`
   before this is even called) — not just "any user who happens to own a provider row."
3. Requires 3S-A's `assertFirstMileComplete` to already hold (the parcel must have real
   origin-hub or Agent-collection custody before it can be considered collected by transport).
4. Requires the *previous* custody event to already say `super_agent → hub.id` (re-read from the
   ledger, not trusted from the parcel row) before writing
   `transport_provider_collected: super_agent(hub) → transport_provider`.
5. Only then moves the Parcel to `DISPATCHED` and writes one `ParcelTracking` row.

A Movement/Run "close this trip" action should reuse exactly this shape — lock, re-check the
*previous* custody event per parcel (not a cached status), one immutable custody row per parcel
per physical event — rather than introducing a parallel movement-level status field that could
drift from the ledger `syncParcelFromAssignment` already treats as authoritative
(`transport.service.ts:876-892`, `PARCEL_SYNC_BLOCKED` already refuses to let a stale transport
event drag a parcel backwards once a hub/recipient has taken over).

## 6. Super Agent + Transport Provider on one Business — already capability-separated, one gap

`TransportProvider.businessId` and `SuperAgent`'s (workspace-scoped, not audited in this file)
binding are independent columns on independent tables — a Business can hold both capabilities.
The **security-critical** transition (`collectAssignedParcel`) is already gated correctly: it
requires `RoleContext.roleType === TRANSPORT_PROVIDER` specifically (checked one level up, in
`updateAssignmentStatus`), not merely "this user has a provider row somewhere" — so a person
switching between acting as the Super Agent hub and acting as the Transport Provider for the same
Business cannot collect their own hub's parcel just because both profiles exist under one
Business; they must be *actively* in the Transport Provider role to do it.

**The one inconsistency:** `createAssignment`'s Super-Agent-side authority check
(`findCallerSuperAgent`, `transport.service.ts:125-128`) is **not** `RoleContext`-aware — it only
asks "does this user id own exactly one SuperAgent row" (fail-closed on 0 or 2+, but blind to
which role is currently active), unlike `collectAssignedParcel`'s provider-side check. For a
Business that holds both capabilities, a caller currently active as Transport Provider could
still create a *new* assignment as if acting as the hub, since that check never consults
`RoleContext` at all. Lower severity than a custody transfer (it doesn't move a parcel's
custody, just creates a pending assignment another party must still accept/collect), but worth
closing in the same pass as the createAssignment transaction gap in §3, for consistency with the
rest of the RoleContext rollout already applied to `confirmArrived`/`collectAssignedParcel`/etc.

## 7. What already conflicts with a Movement/Run foundation (not just "missing")

`daily-batches/` (`DailyBatch` + `BatchParcel`, ~1355-line service, actively built, not a stub)
is a **third, fully independent small-parcel logistics domain** that predates this audit's base
and does **not** participate in any of the above:
- `BatchParcel` links directly to `Order` (`daily-batches/entities/batch-parcel.entity.ts:39`),
  bypassing `Parcel`/`Shipment` entirely.
- Its own status enum (`AWAITING_HANDOVER → AT_HUB → ON_VAN → AT_ZONE → OUT_FOR_DELIVERY →
  DELIVERED/RETURNED`) never writes a `ParcelCustodyEvent` row — confirmed by grep: zero
  references to `TransportProvider`, `ProviderAvailability`, `transport_assignment`, or
  `providerId` anywhere in `daily-batches.service.ts`.
- `DailyBatch` itself (`daily_batch` table: `runDate`, `cutoffTime`,
  `plannedDepartureTime`/`actualDepartureTime`, `driverName/Phone`, `vehicleInfo`) is
  *structurally* almost exactly the Movement/Run shape this audit was asked to assess readiness
  for — it already proves "one physical departure, many parcels, planned vs actual timing, driver
  and vehicle info" works as a pattern — but it is hardwired to one van route ("Kariakoo → …") with
  no link to `TransportProvider`/`TransportRoute` at all, even though `RouteType.LOCAL_LOOP` was
  seemingly built to describe exactly this case.

This is the audit's central architectural risk, not a code defect: **a Movement/Run entity built
directly on `ProviderAvailability`/`TransportAssignment` would leave `daily-batches` as a
permanent second, custody-blind logistics island**, unless the smallest next slice explicitly
plans a path for `DailyBatch` to become a `ProviderAvailability`-backed instance of the same
Movement/Run concept rather than growing further in parallel. Nothing in this audit changes or
migrates `daily-batches` — flagging it is the finding.

## 8. Smallest next implementation slice, after Stage 3K–3R closes

Given everything above, the smallest safe slice is **not** a new Movement/Run table yet. It is:

1. **Close the two `createAssignment` gaps (§3, §6)** — small, isolated, no schema change: wrap
   the parcel/provider/availability validation + `reserveCapacity` + `TransportAssignment` insert
   in one `dataSource.transaction`; check `reserveSlotAtomic`'s return (or switch to the existing
   strict `reserveSlot` with a `ConflictException` on `false`, matching the Shipment path); make
   the Super-Agent-side authority check `RoleContext`-aware like `collectAssignedParcel`'s
   provider-side check already is. This removes the one place today where an assignment can exist
   without a genuinely held slot — a prerequisite before any Movement/Run flow boards multiple
   parcels onto one trip through the same code paths.
2. **Give `ProviderAvailability` its missing `DEPARTED` writer**, as one new, narrow, transactional
   method (e.g. `TransportService.departSlot(availabilityId, …)`): lock the slot row, require it
   `OPEN`/`FULL` and not already `DEPARTED`/`CANCELLED`, set `status = DEPARTED` plus an
   `actualDepartedAt` timestamp (new column), and — inside the same transaction — walk every
   `TransportAssignment` still `ACCEPTED`/`COLLECTED` on that `availabilityId` and require each to
   already have gone through `collectAssignedParcel` (so it has its own
   `transport_provider_collected` custody row) before allowing the slot-level departure to commit;
   only after commit, fan the existing per-assignment `updateAssignmentStatus(DEPARTED)` +
   `syncParcelFromAssignment` path out to each one (reusing, not duplicating, that logic). This
   is the literal missing piece identified in §4 — the first real "Movement" fact — built as a
   thin closure event on the entity that already aggregates capacity, not a new domain object.
3. **Only after (1) and (2) are proven** (real-PG concurrency tests: two simultaneous
   `createAssignment` calls on the last slot, a `departSlot` call with one assignment still
   uncollected, a `departSlot` call racing a `respondToAssignment(decline)` on the same slot),
   consider promoting `ProviderAvailability` + its now-atomic depart/arrive closure into an
   explicit `Movement`/`Run` entity if the UI/reporting need (e.g. "show me everything on this
   specific van run") outgrows treating the slot row itself as the run. If/when that happens,
   `DailyBatch` should be revisited in the same design (§7) rather than left as a permanent
   fourth parallel path.

Nothing above requires touching production, the isolated Stage3KR staging environment, or the
unreleased 3K–3R/recipient-journey lineage; slice (1) and (2) are additive to the already-approved
3S-A base and can be developed and reviewed independently of it.
