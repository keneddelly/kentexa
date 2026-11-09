# KenteXa roadmap

## Core rules

- KenteXa is a network, not isolated features. Every feature connects to the network, the waybill and the other roles.
- Audit the existing code first, then propose. Never design without checking what already exists.
- KenteXa never holds money; a payment provider holds it.
- Workflow: audit → design → owner approval → build. Ask before a change that could do more than the owner meant.
- Claude does the engineering; merge only after the owner says "push", and only with no new CI failures (the baseline is the 14 known failing logistics suites).
- Migrations are additive only. Raise `MIGRATION_RUN_UPTO` in `start:prod` and update `docs/PENDING_MIGRATIONS.md`.
- Simple Swahili in the app, "ofisi" never "Super Agent", no emoji, Twitter-style look, no text under 12px.
- Verify before claiming: a commit is not a deploy, and a green build is not proof that live works. Never invent data.
- The frontend router is the hand-written one in `App.js` (not React Router); the backend is NestJS + TypeORM + PostgreSQL.
- The live branch is `worktree-service-provider-profiles` (it deploys to Render).

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
7. **Pickup and last mile:** built (office pickup offer, same-city delivery, mobile-money collection); migrations 1792700000000, 1792800000000, 1792900000000 applied on live (2026-10-26).
8. **One shipment engine for all orders:** built. Sellers no longer set the delivery price; checkout prices come from the engine; no transport is never a block (the seller ships their own way and can invite carriers).
9. **Office–transport link on shehena:** built (PR #166); migration 1793000000000 applied on live (2026-10-26).
10. **Advertiser links:** built (PR #176); commission per event, rates set by admin; migration 1793100000000 applied on live (2026-10-26).
11. **Other agreed items (not built):** re-openable receipts; 22:00 reminder for parcels without dispatch info; loud pickup-request alerts; hire a whole vehicle; types of goods per office (containers vs parcels); rename "Super Agent" to "ofisi" in the rest of the app.
12. **Hotel food ordering:** part 1 built (PR #211: menu, table QR, kitchen board, menu manager); part 2 Letewa (wakala delivery, paid on delivery, fee from the Dar rate card) built. Migrations 1793400000000 and 1793500000000 to apply on live; see docs/PENDING_MIGRATIONS.md.

13. **Checkout and seller shipping (Nov 9):** checkout shows one real office's exact price ("best office"); the seller is asked about pickup for intercity; an unaccepted agent job stays offered 5 minutes (PRs #300–#302).
14. **Admin as KenteXa's mirror (Nov 9):** every action recorded, person and business pages, all datasets, staff roles manager / customer care / finance / moderator (PRs #308–#312).
15. **Tuma taarifa and Mazungumzo (Nov 9):** messages to users with an in-app link (approval over 100 people or any SMS), from every admin screen; admin reads inbox chats, each view recorded (PR #315).
16. **Full-site cleanup (Nov 9):** invoice/receipt PDFs only for buyer, seller or staff (#313); old pages removed and pages say why they did not open (#316); no emoji, no text under 12px, fewer colours (#317, #318).

## Open

- Onboarding (owner 2026-11-09: still to do after the cleanup).
- Smart Post, BrandDashboard keep or remove, the BiS inbox / staff hub: waiting for owner decisions.

- Migrations are applied on live by the owner with the guarded script; MIGRATION_RUN_UPTO pins auto-run. New code checks a column or table exists before using it.


## Social Engagement Experience

The product discovery and Claude handoff are maintained in [docs/SOCIAL_ENGAGEMENT_ROADMAP.md](SOCIAL_ENGAGEMENT_ROADMAP.md).

**Status (2026-11-09):** the social Home plan was approved by the owner on 2026-11-02 and built (topics, Jumuiya / communities, Home rebalance, "Leo kwako", new profile and business pages). Further changes to these surfaces still follow audit → design → owner approval → build.


## Experience & Tools Product Architecture

The product-owner decisions and architecture/navigation proposal are maintained in [docs/KENTEXA_EXPERIENCE_TOOLS_ARCHITECTURE.md](KENTEXA_EXPERIENCE_TOOLS_ARCHITECTURE.md).

**Agreed decisions:** all users land on Home after login; operational tools are accessed through a dedicated My Workspace hub. Experience and Tools share identity, permissions and intelligence foundations. Inbox is accessible from both. **Status (2026-11-09):** approved and built: Home for everyone after login, the "Kazi" hub, the bottom bar Mwanzo / Tafuta / + / Inbox / Kazi (owner 2026-11-01). Further changes still follow audit → design → owner approval → build. See the architecture document for boundaries, navigation, business context switching, privacy rules and acceptance criteria.


### Demand Intelligence & Opportunity Discovery

The Social Engagement roadmap now includes demand expression and demand-to-supply discovery as a strategic Home Feed pillar. Natural posts and Moments can express needs; intent understanding and relevant business discovery must respect author visibility, contact preferences and privacy. See the **Demand Intelligence & Opportunity Discovery** section in [docs/SOCIAL_ENGAGEMENT_ROADMAP.md](SOCIAL_ENGAGEMENT_ROADMAP.md) and its connection to the Experience/Tools boundary in [docs/KENTEXA_EXPERIENCE_TOOLS_ARCHITECTURE.md](KENTEXA_EXPERIENCE_TOOLS_ARCHITECTURE.md). This is discovery/design scope, not implementation authorization.


## Smart Post System

The Smart Post System product specification and read-only audit handoff are maintained in [docs/KENTEXA_SMART_POST_SYSTEM.md](KENTEXA_SMART_POST_SYSTEM.md). It extends existing Moments/feed infrastructure with participation-first creation and optional contextual AI suggestions. **Current instruction: audit only; no implementation authorization.** Claude must verify the existing composer, post formats, poll/vote support, media pipeline, identity/visibility enforcement, AI, notifications, analytics and tests before proposing implementation.


## Professional Identity & Service Discovery

The professional identity initiative is maintained in [docs/KENTEXA_PROFESSIONAL_IDENTITY_SERVICE_DISCOVERY.md](KENTEXA_PROFESSIONAL_IDENTITY_SERVICE_DISCOVERY.md). It connects professional participation and preserved personal/organization brands to Kentexa's existing Services domain, including broader service-category coverage and a governed process for suggesting missing categories.

**Product direction:** after basic profile creation, users may select multiple ways to use Kentexa (including professional, service provider, business/organization and personal/community participation), skip and return later. These onboarding choices are not automatic permissions or a replacement for authoritative roles. Missing service categories can be proposed for review; users must still be able to create a professional identity and participate while a category is reviewed.

**Status:** discovery/design handoff only. Claude must audit onboarding, account roles, identity switching, organization authorization, service provider profiles, category taxonomy, service records, discovery and permissions. No implementation authorization.


## Hybrid Social Feed Visual Direction

Kentexa's Home Feed should develop its own visual identity: Twitter/X-inspired conversation structure and readable feed density combined with Instagram-inspired visual storytelling and media quality, expressed through Kentexa's own commerce, professional identity and discovery language. This evolves the existing Home Feed rather than replacing it.

Preserve the current foundation—compact header, prominent search, For You/Following/Nearby/Products/Services discovery, Moments, bottom navigation and familiar feed interactions—unless the approved design audit recommends specific changes. Make discussions, professional contributions, business updates, product showcases, service content and demand posts feel native to one coherent feed, with context-specific card treatments and relevant actions.

The full design principles, content-specific treatments, audit checklist and approval gate are documented in [docs/SOCIAL_ENGAGEMENT_ROADMAP.md](SOCIAL_ENGAGEMENT_ROADMAP.md) under **Kentexa Hybrid Social Feed — Visual Direction**.

**Status:** visual direction only; audit and mockups before implementation. No coding or redesign authorization.
