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

## 9. Existing timed jobs set no time zone, so 8 am jobs run at 11:00 Tanzania time (confirmed)

Found 2026-10-10. No `@Cron(...)` in the code passes a `timeZone`, and `render.yaml` sets no `TZ`.
**Confirmed 2026-10-10: Render has NO `TZ` setting; the live server runs on UTC.** Tanzania is UTC+3,
so a job written for "8 am" runs at 11:00 Tanzania time, "midnight" at 03:00, "2 am" at 05:00.
**Not changed now** — changing the time of money/escrow jobs needs its own decision.

| Job (file) | Schedule in code | Real time in Tanzania (server is UTC, confirmed) | What it does |
|---|---|---|---|
| `checkStaleEscrow` (`daily-batches.service.ts:1150`) — **never runs on live, see #11** | `0 8 * * *` | 11:00 | Flags escrow payments that should have been released, logs for the operator |
| `autoReleaseEscrow` (`daily-batches.service.ts:1270`) — **never runs on live, see #11** | `0 8 * * *` | 11:00 | Releases escrow to the seller when a delivered order was never confirmed by the buyer (3 days local, 5 days intercity) |
| `autoConfirmDeliveredOrders` (`orders.service.ts:2404`) | `0 8 * * *` | 11:00 | Auto-confirms delivered orders after 3 days (local) / 5 days (intercity) |
| `autoCompleteDelivered` (`shipping.service.ts:267`) | every day at midnight | 03:00 | Marks delivered orders completed after 7 days |
| `expireOverdueAuthorizations` (`brand-authorizations.service.ts:399`) | `0 2 * * *` | 05:00 | Expires brand authorizations past their end date and notifies |
| `expireOverdueRegistrations` (`warranty.service.ts:276`) | `0 3 * * *` | 06:00 | Expires overdue warranty registrations |
| `autoCutoffCheck` (`daily-batches.service.ts:1124`) — **never runs on live, see #11** | every 10 minutes | not affected by time zone | Marks daily batch cut-off as passed (its comment wrongly says "every 15 min") |
| `expireInvoices` (`invoices.service.ts:460`) | every hour | not affected | Expires unpaid invoices past their expiry |
| `expireOffers` (`offers.service.ts:32`) | every hour | not affected | Expires buyer offers nobody answered |
| `retryDue` (`money-routing.service.ts:304`) | every minute | not affected | Retries pending money-routing entries whose wait time has passed |
| `extendScheduleHorizons` (`transport-run.service.ts:373`) | minute 15 of every hour | not affected | Creates future transport trips from recurring schedules |

The new evening-reminder job (item 5) will set `timeZone: 'Africa/Dar_es_Salaam'` itself.

## 10. Every timed job runs THREE times at once (found 2026-10-10) — FIXED on marketplace-basic, not yet live

Seen in the local test of the new nightly reminder: each 5-minute tick wrote its log line **three
times in the same second** (19:35, 19:40, 19:45). The scheduler is set up three times:
`ScheduleModule.forRoot()` in `src/app.module.ts:73`, `src/invoices/invoices.module.ts:20` and
`src/orders/orders.module.ts:71` (@nestjs/schedule 6.1.3). Three set-ups = three copies of every
`@Cron` job (see section 9 for the list).

Proven for the new reminder job (log lines). For the older jobs the cause is the same, but each
one should be checked before changing anything. Why it matters:
- `retryDue` (money routing, every minute) — three copies retry the same money entries at the
  same moment. If a retry is not fully idempotent, money could be routed twice. **Check first.**
- `autoReleaseEscrow`, `autoConfirmDeliveredOrders`, `checkStaleEscrow` — three copies at 11:00.
- `expireInvoices`, `expireOffers`, `extendScheduleHorizons` — likely harmless (status flips / locked).

The new nightly reminder is safe against this: one database row per office per day, and the single
retry only on a later tick. **Not changed now.** Likely fix (needs its own yes and a test): keep
`ScheduleModule.forRoot()` only in `app.module.ts` and remove it from the invoices and orders modules.

**Update 2026-10-10 (evening):**
- Proven, not just probable: a test app with the project's own library versions ran a job 5 times with
  one scheduler set-up and 15 times with three. Live uses the same versions and the same three set-ups.
- The real app on the local test database, old code: start-up check logged
  `Timed jobs registered 27 times for 9 job(s) ... by 3 scheduler set-up(s)`; fixed code:
  `Timed jobs: 9 registered, each once`, and one log line per reminder tick instead of three.
