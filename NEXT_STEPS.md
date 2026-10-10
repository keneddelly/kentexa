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
2. **Back up the live database** (Render dashboard → the database → Backups, or `pg_dump` with the
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
   live is PostgreSQL 17 and must use the normal runner above.)
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
