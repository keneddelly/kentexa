# Kentexa — Roadmap & Claude Handoff

Last updated: 2026-11-07  
Repository: `keneddelly/kentexa`  
Production branch historically used: `worktree-service-provider-profiles`

This document is the working handoff for Claude. It is intended to preserve project direction and prevent repeated investigation, duplicated fixes, and regressions.

## 1. Handoff rules — read before changing code

1. **Inspect the current repository state first.** Check the active/default branch, recent commits, open and merged PRs, CI status, Render deploy history, and relevant files before proposing or making changes.
2. **Do not redo completed work.** PRs #287–#289 were previously reported as merged and live. PR #290 introduced the database-backed public sitemap. Verify its current merge/deploy state from GitHub and Render; do not recreate it.
3. **Continue from the latest verified state.** Do not assume that an old branch, commit, deployment ID, or task is still current.
4. **No unverified claims.** A commit is not a deployment; a successful build is not proof of production health. Verify each separately.
5. **Small, focused changes.** Use a dedicated branch and PR for each coherent task. Run the relevant backend/frontend checks before merging.
6. **Protect production.** Do not change production environment variables, database schema/data, payment flows, authentication, or deploy services without reviewing impact. Never expose secrets in commits, logs, or handoff notes.
7. **Preserve existing architecture.** Frontend routing is a custom handwritten router in `App.js`, not React Router. Backend is NestJS + TypeORM + PostgreSQL. Confirm actual package/workspace paths before assuming file locations.
8. **Do not launch a major rewrite by default.** SSR/Next.js migration is not approved by this roadmap. First diagnose specific crawl/indexing issues and propose a separate migration plan if genuinely necessary.
9. **Keep this file current.** Update the status and next actions when work is completed, and include relevant PR/commit/deploy references.

## 2. Product vision

Kentexa is a connected commerce, services, social discovery, communication, payments, and logistics platform for Tanzania.

North-star interaction:

**Human → Intent → Context → Capability → Orchestration → Domain systems → Outcome**

The natural-language entry point (“Unataka nini?”) should help people express what they need. Intent/AI must never replace domain authority: orders, payments, inventory, identity, shipment state, permissions, and financial records remain controlled by their respective domain systems.

The platform serves:
- Buyers and everyday users
- Sellers, shops, and larger businesses
- Service providers
- Agents and Super Agents / hubs
- Transport providers
- Customer care, managers, admins, and arbitrators

## 3. Current product and architecture context

### Core stack
- Backend: NestJS, TypeScript, TypeORM, PostgreSQL, JWT.
- Web frontend: React SPA with custom routing.
- Mobile: React Native / Expo direction (older Flutter app existed).
- Hosting: Render; public domains include `kentexa.com` and `api.kentexa.com`.
- GitHub repository: `keneddelly/kentexa`.

### Role and identity model
The intended role model supports multiple roles per account, rather than one permanent `User.role`:
- buyer
- seller
- agent
- super_agent
- transport_provider
- service_provider
- customer_care
- manager
- admin
- arbitrator

Relevant architecture concepts previously defined: AccountRole, ActiveRoleSession, JWT role contract, RoleContextGuard. Verify current implementation before modifying it. Role switching must not mix inboxes or duplicate navigation items.

### Major platform capabilities
- Classifieds and product marketplace
- Business/store profiles
- Services marketplace
- Public posts / Moments social feed
- Unified Inbox
- Orders, payments, shipping and logistics
- POS SaaS
- AI-assisted discovery, orchestration, and internal reporting

## 4. Priority roadmap

### P0 — Stabilize and finish current production work

**A. Production and repository baseline**
- Establish the actual production commit and branch.
- Review open PRs, failing CI, migrations, Render deploys, and recent production errors.
- Identify unfinished work from existing issues/PRs before creating new work.
- Confirm backend and frontend are healthy and that migrations are applied in the intended order.

**B. Google indexing and public-page discoverability**
- Continue from the existing SEO implementation; do not rebuild it.
- Historical work:
  - PR #287: SEO landing pages and sitemap foundation — previously reported live.
  - PR #288: AI crawler support — previously reported live.
  - PR #289: identity/metadata improvements — previously reported live.
  - PR #290: live database-backed sitemap for public Kentexa content.
- Verify the actual state of these PRs and their deployments.
- Existing sitemap design:
  - `https://kentexa.com/sitemap.xml` is the sitemap index.
  - `https://kentexa.com/sitemap-static.xml` contains static marketing URLs.
  - `https://api.kentexa.com/share/sitemap.xml` serves dynamic public URLs.
  - `robots.txt` references the root sitemap.
