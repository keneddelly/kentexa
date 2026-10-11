# Release B checklist — two new migrations, then the marketplace-basic code

**Goal:** put the marketplace-basic work on live: waybill numbers, the nightly "received but not
dispatched" reminder (red notice), the honest intercity pickup message, "Mizigo Yangu" fix, every timed
job runs once, the two safety fixes, and the send-form wording.
(Plus, only if the owner says yes before the day: receipt reopen + visible handover, NEXT_STEPS
section 10, and the reminder off-switch, section 11.)

**The rule of this release: the database first, the code second.** The two migrations only ADD
things and the current live code (`4d692ee`) ignores them, so they can go on live while the old code
runs. The new code needs them, so it must not start before them.

| # | Migration | Adds | Check |
|---|---|---|---|
| B1 | 1791600000000 AddParcelWaybillNumber | column `parcel."waybillNumber"`, 2 functions, unique index, default | default is `kentexa_generate_waybill()`; no OLD parcel got a number; the function gives `KTX` + 10 digits |
| B2 | 1791700000000 AddDispatchReminders | 2 new empty tables + 1 index | both tables exist |

Locally each took about 1 second; each runs in its own transaction (fails = rolled back completely).
Note: from B1 on, every NEW parcel gets a waybill from the database automatically, even while the old
code still runs. That is intended and harmless (the old code just does not show it).

**New environment variables:** none required.
- Optional, defaults shown (leave them out to use the defaults): `DISPATCH_REMINDER_STALE_HOURS=6`,
  `DISPATCH_REMINDER_SMS_TIME=22:00`, `DISPATCH_REMINDER_LATEST_TIME=23:30`.
- Only if the off-switch (NEXT_STEPS 11) is built: `DISPATCH_REMINDER_ENABLED` (default `true`).
- Already on live, do not change: `SHIPMENT_CLAIM_HMAC_KEY`, `DB_USERNAME`, `DB_PASSWORD`.

