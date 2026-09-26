# Stage 3K — terminal delivery integrity audit

Base: production `5203db1a3071477df1b58cc8f57c1f17d225c95e` (Stage 3J).

## Production and code evidence

Read-only production counts on 2026-09-26: 82 Parcels, including 23 `delivered`; five linked COD Parcels, four `delivered` with `codBalanceCollected=true`; `parcel_custody_event` has zero rows. These aggregate counts do not prove who physically received any historical parcel. No backfill is justified.

`SuperAgentsService.updateParcelStatus()` is still a general status endpoint exposed by `PATCH /super-agents/parcels/:trackingNumber/status`. The Super Agent dashboard offers `delivered` through this endpoint. Its COD branch calls `OrderReleaseService.releaseSellerProceeds()`, then separately increments Parcel `superAgentEarnings`, increments SuperAgent `codCashHeld`, records an invoice receipt and activity, and later updates Parcel status and tracking. The increments and receipt explicitly catch and ignore failures. A concurrent or failed later write can leave seller release, cash liability, receipt, and physical status inconsistent. The non-COD branch also writes terminal status without recipient handover evidence. The Stage 3J pickup endpoint does not cover this route.

`SuperAgentsService.updateMyDeliveryStatus()` allows a claiming local agent to mark `delivered`. It updates Parcel before tracking and agent statistics in separate writes; it neither records recipient proof nor an immutable custody event. It cannot safely be folded into the hub COD path because the actor, custodian, cash handler, and authorization differ.

Other terminal writers found in the first inventory:

| Writer | Trigger | Physical evidence and boundary |
| --- | --- | --- |
| `OrdersService.syncParcelDeliveredForOrder()` | Buyer confirms Order, including token link | Buyer action is meaningful confirmation, but Parcel and tracking are a best-effort post-completion sync with no custody event. Token authority and external-recipient mismatch need review. |
| `TransportWebhookController.delivered()` | Provider API key and tracking number | Provider self-report, optional `receivedBy`/photo, independent Parcel and tracking writes; no verified assignment-to-Parcel authorization or recipient confirmation shown in this method. |
| `TransportService.syncParcelFromAssignment()` | Carrier assignment status | Current `PARCEL_SYNC` maps only `DEPARTED` to `IN_TRANSIT`; `COMPLETED` deliberately does not mark delivery. Its `SHIPMENT_SYNC` includes terminal mapping but cannot reach it from the current assignment map. |
| `DailyBatchesService` delivery | Batch Parcel status | `BatchParcel` is a separate entity; do not conflate its writes with physical `Parcel` custody without an entity-link audit. |

The inventory distinguishes actual Parcel terminal writers from enum references and a separate BatchParcel flow. No terminal writer should be declared covered merely because a status string matches.

Stage 3J's `confirmCodRecipientPickup()` is a useful bounded pattern: it rechecks an Order and Parcel under locks, uses the canonical seller-release transaction callback for COD, records cash liability, invoice receipt, Parcel status, tracking, and custody together, and consumes recipient-held SMS proof. Its `recipient_self_pickup` event must not be reused for delivery by a local agent or a transport provider.

## Proposed next implementation boundary

1. Inventory every `DELIVERED` writer (hub status, local agent, transport assignment/webhook, Order callbacks) and identify which are public tracking projections versus authoritative physical handovers. Document the current custodian and money side effects for each. Do not infer a recipient handover from an agent's own status tap.
2. Introduce a recipient-verifiable delivery confirmation for the appropriate actor/path, reusing the short-lived SMS challenge primitives where suitable. Bind it to the Parcel contact, use rate limits and a one-time hash, and keep an external recipient valid without a Kentexa account. The `ParcelCustodyEvent` must identify a verified recipient contact and its source/evidence, not invent a User ID.
3. For COD, lock Order before Parcel, revalidate canonical payment and current amounts, and join the seller release, Order companion facts, cash liability, agent fee, invoice receipt, terminal Parcel/Order/Shipment state, custody event, and tracking in one transaction. Seller-arranged orders have no Kentexa seller credit but still need atomic cash/physical companion writes. A blocked release must leave handover and collected flags unchanged.
4. Deny terminal status through generic status updates when the verified handover path owns it; remove the obsolete dashboard choice after the replacement is usable. Keep nonterminal hub status actions working. Do not redirect an in-flight generic delivery request into a new financial writer without an idempotency and stale-state guard.
5. Treat local agent delivery as a separate physical handover and compensation gate. A hub cannot attest agent-to-recipient custody. Ensure agent identity and claimed Parcel match under lock. Payment and COD authority for this route must be established before allowing it to collect money or credit a seller.
6. Send SMS/activity after commit. A durable retry or reconciliation mechanism is needed if their delivery is essential; a failed SMS cannot turn a committed handover into a retry that pays twice.

## Release proof

Native PostgreSQL tests must cover rollback after canonical release but before custody/tracking/receipt, blocked routing, two racing confirmations, replay, wrong recipient code, changed phone, wrong actor/hub/agent, refunded or cancelled Order, seller-arranged COD, and a stale generic status request racing the verified handover. Check transaction ledger and custody count together. Frontend and backend builds, exact-head CI, additive migration UP/DOWN if schema changes, and production migration-first rollout are required. Do not test on historical production Parcels or send a real recipient code without an operational test case.

## Gate decision

Stage 3J is released; Stage 3K is a design/audit gate. The generic COD and local-agent terminal paths have unresolved integrity and evidence gaps. This document authorizes no production mutation and claims no complete custody coverage. Implement on this non-production branch only after the writer inventory defines an exact first replacement path.
