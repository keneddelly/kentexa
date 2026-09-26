# Stage 3K — destination hub to local Agent custody candidate

Base: production `5203db1a3071477df1b58cc8f57c1f17d225c95e`. This branch is separate from the draft legacy COD accounting PR #37. No production change is authorized by this candidate.

## Authority

Claiming a destination Parcel (`claimParcel`) or the recipient selecting an Agent (`chooseDestinationMethod`) assigns a job; neither proves the Agent physically received it. The latest custody event must be `destination_hub_received` for the selected destination hub. The hub with an active Super Agent context issues a short-lived one-use six-digit handoff code. The recipient-selected, approved Agent enters it with an active Agent context. The code is shown once to the hub, never included in the Agent's API response, Parcel list, or tracking projection.

`confirmAgentHandoff` locks the Parcel, checks selected Agent User ID, role ownership, latest verified hub custody, code hash/expiry/attempts, and hub binding. A successful transaction writes `destination_agent_received` from Super Agent hub ID to local Agent User ID, moves Parcel to `OUT_FOR_DELIVERY`, clears the challenge, and appends tracking. Incorrect attempts persist under the lock; replay and concurrent confirmations fail. A failed event/tracking insert rolls all operational writes back. No Order/payment/COD or Shipment status changes occur.

The additive migration `1788279600000` adds nullable challenge columns to Parcel without backfilling history. It guards the all-or-none challenge shape, and DOWN refuses while a challenge is pending. The code hash uses a random salt and is bound to Parcel and Agent User ID. Expiry is 10 minutes, issue throttle one minute, and five incorrect attempts exhaust it.

The generic hub status sheet cannot mark Agent-assigned Parcels `OUT_FOR_DELIVERY` or `DELIVERED`; this is rechecked under a row lock so a stale request cannot overwrite the handoff. The Agent delivery-status endpoint requires the Agent receipt event before moving out for delivery or marking delivered. Unsettled COD delivery is blocked at that endpoint. The later recipient delivery proof and Agent COD cash-holder accounting remain separate, necessary gates; this feature does not claim terminal delivery custody.

## Validation and rollout gate

Backend typecheck and frontend build pass locally. The isolated PostgreSQL test covers wrong actor/code, rollback after a failed tracking write, one winner among concurrent Agent confirmations, migration constraint and DOWN/re-UP with no historical Parcel rewrite. It must pass on the exact PR head in CI. Review the `claimParcel` pre-choice behavior and frontend role context before release. If approved later, deploy the schema alone, run the bounded production migration through `1788279600000`, verify ledger/columns, then deploy behavior. Do not deploy behavior ahead of its schema, fabricate old custody events, or merge PR #37 alongside it.
