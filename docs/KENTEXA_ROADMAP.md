# KenteXa roadmap

## Core rules

- KenteXa is a network, not isolated features. Every feature connects to the network, the waybill and the other roles.
- Audit the existing code first, then propose. Never design without checking what already exists.
- KenteXa never holds money; a payment provider holds it.

## Roles (owner 2026-10-26)

- **Ofisi** (called "Super Agent" in code): independent transport offices, not owned by KenteXa. Never say "KenteXa office". In the UI say "ofisi".
- **Agent:** last mile. **Transport:** the vehicle; it works for offices.
- Customers, buyers and sellers deal with offices and agents only, never with transport. The transport fare stays with office staff.
- KenteXa never pays shipping and never holds money; the seller, business or customer pays.

## Build order (status as of 2026-10-26)

1. **Shared waybill and tracking:** exists. Gap: handover codes at each step.
2. **Partner invitations:** released (PR #134). Invites go by WhatsApp or the sender's own SMS, never KenteXa SMS.
3. **Office price rule:** released (migration 1792200000000). Prices are optional and set by the office. Edited in the dashboard's "Bei zangu" (PR #178).
   - **3a. Competitive pricing (not built):** anonymous route range, counter manual price with reason, customer comparison first; suggestions later.
4. **Cash and mobile money only:** branch feature/cash-mobile-money-only, not released.
5. **Receipt fix for M-Pesa and Airtel:** branch fix/receipt-mpesa-airtel-manual, not released.
6. **Office dashboard:** built. POKEA and TUMA, everything else in the menu. POKEA "Kutoka KenteXa" is one list for marketplace orders, seller orders and customer shipments. A single parcel goes out as a shehena of one; the receiver over there is asked, never pre-filled (PR #177). Office SMS end with the office's phone.
7. **Pickup and last mile:** built (office pickup offer, same-city delivery, mobile-money collection); migrations 1792700000000, 1792800000000, 1792900000000 to apply on live.
8. **One shipment engine for all orders:** built. Sellers no longer set the delivery price; checkout prices come from the engine; no transport is never a block (the seller ships their own way and can invite carriers).
9. **Office–transport link on shehena:** built (PR #166); migration 1793000000000 to apply on live.
10. **Advertiser links:** built (PR #176); commission per event, rates set by admin; migration 1793100000000 to apply on live.
11. **Other agreed items (not built):** re-openable receipts; 22:00 reminder for parcels without dispatch info; loud pickup-request alerts; hire a whole vehicle; types of goods per office (containers vs parcels); rename "Super Agent" to "ofisi" in the rest of the app.

## Open

- Migrations are applied on live by the owner with the guarded script; MIGRATION_RUN_UPTO pins auto-run. New code checks a column or table exists before using it.
