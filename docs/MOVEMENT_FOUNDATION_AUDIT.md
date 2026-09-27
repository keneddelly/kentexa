# Movement foundation audit — candidate after the Stage 3K–3R custody gate

Date: 2026-09-27. Read-only repository and production database review. This is an architecture gate, not a migration or a Kentexa Van launch. The current production branch is `76d01ad6e13d5ba386eda511a0a70edf66cc5b04`; Stage 3K–3R behavior remains in draft PR #47, with retry integration in draft PR #49.

## Existing authority

| Concept | Current code | Meaning and limit |
| --- | --- | --- |
| Shipment | `shipments/entities/shipment.entity.ts` | Transport demand and the structured location/hub decision. A walk-in counter Order + Parcel can currently have no Shipment; do not invent one for historical rows. |
| Parcel + custody | `super-agents/entities/parcel.entity.ts`, `parcel-custody-event.entity.ts` | Physical object and append-only custody history. Stage 3K–3R is closing last-mile proof and cash liability. |
| BulkShipment | `super-agents/entities/bulk-shipment.entity.ts` | Active origin-hub grouping of several Parcels with a destination and aggregate cost; `parcel.bulkShipmentId` is its membership. Its dispatch is not proof that a carrier physically accepted custody. |
| TransportAssignment | `transport/entities/transport-assignment.entity.ts` | Responsibility of a provider for one Parcel, with an availability slot and proof fields. It can point to the Parcel and its Shipment; no shared run identity exists. |
| ProviderAvailability | `transport/entities/provider-availability.entity.ts` | Published provider capacity/time slot. It is not a particular vehicle or an immutable executed trip. |
| DailyBatch / BatchParcel | `daily-batches/` | Older Kariakoo-specific Van/zone model linked to Order. `DailyBatchesModule` is not imported by `AppModule`, so its routes are dormant. Its delivered status and notifications would be a separate delivery authority if reactivated unchanged. |

Read-only production counts: 83 Parcels, 2 BulkShipments (one open, one dispatched), 2 Parcels in a bulk group, 1 TransportAssignment with a Parcel reference, 0 assignments with a Shipment reference, 0 DailyBatches and 0 BatchParcels. These are counts at audit time, not migration targets.

Read-only inspection of the two historical groups: BulkShipment #1 (Dar es Salaam → Arusha City) has one dispatched Parcel #18, a transport company/reference and a dispatch timestamp; #2 (Dar es Salaam → Mwanza) has one received-at-hub Parcel #21 and remains open. Neither Parcel has a TransportAssignment or custody event in the current ledger. These pre-ledger records do not establish who physically held them. They must not be inferred as completed Runs or backfilled with carrier custody.

## Decision for the next gate

Use the existing Parcel, custody event and TransportAssignment authorities. Do not activate DailyBatchesModule or use BatchParcel's `DELIVERED` state as a second proof of delivery. Preserve existing BulkShipment records and operational behavior; do not rename or backfill them merely to introduce a Run.

A future **Movement/Run** is one physical departure with a responsible transport operator, time, capacity and origin/destination logistics points. Many Parcel-specific assignments may refer to one Run. A **van is a transport mode/vehicle type**, not a Kentexa-only operator or a separate logistics domain. A Van Run may be supplied by Kentexa-controlled capacity or by a verified partner transport provider; buses, trucks and motorcycles use the same Run/assignment principles where appropriate. Vehicle ownership, run operator, customer-facing service name and physical custodian are distinct facts. A Run does not create a second Shipment, Parcel or delivery status. Actual handover still requires the Parcel custody writer and its authorized receiving actor.

The first implementation slice should be deliberately small: one scheduled departure, one verified operator, vehicle type/reference where known, a configured corridor with ordered operational stops, and membership of multiple existing Parcels through their assignment. Each Parcel has a validated boarding and unloading point on that Run; capacity is occupied only for the segments it rides. No payroll, fleet maintenance, route optimization, automatic dispatch or multi-stop solver. Keep place identifiers/snapshots and capacity validation under their existing authoritative domains. Kentexa may coordinate or brand a service without owning the van or employing its operator; record contractual operator and asset ownership explicitly where known, never infer either from a logo or free text.

`BulkShipment` is an origin-hub packing/grouping object in the current code. Its open state accepts compatible Parcels; dispatch marks the group and Parcels dispatched, but stores no shared verified carrier acceptance, vehicle, capacity reservation or per-Parcel custody transfer. Do not promote its status into a Run state. A Run may carry Parcels from one or more compatible groups, while the existing bulk grouping remains a separate operational object.

