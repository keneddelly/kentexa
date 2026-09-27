# Walk-in parcel registration retry integrity (draft)

The Super Agent counter registration writes an Order, Parcel, custody event, invoice/receipt, and hub cash counters in one transaction. Previously a second POST after a lost response started an entirely new transaction and recorded the cash twice. A disabled submit button did not protect reloads or mobile network retries.

This candidate adds a nullable Order request UUID, payload hash and receipt snapshot, plus a partial unique index. The browser keeps one UUID for an unresolved form submission. The server locks the receiving hub row, then returns the original receipt for a matching retry without another invoice, custody event, counter change or SMS. A reused key with different fields, account or hub is rejected. The receipt snapshot is committed with the original invoice. Existing orders remain null and are not rewritten.

## Gate before release

1. Apply `1788282000000-AddWalkInRequestIdempotency` on an isolated PostgreSQL database. Prove first write, sequential and concurrent same-key replay, changed-payload rejection, invoice rollback, and one receipt sequence increment. Run the Stage 3A2 PostgreSQL workflow on the exact PR head.
2. Verify backend and frontend builds, then test a lost response and reload on a phone. Confirm the same tracking number and receipt return, and that a fresh form creates a new request key.
3. Review interaction with draft PR #47's multi-hub destination selection before merging. That branch has separate unpublished staging changes to the same form/service. The payload hash must include its explicit destination hub ID when integrating; a changed hub must not reuse a prior request.
4. Ship schema before behavior. Do not deploy the candidate to production or merge into PR #47 during the active Stage 3K–3R phone rehearsal.

This change does not backfill legacy walk-in orders and does not create a Shipment for the existing Order + Parcel counter path. That separate domain decision remains open.
