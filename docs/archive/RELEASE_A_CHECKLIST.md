# Release A checklist — apply the five missing migrations to live

**Goal:** end the live outage (KNOWN_FAULTS.md #13). Apply five migrations to the live database,
one at a time. **No code deploy, no restart** — the running live code (`4d692ee`) already expects them.
They only add things; no existing row is changed. Locally each took about 1 second.

| # | Migration | Adds |
|---|---|---|
| A1 | 1791504000000 | empty column `shipment."senderUserId"` + index |
| A2 | 1791507600000 | empty table `shipment_claim_challenge` |
| A3 | 1791511200000 | empty table `shipment_claim_receipt` |
| A4 | 1791514800000 | two empty onboarding tables (removed again by A5) |
| A5 | 1791514900000 | removes those two tables |

**Suggested time (Tanzania):** start ~06:15. Avoid 05:00–05:10 and 06:00–06:10 (existing nightly jobs).

---

## 0. The evening before (5 minutes)

- [ ] In PowerShell: `cd 'C:\Users\BISHOO GROUP\marketplace-basic'` then `npx nest build`
      (ends without errors).
- [ ] Render → kentexa-db → **Connect**: you can see the **External Database URL**. It looks like
      `postgresql://USER:PASSWORD@HOST/DATABASE` (HOST ends with `.render.com`).
- [ ] Optional: run the public check once and note the answer (expected today: 5xx):
      `curl.exe -s -w "\nHTTP %{http_code}\n" https://api.kentexa.com/shipments/track/KTX-SHP-999999`

---

## 1. Rehearsal on a Render copy (≈ 30–45 minutes, mostly waiting)

**On Render:**
- [ ] kentexa-db → **Recovery** → scroll to **Point-in-Time Recovery** → **Restore Database**.
- [ ] Name `kentexa-db-rehearsal`. Time: about 15 minutes ago (Render refuses times within
      10 minutes of now). **Copy Existing Settings: Yes** → **Start Recovery**.
- [ ] Wait for **Available** ("Recovery In Progress" → "Creating" → "Available").
- [ ] Open `kentexa-db-rehearsal` → **Connect** → note HOST, USER, DATABASE of its External URL.
      (If the copy's IP allow list blocks this PC, add this PC's IP **to the copy only**.)

**On this PC — open a NEW PowerShell window and paste this block once** (fill HOST, USER,
DATABASE of the **copy**; the password is typed when asked and is not shown or stored):
```powershell
cd 'C:\Users\BISHOO GROUP\marketplace-basic'
$env:DB_HOST='HOST'; $env:DB_PORT='5432'; $env:DB_USERNAME='USER'; $env:DB_NAME='DATABASE'
$env:DB_PASSWORD = Read-Host 'Database password'
$env:PGPASSWORD = $env:DB_PASSWORD; $env:PGSSLMODE='require'; $env:DB_SSL='true'
$env:MIGRATION_RUN_CONFIRM='RUN_REAL_MIGRATIONS'
function Q($sql) { & 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USERNAME -d $env:DB_NAME -tA -c $sql }
function RunA($ts) {
  if ($ts -notin '1791504000000','1791507600000','1791511200000','1791514800000','1791514900000') { Write-Host 'REFUSED: not a Release A migration'; return }
  $env:MIGRATION_RUN_UPTO = $ts; node dist/database/run-migrations-direct.js; Remove-Item Env:MIGRATION_RUN_UPTO
}
Write-Host "Connected to: $env:DB_HOST / $env:DB_NAME"
```
- [ ] **Check you are on the COPY:** the line `Connected to:` shows the **copy's** HOST.

**Start check (must be correct before going on):**
```powershell
Q 'SELECT max("timestamp") FROM typeorm_migrations'
```
Correct: `1788292800000`. (psql may first print `WARNING: psql major version 16, server major
version 18` — that is normal.) If you see a bigger number, STOP: the copy is not what we expect.

**Then run A1 → A5, each followed by its check:**

| Step | Command | Correct output of the runner | Check | Correct check output |
|---|---|---|---|---|
| A1 | `RunA 1791504000000` | `Executed migrations: AddShipmentSenderOwnership1791504000000` | `Q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='shipment' AND column_name='senderUserId'"` | `1` |
| A2 | `RunA 1791507600000` | `Executed migrations: AddShipmentClaimChallenges1791507600000` | `Q "SELECT to_regclass('public.shipment_claim_challenge')"` | `shipment_claim_challenge` |
| A3 | `RunA 1791511200000` | `Executed migrations: AddShipmentClaimReceipts1791511200000` | `Q "SELECT to_regclass('public.shipment_claim_receipt')"` | `shipment_claim_receipt` |
| A4 | `RunA 1791514800000` | `Executed migrations: AddSuperAgentOnboardingOfficers1791514800000` | `Q "SELECT to_regclass('public.super_agent_onboarding_officer')"` | `super_agent_onboarding_officer` |
| A5 | `RunA 1791514900000` | `Executed migrations: RemoveSuperAgentOnboardingActivation1791514900000` | `Q "SELECT to_regclass('public.super_agent_onboarding_officer')"` | an **empty** line |

Each runner run also prints a line like `MIGRATION_RUN_UPTO=1791504000000 — selecting 47 migration(s)`
and `Running migrations...` — normal.

**Final check on the copy:**
```powershell
Q 'SELECT "timestamp" FROM typeorm_migrations ORDER BY "timestamp" DESC LIMIT 6'
```
Correct: `1791514900000`, `1791514800000`, `1791511200000`, `1791507600000`, `1791504000000`,
`1788292800000` (newest first). **Never** `1791600000000` or `1791700000000` (those are Release B).

- [ ] All five correct on the copy → go on. Anything else → STOP (see section 4), live is untouched.
- [ ] Close this PowerShell window.
- [ ] Render → `kentexa-db-rehearsal` → **Settings** → **Delete Database** (billed while it exists;
      contains customer data).

---

## 2. Live (≈ 15 minutes)

- [ ] **Backup:** Render → kentexa-db → **Recovery** → **Create export**. Wait until it shows
      finished. Write down the time: ________ (Tanzania) / ________ (UTC).
- [ ] Open a **NEW** PowerShell window. Paste the **same block** as in section 1, but with HOST,
      USER, DATABASE of **kentexa-db** (the live one).
- [ ] **Check you are on LIVE:** `Connected to:` shows kentexa-db's HOST.
- [ ] Start check: `Q 'SELECT max("timestamp") FROM typeorm_migrations'` → `1788292800000`.
- [ ] A1: `RunA 1791504000000` → runner output and check exactly as in the table above.
- [ ] A2: `RunA 1791507600000` → as in the table.
- [ ] A3: `RunA 1791511200000` → as in the table.
- [ ] A4: `RunA 1791514800000` → as in the table.
- [ ] A5: `RunA 1791514900000` → as in the table.
- [ ] Final check: the six numbers as above, newest `1791514900000`.
- [ ] Close the PowerShell window (the password leaves memory).

---

## 3. The three tests afterwards (≈ 10 minutes)

1. **Public tracking — the same request as before.**
   ```powershell
   curl.exe -s -w "\nHTTP %{http_code}\n" https://api.kentexa.com/shipments/track/KTX-SHP-999999
   ```
   Correct: `{"message":"Shipment not found","error":"Not Found","statusCode":404}` and `HTTP 404`.
   **Not** a 5xx. This proves the shipment table can be read again.
2. **Public tracking of a REAL shipment.** Admin → **Shipments** → copy any real `KTX-SHP-…` number,
   then the same command with that number. Correct: `HTTP 200` and JSON that starts with
   `{"trackingNumber":"KTX-SHP-…"`. Read-only; changes nothing.
3. **Render logs.** bishoo-backend → **Logs**, from the time A5 finished: search `senderUserId` and
   `shipment_claim`. Correct: **no new lines**. Later in the day, when an office dispatches a single
   parcel or confirms a recipient pickup, still no such lines.

(After these, the send form and the office pickup/delivery buttons work again. "Mizigo Yangu" still
opens the homepage — that is a separate front-end fault, KNOWN_FAULTS.md #14.)

---

## 4. If something fails

- **A runner run prints `Migration run failed: ...` (or any error):** STOP. Do not run the next one.
  That migration was rolled back completely (one transaction); the database is as before it.
  Copy the full error text and send it to the developer. Then check what is recorded:
  `Q 'SELECT max("timestamp") FROM typeorm_migrations'`.
- **The runner prints `No pending migrations — already up to date.`:** that migration is already
  applied. Run its check; if the check is correct, continue with the next.
- **A check gives a different answer than the table:** STOP, send both outputs to the developer.
- **Cannot connect** (timeout / SSL / password): check HOST, USER, DATABASE and the IP allow list;
  nothing has changed in the database.
- **On the copy:** any failure → stop and delete the copy; do NOT start the live part.
- **On live, after A1–A5 succeeded but a test fails:** do not undo anything (no `down()`); the five
  only added things. Send the test output to the developer.
- **Last resort only (data damaged — very unlikely):** Point-in-Time Recovery to the time written
  down at the backup. Render creates a NEW database; the backend must be pointed at it and anything
  written after that time is lost. Decide with the developer first.
- **Never** run `node dist/database/run-migrations-direct.js` directly in this release — always
  `RunA`. Without the ceiling the runner would also apply the Release B migrations.