The single-Parcel path can bind an accepted TransportAssignment at dispatch. The provider's authenticated `COLLECTED` action then writes `transport_provider_collected` custody evidence under Parcel and assignment locks. The destination hub receipt validates that evidence when it exists; legacy parcels without it retain unknown previous custodian. The bulk dispatch path instead updates statuses and tracking in a transaction but does not bind an assignment or write carrier custody. The pilot must make each Van Parcel's authorized operator confirm collection explicitly, whether that operator is a verified partner or Kentexa-controlled; a bulk dispatch label cannot stand in for that handoff. The existing provider-role writer must be extended or an equivalently guarded Kentexa-operator writer added before claiming Kentexa-controlled collection works.

`createAssignment()` currently reserves an availability slot separately from saving an assignment and resolves the acting Super Agent from the caller's user ID. Before a Van Run accepts live parcels, move capacity/membership and active hub-role validation into one transaction with row locks, an idempotency key and a unique active assignment rule. Define cancellation release and concurrent additions. A planned seat or kilogram count never implies possession.

## Kentexa Van pilot entry: Super Agent desk

This is a **milk-run service**: scheduled vans repeatedly collect and drop off many customers' Parcels along configured local corridors, rather than treating one customer order as one vehicle trip. Initial Dar es Salaam operating areas are **Kariakoo, Mbagala, Ubungo, Mbezi and Bunju**. These are pilot areas, not a permanent fixed route or hardcoded city list. Operations must define actual stop order, times, receiving hubs/handoff points, fares and service availability for each corridor before sale. Some departures may connect only two points; others may serve several stops. An area name alone does not prove a hub exists there or that a Van will run today.

The first Van service must work **without a marketplace order or a seller account**. Any customer may bring goods to an active Super Agent desk. The hub operator records sender, recipient, goods, declared value, destination, agreed charge and collection; the existing `POST /super-agents/offline-intercity` path already creates a counter Order, Parcel, tracking number, receipt and origin-hub custody event for this case. That Order is a receipt/tracking record, not a marketplace purchase. Keep the hub's active role and cash authority intact.

After registration, the Parcel can be offered a compatible scheduled Van Run from that hub, operated by Kentexa or a verified partner under the same transport rules. Confirmed Run membership records planned capacity, while the existing custody handoff records physical transfer to the authorized operator. At the destination, a receiving hub confirms custody before pickup or last-mile delivery. The public can track verified parcel events. Marketplace-origin Parcels may later join the same Run; neither source gets a parallel Van shipment or tracking system.

For an initial local-market pilot, define a real origin hub, destination hub/handoff, boarding/unloading stops, departure window, available capacity on every occupied segment, verified operator and fare before the desk quotes a Van option. Show the actual operator where it matters to the customer; a partner van must not be represented as Kentexa-owned. If no eligible Run exists, the desk must not promise Van delivery. Counter intake can continue using other available transport. Do not equate `offline_intercity`'s current `shippingMethod: 'agent'` with proof of Van assignment; a separate validated Run choice and subsequent custody handoff are required. The Van pilot therefore depends on the counter/custody and movement gates, **not on completion of marketplace checkout**.

## Required review before coding

1. Close the Stage 3K–3R phone, recipient proof and Agent COD/remittance gate. The currently isolated staging test must not be redirected to this candidate.
2. Decide whether a BulkShipment maps to a packing/grouping object, a Run, or both in each current operational path. Inspect the two historical production rows read-only; do not reclassify them from status alone.
3. Trace single-Parcel and bulk dispatch, provider acceptance, origin-hub handoff and destination receipt to their canonical custody events. Assignment and planned Run membership must never alone imply physical custody.
4. Define one transaction for adding/removing compatible Parcel assignments under per-segment capacity and role/business authority; prove two concurrent additions cannot overbook or double-assign. Reuse existing availability validation where it truly applies.
5. Design an additive nullable Run reference and migration for new assignments only. Preserve historical nullable assignment references; no inferred backfill. Prove rollback, retry and public tracking projection on PostgreSQL before any production migration.
6. Prove a walk-in customer can register at the Super Agent desk, obtain a receipt/tracking number, then have that Parcel assigned to an available Van Run and handed off with custody proof. Exercise an unavailable/full Run, retry, and destination receipt without involving marketplace checkout.

The human flow remains “Tuma Mzigo” and “Fuatilia.” Movement grouping and provider details are operational infrastructure, while public tracking reports only verified parcel events and the next meaningful step.
