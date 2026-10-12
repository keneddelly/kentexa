# Next steps — not built yet

## Working rules (owner, 2026-10-11)

- Only Claude changes code, and only on `marketplace-basic`. ChatGPT reviews only.
- No code change, commit, push, deploy or live-database step without the owner's "yes".
- Every new migration and environment variable is listed in this file. Nothing deploys until the
  migrations are on live.
- Claude does the engineering work; the owner's part is the fewest clicks and one line to paste.
  Claude does not sign in to Render databases.
- Explain in simple English; give honest advice.

## Next after Release B — FIRST step once Release B is stable (owner, 2026-10-11)

**Waybill on the counter receipt and the sender SMS.** The customer must end up with ONE number.
Today (live, and after Release B) the printed receipt and the sender SMS show only `KTX-ORD-…`; the
waybill exists in the database and is searchable, but the customer never sees it. Plan details:
section 1 below ("Waybill on the Super Agent counter"). Old numbers must keep working everywhere.
Then Release C: desk faults C1/C2 (section 9) and the walk-in claim code, option (a) (section 15).

## DONE 2026-10-12 — Release B live

- **Owner's changes to the checklist:** copy rehearsal SKIPPED (owner's decision: migrations only add,
  run in a transaction, 3 days of point-in-time recovery + a fresh export); the nightly reminder is
  **ON** from the first night (no `DISPATCH_REMINDER_ENABLED=false`; offices were told).
- Fresh export made by the owner before the run.
- 09:41–09:43 Tanzania time: `release-b.ps1 -Target live` — live host confirmed, start check
  1791514900000, B1 1791600000000 and B2 1791700000000 applied with all checks OK (130 old parcels kept
  no waybill); newest migrations 1791700000000, 1791600000000, 1791514900000; tracking test 404. Log:
  `C:\Users\BISHOO GROUP\release-b\release-b-live-20261012-094026.log`.
- 09:48: pushed `marketplace-basic` → `worktree-service-provider-profiles`, fast-forward
  `4d692ee..d4f27a5`; render.yaml unchanged (no Blueprint sync). Auto-Deploy On Commit.
- 09:50: `/version` = `d4f27a5`, started 2026-10-12T06:50:07Z. Public checks: unknown KTX-SHP → 404,
  unknown parcel → 404, receipt and dispatch-reminder routes without login → 401 (routes exist).
  Website bundle `main.cfdebfb8.js` contains the new counter texts, calls `https://api.kentexa.com`,
  no `localhost`.
- **Still to check:** Render logs (`Timed jobs: 9 registered, each once`; no `does not exist`); first
  real walk-in today: waybill + receipt reopen + Kabidhi (checklist tests 4, 8); Mizigo Yangu; recipient
  pickup with code; tonight 22:00–23:30 the reminder log line (one per tick) and the office SMS.

## Status on live — 2026-10-11 (owner)

- Release A done (below). Tracking an unknown number gives 404; single-parcel dispatch works.
- New database credential made; `DB_USERNAME` and `DB_PASSWORD` updated by hand on bishoo-backend
  (section 7 — done).
- `SHIPMENT_CLAIM_HMAC_KEY` added on bishoo-backend (section 8 — done).
- `/version` still shows `4d692ee`. Backups: export made 2026-10-11 + 3 days of Point-in-Time Recovery.
  Live database: PostgreSQL 18.6, paid plan.
- The folder `C:\Users\BISHOO GROUP\release-a` is gone (checked by Claude, 2026-10-11).
- `REACT_APP_API_URL` IS set on bishoo-frontend (owner, 2026-10-11, after a first wrong report).
  It stays a step to confirm before the Release B push (section 14).
- Owner also added `REACT_APP_API_URL` to bishoo-backend by mistake; the backend restarted at
  12:37 UTC (15:37 Tanzania) 2026-10-11, same code. Harmless: the backend never reads it. Left in place.
- **Not tested yet:** recipient pickup with a code (needs a receiving office with an arrived parcel).
- Next: Release B — see `RELEASE_B_CHECKLIST.md`.

## DONE 2026-10-11 — Release A applied on live

- 12:24–12:26 (Tanzania time): the five migrations 1791504000000, 1791507600000, 1791511200000,
  1791514800000, 1791514900000 were applied to the live database kentexa-db, one at a time, each
  checked. Run by the owner with `release-a.ps1` (masked URL prompt, live host check, typed YES).
- Before: Render export created (finished before the run); rehearsal on a Point-in-Time copy
  `kentexa-db-rehearsal` the same morning, 03:18–03:19, all five OK.
- After: newest recorded migration on live = 1791514900000. Public check
  `GET https://api.kentexa.com/shipments/track/KTX-SHP-999999` = HTTP 404 "Shipment not found"
  (was 5xx). `/version` unchanged (4d692ee, started 2026-10-08T15:31:06Z): no deploy, no restart.