- Correction: live has **8** timed jobs, not 11 — the three daily-batches jobs never run (#11).
  So the "order completed" emails and the stale-escrow alert were never sent three times on live.
- Owner ran Q1–Q7 read-only on live: Q1 = both money guards exist; Q2–Q7 = 0 rows.
  No money was paid twice. (Q6/Q7 empty may only mean no brand authorization has expired yet.)
- Fix on marketplace-basic: `ScheduleModule.forRoot()` only in `app.module.ts`; a test fails if a
  second one is added (`src/scheduling/schedule-setup.spec.ts`); a start-up check logs an ERROR if
  jobs are ever registered more than once (`src/scheduling/scheduled-jobs.check.ts`).
- Safety fixes: brand expiry changes a row only if still APPROVED (no repeat SMS even with two
  servers); autoReleaseEscrow sends emails only when it really released the money.

## 11. DailyBatchesModule is never loaded — its 3 timed jobs and its API never run (found 2026-10-10)

- `src/daily-batches/daily-batches.module.ts` is not imported by `AppModule` or any other module, on
  live (`4d692ee`) or ever in `app.module.ts`'s history.
- So these never run on live: `autoReleaseEscrow` (escrow release for delivered, unconfirmed orders),
  `checkStaleEscrow` (admin alert), `autoCutoffCheck` (daily batch cut-off). Escrow is still released
  by `OrdersService.autoConfirmDeliveredOrders` and `ShippingService.autoCompleteDelivered`, which do run.
- The `DailyBatchesController` endpoints are not served either (requests to them return 404).
- **Not changed.** Loading the module is a product decision: it would START an extra escrow-release job
  and the daily-batch API. Decide first whether daily batches are still wanted.
## 12. Whole backend suite: 28 old test files fail (found 2026-10-10)

Running ALL backend tests (`npx jest`) on commit 9b564a4, before the scheduler fix: 28 test files /
98 tests fail; exactly the same 28 / 98 fail with the scheduler and safety fixes (they only add 10
passing tests). Sections 4 and 7 list 9 of them; the other 19 are not analysed yet:
- `src/business/`: b5b-closure-postgres-regression-proof, b5c-profile-business-workspace-integrity,
  b6b-service-business-authority, b6d-p0-service-public-identity,
  b7c-capability-verification-and-superagent-city, i2-legacy-business-transition,
  i2-selling-identity-invariant, i2c-canonical-business-capability-activation,
  i2e-canonical-business-write-authority, i2f-commerce-scope-isolation, seller-admin-approval-bridge
- `src/commerce-profiles/personal-business-identity-integrity`, `src/feed/i2b-public-actor`,
  `src/location-intelligence/location-intelligence.service`,
  `src/role-context/i2a-canonical-active-context-identity`, `src/role-context/role-context.service`
- `src/money-routing/`: i2g-money-routing.real-postgres, order-release.real-postgres,
  release-writers.real-postgres — **these test the money guards**; they probably need a test-database
  setting on this PC. Worth getting green before the next money-related change.

## 13. LIVE OUTAGE since 2026-10-08: five migrations never applied — FIXED 2026-10-11 12:26 (Release A, see NEXT_STEPS.md)

Confirmed by the owner on live after Release A: tracking an unknown number gives 404; single-parcel
dispatch works at the counter. Not yet tested: recipient pickup with a code (needs a receiving office
with an arrived parcel).


- Live database: newest recorded migration `1788292800000`; 1791504000000, 1791507600000,
  1791511200000, 1791514800000, 1791514900000 are NOT applied (owner's read-only check).
- Live code `4d692ee` (server started 2026-10-08T15:31:06Z per /version) expects them.
- Owner's public check: `GET https://api.kentexa.com/shipments/track/KTX-SHP-999999` answers with a
  server error (5xx) instead of 404 "Shipment not found".
- Reproduced locally (live code on a database with exactly live's structure): send form, My Shipments,
  KTX-SHP tracking, counter single dispatch, recipient pickup at office (code/confirm/COD), agent
  delivery (code/confirm/COD), transport assignment and walk-in claim all fail; walk-in receive,
  receipts, shehena work. Applying the five fixes every one of them.
- Fix: Release A (RELEASE_A_CHECKLIST.md) — apply the five with the current code; no deploy needed.

## 14. "Mizigo Yangu" (My Shipments) sends a logged-in user to the homepage (live, 2026-10-11)

- Seen on live by the owner: tapping "Mizigo yangu" opens the homepage and calls no API.
- Cause (code, same on live 4d692ee and on marketplace-basic): the page exists (`App.js`, case
  'MyShipments') and the profile row navigates to it (`MyProfile.js:829`), but `'MyShipments'` is
  **missing from the destination list** `bishoo-frontend/src/navigation/destinationRegistry.js`.
  `navigationPolicy.js:8` sends every unknown destination to the role's home page.
- Same path from the send form's success screen ("My Shipments" button, `SendShipment.js`).
- Likely one-line fix: add 'MyShipments' to the account pages in destinationRegistry.js (and a test).
  Not done — needs its own yes. Note: even with that fix, My Shipments stays broken on live until
  Release A (#13), because the API behind it fails too.
- **Update 2026-10-11:** FIXED on marketplace-basic (commit aa515ec), not yet live — goes out with
  Release B. The API behind it works on live since Release A.

---

# Faults found at the Super Agent desk on live, 2026-10-11

Line numbers are from the LIVE code `4d692ee`, file
`bishoo-frontend/src/public/pages/SuperAgentDashboard.js` unless another file is named.
(On marketplace-basic the same lines are about 6 lower in the file, after line 1126.)

## 15. IMPORTANT — a walk-in receipt can be lost and cannot be opened again

- **What the owner saw:** after creating a walk-in receipt, one wrong tap and the receipt is gone;
  the customer leaves with no receipt.
- **Where the receipt screen is built:** lines 1475-1510 (shown when `walkResult` is set; "🖨️ Chapisha
  Risiti" at 1500, "+ Mteja Mwingine" at 1507). Print window: `handlePrintReceipt`, line 641.
- **Why it is lost:** the receipt lives ONLY in the page's memory (`walkResult`, set at line 611).
  - "+ Mteja Mwingine" (1507) calls `resetWalk` (623-630), which wipes it on purpose.
  - The × at the top of the form (1266) and the tab buttons (1096) leave the walk-in screen.
  - A page reload or a closed browser loses it too.
  - There is **no way back**: the backend DOES keep a copy of every walk-in receipt
    (`order.offlineReceiptSnapshot`, written in `src/super-agents/super-agents.service.ts:914`), but
    no endpoint returns it, and no Historia or search row has a "receipt" button. Historia rows have only
    "🕘 Historia Kamili" (2261-2265). The "send SMS again" buttons exist (endpoints
    `resend-sender-sms` / `resend-receiver-sms`, controller lines 221/233) but are hidden inside the
    "Historia Kamili" window (2623/2629).
- **Safe against a second parcel/charge today?** Yes for re-sending SMS (it only sends). Creating the
  same walk-in twice by a double tap is already guarded (`requestKey`, service lines 650-660: the same
  request returns the saved receipt instead of a new parcel).
- **Not recoverable later:** the walk-in *claim* code (secret) is stored only as a fingerprint, so it
  can never be shown again — by design. Only the receipt itself can be re-shown.
- **Fixed on marketplace-basic 2026-10-11** (NEXT_STEPS.md section 10), browser-tested locally; goes live with Release B.

## 16. Delivery method at walk-in intake is not automatic — FIXED, live 2026-10-12 11:59 (Release C)

Dar → Katavi shows three choices (agent delivery, "KenteXa van", intercity) and defaults to agent
delivery (line 276); such a parcel is saved with NO receiving office. Details and fix: NEXT_STEPS.md
section 9, "Fault 1". Status: not fixed.

## 17. "Wakala wa mtaa" offered when sending an intercity parcel — FIXED, live 2026-10-12 11:59 (Release C)

In the 📤 Tuma panel (2001-2015) it lists the ORIGIN city's agents and marks the parcel dispatched
with no bus/courier at all; the backend checks nothing (service 1790-1886). Details and fix:
NEXT_STEPS.md section 9, "Fault 2". Status: not fixed.

## 18. "KenteXa van" label — KenteXa owns no vans

Hard-coded on the desk (line 1349), the seller dashboard, en/sw/fr language files and two backend
texts. Must show the van business's own name, or hide the van choice where none serves the city.
List of places: NEXT_STEPS.md section 9. Status: not fixed (needs a small new endpoint).

## 19. Handover to the recipient is hidden inside "Sasisha" (status update)

- **Where:** the handover (send pickup code, type the 6-digit code, "✅ Nimekabidhi kwa mpokeaji")
  is inside the status-update sheet, lines 2679-2708. Agent handover ("Toa namba ya makabidhiano")
  2710-2720.
- **What decides it today:** the block shows only when the sheet is opened for a parcel with status
  `arrived_at_hub` or `awaiting_buyer`, `myRole` not `origin`, and the buyer did not ask for door
  delivery (2679-2681).
- **How the office reaches it today:** only by tapping a button called "Sasisha" (atHub list, 1209; in-transit list, 2223)
  or "Sasisha Hali" (⏳ ZINASUBIRI MTEJA list, 1241). Nothing says "hand over". Opening the sheet
  with "✅ Pokea" (incoming list, 1225) shows it only after the parcel was received.
- **Fixed on marketplace-basic 2026-10-11** (NEXT_STEPS.md section 10), browser-tested locally; goes live with Release B.

## 20. Walk-in customers cannot claim online; the claim code is never shown or printed — FIXED, live 2026-10-12 11:59 (Release C)

- Found 2026-10-11 while building the receipt reopen (#15).
- The backend makes a claim code for every walk-in (`issueWalkInClaimReceipt`,
  `super-agents.service.ts` ~866-878, only when `SHIPMENT_CLAIM_HMAC_KEY` is set — it is on live since
  2026-10-11) and returns it ONCE in the intake answer (`shipmentClaim.receiptSecret`).
- The counter screen (`SuperAgentDashboard.js`) never shows it, and the printed receipt
  (`handlePrintReceipt(walkResult.receipt)`) does not contain it. It is stored only as a fingerprint,
  so it can never be shown later.
- Mizigo Yangu asks the customer for "Msimbo uliochapishwa kwenye risiti" (`MyShipments.js:81`),
  which the customer never received. So no walk-in customer can claim their parcel online today.
- **Not in Release B (owner's decision 2026-10-11).** The receipt screen and the 🧾 Risiti window say
  "Namba ya siri ya mteja ya kudai mzigo haiwezi kuonyeshwa tena." Plan for Release C: NEXT_STEPS.md
  section 15.

---

# Still open — short list (owner's status update, 2026-10-11)

| Fault | Where | Plan |
|---|---|---|
| Live server has no TZ; timed jobs run in UTC, 3 hours late | #9 | own decision (money jobs) |
| Intercity "Pick up from me" creates no pickup job, alerts nobody | #5 | honest message in Release B; real fix build-order step 8 |
| A pickup can be claimed by an agent with no link to the chosen hub | #2 | step 8 |
| render.yaml says `plan: free` + linked DB settings; real plan paid, settings typed by hand | NEXT_STEPS 6, 7 | its own day |
| DailyBatchesModule not loaded on live | #11 | product decision |
| 28 old failing backend test files; 3 test money guards | #12 | get the 3 green before next money change |
| Local PostgreSQL password public in Git history | NEXT_STEPS 5 | owner, later |
| Same-city Direct Delivery takes its price from the first agent | #1 | later |
| Lost receipt | #15 | fixed on marketplace-basic, goes live with Release B |
| Walk-in customers cannot claim online (claim code never shown) | #20 | Release C, NEXT_STEPS 15 |
| Desk faults: delivery method, wakala wa mtaa, van name, hidden handover | #16-#19 | NEXT_STEPS 9, 10 |

## 21. Online walk-in claim always said "Shipment already claimed" (live, 2026-10-12) — FIXED on marketplace-basic, not yet live

- Seen by the owner on live: waybill + receipt code + SMS code all correct, then "Shipment already
  claimed", and the parcel (KTX-ORD-133) did not appear in Mizigo Yangu.
- Cause: `shipment-claim-finalize.ts` checked `result.length !== 1` on a bare `UPDATE ... RETURNING`;
  TypeORM returns that as `[rows, count]` (length 2), so every correct claim failed and the error rolled
  the claim back — the shipment stayed linked to NOBODY and the receipt code stayed unused (reproduced on
  a real local Postgres). It had never run on live before Release C, because no code was ever printed.
- Walk-ins are not linked to the counter account: intake sets only `requestedByUserId` (who typed it in);
  the owner `senderUserId` stays empty until the customer claims it. Confirm one parcel read-only with
  `C:\Users\BISHOO GROUP\release-c\check-claim.ps1 -Parcel KTX-ORD-133`.
- Fix: the update wrapped in a CTE (rows come back as rows); a test whose fake answers like the real
  driver; every claim message and the claim SMS in Swahili (`CLAIM_MESSAGES`). Same quirk fixed in
  `parcel-run-assignment.service.ts` (tender "no longer available" never fired) and
  `transport-run.service.ts` (switching off a schedule returned a list, never "not found").
- After it is live the customer simply claims again (asks for a new SMS code); the receipt code is still valid.
