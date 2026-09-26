# Stage 3P — legacy Agent Order delivery boundary

Draft candidate stacked on PRs #38–#42. Do not deploy this on its own.

The legacy `PATCH /agent-orders/:orderId/deliver` wrote Order `DELIVERED`, an auto-release date and success SMS without using the Parcel's recipient proof. An Order may have a linked Parcel under destination hub or Agent custody, so that route could present a false delivery even though the Parcel was still moving.

The route now locks the Order, rechecks current Agent assignment and Order state, and refuses delivery if any Parcel references that Order. Only the verified Parcel pickup or selected Agent handover/delivery paths may finish those shipments. The existing order-only path remains functional and sends SMS after its transaction commits. A retry or competing request cannot complete the same Order twice. No schema or historical rows change.

The PostgreSQL gate checks linked Parcel rejection with no status, deadline or SMS change; an order-only success; and competing completion requests. Review the direct Agent Order claim and pickup workflow separately: it remains legacy and lacks physical recipient proof for orders with no Parcel. Agent-held COD collection/settlement remains blocked pending its own ledger and release design. Before production, apply and verify the prior additive custody migrations in order, then review the stacked branch and live traffic implications.
