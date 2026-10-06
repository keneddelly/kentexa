# Release process

Established by logistics repair Gate 0 (October 2026), after an audit found
reviewed fixes merged to a branch production did not deploy and 52 commits
pushed straight to the deployed branch in one afternoon.

## One deployable branch

`worktree-service-provider-profiles` is the production line. Render deploys
it. It should also be the GitHub default branch, so that a new pull request
targets it unless someone deliberately chooses otherwise, and it should be
protected (pull request required, the three Production Line CI checks
required, no force push). Both are repository settings that only the owner
can change: Settings -> General -> Default branch, and Settings -> Branches.
Until they are set, `master` remains the default and nothing stops a direct
push.

`master` is frozen at `77d2cb5` (the 1 September code plus #83-#85) and is
not the deployable branch. Nothing new is merged into it. Its three fixes
were checked against the production line: the two feature flags are already
on here, and the other changes build on models the repair replaces. Before
`master` is deleted or re-pointed, confirm in the Render dashboard that no
service still builds from it.

## How a change reaches production

1. Branch from `worktree-service-provider-profiles`.
2. Open a pull request back into it.
3. **Production Line CI** must pass: backend type-check, build and a real
   boot; the logistics specs on real PostgreSQL against the known-failure
   baseline; frontend tests and build.
4. Squash-merge. Render deploys the merge commit.
5. Confirm the deploy: `GET /version` on the API returns the merged commit.

A change that needs a migration or any manual production step says so in the
pull request description, and is merged only when that step can be run.

## Known-failure baseline

`.github/logistics-known-failures.txt` lists spec files that were already
failing when the repair started. CI fails on any failing spec that is not
listed, and also when a listed spec starts passing, so the list only shrinks.

## Which commit is live?

`GET https://api.kentexa.com/version` returns the commit and branch Render
built. Before Gate 0 this could only be inferred by probing for routes.

## Which schema is live?

`GET https://api.kentexa.com/version/migrations` compares the migration files
shipped in the running build with the database's own ledger
(`typeorm_migrations`) and lists the ones not applied (`pending`).

This matters because production does not run every migration on start. The
start command in `package.json` (`start:prod`) carries an upper bound,
`MIGRATION_RUN_UPTO=<timestamp>`, raised by hand one migration at a time.
Code can therefore be deployed ahead of a table it needs. Before merging a
change that depends on a migration, check that `pending` does not list it.

`sharedTimestamps` shows, for timestamps used by more than one migration
file, which names the ledger holds. Two files share `1788288600000`; do not
rename either until this report shows what production actually recorded.

## Transport supply

A trip a sender can book is an open, future **Transport Run**
(`src/transport/run-supply.ts`). Route search, the Journey composer, quoting
and booking read Runs only. `provider_availability` is no longer read by any
of them; it remains only behind the legacy Super Agent dispatch screen
(`GET /transport/available`) until that screen is retired.

Recurring schedules are topped up to their horizon hourly and at start-up
(`TransportRunService.extendScheduleHorizons`).

## Shipment lifecycle

A Shipment's operational status (`collected`, `in_transit`, `delivered`,
`completed`) and its three timestamps are derived, never set by hand, by the
one projector in `src/shipments/shipment-projection.ts`. It reads the custody
ledger and the Parcel's status, only moves forward, and is run when a parcel
moves and again whenever a Shipment is read. `pending`, `confirmed` and
`cancelled` remain the customer's own decisions in `ShipmentsService`.

Every intake creates or links a Shipment (`src/shipments/intake-shipment.ts`):
the send form, a Super Agent desk walk-in, a seller shipment and an Order
received at a hub. `shipment."intakeChannel"` says which.

The customer's tracking number is the Shipment's. A Parcel born from a
Shipment carries the same number; a parcel numbered before this
(`KTX-PCL-n`) is still found by the customer's number
(`src/shipments/customer-tracking.ts`).
