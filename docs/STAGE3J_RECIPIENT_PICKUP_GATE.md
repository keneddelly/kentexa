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

The local candidate now issues a one-time SMS code to the parcel recipient phone, stores only a salted scrypt hash, limits attempts/reissues, and requires the active receiving hub to present that code before writing custody. The event identifies an external recipient contact without inventing a Kentexa User ID. COD handover is blocked. The candidate checks canonical payment evidence for applicable non-COD checkout orders and leaves Order settlement/status to its authoritative service. The existing `Shipment` logistics status can be updated with Parcel and custody in one transaction.

The corrected candidate still needs a native PostgreSQL gate, comprehensive races and SMS failure tests, and an explicit Order convergence/communication design. It must remain a draft; no Stage 3J production deployment or migration is approved by this review. Kentexa Van/Movement is outside this gate.
