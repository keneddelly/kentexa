# Known faults — not fixed yet

Found while planning the `marketplace-basic` work (October 2026, on commit 4d692ee).
These are written down on purpose. They are **not** fixed in step 1.

## 1. Same-city "Direct Delivery" price comes from the first agent in the list

- File: `src/transport/logistics-service-offer.service.ts`, `discover()`, the `sameCity` block
  (the `price: Math.max(pickupFee, deliveryFee)` line).
- `pickupFee` / `deliveryFee` are read from `originAgents[0]` / `destinationAgents[0]`:
  whichever approved, online agent in that city sorts first (by rating).
- That agent is not chosen and may never take the job. Any agent in the city can
  claim it, and that agent may charge a different fee. So the price the customer
  sees is not tied to the agent who comes.

## 2. An agent with no link to the chosen hub can claim a pickup

- File: `src/shipments/pickup-tasks.service.ts`, `claim()`.
- The only check is that the agent's city equals the shipment's origin city.
- For a hub-routed pickup the task has `originHubId` (the Super Agent the
  customer chose), but `claim()` never checks that the agent works with that hub.
- Related: `requestForShipment()` itself sends no alert, but its caller
  `ShipmentActivationService.confirmAndActivate()` then calls
  `LogisticsDispatchService.dispatchPickup()`, which alerts **every** approved
  agent in the origin city (in-app + SMS, call after 10 min). So there is an
  alert, but it goes to the whole city, not to one chosen provider.
  `listAvailable()` also shows the job to every agent in the city.
  (Corrected 2026-10-10: the first version of this file said "no alert".)
- Planned fix: build-order step 8 (pickup request goes to the chosen provider).

## 3. Dead code in the offer file

- File: `src/transport/logistics-service-offer.service.ts`, `commit()`.
- The block after `return this.journeys.selectService(...)` for an intercity
  offer (`const routeId = ...` down to the second `selectService` call; lines
  62-76 at commit 4d692ee) can never run, because the function has already returned.
