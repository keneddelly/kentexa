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

## Decision for the next gate

Use the existing Parcel, custody event and TransportAssignment authorities. Do not activate DailyBatchesModule or use BatchParcel's `DELIVERED` state as a second proof of delivery. Preserve existing BulkShipment records and operational behavior; do not rename or backfill them merely to introduce a Run.

A future **Movement/Run** is one physical departure with a provider/operator, time, capacity and origin/destination logistics points. Many Parcel-specific assignments may refer to one Run. Kentexa Van is an operator/vehicle supplying that capacity; external vans, buses and trucks use the same movement concept. A Run does not create a second Shipment, Parcel or delivery status. Actual handover still requires the Parcel custody writer and its authorized receiving actor.

The first implementation slice should be deliberately small: one origin, one destination, one departure, one provider/vehicle reference where known, and membership of multiple existing Parcels through their assignment. No payroll, fleet maintenance, route optimization, automatic dispatch or multi-stop solver. Keep place identifiers/snapshots and capacity validation under their existing authoritative domains. A named operator can be Kentexa or a verified transport provider; never infer ownership from a logo or free text.

## Required review before coding

1. Close the Stage 3K–3R phone, recipient proof and Agent COD/remittance gate. The currently isolated staging test must not be redirected to this candidate.
2. Decide whether a BulkShipment maps to a packing/grouping object, a Run, or both in each current operational path. Inspect the two historical production rows read-only; do not reclassify them from status alone.
3. Trace single-Parcel and bulk dispatch, provider acceptance, origin-hub handoff and destination receipt to their canonical custody events. Assignment and planned Run membership must never alone imply physical custody.
4. Define one transaction for adding/removing compatible Parcel assignments under capacity and role/business authority; prove two concurrent additions cannot overbook or double-assign. Reuse existing availability validation where it truly applies.
5. Design an additive nullable Run reference and migration for new assignments only. Preserve historical nullable assignment references; no inferred backfill. Prove rollback, retry and public tracking projection on PostgreSQL before any production migration.

The human flow remains “Tuma Mzigo” and “Fuatilia.” Movement grouping and provider details are operational infrastructure, while public tracking reports only verified parcel events and the next meaningful step.
