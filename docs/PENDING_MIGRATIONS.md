# Migrations waiting for live (2026-10-27)

**Update 2026-11-10 (Uza tena members):** the pin is now `MIGRATION_RUN_UPTO=1795900000000`. The next deploy
runs `1795900000000-AddResaleMember` itself (table resale_member; people who already made an offer become members). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-09 (Uza tena, resell):** the pin is now `MIGRATION_RUN_UPTO=1795800000000`. The next deploy
runs `1795800000000-AddResale` itself (product: resaleOpen, resalePrice, resaleMinPrice; new table resale_offer; order: the reseller, the amounts and the profit record). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-09 (Smart Post, Uzoefu):** the pin is now `MIGRATION_RUN_UPTO=1795700000000`. The next deploy
runs `1795700000000-AddExperiencePostIntent` itself (adds 'experience' to business_feed_item_intent_enum). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-09 (Tuma taarifa):** the pin is now `MIGRATION_RUN_UPTO=1795600000000`. The next deploy
runs `1795600000000-AddAnnouncementSendFlow` itself (announcements: status, in-app link, schedule, approval and reach; old rows become 'sent'; an index on notification source). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-09 (staff roles):** the pin is now `MIGRATION_RUN_UPTO=1795500000000`. The next deploy
runs `1795500000000-AddStaffRoleTypes` itself (adds 'finance' and 'moderator' to account_role_type_enum). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-09 (Instagram through the Page):** the pin is now `MIGRATION_RUN_UPTO=1795400000000`. The next deploy
runs `1795400000000-AddInstagramPageConnection` itself (Page id/name and webhook error on instagram_business_connection; old connections without a Page become reauth_required). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-09 (job offer time limit):** the pin is now `MIGRATION_RUN_UPTO=1795300000000`. The next deploy
runs `1795300000000-AddPickupTaskOfferedAt` itself (parcel_pickup_task."offeredAt": when a job was last offered to agents; it leaves their list 5 minutes later). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-09 (checkout office price):** the pin is now `MIGRATION_RUN_UPTO=1795200000000`. The next deploy
runs `1795200000000-AddOrderShippingQuote` itself (order."shippingQuote": the office the buyer's shipping fee came from, so the seller's send form opens on it). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-03 (team invitations):** the pin is now `MIGRATION_RUN_UPTO=1795100000000`. The next deploy
runs `1795100000000-AddTeamInvitation` itself (team_invitation: invitations a person accepts with Kubali; and a one-time copy of active Timu members into business_team_member, which the POS and seller tools read). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-03 (POS cashier PIN):** the pin is now `MIGRATION_RUN_UPTO=1795000000000`. The next deploy
runs `1795000000000-AddPosCashierPin` itself (pos_cashier_pin: each cashier's 4-digit PIN, stored as a salted hash; sale."cashierUserId": who served the sale). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-03 (POS part 3):** the pin is now `MIGRATION_RUN_UPTO=1794900000000`. The next deploy
runs `1794900000000-AddPosStockAndDebts` itself (pos_supplier, pos_stock_receipt, pos_debt_payment). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-03 (POS part 2):** the pin is now `MIGRATION_RUN_UPTO=1794800000000`. The next deploy
runs `1794800000000-AddPosShiftsAndExpenses` itself (pos_shift: cashier shifts with starting cash and the counted drawer; pos_expense: shop expenses). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-03 (shop place kept):** the pin is now `MIGRATION_RUN_UPTO=1794700000000`. The next deploy
runs `1794700000000-AddSellerPickupPlace` itself (seller_pickup_place: the seller's shop place per city, so the send form stops asking "Duka lako" every time). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-03 (Ada ya KenteXa):** the pin is now `MIGRATION_RUN_UPTO=1794600000000`. The next deploy
runs `1794600000000-AddKentexaFee` itself (fee settings, fee rows, payments, standing, reminders; old seller-shipment debts are copied into `kentexa_fee_cleared` and set to 0, as approved). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-02 (POS to ship):** the pin is now `MIGRATION_RUN_UPTO=1794500000000`. The next deploy
runs `1794500000000-AddSaleToShip` itself (sale."toShip": a paid POS sale marked "Itatumwa kwa mteja"). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-02 (Shehena code):** the pin is now `MIGRATION_RUN_UPTO=1794400000000`. The next deploy
runs `1794400000000-AddShehenaHandoverCode` itself (bulk_shipment: hand-over code, transport confirmed time, wrong tries, received-without-code reason). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-02 (Dar common places):** the pin is now `MIGRATION_RUN_UPTO=1794300000000`. The next deploy
runs `1794300000000-AddDarCommonPlaces` itself (about 200 common Dar es Salaam places, e.g. Mwenge, Posta, Tabata Relini, added to the place search, each in its delivery zone). Check: `/version/migrations` shows `pending: []`, and the place search finds "Tabata Relini".

**Update 2026-11-02 (Jumuiya):** the pin is now `MIGRATION_RUN_UPTO=1794200000000`. The next deploy
runs `1794200000000-AddCommunities` itself (communities, members, a post's community). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-02 (Social Home 1):** the pin is now `MIGRATION_RUN_UPTO=1794100000000`. The next deploy
runs `1794100000000-AddFeedTopics` itself (topics, topic follows, post topic, listings marked out of Home). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-02 (phase F):** the pin is now `MIGRATION_RUN_UPTO=1794000000000`. The next deploy
runs `1794000000000-AddRepostReportMute` itself (repost count, reports, mutes). Check: `/version/migrations` shows `pending: []`.

**Update 2026-11-02 (phase E):** the pin is now `MIGRATION_RUN_UPTO=1793900000000`. The next deploy
runs `1793900000000-AddPostPolls` itself (Kura: three new tables). Check: `/version/migrations` shows `pending: []`.

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