- Harmless today, but confusing: it suggests a check ("is this offer still
  available?") that does not actually happen.

## 4. 19 old tests already fail on the live code (4d692ee)

Checked on 2026-10-09: the same 19 tests fail with and without the step 1
change. They are faults in the **test files**, not in the running app.

| Test file | Failing | Cause |
|---|---|---|
| `src/shipments/shipment-lifecycle.spec.ts` | 11 tests | Error `parcels.findOne is not a function`. The fake database in the test returns an empty object for every table except Shipment (line ~130). `ShipmentsService.confirm` now creates the Parcel inside the same transaction (`em.getRepository(Parcel)`, shipments.service.ts ~line 1425), so the fake is out of date. |
| `src/shipments/shipment-location-snapshot.spec.ts` | 6 tests | Same cause as above: the fake transaction has no Parcel table. |
| `src/transport/transport.legacy-authority.spec.ts` | 2 tests | Error `Cannot read properties of undefined (reading 'transaction')`. The test builds `new TransportService(...)` with the old list of constructor arguments, so `dataSource` lands in the wrong place. |
| `src/transport/van-pilot-c8.real-postgres.spec.ts` | whole file does not compile (0 tests run) | TypeScript error TS1005 at line 189: a SQL text earlier in the file (around line 186, a trigger with `regexp_replace`) breaks the string, so the file cannot be read. This file is a database test and would be skipped anyway without a test database. |

11 + 6 + 2 = 19. Fix: update the fakes and the SQL string in these test
files only. No app code needs to change.

## 5. Intercity "Pick up from me": no pickup job is ever created

Found in the local browser test on 2026-10-10 (test shipment KTX-SHP-1, Dar es Salaam → Mwanza, door pickup).

- File: `src/shipments/shipment-activation.service.ts`, `confirmAndActivate()`.
- When the shipment comes from the send form (it has a `journeySelectionId`) and the first leg
  is FIRST_MILE, the code only returns `nextAction: agent_pickup_pending / awaiting_assignment`.
  It does **not** call `requestForShipment()` and does **not** call `dispatchPickup()`.
  Only the older non-journey path (same-city direct delivery) creates a pickup task and alerts agents.
- The only other way to create a task is `POST /shipments/:id/pickup-task`, which the send form no
  longer calls. For hub-routed tasks it would also need an `originHubId`, which a door-pickup
  intercity shipment does not have.
- But the success screen says "Pickup has been requested. Open My Shipments to see who is coming"
  (`send_shipment.direct_pickup_requested`, shown when nextAction is `agent_pickup_pending`).
- Result: the customer believes a pickup is coming, but no agent and no Super Agent is told.
- Planned fix: build-order step 8.

## 6. Small wording / naming problems seen in the browser test

- Home feed transport cards show a transporter with a blank name as **"Business"** (not its business
  name). Step 1 fixed this only in the send form, not on the home feed.
- The send form says "Kentexa will arrange pickup from your address", "Kentexa will arrange delivery
  to the recipient", "Kentexa Point", "Kentexa will confirm the final transport price" and the success
  screen says "Kentexa is arranging the next fulfillment step". This conflicts with "KenteXa carries
  nothing; providers do the work".

## 7. Five more old test files fail in src/database (found 2026-10-10)

Same failures with and without the step 2 change (not caused by it, not yet analysed):
`backfill-conversation-classification.spec.ts`, `complete-ambiguous-buyer-participants.spec.ts`,
`migrations/add-service-business-authority-foundation.spec.ts`,
`migrations/add-service-business-authority-foundation.real-postgres.spec.ts`,
`migrations/add-transport-superagent-business-workspace-binding.spec.ts`.
Together with section 4: 9 failing suites, 55 failing tests in transport/shipments/orders/super-agents/database.

## 8. Two old frontend test files fail (found 2026-10-10)

`bishoo-frontend/src/public/pages/SellerInbox.context.test.js` and
`bishoo-frontend/src/navigation/navigationRegistry.test.js`: 4 tests fail with and without step 2.
Not analysed yet.

## 9. Existing timed jobs set no time zone, so 8 am jobs probably run at 11:00 Tanzania time

Found 2026-10-10. No `@Cron(...)` in the code passes a `timeZone`, and `render.yaml` sets no `TZ`.
Render servers run on UTC unless `TZ` is set in the dashboard (please check). Tanzania is UTC+3,
so a job written for "8 am" runs at 11:00 Tanzania time, "midnight" at 03:00, "2 am" at 05:00.
**Not changed now** — changing the time of money/escrow jobs needs its own decision.

| Job (file) | Schedule in code | Real time in Tanzania (if server is UTC) | What it does |
|---|---|---|---|
| `checkStaleEscrow` (`daily-batches.service.ts:1150`) | `0 8 * * *` | 11:00 | Flags escrow payments that should have been released, logs for the operator |
| `autoReleaseEscrow` (`daily-batches.service.ts:1270`) | `0 8 * * *` | 11:00 | Releases escrow to the seller when a delivered order was never confirmed by the buyer (3 days local, 5 days intercity) |
| `autoConfirmDeliveredOrders` (`orders.service.ts:2404`) | `0 8 * * *` | 11:00 | Auto-confirms delivered orders after 3 days (local) / 5 days (intercity) |
| `autoCompleteDelivered` (`shipping.service.ts:267`) | every day at midnight | 03:00 | Marks delivered orders completed after 7 days |
| `expireOverdueAuthorizations` (`brand-authorizations.service.ts:399`) | `0 2 * * *` | 05:00 | Expires brand authorizations past their end date and notifies |
| `expireOverdueRegistrations` (`warranty.service.ts:276`) | `0 3 * * *` | 06:00 | Expires overdue warranty registrations |
| `autoCutoffCheck` (`daily-batches.service.ts:1124`) | every 10 minutes | not affected by time zone | Marks daily batch cut-off as passed (its comment wrongly says "every 15 min") |
| `expireInvoices` (`invoices.service.ts:460`) | every hour | not affected | Expires unpaid invoices past their expiry |
| `expireOffers` (`offers.service.ts:32`) | every hour | not affected | Expires buyer offers nobody answered |
| `retryDue` (`money-routing.service.ts:304`) | every minute | not affected | Retries pending money-routing entries whose wait time has passed |
| `extendScheduleHorizons` (`transport-run.service.ts:373`) | minute 15 of every hour | not affected | Creates future transport trips from recurring schedules |

The new evening-reminder job (item 5) will set `timeZone: 'Africa/Dar_es_Salaam'` itself.
