# Stage 3M — terminal writer isolation review (draft)

Base: draft Stage 3L `fb00083`, which depends on Stage 3K PR #38. Production remains `5203db1` in GitHub. This candidate does not authorize merge, migration, or deploy.

## Transport provider webhook

`POST /api/v1/webhook/delivered` authenticated only an enabled provider key and accepted any tracking number. It did not validate a TransportAssignment for that provider, current Parcel custodian, recipient proof, or terminal state. It updated Parcel before tracking in separate writes and sent an SMS. `receivedBy` was caller-supplied text. A provider could therefore set an unrelated Parcel to `DELIVERED` or repeat the operation. This draft rejects that terminal route; departure/arrival routes are unchanged. A future provider delivery path must bind provider → assignment → Parcel → recipient verification and commit custody, Parcel, Order/Shipment, and tracking together. Existing provider clients calling `/delivered` will receive a conflict response; check real usage before any rollout.

## Remaining Order completion bypass

`OrdersService.syncParcelDeliveredForOrder()` runs after `buyerConfirm`, `confirmViaToken`, and the auto-confirm cron. It best-effort writes Parcel `DELIVERED`, tracking and Agent commission after Order completion/release. It does not inspect the custody ledger. A buyer account is not necessarily the physical recipient. A public confirmation token is also not physical custody proof. The Order release may succeed while Parcel/tracking writes fail, and an active Agent or hub could still hold the Parcel. This remains **unresolved**, so PR #39 is not a complete terminal-delivery gate.

The next bounded design must distinguish financial buyer confirmation from recipient physical handover, preserve historical no-custody records without fabricating new events, serialize Order/Parcel locks before seller release where applicable, and give legitimate recipients without accounts a path. Verify races with Agent handover, public token confirmation and auto-release against real PostgreSQL. Do not blindly disable buyer confirmation or infer recipient identity from buyer ownership.

## Gate

This PR's transport webhook rejection has a focused no-write test in the Stage 3F PostgreSQL workflow; backend typecheck passes locally. It is a draft because the Order path and generic hub terminal status path still require review and a replacement or isolation. Stage 3K/3L schema-first rollout remains separate and unapproved.
