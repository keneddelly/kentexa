# Stage 3J — recipient pickup gate (review of local candidate)

Production baseline: `0a553c4c2e006ef0eb26fd44f3c74e74d5ddbfbb`. The current candidate is uncommitted in `feature/stage3j-hub-self-pickup`, based on Stage 3I `7ec0936`.

## Gate result: HOLD

The buyer's self-pickup selection is a preference, not a handover. The existing candidate adds a receiving-hub action that immediately writes `recipient_self_pickup` custody, `Parcel.SELF_PICKUP`, `Order.DELIVERED`, and `Shipment.DELIVERED`. This is not ready for release.

1. `SuperAgentsService.confirmRecipientPickup` has no recipient-held evidence. A hub operator's click alone cannot establish who took the parcel. The custody event's `toCustodianId` comes from a phone lookup, which identifies an account, not the person present.
2. `Parcel.buyerPhone` can belong to an external recipient without a Kentexa account. The current account lookup fails for that legitimate shipment; falling back to `Order.buyer` may identify the payer instead of the recipient.
3. Direct `Order.DELIVERED` updates bypass the order payment-evidence and canonical seller-release boundary. COD `codBalanceCollected` alone is not a complete settlement decision. A physical handover and an order's financial completion cannot be treated as one simple status update.
4. The candidate's PostgreSQL test is skipped without an isolated database. Its in-memory test proves transaction call order but cannot establish the production race and rollback behavior.

## Required correction before merge

- Use a short-lived, one-time recipient-held handover credential bound to one Parcel and sent to the recipient contact, with an authenticated receiving-hub actor. Do not store or expose the plaintext credential after issue. Design expiry, bounded attempts, reissue, SMS failure, and replay. A Kentexa account must remain optional for the recipient.
- Under a Parcel row lock, verify the credential, verified destination-hub custody, active hub context, pickup choice, and current Parcel state. Atomically consume the credential and write the Parcel state, append-only custody event, and public tracking. Preserve the external-recipient identity as a verified contact/evidence reference rather than inventing a User ID.
- Keep Order and Shipment financial/fulfilment transitions under their existing authoritative services. Define their post-handover convergence, failure/retry policy, and any COD collection path before changing their statuses. Do not silently release seller proceeds or claim payment completion.
- Cover recipient-without-account, payer-versus-recipient, invalid/expired/replayed code, wrong hub/role, unpaid COD, conflicting status writers, concurrent confirmations, and rollback in native PostgreSQL.

## Candidate correction in this feature worktree

The local candidate now issues a one-time SMS code to the parcel recipient phone, stores only a salted scrypt hash, limits attempts/reissues, and requires the active receiving hub to present that code before writing custody. The event identifies an external recipient contact without inventing a Kentexa User ID. The code can also express the recipient's pickup choice when a shipment had no previous choice; an explicit delivery request still blocks hub pickup. COD handover is blocked. The candidate checks canonical payment evidence for applicable non-COD checkout orders and writes physical Order `DELIVERED` with Parcel/custody/tracking under one transaction. Seller proceeds remain untouched; buyer confirmation continues through the canonical release path. The existing `Shipment` logistics status can be updated in that transaction.

The final non-COD candidate passed local SMS failure/phone-edit tests, frontend/backend builds and the native PostgreSQL rollback/replay/concurrent-confirmation gate on PR #35 head `82e7f0dfbca69b30cfd95bd4ef986a6ae5ce36ee`. Communication visibility and the COD boundary still require independent review. It must remain a draft; no Stage 3J production deployment or migration is approved by this review. Kentexa Van/Movement is outside this gate.

## COD pickup: separate integration gate

`SuperAgentsService.updateParcelStatus(DELIVERED)` presently invokes `OrderReleaseService.releaseSellerProceeds` for Kentexa-mediated COD, or updates the order directly for a seller-arranged shipment. It then increments `Parcel.superAgentEarnings`, increments `SuperAgent.codCashHeld`, issues a COD receipt, and finally updates Parcel/tracking. These later writes are outside the release service's transaction and several catch errors. A successful seller credit followed by a failed Parcel write therefore leaves money and custody inconsistent. Reusing that method from the code-gated hub pickup would inherit this gap.

COD handover needs one authoritative transaction that locks Order then Parcel, checks deposit evidence, code, receiving hub, remaining balance and amount collected, and commits exactly once: canonical seller routing/release and COD companion fields, hub cash liability/agent fee, Parcel status, custody event, tracking and physical Order/Shipment status. A blocked routing target must leave the handover and collected flags unchanged and remain durably diagnosable. Receipt/SMS/activity should run after commit with retryable reconciliation. The canonical `OrderReleaseService` may need a bounded in-transaction completion hook or equivalent shared operation; do not call its current outer transaction and then write custody in another transaction. Prove release failure, custody/tracking failure after routing, replay, and concurrent COD handovers in native PostgreSQL before enabling COD pickup.

## COD candidate update — still HOLD

The feature branch now adds a bounded completion callback inside canonical seller release. COD code verification rechecks the locked Parcel after preflight and joins custody, tracking, physical status, hub cash liability, agent fee, and invoice/receipt with the release transaction. Seller-arranged shipments use a transaction without a seller credit, preserving the zero-fee routing rule. Unit tests and frontend/backend builds pass. A PostgreSQL test covers release callback rollback, blocked routing, and concurrent release. The original non-COD pickup PostgreSQL test covers custody rollback and replay. A further PostgreSQL test drives the full COD service path using a database-backed release stand-in to prove blocked release, tracking/receipt rollback, replay, and concurrent confirmation. It passed on PR #35 head `19618f918120f2db465c1a2e04c07c9470436244`. Because the stand-in does not prove every canonical release and invoice internal in one test, independent review must assess the combined evidence. PR #35 remains draft and production migration/deployment remains blocked. The legacy generic COD delivery endpoint still has its older split accounting writes and is outside this candidate.
