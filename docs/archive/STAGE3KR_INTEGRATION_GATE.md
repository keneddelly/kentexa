# Stage 3K–R behavior integration candidate

This branch merges the cumulative Stage 3K–R behavior head `0fae4d34e46d305019dfa80f66f8fc118f62cf0f` onto production schema commit `76d01ad6e13d5ba386eda511a0a70edf66cc5b04`. The four migrations are already applied to the production `kentexa` database (27 ledger rows through `1788281400000`); this diff does not add or rerun them. The schema deployment did not enable the behavior.

The combined candidate provides verified destination-hub-to-Agent handoff, non-COD recipient delivery, Agent COD handover and immutable collection/remittance evidence. It also blocks legacy terminal writers that could overrule custody: provider delivered webhook source, generic hub status, linked Agent Order delivery and Order completion without recipient custody. The source `WebhookController` is currently not registered in `TransportModule`; its rejected delivered method must remain rejected if that controller is registered later.

## Release gate

Run the exact integration commit through backend PostgreSQL workflows, focused tests, backend build and frontend build. Review the combined diff for role authority, transaction rollback, retry, recipient SMS and cash accounting. Before enabling real Agent COD use, exercise the hub, Agent, recipient and admin flows on phones with test transactions, including wrong/expired code, repeated confirmation, offline/retry, role switch and cash remittance receipt. Check legacy no-Parcel Order behavior and existing hub pickup. Keep all eight stacked PRs in draft until this combined gate is clean.

The Agent dashboard must load assigned Parcels even when its profile has no city and the separate direct-order service fails. A focused rendered frontend test covers this failure isolation. The new operational code and remittance controls use readable phone text and touch targets; an actual phone rehearsal is still required.

No automatic historical custody or COD backfill is permitted. Do not merge this candidate solely because CI passes; real-device and operational cash-handling validation remain separate release gates.