- Still to do: check Render logs for `senderUserId` / `shipment_claim` (expect none after 12:26);
  track one real KTX-SHP number (expect HTTP 200); delete `kentexa-db-rehearsal`; delete the folder
  `C:\Users\BISHOO GROUP\release-a`; rotate the live database credential (section 7 below — DB_PASSWORD on bishoo-backend is typed by hand, so it does NOT follow automatically).
- Release B (B1 1791600000000, B2 1791700000000 + the marketplace-basic code) is still pending.
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

**The full, current step list is `RELEASE_B_CHECKLIST.md`** (guarded script, one line to paste).
The outline below is the first plan, kept for reference.

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

### LIVE 2026-10-12 10:57 (pushed d4f27a5..2130d6c, Auto-Deploy; backend + website checked) — switch `WAYBILL_CUSTOMER_FROM` NOT set yet

Also built at the owner's request (2026-10-12):
- Office/business names inside SMS texts only: curly quotes → straight, emoji removed
  (`smsSafeName`, `src/super-agents/customer-parcel-number.ts`); names unchanged everywhere else.
  The COD "limethibitishwa — Malipo" SMS dash replaced by "-" for the same reason.
- ONE universal printed receipt (`bishoo-frontend/src/utils/receiptPrint.js`): no forced paper size,
  slip `min(100%, 80mm)`, print units only (11pt text; number 16pt bold, never split over two lines,
  a little smaller only on a 58mm roll), 3mm margins. Checked at 48mm, 52mm, 74mm and A4/Letter.
