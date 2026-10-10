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
