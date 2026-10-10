# Next steps — not built yet

## How to deploy safely

### Why live is missing migrations (the "automatic cut-off")

When the live server starts, `npm run start:prod` first runs the migration runner with
`MIGRATION_RUN_UPTO=1788292800000` (package.json). That number is a **ceiling**: the runner applies
only migrations whose number is **at or below** it, and quietly skips every newer one (its start-up
log says `MIGRATION_RUN_UPTO=1788292800000 — selecting 46 migration(s)`). The ceiling was put there
on purpose, so that no new migration ever runs on live by surprise. But it means every newer
migration must be applied **by hand**, and on 2026-10-08 five migrations were added to the code
(commits 1e3c28f, 5499c88) without anyone applying them. The code went live; the database did not
change. Confirmed by the owner on live, 2026-10-10: the newest recorded migration is
`1788292800000`, and the five checks all say NO.

**What is broken on live because of it** (reproduced locally with the exact live code `4d692ee`
on a database with exactly live's structure; every call below fails, and works after the five):
- Send form: creating a shipment (`column "senderUserId" of relation "shipment" does not exist`).
- My Shipments and tracking by a shipment number KTX-SHP-... (`column Shipment.senderUserId does not exist`).
- Counter: **dispatching a single parcel**; **recipient collecting at the office** (pickup code,
  confirm, COD confirm); **agent delivering to the recipient** (delivery code, confirm, COD confirm);
  transport assignment — for EVERY parcel (`column Parcel__Parcel_shipment.senderUserId does not exist`).
- Walk-in claim (sender claims a walk-in shipment): `relation "shipment_claim_challenge" does not exist`.
**Still working:** walk-in receive at the counter and its receipt and SMS, shehena (create, add, dispatch),
the counter search/tracking by parcel number, customer SMS sent by those flows.
Render logs: search for `senderUserId` and `shipment_claim` — every hit is one failed request.

### The safe order: two separate releases

**Release A — fix live now: the five old migrations, CURRENT code, no deploy.** The live code
already expects them, so applying them fixes the broken screens immediately; nothing else changes.
They only add things (and the last two cancel each other out), so the current code is not at risk.
**Release B — later, separate day: the two new migrations, then the marketplace-basic code.**
Doing A alone first means: the outage ends sooner, each day has fewer moving parts, and if
something goes wrong you know which step caused it.

| # | Migration | What it does on live | Lock / risk |
|---|---|---|---|
| A1 | `1791504000000` AddShipmentSenderOwnership | adds empty column `shipment."senderUserId"` + a small index | brief lock on `shipment` (writes wait ~a second); no data changed |
| A2 | `1791507600000` AddShipmentClaimChallenges | new empty table `shipment_claim_challenge` | brief lock on `shipment` for the foreign key |
| A3 | `1791511200000` AddShipmentClaimReceipts | new empty table `shipment_claim_receipt` | brief lock on `shipment` for the foreign key |
| A4 | `1791514800000` AddSuperAgentOnboardingOfficers | creates two empty onboarding tables | brief lock on `user`; fails only if those tables already exist (checked: they don't) |
| A5 | `1791514900000` RemoveSuperAgentOnboardingActivation | removes those two tables again | none (empty tables) |
| B1 | `1791600000000` AddParcelWaybillNumber | new waybill column + functions + unique index on `parcel`; old rows untouched | brief lock on `parcel` |
| B2 | `1791700000000` AddDispatchReminders | two new empty tables + index | brief locks |

Locally each took about 1 second. Each run of the runner is one transaction: if a migration fails,
it is rolled back completely and nothing is half-done.

**Backups on Render (checked 2026-10-10):** kentexa-db is on the paid plan `0.1c-256mb`,
PostgreSQL 18.6. The Recovery page has **Point-in-Time Recovery** (any moment in the last 3 days)
and **Export** (a full logical backup, kept 7 days). No `pg_dump` from this PC is needed.

### How to run one migration (used in every step below)

In PowerShell, in the project folder, with the database's **External Database URL** from Render
(kentexa-db → **Connect**; for the rehearsal, the copy's URL). It looks like
`postgresql://USER:PASSWORD@HOST/DATABASE`. Never paste it into chat or into a file in the project.
```
npx nest build
$env:DB_HOST='HOST'; $env:DB_PORT='5432'; $env:DB_USERNAME='USER'; $env:DB_NAME='DATABASE'
$env:DB_PASSWORD = Read-Host 'DB password'
$env:DB_SSL='true'; $env:MIGRATION_RUN_CONFIRM='RUN_REAL_MIGRATIONS'
$env:MIGRATION_RUN_UPTO='<13-digit number>'; node dist/database/run-migrations-direct.js
```
Run them **one at a time, oldest first**, changing only `MIGRATION_RUN_UPTO`. Each run should print
`Executed migrations: <that one>`. Stop at the first error and ask. Close PowerShell at the end so
the password does not stay in memory. Run the checks with psql (`C:\Program Files\PostgreSQL\16\bin\psql.exe`).

### The check after each migration (run on the same database)

```sql
-- A1 1791504000000: expect 1 and IDX_shipment_sender_user
SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='shipment' AND column_name='senderUserId';
SELECT to_regclass('public."IDX_shipment_sender_user"');
-- A2 1791507600000: expect shipment_claim_challenge
SELECT to_regclass('public.shipment_claim_challenge');
-- A3 1791511200000: expect shipment_claim_receipt
SELECT to_regclass('public.shipment_claim_receipt');
-- A4 1791514800000: expect super_agent_onboarding_officer (created)
SELECT to_regclass('public.super_agent_onboarding_officer');
-- A5 1791514900000: expect an EMPTY result (removed again)
SELECT to_regclass('public.super_agent_onboarding_officer'), to_regclass('public.super_agent_onboarding_audit');
-- B1 1791600000000: expect kentexa_generate_waybill(), then 0, then a number like KTX9584287081 (nothing saved)
SELECT column_default FROM information_schema.columns WHERE table_name='parcel' AND column_name='waybillNumber';
SELECT count(*) FROM parcel WHERE "waybillNumber" IS NOT NULL;
BEGIN; INSERT INTO parcel ("originCity","destinationCity") VALUES ('x','y') RETURNING "waybillNumber"; ROLLBACK;
-- B2 1791700000000: expect both names shown
SELECT to_regclass('public.parcel_still_here_mark'), to_regclass('public.super_agent_dispatch_reminder');
-- After any step: every migration you ran is recorded
SELECT "timestamp", name FROM typeorm_migrations ORDER BY "timestamp" DESC LIMIT 8;
```

### Release A — the five old migrations (current code, no deploy)

1. **Rehearse on a Render copy (same day is fine — it takes about 30–45 minutes).**
   1. kentexa-db → **Recovery** → scroll to **Point-in-Time Recovery** → **Restore Database**.
   2. **Name:** `kentexa-db-rehearsal`. **Time:** about 15 minutes ago (Render refuses a time within
      10 minutes of now). **Copy Existing Settings:** Yes. Click **Start Recovery**. Render creates a
      **separate new database** ("Recovery In Progress" → "Creating" → "Available"); kentexa-db keeps
      running unchanged.
   3. When it shows **Available**: open it → **Connect** → copy its External Database URL. (It copies
      live's IP allow list; if that blocks this PC, add this PC's IP to the copy, not to live.)
   4. Run A1 → A5 on the copy (section "How to run one migration"), with the check after each.
   5. Delete the copy: `kentexa-db-rehearsal` → Settings → **Delete Database** (billed while it
      exists; contains customer data).
2. **Quiet time.** Not during busy counter hours, not near 22:00.
3. **Backup:** kentexa-db → **Recovery** → **Create export**. Wait until it shows finished. Write
   down the time (Tanzania and UTC) — Point-in-Time Recovery is the second safety.
4. **Apply A1 → A5 on live**, one at a time, with the check after each.
5. **Check the app (no deploy needed — the running code picks the columns up immediately):**
   - Render logs: no new lines with `senderUserId` or `shipment_claim`.
   - Send form: a test shipment can be confirmed (then cancel it, or use a test account).
   - My Shipments opens; tracking a KTX-SHP number works.
   - Counter: dispatch one parcel; confirm a recipient pickup with a code (or ask an office to try).
6. **If something goes wrong:** these five only add things, so there is nothing to roll back in the
   code. Do not run their `down()` without a developer. Last resort: Point-in-Time Recovery (below).

### Release B — the new code (later, separate day)

1. **Rehearse on a Render copy** exactly as in Release A step 1, but run **B1 → B2** (from the
   marketplace-basic folder), then start the new code against the copy with all outgoing messages off
   (the copy holds real customers' phone numbers):
   ```
   $env:NODE_ENV='production'; $env:STAGE3KR_DISABLE_OUTBOUND_SMS='true'; $env:PGSSLMODE='no-verify'
   $env:JWT_SECRET='rehearsal-only'; $env:CLOUDINARY_CLOUD_NAME='x'; $env:CLOUDINARY_API_KEY='x'; $env:CLOUDINARY_API_SECRET='x'
   node dist/main
   ```
   No AT_*, payment or mail keys on this PC, so nothing can reach a customer or move money.
   (`PGSSLMODE=no-verify` turns on SSL, which Render requires from outside; the app has no SSL
   setting of its own. Not yet tried against Render — if the app cannot connect, stop and ask.)
   Check the log: `Timed jobs: 9 registered, each once`, and no `column ... does not exist`. With the
   local frontend (REACT_APP_API_URL unset = this PC): an old tracking number still tracks; the
   counter page loads. Stop the app, close PowerShell, **delete the copy**.
2. **Quiet time**, not near 22:00 (the nightly reminder runs 22:00–23:30).
3. **Backup:** **Create export**, write down the time.
4. **Apply B1 → B2 on live**, one at a time, with the check after each.
5. **Only now deploy the code** (merge/push to the deploy branch, or manual deploy). Read
   "render.yaml and the Blueprint" below first.
6. **Check after the deploy:** Render logs show `Timed jobs: 9 registered, each once` and no
   `column ... does not exist`; an old parcel number still tracks; the first new parcel has a waybill;
   the counter can receive a parcel and print the receipt as before.
7. **If something goes wrong:** roll back the **code** in Render ("Rollback" to the previous deploy) —
   safe, because B1/B2 only add things and old code ignores them. Do not run `down()` on live without
   a developer (B1's `down()` deletes every waybill number already given to customers).

**Last resort, either release (data damaged):** Point-in-Time Recovery to a moment before the
migrations. Render creates a **new** database; the backend must then be pointed at it, and everything
written after that moment is lost. Decide this with a developer.

**Remember:** Render deploys from the branch `worktree-service-provider-profiles`, not `master`.

### PostgreSQL versions (live is 18.6) — what it changes

- **The new migrations are fine on 18.** `1791600000000` (waybill) and `1791700000000` (reminders)
  use only long-standing features: PL/pgSQL functions, `gen_random_uuid()`, `md5()`, partial indexes,
  `CHECK` and `UNIQUE` constraints. Local tests ran on PostgreSQL 16; the Render rehearsal copy in
  step 4 is the real test on 18.
- **Nothing to install for backups or the rehearsal:** Render does the export and the copy, and the
  migration runner (Node) works with PostgreSQL 18. The PostgreSQL-16 test runner in the developer's
  scratch folder is for local tests only — never use it on live or on the Render copy.
- **psql 16 for read-only queries is OK.** It prints a warning that the server is newer; simple
  queries work. Path on this PC: `C:\Program Files\PostgreSQL\16\bin\psql.exe`.

### render.yaml and the Blueprint — read before any push to the deploy branch

kentexa-db is "Blueprint managed", and `render.yaml` still says `plan: free`, but the real plan is
the paid `0.1c-256mb`. Render applies `render.yaml` to the real resources in a **Blueprint sync**.
A sync happens automatically on a push to the Blueprint's linked branch **only if that push changes
`render.yaml`**, or when someone clicks **Manual Sync**. A push that does not touch `render.yaml`
only deploys code. The marketplace-basic commits do not touch `render.yaml`.
If a sync ever runs with `plan: free`, Render would try to move the database to free. Render does
not support downgrading Postgres, so the sync most likely fails with an error such as "cannot
downgrade database ... to free" (community reports, not an official guarantee) — and other changes
in that same sync may not be applied. Fix: see section 6 below (plan only, not done yet).

Rules for every future migration:
- Only add things (tables, nullable columns, indexes, defaults) in the same release as new code.
  Removing or renaming something needs two releases: first stop using it, later remove it.
- Never edit a migration that has already run on live; write a new one.
- Do not raise `MIGRATION_RUN_UPTO` in `start:prod` without a decision: that makes the server run
  migrations by itself at start, with no rehearsal.

---

Agreed items that are waiting for a separate "yes". Written down so they are not forgotten.

## 1. Waybill on the Super Agent counter (receipts and counter SMS)

Step 2 (waybill numbers) deliberately did **not** change the counter. Today:

- Walk-in parcels (`createOfflineIntercityOrder`) and seller drop-offs (`createSellerShipment`)
  in `src/super-agents/super-agents.service.ts` still print and SMS `KTX-ORD-{id}`.
- Each of those parcels now ALSO gets a waybill from the database automatically, and every
  counter lookup accepts it (through `ParcelReferenceInterceptor` → `resolveParcelTrackingNumber`).

Later step (needs its own yes, because it changes the counter):

- Print the waybill on the walk-in receipt and the seller drop-off receipt.
- Put the waybill in the counter's sender/receiver SMS (check SMS length and cost first).
- Show the waybill in the Super Agent dashboard parcel lists and the shehena parcel list.
- Decide which number staff should say to customers. Suggestion: the waybill for the parcel,
  KTX-ORD only for payment/order questions.
- Old numbers must keep working everywhere (they already do).

## 2. Before deploying step 2 — ORDER MATTERS

The live server runs migrations only up to `MIGRATION_RUN_UPTO=1788292800000` at start
(package.json `start:prod`). Migration `1791600000000-AddParcelWaybillNumber` will **not** run by itself.

1. Back up the live database.
2. Apply migration `1791600000000-AddParcelWaybillNumber` by hand (it only adds a column, a unique
   index, two functions and a default; it does not change existing rows).
3. Check it directly in the database (not through the API):
   - the column `parcel."waybillNumber"` exists, existing rows are NULL;
   - the default is `kentexa_generate_waybill()`;
   - a test insert in a transaction gets a number, then roll back.
4. Only then deploy the code. If the code goes out first, every query that loads a parcel fails
   ("column waybillNumber does not exist") — **including the counter**.

## 3. Other agreed follow-ups

- Intercity "Pick up from me": no pickup job is created (KNOWN_FAULTS.md #5) — build-order step 8.
- Send-form success screen must tell the truth when no pickup job exists — plan given, waiting for yes.
- Frontend default API address must not be the live site — plan given, waiting for yes.

## 4. Nightly "received but not dispatched" reminder — deploy notes

- Migration `1791700000000-AddDispatchReminders` (two new tables + one index). Apply it with the
  steps in "How to deploy safely", after `1791600000000` (waybill).
- If the code goes out before this migration, the counter still works; only the red notice stays
  hidden and the nightly job logs errors. Still: database first.
- Settings on Render (optional — these are the defaults):
  `DISPATCH_REMINDER_STALE_HOURS=6`, `DISPATCH_REMINDER_SMS_TIME=22:00`, `DISPATCH_REMINDER_LATEST_TIME=23:30`.
- Each office needs `super_agent.phone` filled in, or it gets only the in-app notice
  (admins see "Hakuna simu ya ofisi" on the Dispatch reminders page).
- Cost: at most one SMS per office per night, plus one retry if the first fails.

## 5. Change the local PostgreSQL password (the owner will do it later)

The old local password was in the public repository (removed in commit 44e35af, still in Git history).
The live database is NOT affected (checked: Render's DB_PASSWORD is different).
1. In psql: `\password postgres` (type the new password twice; it is not shown).
2. Run the helper script from the 2026-10-10 session (update-local-db-password.ps1). It updates the
   password line in the 7 local `.env` files (main bishoo-backend, marketplace-basic, 5 worktrees)
   without printing it, and keeps backups in `C:\Users\BISHOO GROUP\env-backups-before-password-change`.
   If that script is gone: change `DB_PASSWORD=` by hand in those 7 files.
3. Update the saved password in pgAdmin, if used.
4. Check each project still connects, then delete the backup folder.

## 6. render.yaml says `plan: free`, the real database plan is paid `0.1c-256mb` (PLAN ONLY)

**What a Blueprint sync does** (Render docs, render.com/docs/infrastructure-as-code and
render.com/docs/blueprint-spec): the Blueprint wins — at the next sync, values in `render.yaml`
overwrite settings changed in the dashboard. A sync runs automatically only on a push to the
Blueprint's **linked branch** that **changes `render.yaml`**, or when someone clicks **Manual Sync**.
Pushes that do not change `render.yaml` (like all marketplace-basic commits) only deploy code.

**If a sync ran today with `plan: free`:** Render would try to move kentexa-db to free. Render does
not support downgrading Postgres, so the sync most likely stops with an error like "cannot
downgrade database ... to free" (Render community answers; not an official guarantee). The data
should not be touched, but the other changes in that same sync may not be applied either.

**Proposed correction** (its own small commit, its own day — not with the big deploy):
```yaml
databases:
  - name: kentexa-db
    plan: 0.1c-256mb # the real, paid plan. A Blueprint sync applies this value — keep it equal to the dashboard.
    databaseName: kentexa
    user: kentexa
```
Do NOT add `diskSizeGB` or `postgresMajorVersion`: when left out, Render keeps the current disk size
and version of an existing database (the version can never be changed after creation anyway).

**Careful — pushing this correction is itself a change to `render.yaml`, so it triggers a sync of
the WHOLE file**, for every service in it (bishoo-backend, kentexa-early-access, bishoo-frontend):
plans, build/start commands and env var values written in the file (e.g. NODE_VERSION,
REACT_APP_API_URL). Anything changed in the dashboard since would be overwritten. Safe order:
1. In Render → Blueprints → this Blueprint → Settings: note the **linked branch**, set **Auto Sync: No**.
2. Compare every service's settings in the dashboard with `render.yaml`; correct the file where the
   dashboard is right (only `sync: false` env vars are never overwritten).
3. Commit and push the corrected file.
4. On the Blueprint page, review the pending changes, then click **Manual Sync** at a quiet time.
5. Optional: turn Auto Sync back on.