- "Njia ya Malipo" printed in Swahili: Taslimu / Pesa kwa simu (M-Pesa / Airtel Money).
- Not changed (KenteXa's own text, not office names): the DELIVERED SMS uses "✅" and "🎉", which put
  that one message in the expensive mode — separate decision.

**After deploy, to switch on:** bishoo-backend → Environment → `WAYBILL_CUSTOMER_FROM` =
e.g. `2026-10-13T08:00:00+03:00` (a time AFTER the deploy). Every parcel received from then on gets
the waybill on receipt and SMS; earlier parcels keep KTX-ORD until delivered. Delete it to switch off.

**Rule:** everything a customer sees shows the waybill, printed `KTX 9815 9515 21`
(`formatWaybill`). `KTX-ORD-…` stays an internal staff reference and keeps working in every lookup.
Parcels without a waybill (the 130 from before 2026-10-12 09:43) keep `KTX-ORD` everywhere.

**Switch-over setting (NEW environment variable): `WAYBILL_CUSTOMER_FROM`** = a date-time.
Parcels created at or after it show the waybill on everything, receipt to delivery; older parcels keep
`KTX-ORD` until delivery, so no customer sees their number change mid-journey. Not set = `KTX-ORD`
everywhere, as today (the deploy itself changes nothing). The owner sets it after the deploy.

**Changes:**
- Printed receipt: "Namba ya Mzigo" = waybill, large; receipt number `KNT-RCP-…` stays; `KTX-ORD` not printed.
- Walk-in result screen, counter parcel rows (Pokea, Tuma, Historia, shehena), 🧾 Risiti window:
  waybill first, `KTX-ORD` small grey for staff.
- SMS in `super-agents.service.ts`: sender intake + "SMS tena"; recipient dispatched, "SMS tena",
  transport updated, "will be received by", arrived, pickup code, agent delivery code; pickup-task
  delivery code (`pickup-tasks.service.ts`); staff/agent SMS (shehena hand-over, transfer to hub,
  delivery request); `?track=` links use the stored waybill.
- Seller drop-offs (`createSellerShipment`): the waybill too (owner yes).
- Replace "→" with "-" in SMS texts: "→" forces UCS-2 (70 chars per part); the recipient "SMS tena"
  and "transport updated" texts drop from 3 parts to 2 (owner yes).
- Intake reads the database-made waybill back inside the same transaction (the column is not
  returned by the insert), like `shipment-activation.service.ts` already does.
- Not included: online marketplace orders ("Agizo #123" SMS) — separate decision.

**SMS length (measured, realistic texts):** the waybill adds ~4 characters; no message gets an extra
part (sender intake 188→192 chars, 2 parts; dispatched 248→252, 2; arrived 248→253, 2; pickup code
132→136, 1). Africa's Talking bills per part. A business name with a special character (’, emoji)
already forces the expensive mode today.

**Old numbers:** every lookup already accepts `KTX-ORD`, the waybill (with or without spaces) and
old shipment numbers (step 2, `resolveParcelTrackingNumber`). No migration, no old row changes.

**Tests:** each SMS text (right number, no extra part); waybill read-back on a local database; the
setting before/after its time; browser click test of the printed receipt and lists at phone width.
**Size:** backend ~1 day, frontend ~½ day. **Release:** code only (push → Auto-Deploy), then the owner
sets `WAYBILL_CUSTOMER_FROM` on bishoo-backend.

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
- Off-switch (built 2026-10-11, needs no setting to stay ON): `DISPATCH_REMINDER_ENABLED=false` stops the
  nightly SMS, the in-app reminder and the red notice. Changing it restarts the app with the same code.
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

## 7. Change the live database password (credential rotation) — owner, on Render — DONE 2026-10-11

**Why manual:** on bishoo-backend, `DB_PASSWORD` (and `DB_USERNAME`) are **typed by hand** in the
Environment tab, not linked to the database (render.yaml says `fromDatabase`, the dashboard does
not — another file/dashboard difference, see section 6). So a new credential is **not** picked up
by itself. Render keeps every existing credential valid until you delete it, so the order below
never leaves the app without a working password. Only bishoo-backend uses these settings.

1. **Quiet time**, not near 22:00. Have the Render dashboard open on both kentexa-db and bishoo-backend.
2. **New credential:** kentexa-db → **Info** → **Credentials** → **+ New default credential**.
   Leave the username empty (Render makes one) → **Create Credential**. Note the new **username**
   and copy the new **password** (do not paste them anywhere else).
   The old credential keeps working; nothing changes for the app yet.
3. **Update the app:** bishoo-backend → **Environment** → edit `DB_USERNAME` (the new username) and
   `DB_PASSWORD` (the new password). Leave `DB_HOST`, `DB_PORT`, `DB_NAME` unchanged.
   Click **Save** (Render offers "Save and deploy" / "Save, rebuild, and deploy" — either is fine).
   This redeploys the SAME code; the start-up migration step finds nothing to do.
4. **Wait for "Live"** on the bishoo-backend Events page.
5. **Test:**
   - `curl.exe -s https://api.kentexa.com/version` → answers, with a new `startedAt` time.
   - `curl.exe -s -w "\nHTTP %{http_code}\n" https://api.kentexa.com/shipments/track/KTX-SHP-999999`
     → HTTP 404 "Shipment not found" (proves the database login works).
   - Render logs: no `password authentication failed` lines.
   If anything fails: put the OLD username/password back in the Environment tab, save, wait for
   Live — the old credential still works because it is not deleted yet.
6. **Only now delete the old credential:** kentexa-db → **Info** → **Credentials** → trashcan next to
   the OLD user → confirm. (If it is the original user, Render deactivates it instead of deleting it.)
7. Repeat test 5 once more after the deletion.
8. Later, when render.yaml is corrected (section 6): decide whether DB_* should become `fromDatabase`
   again. If yes, a Blueprint sync will set them to the default credential's values.

## 8. SHIPMENT_CLAIM_HMAC_KEY (walk-in claim receipts) — check, owner — DONE 2026-10-11 (added)

- Used by walk-in claim receipts (`super-agents.service.ts:866`, `shipment-claim-crypto.ts:17`).
  It must be at least 32 characters. If it is missing, walk-in receive still works but no claim
  receipt is issued, and the log says
  `Walk-in claim receipt unavailable: SHIPMENT_CLAIM_HMAC_KEY not configured`.
- Not in render.yaml. Check bishoo-backend → Environment. If it exists: do not change it — a new
  value makes every receipt already handed out unusable.
- If missing: make a key on this PC straight into the clipboard (PowerShell 5 or 7; prints nothing):
  `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); (($b | ForEach-Object { $_.ToString('x2') }) -join '') | Set-Clipboard`
  Add it as `SHIPMENT_CLAIM_HMAC_KEY` (paste), save, wait for Live, then clear the clipboard:
  `Set-Clipboard -Value ' '` (and remove it from Windows clipboard history, Win+V, if that is on).
  Keep a copy only in a password manager.
## 9. Super Agent dashboard redesign — desk faults found on live 2026-10-11 (PLAN ONLY)

Line numbers below are from the LIVE code `4d692ee`
(`bishoo-frontend/src/public/pages/SuperAgentDashboard.js`, `src/super-agents/super-agents.service.ts`).

### Fault 1 — delivery method at walk-in intake is not automatic
- **Where:** SuperAgentDashboard.js:1342-1353 ("Mzigo ufikeje?"): three buttons — 🏍️ Agent delivery
  (`local_agent`), 🚐 Kentexa Van (`van`), 🚌 Intercity / Courier (`intercity`). They are ALWAYS shown;
  nothing compares origin and destination. Default is `local_agent` (line 276), reset to it after
  each parcel (line 628).
- **Backend:** super-agents.service.ts:644-645 accepts any of the three; it never checks it against
  the cities. With `local_agent` it sets NO destination office (lines 732-735).
- **Consequence:** a Dar → Katavi parcel left on the default is saved as "agent delivery" with no
  receiving office in Katavi — nobody there is told it is coming.
- **Wanted:** destination in another region → intercity chosen automatically; same region → only the
  local choices (agent, van); the office can still override by hand.
- **Smallest safe fix (frontend only, small):** when the destination place is picked (it already gives
  `regionName`, line ~1320), compare it with the office's region (`profile.city`, offices register a
  region): different → set `intercity` and show the local buttons only under "Badilisha kwa mkono";
  same → default `local_agent`, intercity only under the override. No backend change, so nothing
  that works today is refused. Optional later: the backend warns (does not refuse) on a mismatch.
