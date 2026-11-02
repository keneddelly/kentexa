# Migrations waiting for live (2026-10-27)

**Update 2026-11-02 (phase D):** the pin is now `MIGRATION_RUN_UPTO=1793800000000`. The next deploy
runs `1793800000000-AddPostMediaAndFormats` itself (up to 4 photos per post, edit time, Swali/Mjadala).
Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-02:** the pin is now `MIGRATION_RUN_UPTO=1793700000000`. The next deploy runs
`1793700000000-AddPostLikes` itself (Home Feed phase C: hearts separate from saves).
Check: `Q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='business_feed_item' AND column_name='likeCount'"` must print `1`,
and `/version/migrations` must show `pending: []`.

**Update 2026-11-01:** `start:prod` now pins `MIGRATION_RUN_UPTO=1793600000000`, so the
deploy after that change runs these four itself, in order, before the app starts (the same
guarded runner). Nothing to run from the PC. To check afterwards, use the "Final check" below
or `https://api.kentexa.com/version/migrations` (its `pending` list must be empty).

The manual steps below stay for reference (or if a deploy fails to start).

Run these on the live database from your PC, **in this order, one at a time**, with the
guarded runner (`dist/database/run-migrations-direct.js`). Take the Render backup first,
as in every release.

All four are additive (new tables or new columns). None changes or deletes existing rows.

| # | Migration | What it turns on | Check after it runs | Correct check output |
|---|---|---|---|---|
| 1 | `1793300000000-AddAdvertiserApplications` | Self-service advertiser applications (PR #196) | `Q "SELECT to_regclass('public.advertiser_application')"` | `advertiser_application` |
| 2 | `1793400000000-AddFoodOrdering` | Hotel menu, table QR, kitchen board (PR #211) | `Q "SELECT to_regclass('public.food_order')"` | `food_order` |
| 3 | `1793500000000-AddFoodDelivery` | Letewa: hotel food delivered by a wakala, paid on delivery | `Q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='food_order' AND column_name='shippingOrderId'"` | `1` |
| 4 | `1793600000000-AddPosOfflineAndSplitPay` | POS: offline sales sent once, split payment, Deni | `Q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sale' AND column_name='clientSaleId'"` | `1` |

Applied already (owner 2026-10-26): everything up to and including `1793200000000`.

## Start check

Before running anything:

```powershell
Q 'SELECT max("timestamp") FROM typeorm_migrations'
```

Correct: `1793200000000`. If it shows a **smaller** number, stop and send it to Claude: some
older migration is not on live yet. If it already shows `1793300000000` or more, skip the
ones already applied.

You can also open `https://api.kentexa.com/version/migrations` in the browser: its
`pending` list must show exactly the migrations above that are not applied yet.

## Run (PowerShell, after the usual connection block for the LIVE database)

```powershell
function RunOne($ts) {
  if ($ts -notin '1793300000000','1793400000000','1793500000000','1793600000000') { Write-Host 'REFUSED: not a waiting migration'; return }
  $env:MIGRATION_RUN_UPTO = $ts; node dist/database/run-migrations-direct.js; Remove-Item Env:MIGRATION_RUN_UPTO
}
RunOne 1793300000000
RunOne 1793400000000
RunOne 1793500000000
RunOne 1793600000000
```

Run each `RunOne` line on its own and do its check from the table before the next one.
Each run must print exactly one `Executed migrations: ...` line with that migration's name.

## Final check

```powershell
Q 'SELECT "timestamp" FROM typeorm_migrations ORDER BY "timestamp" DESC LIMIT 5'
```

Correct: `1793600000000`, `1793500000000`, `1793400000000`, `1793300000000`, `1793200000000`.

The app checks that these tables and columns exist before using them, so the order of
deploy and migrate does not break anything: until a migration runs, its feature stays hidden.
