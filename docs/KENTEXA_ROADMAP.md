# KenteXa roadmap

## Core rules

- KenteXa is a network, not isolated features. Every feature connects to the network, the waybill and the other roles.
- Audit the existing code first, then propose. Never design without checking what already exists.
- KenteXa never holds money; a payment provider holds it.

## Build order (status as of 2026-10-21)

1. **Shared waybill and tracking:** exists. Gap: handover codes at each step.
2. **Partner invitations:** released (PR #134, migration 1792100000000). Super Agents invite transport and hubs by WhatsApp or the sender's own SMS, never KenteXa SMS. A partner joins through the waybill.
3. **Office price rule:** released with migration 1792200000000. Office prices are optional and the office decides them. KenteXa provides calculation and comparison tools only. The counter always allows a manual price, with a saved reason when it differs from the suggestion. Route prices stay per destination. Dar same-city agent delivery pays only the boda fee. The 10% and 5,000 TZS values are suggested defaults, not mandatory. Removing the counter refusal (c7ef83a) is pending and must not merge until approved.
   - **3a. Competitive pricing design (not built):**
     - (a) suggestions from the office's own history, accepted or ignored in one tap;
     - (b) an anonymous market range per route with the office's position, never another office's name or price;
     - (c) customers see offers from all offices on a route side by side and choose;
     - (d) each office sees its own results;
     - (e) build first: route range, counter manual price with reason, customer comparison. Suggestions and learning come after real data exists.
4. **Cash and mobile money only:** branch built (feature/cash-mobile-money-only, 1e462d7), not released. Prepaid refused.
5. **Receipt fix for M-Pesa and Airtel:** branch built (fix/receipt-mpesa-airtel-manual, 64c4773), not released.
6. **Super Agent dashboard:** two jobs only, POKEA (receive) and TUMA (send). Everything else in the menu. Shipments and KenteXa orders are the same thing, handled differently. Not built.
7. **Pickup and last mile:** each office says whether it does pickup and last-mile; the customer form shows it. Exact map location for door pickup. Not built.
8. **Marketplace link:** orders linked to shipments so sellers can show delivered prices. Not built.
9. **Other agreed items:** re-openable receipts; 22:00 reminder for parcels received without dispatch info; loud pickup-request alerts. Not built.

## Open

- The 6 logistics test suites fail on the base branch too; fixed on fix/logistics-suites, awaiting approval.