- Dynamic sitemap scope: eligible public profiles, online/available products, active classifieds, publicly visible services, and published/unexpired public posts. Respect visibility, publication, availability, expiry, stock, and identity-verification rules.
- Search Console snapshot shared previously: sitemap status Success, 17 discovered pages; a previous report showed 1 indexed page, with redirect exclusions and historical 5xx/404 examples.
- Next actions:
  1. Inspect current Search Console coverage and URL Inspection for representative profile, product, classified, service, and post URLs.
  2. Test sitemap index and child sitemap responses directly; validate XML, status codes, canonical URLs, lastmod, and robots directives.
  3. Test representative public URLs as Googlebot and normal browser requests. Distinguish API errors, redirects, true 404s, noindex, canonical mismatch, and JavaScript-rendering issues.
  4. Fix only verified causes; submit updated sitemap / request indexing where appropriate.
  5. Record before/after counts and the exact URLs tested.
- Google can render JavaScript. Do not claim SPA rendering alone prevents indexing. Do not start a full SSR migration without evidence and a separate approved plan.

**C. Seller onboarding and verification gate**
- A bypass was reported: some users could create a business and activate selling without being shown the required ID submission step.
- Admin activation correctly required ID in one flow, while the user-facing gate did not consistently enforce/show it.
- Audit every seller activation entry point: business creation, selling activation, profile completion, admin approval, and API endpoints.
- Enforce the same server-side identity/verification policy across all paths; frontend visibility alone is not a security gate.
- Make the required ID step clear to sellers and show actionable pending/rejected/verified states.
- Ensure admin cannot approve a seller without the required evidence unless an explicit, audited exception policy exists.
- Test new seller, existing seller, missing ID, uploaded ID, pending review, rejected ID, and verified seller.

**D. Unified Inbox and Meta channel integration**
- Unified Inbox is intended to combine Kentexa internal conversations with external channels: WhatsApp, Instagram DMs, Facebook Messenger, TikTok DMs, SMS, email, and web chat.
- A previous issue: the seller inbox “Integration” entry routed back to the seller inbox instead of channel configuration.
- Instagram/Facebook login and callback work has been actively tested; do not reopen solved login issues without reproducing them.
- Verify OAuth state, redirect URI, permissions, token storage/refresh, connected account selection, webhook subscription/verification, message ingestion, reply sending, and disconnect/reconnect.
- Integration settings must open a real channel-configuration page, separate from the inbox conversation list.
- Keep seller, transport-provider, and other role inbox contexts isolated.

### P1 — Complete Logistics & Location Intelligence

Logistics and Location Intelligence are the first major domain priority. Preserve the staged architecture and audit completed stages before changing them.

Previously defined progression:
- Stage 1 — Shipment Integrity
- Stage 2A — Location Intelligence Foundation
- Stage 2B — Historical Shipment Location Snapshot
- Stage 2C — Shipment Capacity-Attachment Integrity
- Stage 2D — Server-Resolved Places
- Stage 2E — Logistics Location Context / Route Discovery
- Stage 2F — Deterministic Multi-Hub Discovery & Explicit Hub Selection
- Stage 3S — Movement Foundation / Kentexa Van integration

Verify the latest branch/commit and actual implementation of each stage; the above is the historical project sequence, not a claim that every stage is currently complete.

Core logistics entities and concepts:
- Shipment
- Parcel
- Super Agent / Hub
- Transport Provider
- Transport Assignment
- Agent / last-mile delivery

Key requirements:
- Shipment state and location must be authoritative and auditable.
- Preserve historical location snapshots; do not silently rewrite historical shipment context when a place changes.
- Hub discovery must be deterministic and allow explicit hub selection.
- Capacity attachment and transport assignment must be integrity-checked.
- Route and price history must be explainable.
- Support pricing by weight, volume, or size category (small / medium / large) where the chosen model requires it.
- Transport providers can define pickup/drop pricing and schedules.

**Kentexa Van**
- Treat Kentexa Van as scheduled movement capacity within the logistics domain, not a separate tracking system.
- Initial Dar es Salaam corridors previously considered:
  - Kariakoo → Mbagala
  - Kariakoo → Ubungo
  - Kariakoo → Bunju
  - Later expansion can include Kimara and Mbezi.
- Pilot should consolidate parcels onto scheduled runs between hubs.
- Model runs, capacity, parcel assignment, handover, arrival, exceptions, and reconciliation using the existing shipment/movement domain.

### P2 — POS SaaS

After Logistics & Location Intelligence is stable, prioritize Kentexa POS SaaS.

