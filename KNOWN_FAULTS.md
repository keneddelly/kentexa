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
- Related: `requestForShipment()` sends no SMS or alert to anyone, and
  `listAvailable()` shows the job to every agent in the city.
- Planned fix: build-order step 8 (pickup request goes to the chosen provider).

## 3. Dead code in the offer file

- File: `src/transport/logistics-service-offer.service.ts`, `commit()`.
- The block after `return this.journeys.selectService(...)` for an intercity
  offer (`const routeId = ...` down to the second `selectService` call; lines
  62-76 at commit 4d692ee) can never run, because the function has already returned.
- Harmless today, but confusing: it suggests a check ("is this offer still
  available?") that does not actually happen.