**The script:** `C:\Users\BISHOO GROUP\release-b\release-b.ps1` (outside the project, like Release A;
Claude writes it and tests it on local databases after the owner's yes). It:
- asks for the database URL with a **hidden** prompt (never shown, never written to a file or log);
- `-Target copy` refuses the live host; `-Target live` refuses anything except the live host
  `dpg-d9qnaprm8hqs738q3ku0-a` and asks you to type `YES`;
- start check: newest migration must be `1791514900000` (Release A), otherwise it stops;
- runs B1, checks it, runs B2, checks it — only these two, never anything newer, never `down()`;
- copy only: starts the new code against the copy with all outgoing SMS/e-mail/payments impossible
  (no keys on this PC, SMS switched off), waits for `Timed jobs: 9 registered, each once`, checks there
  is no `column ... does not exist`, asks it for an unknown tracking number (expects 404), then stops it;
- live only: ends with the public tracking test (expects 404);
- writes a log next to itself, without the password or the full address; prints `ALL OK` or `STOP`.

---

## 0. The day before (owner ≈ 5 minutes, Claude the rest)

- [ ] Owner: "yes" to the final Release B content (with or without NEXT_STEPS 10 and 11).
- [ ] Claude: final local test run (backend tests for the changed parts, frontend build with
      `CI=true`, so warnings cannot break the Render build), and confirms the live branch on GitHub is
      still `4d692ee` (then the push is a plain fast-forward).
- [ ] Owner, Render → **bishoo-frontend** → **Environment**: `REACT_APP_API_URL` exists and is the live
      API address. **Important:** the new frontend no longer falls back to the live API by itself
      (commit e3a51a5). If this setting were missing, the new site would call `localhost` and nothing
      would load. (render.yaml says `https://bishoo-backend.onrender.com`; the dashboard value wins.)
- [ ] Owner, Render → **bishoo-backend** → **Settings** → **Auto-Deploy**: note whether it is
      "On Commit" or "Off". Same for **bishoo-frontend**. Do not change it.
- [ ] Owner: tell the offices that from the first night after Release B they may get ONE SMS at 22:00
      if a received parcel has not been dispatched for 6+ hours.

## 1. Rehearsal on a Render copy (≈ 30–45 minutes, mostly waiting)

- [ ] kentexa-db → **Recovery** → **Point-in-Time Recovery** → **Restore Database**. Name
      `kentexa-db-rehearsal`, time about 15 minutes ago, **Copy Existing Settings: Yes** → **Start Recovery**.
- [ ] When it shows **Available**: open it → **Connect** → copy its **External Database URL**.
- [ ] In PowerShell, paste ONE line:
      ```
      powershell -ExecutionPolicy Bypass -File "C:\Users\BISHOO GROUP\release-b\release-b.ps1" -Target copy
      ```
      Paste the copy's URL when asked (not shown). Wait for `ALL OK` (about 3–5 minutes).
- [ ] `STOP` or any error → do not go on; send the log file to Claude. Live is untouched.
- [ ] Delete the copy: `kentexa-db-rehearsal` → **Settings** → **Delete Database**.

## 2. Backup (≈ 10 minutes)

- [ ] kentexa-db → **Recovery** → **Create export**. Wait until finished. Write down the time:
      ________ (Tanzania) / ________ (UTC).

## 3. Migrations on live (≈ 5 minutes)

- [ ] Copy kentexa-db's **External Database URL**. Paste ONE line:
      ```
      powershell -ExecutionPolicy Bypass -File "C:\Users\BISHOO GROUP\release-b\release-b.ps1" -Target live
      ```
      Paste the URL when asked, type `YES` when asked. Wait for `ALL OK`.
- [ ] Tell Claude "migrations done". At this moment live runs the OLD code on the NEW database —
      safe; the counter works as before. If needed, you can stop here for hours or days.

## 4. The new code goes live (≈ 15–25 minutes, mostly Render building)

How it works: Render builds bishoo-backend and bishoo-frontend from the GitHub branch
`worktree-service-provider-profiles` (not `master`). Today that branch is `4d692ee`;
marketplace-basic is built on top of it, so the update is a plain fast-forward.

- [ ] Owner says "push". Claude checks the branch is still `4d692ee`, then runs
      `git push original marketplace-basic:worktree-service-provider-profiles`.
      (Or, if you prefer a pull request on GitHub: Claude opens it, you click **Merge** — one click more.)
      This push does not change `render.yaml`, so no Blueprint sync happens (NEXT_STEPS "render.yaml").
- [ ] **If Auto-Deploy is "On Commit"** (step 0): Render starts both deploys by itself. Nothing to click.
      **If it is "Off":** bishoo-backend → **Manual Deploy** → **Deploy latest commit**; when it is
      **Live**, the same on bishoo-frontend.
- [ ] Wait until bishoo-backend shows **Live** (Events page). Render keeps the old version answering
      until the new one is ready. On start the new code runs the old migration step (ceiling
      `1788292800000`), which finds nothing to do — B1/B2 are already there.
- [ ] kentexa-early-access may redeploy too (same branch); its code did not change.

## 5. Tests after the deploy (≈ 20 minutes)

1. **Right version:** `curl.exe -s https://api.kentexa.com/version` → the new commit (not `4d692ee`)
   and a new `startedAt`.
2. **Start-up log** (bishoo-backend → Logs): `Timed jobs: 9 registered, each once`; no
   `column ... does not exist`; no `ERROR` about timed jobs.
3. **Old numbers still work:** `curl.exe -s -w "\nHTTP %{http_code}\n" https://api.kentexa.com/shipments/track/KTX-SHP-999999`
   → HTTP 404; a real KTX-SHP number → HTTP 200; at the counter, search an old parcel number → found.
4. **Waybill:** receive one walk-in parcel at a counter (or a real one) → in Admin → Shipments / the
   parcel, it has a number like `KTX` + 10 digits; searching that waybill at the counter finds the parcel.
   (The counter receipt and SMS still show `KTX-ORD-…` — by design, NEXT_STEPS section 1.)
5. **Red notice:** the counter page opens and shows no error. If an office has a parcel received 6+
   hours ago and not dispatched, the red notice shows it; "Still here" hides it until the next day.
   Admin → **Dispatch reminders** page opens.
6. **Honest pickup message:** send form, intercity, "Pick up from me" → the success screen does NOT say
   "Pickup has been requested"; it says no one is assigned yet and shows who to call. (Use a test
   account; cancel the test shipment after.)
7. **Mizigo Yangu:** profile → "Mizigo yangu" opens My Shipments (not the homepage).
8. **Receipt reopen + handover — only if included:** create a walk-in, tap away, come back → the
   receipt is still there until "Mzigo mpya"; Historia → 🧾 Risiti → print again → the parcel count and
   money did NOT change; 📲 SMS tena sends one SMS. A parcel waiting for the recipient shows
   "🤝 Kabidhi kwa mpokeaji".
9. **Recipient pickup with code** (still untested since Release A): ask a receiving office with an
   arrived parcel to try it.
10. **The first night, 22:00–23:30 Tanzania time:** Render logs show
    `Nightly dispatch reminder <date>: ... sent ..., failed ...` (one line per tick, not three).

## 6. If something goes wrong

- **Script says STOP on the copy:** nothing on live changed. Send the log to Claude.
- **Script says STOP on live during B1 or B2:** that migration was rolled back completely. The old code
  still runs normally. Do not push. Send the log to Claude.
- **The new code misbehaves after the deploy:** roll back the CODE only:
  bishoo-backend → **Events** → the previous deploy (`4d692ee`) → **Rollback**; the same on
  bishoo-frontend if the problem is in the website. Safe, because B1/B2 only added things and the old
  code ignores them. After a rollback, check **Settings → Auto-Deploy** (Render may switch it off after
  a rollback so the bad commit is not deployed again) and tell Claude; the branch is fixed in code,
  never by force-pushing.
- **Never** run `down()` of B1 on live: it deletes every waybill number already given to customers.
- **Last resort only (data damaged — very unlikely):** Point-in-Time Recovery to the time written down
  in step 2 — a NEW database; anything written after that time is lost. Decide with Claude first.

## 7. Afterwards

- [ ] Claude records the result in NEXT_STEPS.md (times, commit, test results).
- [ ] Owner deletes the folder `C:\Users\BISHOO GROUP\release-b` (the script; no passwords are in it).
- [ ] Check the copy `kentexa-db-rehearsal` is deleted.

---

## Time and best moment

- **Total ≈ 1 h 45 min**, of which the owner's hands-on time is ≈ 25 minutes (the rest is Render
  waiting): rehearsal 30–45, export 10, live migrations 5, deploy 15–25, tests 20.
- **Best: a weekday morning.** Start the rehearsal ≈ 06:15, live migrations ≈ 07:00, push ≈ 07:10,
  tests done by ≈ 08:00, before the counters are busy. This also leaves a whole working day to watch
  the new code before the first 22:00 reminder.
- **Avoid (Tanzania time):** 22:00–23:30 (nightly reminder), 03:00, 05:00–05:10, 06:00–06:10 and
  11:00–11:10 (existing timed jobs, which run on UTC — KNOWN_FAULTS #9), and busy counter hours.
- The migrations and the deploy may be on different days: after step 3, live is safe with the old code.