- **What could break:** a wrong match if a city/region name is spelled differently (e.g. "Dar" vs
  "Dar es Salaam"); the override covers that. Test: unit test of the decision helper (same region,
  other region, unknown destination), plus local click-through: Dar→Katavi shows intercity selected;
  Dar→Dar shows agent/van only.

### Fault 2 — "Wakala wa Mtaa" offered when sending an intercity parcel
- **Where:** SuperAgentDashboard.js:2001-2015 (mode toggle "🚌 Basi / Courier" | "🏍️ Wakala wa Mtaa")
  in the 📤 Tuma panel, opened for intercity parcels by the "📤 Tuma" button (lines 2204-2207);
  agent list at 2139-2170.
- **Which agents it lists:** `localAgents`, loaded ONCE for the office's OWN city
  (line 493: `/agents/nearby?region=<office city>`). So for Dar → Katavi it lists **Dar** agents,
  while the text says "Chagua wakala wa mtaa … katika Katavi" (line 2142-2143) — misleading.
- **What it means / does:** choosing one sends `localAgentId` (line 818). The backend
  (super-agents.service.ts:1879-1886) records that agent with NO city check and marks the parcel
  **DISPATCHED** with the note "Imepewa wakala wa mtaa kwa uwasilishaji" — no bus, no courier.
  It is not door delivery at the destination, nor a collection point: it hands an intercity parcel
  to an origin-city agent as if that were the transport.
- **No agents in that city:** the panel says "Hakuna mawakala walioidhinishwa katika Katavi", but the
  "📤 Tuma Sasa" button still works: the backend has NO check that any transport detail was given
  (lines 1790-1878), so the parcel becomes DISPATCHED with only the note "Imetumwa".
- **Wanted:** offer an agent only when there are agents in the DESTINATION city and only for door
  delivery there; otherwise not shown — the recipient collects at the office or from a typed contact.
