# Next steps — not built yet

## How to deploy safely

Follow this every time code with a new migration goes live. The first time it is for the waybill
migration `1791600000000-AddParcelWaybillNumber`; later migrations follow the same steps.

**Why the order matters.** The live server (`start:prod` in package.json) runs migrations only up
to `MIGRATION_RUN_UPTO=1788292800000` when it starts. Every newer migration must be applied by hand.
New code that expects a new column breaks when that column is missing — for the waybill, every
screen that loads a parcel would fail, **including the Super Agent counter**. So: database first,
code second. A migration that only adds things is safe to apply before the code; old code ignores it.

**Remember:** Render deploys from the branch `worktree-service-provider-profiles`, not `master`.
A push to that branch can start a deploy. Do not push there until step 6.

1. **Choose a quiet time.** Not during busy counter hours and not near 18:00 (evening reminders).
2. **Back up the live database** (Render dashboard → the database → Backups, if your plan has them; or `pg_dump` **version 18** — see "PostgreSQL versions" below — with the
   external connection string). Keep the file until the deploy has been fine for a week.
3. **See what is pending.** On the live database run:
   `SELECT name FROM typeorm_migrations ORDER BY timestamp DESC LIMIT 10;`
   Compare with the files in `src/database/migrations/` (only names starting with a 13-digit number).
   Every migration file newer than the last row is pending, oldest first.
4. **Rehearse on a copy first.** Restore the backup into a separate database (never the live one),
   point `DB_HOST/DB_NAME/DB_USERNAME/DB_PASSWORD` at that copy, build (`npx nest build`), then run
   ONE pending migration at a time, oldest first:
   `MIGRATION_RUN_CONFIRM=RUN_REAL_MIGRATIONS MIGRATION_RUN_UPTO=<that migration's 13-digit number> node dist/database/run-migrations-direct.js`
   Start the new code against the copy and check: old tracking numbers work, a new parcel works.
   (The PostgreSQL-16 test runner in the developer's scratch folder is for local tests only —
   live is **PostgreSQL 18.6** and must use the normal runner above. The rehearsal copy must also
   run on PostgreSQL 18 — see "PostgreSQL versions" below.)
5. **Apply on live, one migration at a time**, oldest first, with the same command and
   `DB_SSL=true`, pointing at the live database. After each one, check directly in the database —
   not through the app. For the waybill migration:
   - `SELECT column_default FROM information_schema.columns WHERE table_name='parcel' AND column_name='waybillNumber';`
     → shows `kentexa_generate_waybill()`
   - `SELECT count(*) FROM parcel WHERE "waybillNumber" IS NOT NULL;` → `0` (old parcels untouched)
   - `BEGIN; INSERT INTO parcel ("originCity","destinationCity") VALUES ('x','y') RETURNING "waybillNumber"; ROLLBACK;`
     → returns a number like `KTX9584287081`, and nothing is saved.
6. **Only now deploy the code** (merge/push to the deploy branch, or manual deploy in Render).
7. **Check right after the deploy:**
   - Render logs show no `column ... does not exist` errors.
   - Track one old parcel number on the tracking page — it still works.
   - The first new parcel (counter or send form) has a waybill.
   - The Super Agent counter can receive a parcel and print the receipt as before.
8. **If something goes wrong:** roll back the **code** in Render ("Rollback" to the previous deploy).
   That is safe because the migration only added things. Do **not** run a migration's `down()` on
   live unless a developer has checked it first — it can delete data (for the waybill: every
   waybill number already given to customers).

### PostgreSQL versions (live is 18.6) — what it changes

Live runs **PostgreSQL 18.6**. This PC has **PostgreSQL 16**; all local tests so far ran on 16.

- **The new migrations are fine on 18.** `1791600000000` (waybill) and `1791700000000` (reminders)
  use only long-standing features: PL/pgSQL functions, `gen_random_uuid()` (built in since 13),
  `md5()`, `CREATE INDEX ... WHERE`, `CHECK` and `UNIQUE` constraints. Nothing in them was removed or
  changed in 17 or 18. Still, a test on 18 is better than a reasoned guess — see the next points.
- **Backups need version-18 tools.** `pg_dump` refuses to dump a server newer than itself, so the
  `pg_dump` 16 on this PC **cannot** back up the live database. Install the PostgreSQL 18 client tools
  (or full PostgreSQL 18) before deploy day, or use Render's own backups if the plan includes them.
  (`render.yaml` still says `plan: free` for kentexa-db; Render's free Postgres has no backups —
  check the real plan in the dashboard.)
- **The rehearsal copy (step 4) must run on PostgreSQL 18.** A dump from 18 does not reliably load
  into 16. Install PostgreSQL 18 locally next to 16 (a different port, e.g. 5433) or use a Render copy.
  Then rehearse with the normal migration runner (no test-only shims needed on 18; pgvector must be
  installed there too, because live uses it).
- **psql 16 for read-only queries is OK.** It prints a warning that the server is newer; simple
  queries such as Q1–Q7 work. Path on this PC: `C:\Program Files\PostgreSQL\16\bin\psql.exe`.

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
