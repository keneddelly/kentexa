# Stage 3S first-mile boundary — review candidate

Date: 2026-09-27. Architecture only. Base production branch: `76d01ad6e13d5ba386eda511a0a70edf66cc5b04`. The Stage 3K–3R behavior and walk-in retry integrations remain draft PRs #47 and #49. This document does not authorize a production merge, migration or deployment.

## One capability, different senders and paths

An ordinary account holder, an authorized seller/business, or a person assisted at a Super Agent desk may send a Parcel. The registered requester, physical sender, payer and recipient are separate identities. A person without an account may use the desk path; an authenticated requester may create an independent Shipment. A business-linked shipment requires its active business authority. All paths converge on the existing Parcel, custody events and tracking.

| Requested service | Physical path | Hub decision | Run membership |
| --- | --- | --- | --- |
| Direct intracity Agent delivery | Sender → Agent → recipient | `not_required` where no hub was requested | None |
| Agent pickup for a hub-routed service | Sender → Agent → selected origin hub → eligible transport | Explicit, validated origin hub | Only if a scheduled Run is actually selected |
| Walk-in desk intake | Sender → authorized Super Agent desk → eligible transport | Actual receiving hub | Only if a scheduled Run is actually selected |

An Agent-to-Agent transfer on the direct path adds an accepted custody handoff. An assigned Agent, selected hub, planned Run or location ping never proves physical possession. The legacy Shipment `pickupOption` value `agent` creates neither an origin pickup task nor a Super Agent decision.

## Current code boundary

- `src/shipments/shipments.service.ts` creates an independent Shipment and, on confirmation, its single Parcel. `src/shipments/entities/shipment.entity.ts` keeps hub decisions independent of `pickupOption` and `deliveryOption`.
- `src/parcel-collections/parcel-collections.service.ts` has an Order-linked collection job, atomic Agent claim and `seller_collected_by_agent` custody event. Its terminal path is a receiving Super Agent; it does not provide an independent Shipment pickup task or direct recipient handoff.
- `src/agent-orders/agent-orders.service.ts` has Order-level pickup/delivery status actions. Those are not a substitute for Parcel custody evidence on an independent Shipment.
- `src/super-agents/entities/parcel-custody-event.entity.ts` provides a per-Parcel operation key and actor/custodian snapshots. Stage 3K–3R adds destination Agent recipient proof and COD/remittance behavior; its exact candidate must be re-reviewed before sharing any proof writer with direct delivery.

## Bounded first-mile contract

1. The requester asks for pickup against an existing, authorized Parcel. Persist an immutable requested service path (`direct_delivery` or `hub_routed`), an origin place/address snapshot, pickup contact, fee quote and idempotency key. A target hub is required and validated only for a hub-routed path. A desk intake already in hub custody does not create an Agent pickup task.
2. Create at most one active pickup task for that Parcel. The task references the Parcel and request, not a second Shipment or Order. An approved Agent in an eligible service area claims it using one conditional write under active role authority. A claim records responsibility, never custody. A decline, expiry or pre-collection cancellation releases the task without erasing its history.
3. At collection, lock task and Parcel, verify the assigned active Agent and sender handoff evidence, then insert one idempotent `origin_agent_collected` custody event, advance Parcel status and append tracking in the same transaction. An offline retry returns the same event; a different Agent cannot claim or collect it.
4. A hub-routed task terminates only when the selected active Super Agent acknowledges receipt from that exact current Agent. Under locks, append `origin_hub_received`, update Parcel/tracking and complete the task together. The Agent's “handed over” tap is only a request for acknowledgment. A refusal keeps custody with the Agent and requires an explicit next action.
5. A direct task terminates at verified handoff to the intended recipient. Under locks, validate current Agent custody, recipient proof and an operation key; append the recipient custody event, update Parcel/tracking and task status together. Do not manufacture hub receipt or Run membership. A different delivery Agent needs an accepted Agent-to-Agent custody transfer first.
6. Project the proven Parcel event to linked Shipment/Order status. Trigger communications once from that event. Charge pickup, credit the Agent and handle any goods COD under separate, explicitly defined billable and cash-liability rules. A recipient-delivery action cannot silently release seller funds or settle Agent cash.

The exact task entity name and column types remain implementation choices. Preserve historical Order-linked `ParcelCollection` records and behavior; do not backfill them into a new task. A new partial unique active-task rule and immutable operation keys must be proved on PostgreSQL before use.

## Required proof before a release candidate

- Independent Shipment and authorized seller Parcel both request pickup; an unregistered walk-in creates a counter Parcel without a seller account or an Agent task.
- Two Agents race to claim one task; exactly one wins. Duplicate request/retry cannot mint another active task or Parcel. Stale Agent role, wrong business context and wrong hub are rejected.
- Collection rollback leaves task, Parcel, custody ledger and tracking unchanged. A committed collection followed by a lost response is returned idempotently.
- Direct delivery proves sender → Agent → recipient with no hub/Run; an Agent-to-Agent transfer requires acceptance. Wrong/expired recipient proof, cancellation after collection, COD liability and offline replay are covered.
- Hub path proves Agent → selected hub acknowledgment. A hub refusal does not rewrite custody. Van boarding cannot occur before the required physical handoff.
- Historical rows stay untouched. All new constraints/migrations are additive, nullable where legacy data needs it, with a tested down path and no inferred backfill.

## Gate

Close the Stage 3K–3R controlled phone and cash rehearsal, review PR #49's walk-in retry migration separately, and re-ground branch heads, production migrations and CI before coding against the combined candidate. Keep first-mile implementation on a non-production feature branch. The later Movement/Run layer consumes a physically received Parcel; it does not create a parallel logistics object or delivery authority.