Product goals:
- Mobile-first POS for small shops and larger businesses.
- Desktop/tablet-friendly operational dashboard.
- Product catalogue, variants, SKUs/barcodes, cost price, selling price, stock, and inventory movements.
- Sales, receipts, refunds/returns, discounts, and cashier/role permissions.
- Multiple branches and stock locations where supported.
- Payment reconciliation and integrations with Tanzanian payment providers.
- Reporting for sales, margin, inventory, cash, and business performance.
- Connect POS inventory and orders to Kentexa marketplace without creating duplicate sources of truth.

Build in vertical slices: data model and permissions → inventory → checkout/sales → payments → receipts → reporting → multi-branch.

### P3 — Commerce social network and seller activation

- Moments/social feed should connect discovery to real products, services, and business profiles.
- Make it easy for sellers to publish useful content and convert interest into enquiries/orders.
- Prioritize supply-side activation: sellers, businesses, service providers, agents, and transport providers.
- Improve onboarding, profile completion, verification, first listing, first response, and first transaction.
- Growth should emphasize practical merchant value and trust, not only app downloads.
- Existing marketing insight: technical build/coding content has attracted more attention than generic Kentexa feature promotion. Use behind-the-scenes development content to introduce concrete user problems and outcomes.

### P4 — Unified communications and AI orchestration

- Continue the channel-agnostic Unified Inbox architecture.
- Add external channels incrementally with clear connection status and reliable webhook processing.
- AI may classify intent, summarize conversations, suggest replies, assist search, and generate internal reports.
- Human approval remains required for consequential actions such as sending sensitive messages, refunds, payment changes, account restrictions, and shipment state overrides.
- AI must call domain capabilities and respect permissions; it must not bypass domain validation or become the source of truth.

## 5. Business rules and Tanzania-specific context

- Currency: TZS.
- Payment providers previously explored: Vodacom M-Pesa, Airtel Money, ClickPesa, Selcom, AzamPay, and bank/Lipa Namba flows.
- Keep payment provider integrations behind clear adapters and verify callbacks/signatures/idempotency.
- Shipping/agent workflows previously considered:
  - Seller creates shipment.
  - Seller selects Kentexa Super Agent network, bus, or courier.
  - Optional agent collection / hub handover.
  - A historical manual shipping fee concept was TZS 1,000; verify current business rules before hardcoding.
- Escrow, COD, commissions, agent fees, and payment reconciliation require explicit ledger-like records and audit trails. Never infer payment success from a client screenshot alone.

## 6. UX principles

- Mobile-first, accessible, and readable.
- Aim for approximately 16px body text; avoid tiny labels.
- Large touch targets and clear primary actions.
- Prefer short, guided multi-step flows for complex tasks.
- Always show useful empty, loading, success, pending, and error states.
- Explain why identity, payment, or shipment information is required.
- Avoid duplicate navigation items and confusing role context.
- Use consistent Kentexa blue/black visual identity.

## 7. Definition of done

A task is not complete until:
- Acceptance criteria are met.
- Relevant backend and frontend tests/builds pass.
- Database migrations are reviewed and safe.
- Authorization and role boundaries are tested.
- Regression paths are tested.
- PR is reviewed and merged according to project practice.
- Render deployment is confirmed against the expected commit.
- Production smoke tests pass.
- This roadmap or the relevant project documentation is updated with PR, commit, and deploy references.

## 8. Claude's first session checklist

1. Read this handoff completely.
2. Inspect GitHub repository, active/default branch, open PRs, recent commits, and CI.
3. Confirm the production branch/commit and current Render deploys.
4. Verify the actual status of PRs #287–#290. Do not recreate them.
5. Check the latest Search Console status already provided in project history and continue the indexing diagnosis from that point.
6. Review current seller verification and Unified Inbox integration status before touching either.
7. Produce a short status report with: **Done / In progress / Blocked / Next exact action**.
8. Then execute the highest-priority verified unfinished task. Do not restart completed work.

## 9. Important known repository details

- Repository: `keneddelly/kentexa`
- Historical production branch: `worktree-service-provider-profiles` (verify before use).
- Frontend service ID previously recorded: `srv-da0069dbedkc739j0ji0`
- Backend service ID previously recorded: `srv-d9qnb33m8hqs738q492g`
- Render workspace ID previously recorded: `tea-d9iftcn41pts73b73l4g`
- Public web: `https://kentexa.com`
- Public API: `https://api.kentexa.com`

These IDs and branch names are historical references. Verify they still match the live account before using them. Never put credentials, tokens, private keys, or database passwords in this document.