- **Honest advice:** door delivery at the destination is done by the DESTINATION office when the parcel
  arrives (it can see its own city's agents). The origin office should not pick it at dispatch. So:
  record "door delivery wanted" at intake, and let the destination office assign the agent.
- **Smallest safe fix (small):** in the intercity 📤 Tuma panel, remove the "Wakala wa Mtaa" toggle
  (keep it for same-city parcels — the "🏍️ Chagua Agent" path, lines 2196-2199, which correctly uses
  the office's own city). Backend guard (also small): for a parcel whose destination city differs from
  its origin, refuse `localAgentId`, and require a bus company, courier, or assigned transporter
  before marking it DISPATCHED.
- **What could break:** offices that use the agent option today as a workaround (e.g. a boda taking
  the parcel to the bus stand). Check first, read-only, on live:
  `SELECT count(*) FROM parcel WHERE status IN ('dispatched','in_transit','arrived_at_hub','delivered')
     AND lower(trim("originCity")) <> lower(trim("destinationCity")) AND "localAgentId" IS NOT NULL;`
  Test: unit tests for the backend guard (intercity + agent → refused; intercity + bus → OK; same city
  + agent → OK); local click-through of both panels.

### "KenteXa van" must become the van business's own name
The van is run by a transport provider with a local-loop route (van-pilot module); its own name is
`transport_provider.name`. Places that show "KenteXa Van" today:
- SuperAgentDashboard.js:1349 (walk-in button "🚐 Kentexa Van", hard-coded).
- SellerDashboard.js:513 (`seller_dashboard.kentexa_van`).
- Language files en/sw (fr only `kentexa_van`): `van_title` ("KenteXa Van — Dar es Salaam"),
  `van_status_title`, `van_today`, `kentexa_van`, `method_van` ("KenteXa Van Delivery"),
  `van_chosen_note`, `method_name_van_dar` (en.json lines 1394, 3143, 4308, 4337, 4694, 4729, 4756;
  sw.json 1173, 2922, 4087, 4116, 4473, 4508, 4535).
- Backend texts shown to sellers/buyers: orders.service.ts:3100 and daily-batches.service.ts:1054
  ("Van ya KenteXa inakuja … kila siku").
- Internal only (no change needed): VanToday.js:7 comment, migration 1788287400000 description,
  super-agent-cash-collection comments.
- Plan: one small backend endpoint "van operators serving this city" (active local-loop route,
  verified provider) → show the provider's name; if none, HIDE the van choice (capability-based,
  as CLAUDE.md asks). Texts take the name as a parameter, e.g. "🚐 {{vanName}}".

### Other places where the desk asks for something the system could work out itself
1. **Delivery method** — fault 1 above.
2. **Sender** (lines 1276-1287): name and phone typed every time; no lookup of a returning sender by
   phone (previous walk-ins or a registered user).
3. **Price** (line 1432 "Ada Uliyokusanya"): typed by hand although the estimate is already shown
   (lines 1368-1395, `/pricing/estimate`); it could be pre-filled from the estimate (editable).
4. **Recipient address asked twice:** the destination place (line ~1338 "Andika eneo la mpokeaji")
   and again "Anwani ya Mpokeaji *" (line 1418).
5. **Destination office:** chosen at intake (lines 1355-1364; auto only when there is exactly one),
   then offered AGAIN in the Tuma panel (`fetchDestinationHubs`, line 2207, form reset to
   `destinationSuperAgentId: null` at 2206) although the parcel already has one.
6. **Bus company and ticket** (lines 2034-2043): free text, although "🚌 Panga Usafiri" (2202-2203)
   already knows registered transporters/runs for the route; dispatch could pre-fill from an
   accepted assignment.
7. **Expected arrival date/time** (lines 2126-2135): typed, although the route has `estimatedDays`
   (intake already computes `expectedArrival`, super-agents.service.ts ~745-748).
8. **Bus vs courier** (2019-2032): defaults to bus every time, even when a courier/transporter is
   assigned.

### Before the redesign?
- **Fault 1 — yes**, small and frontend-only; prevents parcels being saved without a receiving office.
- **Fault 2 — yes** (hide the toggle for intercity), small; the backend guard is a small second step.
- "KenteXa van" name, and items 2–8 — leave for the redesign (they need new data/endpoints).
- **Handover to the recipient (KNOWN_FAULTS #19) — yes**, small and frontend-only; see section 10.

## 10. Receipt can always be opened again + visible handover (PLAN ONLY, KNOWN_FAULTS #15 and #19)

**Wanted (owner):** every parcel can be opened again at any time after creation, from the search box
(waybill, old number, phone, name) and from Historia, with: show receipt, print again, send the SMS
again. Re-printing or re-sending never creates a second parcel or a second charge. After creating a
receipt the screen stays on it until the office leaves with a clear "Mzigo mpya" button.

**Backend (small, read-only, no migration, no new setting):**
- New `GET /super-agents/parcels/:trackingNumber/receipt` in `super-agents.controller.ts`. The
  controller already runs `ParcelReferenceInterceptor` (line 38), so a waybill, `KTX-ORD-…` or old
  number all work.
- Returns the saved `order.offlineReceiptSnapshot` (already written for every walk-in since before
  4d692ee, `super-agents.service.ts` ~914). Only for the office that RECEIVED the parcel (its
  origin office); anyone else gets 403. No snapshot (online orders, seller drop-offs) → 404 with a
  clear Swahili message. It only reads: it cannot create a parcel, an invoice or a charge.
- Tests: own office gets the receipt; other office 403; no snapshot 404; lookup by waybill works.

**Frontend (small, `SuperAgentDashboard.js`):**
1. After a walk-in is created, the result screen stays until **"Mzigo mpya"** (today "+ Mteja
   Mwingine", line 1507). The × (1266) is not shown on the result screen; switching tabs and coming back
   shows it again; the last result is kept in the browser's session storage (per office) so a reload
   brings it back. Only "Mzigo mpya" clears it.
2. Historia rows (2261-2265) get two more buttons: **🧾 Risiti** (opens the saved receipt, with
   "🖨️ Chapisha tena" using the existing `handlePrintReceipt`) and **📲 SMS tena** (the existing
   `resend-sender-sms` / `resend-receiver-sms`, today hidden inside "Historia Kamili"). The Historia
   search (lines 530-536) also matches the waybill number.
3. Re-printing and re-sending call only these read/send endpoints, never `offline-intercity`.
   (A double tap on "create" is already safe: `requestKey`, service 650-660.)
- Cannot be re-shown: the walk-in claim secret (stored only as a fingerprint, by design).

**Handover (KNOWN_FAULTS #19), frontend only:** parcel rows that are ready for the recipient
(`arrived_at_hub` / `awaiting_buyer`, this office is not the origin, no door delivery requested — the
same rule as lines 2679-2681) get their own button **"🤝 Kabidhi kwa mpokeaji"**. It opens the same
sheet with the handover part on top. The ⏳ ZINASUBIRI MTEJA count already exists (line 1073).
No backend change: the same `pickup-code` / `confirm-pickup` calls as today.

**Size:** backend ~1 endpoint + 4 tests; frontend ~100 lines + tests; local click-through.
About half a day to one day. No migration, no environment variable.

## 11. Nightly reminder off-switch — BUILT 2026-10-11 (owner yes), not yet committed

On the first night after Release B, at 22:00, every office with a parcel received 6+ hours ago and
not dispatched gets one SMS. That is the feature, but there is no way to stop it without a code
deploy. Proposal: a setting `DISPATCH_REMINDER_ENABLED` (default `true`; `false` = no SMS and no
red notice, the job only logs "off"). Changing it on Render restarts the app with the same code.
New environment variable → if built, it is listed here and in RELEASE_B_CHECKLIST.md.

## 12. Business rules decided (owner, 2026-10-11)

- KenteXa owns only technology. No hubs, vans, buses. Holds no money.
- Super Agents are the main offer. Each sets its own route price and HOW it charges: percent of goods
  value (often 10%, may be 5%), per kg, minimum charge, or a mix. KenteXa shows the rule and
  calculates the total for the customer's parcel.
- Each offer says pickup: no / free / priced, and door delivery: no / free / priced. Admin sets a
  maximum for pickup and delivery only.
- The customer books the Super Agent, not a bus trip. The Super Agent picks the bus later, in the shehena.
- Sender must enter goods value; locked at creation; it is the most paid if the parcel is lost.
  The last holder is responsible.
- Kg and size are mainly for matching the right provider and vehicle.
- One invoice: pickup, transportation, delivery, total. Free is shown as "free". The same numbers on
  offer, confirmation and invoice.
- Payment for now: cash to the agent at pickup (the office confirms parcel and money together), or
  mobile money to the office, confirmed by a phone call and marked paid by the office.
- Free pickup is mostly done by the Super Agent's own agents.
- Bus companies must not be shown in a way that hurts the Super Agents who feed them cargo.
- Super Agents said they would pay for KenteXa. Pricing not decided (per waybill or monthly).
  **Count waybills per office from now on.**
- Growth beyond Tanzania later: new records carry a country and a currency, default Tanzania and TZS.
  Never hard-code them.

## 13. Design decisions — not built yet (owner, 2026-10-11)

1. **Super Agent dashboard: two big buttons, POKEA and TUMA, and one search box.** "Simple door,
   complex engine."
   - POKEA: Walk-in; Kutoka KenteXa (orders and shipments are ONE line — the backend knows the
     difference, the office is never asked); Shehena kutoka ofisi nyingine.
   - TUMA: Kwa usafiri (mzigo mmoja, shehena); Kwa mpokeaji (handover with code); Kwa wakala wa mtaa.
   - Menu for the rest: Historia, Mapato, Bei, Van; later Washirika and Ofisi yangu.
   - Each line shows a count. Each parcel row shows ONE next action.
   - The system fills in what it already knows: destination office, bus company used last time, price
     from the office's rule, known sender by phone number (see section 9, "Other places").
   - Official KenteXa colours from Theme.js. Swahili first. Works on a phone and a slow connection.
     Never fails silently.
   - The old layout stays available during a trial.
2. **Pickup request alert, loud:** screen card with sound and Accept / Cannot; SMS at 2 min; automatic
   call at 5 min; tell the sender and show the office phone at 10 min. Times are settings. Office
   working hours respected.
3. **Partner invitations use no KenteXa SMS.** The Super Agent shares a personal link from their own
   WhatsApp or SMS. Final only after the Super Agent confirms the person. States: invited, opened,
   joined, confirmed.
4. **Longer direction, not now:** one consented Connection between profiles; a directory by capability
   and place; then an intent record and a server-side coordinator for "send a parcel".

## 14. Render dashboard settings — confirm by hand (names only, never values)

**Why:** render.yaml is NOT what live uses. Found so far: `DB_USERNAME` / `DB_PASSWORD` typed by hand
(section 7). `REACT_APP_API_URL` on bishoo-frontend: confirmed set by the owner 2026-10-11.
**Release B must not be pushed until `REACT_APP_API_URL` is confirmed again** (RELEASE_B_CHECKLIST
step 0): the new frontend has no live fallback any more.

**bishoo-frontend** — the code reads only ONE setting:
- [ ] `REACT_APP_API_URL` (read at build time; also used for the live chat connection)

**bishoo-backend — must exist (the app refuses to start, or a core feature breaks):**
- [ ] `NODE_ENV` (must be `production`)   - [ ] `NODE_VERSION`
- [ ] `JWT_SECRET`
- [ ] `DB_HOST`  - [ ] `DB_PORT`  - [ ] `DB_NAME`  - [ ] `DB_USERNAME`  - [ ] `DB_PASSWORD`
- [ ] `AT_API_KEY`  - [ ] `AT_USERNAME`  - [ ] `AT_SHORTCODE` (all SMS)
- [ ] `CLOUDINARY_CLOUD_NAME`  - [ ] `CLOUDINARY_API_KEY`  - [ ] `CLOUDINARY_API_SECRET` (images)
- [ ] `SHIPMENT_CLAIM_HMAC_KEY` (walk-in claim; added 2026-10-11 — never change it)

**bishoo-backend — must NOT exist on live (test switches; any of them would change live behaviour):**
- [ ] `TYPEORM_SYNCHRONIZE`  - [ ] `PAYMENTS_ALLOW_MOCK`
- [ ] `STAGE3KR_DISABLE_OUTBOUND_SMS` (would stop all SMS)  - [ ] `STAGE3KR_SMS_REHEARSAL`
- [ ] `STAGE3KR_SMS_TEST_PHONE`  - [ ] `STAGE3KR_DISABLE_UPLOADS`  - [ ] `STAGE3KR_FRONTEND_ORIGIN`
- [ ] `MIGRATION_RUN_UPTO`  - [ ] `MIGRATION_RUN_CONFIRM` (start:prod sets these itself)
- [ ] `PRODUCT_TRANSFER_CONFIRM`  - [ ] `B5B_TEST_DB_HOST` / `_PORT` / `_PASSWORD`
- [ ] `BASELINE_ADOPTION_EXPECTED_HOST` / `_DATABASE`

**bishoo-backend — optional; note which exist (missing = that feature is off or uses a default):**
- Links/contact: `FRONTEND_URL`, `BACKEND_URL`, `SUPPORT_PHONE`, `ADMIN_EMAIL`, `REQUIRE_PHONE_VERIFICATION`
- E-mail: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_SECURE`
- Push notifications: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
- Maps: `GOOGLE_MAPS_API_KEY`
- AI: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `QWEN_API_KEY`,
  `QWEN_BASE_URL`, `AI_SIMPLE_PROVIDER`, `AI_SIMPLE_MODEL`, `AI_REASONING_PROVIDER`, `AI_REASONING_MODEL`,
  `AI_CODING_PROVIDER`, `AI_CODING_MODEL`, `AI_SIMPLE_FALLBACK_PROVIDER`, `AI_REQUEST_TIMEOUT_MS`,
  `AI_CACHE_TTL_MS`, `AI_MAX_INPUT_CHARS`, `EMBEDDING_PROVIDER`
- Payments (only if payments are switched on): `PAYMENTS_ENABLED_PROVIDERS`, `PAYMENT_EVIDENCE_SEAL_KEY`,
  `PAYOUT_DESTINATION_COOLING_OFF_SECONDS`, `CLICKPESA_API_KEY`, `CLICKPESA_API_URL`, `CLICKPESA_CLIENT_ID`,
  `SELCOM_API_KEY`, `SELCOM_API_SECRET`, `SELCOM_API_URL`, `SELCOM_CALLBACK_URL`, `SELCOM_VENDOR_ID`,
  `AIRTEL_BASE_URL`, `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, `VODACOM_BASE_URL`, `VODACOM_CALLBACK_URL`,
  `VODACOM_CONSUMER_KEY`, `VODACOM_CONSUMER_SECRET`, `VODACOM_SHORTCODE`
- Release B (all optional, defaults built in): `DISPATCH_REMINDER_ENABLED`, `DISPATCH_REMINDER_STALE_HOURS`,
  `DISPATCH_REMINDER_SMS_TIME`, `DISPATCH_REMINDER_LATEST_TIME`
- Waybill on counter receipt/SMS (planned, section 1): `WAYBILL_CUSTOMER_FROM` (not set = KTX-ORD as today)

**Set by Render itself — do not add:** `PORT`, `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH`.

(List made 2026-10-11 by searching the marketplace-basic code for every setting it reads, plus
render.yaml. Release B adds no required setting.)

## 15. Release C plan: let walk-in customers claim their parcels online (KNOWN_FAULTS #20) — PLAN ONLY

**Today:** the claim code is made at intake (valid 30 days, stored only as a fingerprint) but never shown
or printed. The claim flow itself already exists and is tested: a VERIFIED KenteXa account types the
code in Mizigo Yangu → an SMS code (OTP) goes to the **sender phone typed at the counter** → typing it
links the parcel to the account. At most 3 SMS per person per parcel per hour, 1 minute apart.

**a) Show the code once and print it on the first receipt**
- Work: frontend only, small. Show the code on the receipt screen; put it on the FIRST print only. Keep it
  in page memory only (never in browser storage) — so after "Mzigo mpya" or a reload it is gone, and
  "Chapisha tena" prints without it (as today's note says).
- Safety: two things needed to claim — the paper AND the sender's phone (OTP). A typo in the phone
  at the counter only means the OTP goes nowhere; nobody else gets the parcel. Strong.
- Weak points: paper lost / not printed → cannot claim (a later "new code" button at the counter
  could fix this). The code shown on screen could be photographed by someone standing near the desk —
  still useless without the sender's phone.
- SMS cost: 1 OTP per claim, only for customers who choose to claim (plus re-sends, max 3 per hour).
  Nothing for walk-ins who never claim.

**b) No printed code: sign in with the sender phone, parcels linked automatically**
- Work: backend, medium. When a verified account's phone equals a walk-in's sender phone (after
  normalising 07… / 255… / +255…), link the parcel to that account (on login or when Mizigo Yangu
  opens). Needs a rule for how far back, and care with phone formats. The printed-code path would be
  unused.
- Safety: ONE thing needed — control of that phone number. Risks: (1) a typo at the counter links
  the parcel to a STRANGER who owns the mistyped number — they would see the recipient's name,
  phone, address and the goods value; (2) recycled numbers: a number given to a new person later gets
  the old owner's parcels; (3) shared family/office phones. Each is a privacy leak, not just a failure.
- SMS cost: 0 extra for customers already verified; for a new account, the normal sign-up OTP (1 SMS),
  once per person, not per parcel. Cheapest.

**Honest advice: (a) is both safer and simpler.** It reuses the claim flow that is already built and
tested, needs only a frontend change, and a counter typo can never hand a parcel to the wrong person.
(b) is smoother for customers and cheaper in SMS, but a mistyped or recycled phone number shows one
customer's parcel to another. If (b) is wanted later, make it a suggestion ("We found 2 parcels sent from
your number — confirm with the code we SMS to that number"), and only for parcels from the last few days.

## 16. Release C — BUILT 2026-10-12 on marketplace-basic (local commits, not live)

Count check on live first (owner, `release-c\count-agent-dispatch.ps1`, read-only): parcels 0, offices 0
— no office had ever sent an intercity parcel through "Wakala wa Mtaa".
- **C1:** walk-in intake picks the delivery method from the office region vs the destination region
  (`regionMatch.js`): another region → only "Intercity / Courier"; same region → agent / van; unknown →
  all three. "Badilisha kwa mkono" shows all three.
- **C2:** the Tuma panel shows no "Wakala wa Mtaa" for an intercity parcel; the backend refuses
  (`dispatchParcel`) a local agent for an intercity parcel and an intercity dispatch with no bus,
  courier or arranged transport (`region-match.ts`).
- **Claim code, option (a):** shown once on the receipt screen (in page memory only, never stored),
  printed on that first receipt with the steps; reprints and the 🧾 Risiti window say it cannot be shown
  again. Mizigo Yangu → "Ongeza mzigo wa dawati" now asks for the **Namba ya Mzigo on the receipt**
  (waybill or old number) instead of the internal shipment id — new routes
  `POST /shipments/claim-by-number/start` and `/claim-by-number`; spaces in the code are ignored. Unknown
  numbers get the same answer as a wrong code. The SMS code step can only be checked on live.
- No migration, no new setting. Deploy = push (code only).

## 17. Same-city door pickup: customer must give the ward or a map pin (PLAN ONLY, owner 2026-10-12)

Today the send form takes any place from the place search for "Pick up from me" — a whole region
("Dar es Salaam") is accepted, so the agent does not know where to go. The shipment already has
`originWard`/`originWardId` and coordinates, but coordinates are only server-derived from the chosen
place (the client may never send its own — Stage 2B rule).
- **A. Ward required (no migration, ~1 day):** for door pickup, the chosen pickup place must be a ward
  or finer; if the search result is only a region/district, a ward list appears (existing ward data /
  `LocationPicker`). Backend refuses door pickup without a ward. Agent pickup screen shows ward + landmark.
- **B. "Tumia mahali nilipo" pin (+1 migration, ~1 more day):** the phone's GPS position with its
  accuracy, stored in NEW, clearly "sender-given" columns (never mixed with the server-derived
  coordinates), plus a "Fungua ramani" link for the agent. Needs a Release-B-style migration step.
- **Not recommended now:** a draggable map (needs a map library and an outside tile server).
- Recommendation: A first (small, safe), then B if agents still cannot find senders.
