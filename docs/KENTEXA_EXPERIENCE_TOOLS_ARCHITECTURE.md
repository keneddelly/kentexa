# Kentexa Experience & Tools Architecture

**Status:** Product direction agreed; proposal for audit and design. Not implementation authorization.
**Last updated:** 2026-10-31
**Branch:** `worktree-service-provider-profiles`

## Owner decisions

- Login landing is **Home for every user**, regardless of roles or business affiliations.
- Tools are accessed through a dedicated **My Workspace** hub.
- Experience and Tools share one identity, permissions and intelligence foundation.
- Inbox remains accessible from both environments.
- This is a logical product/navigation separation, not a requirement for separate applications, databases or duplicate domain records.

## Product model

1. **Kentexa Experience:** discover, connect and participate. Includes Home Feed, Moments, Create, Discover, public profiles, social engagement and public content.
2. **Identity & Intelligence foundation:** person and business identities, role assignments, capabilities, permissions, active context, relationships, conversations, notifications, structured events and authorized AI context.
3. **Kentexa Tools:** manage, sell, serve, communicate and operate through My Workspace.

> Home is where people discover, connect and participate. Workspace is where people operate, manage and get work done.

## Navigation proposal

Primary mobile destinations:

1. Home — default login destination.
2. Discover — people, businesses, content and relevant offerings.
3. Create — approved post, Moment, question or showcase flows.
4. Inbox — conversations and messages.
5. My Workspace — dedicated tools hub.

Desktop should retain clear Experience navigation and open Workspace as a distinct operational shell. This proposal does not authorize immediate UI changes; preserve approved Kentexa visual language until designs are reviewed.

Navigation rules:
- Login always lands on Home.
- Home returns to Experience; My Workspace opens the tools hub.
- Opening a tool preserves active business and role context.
- Returning from a tool restores the prior workspace state where practical.
- Inbox is one shared capability, not two separate message histories.
- Users without business roles can use Experience without forced business onboarding.

## My Workspace

Organize authorized tools by capability, not as a flat list shown to everyone:

| Group | Candidate tools |
|---|---|
| Sell & Commerce | POS, Store Manager, catalogue, orders |
| Logistics & Delivery | Office, shipments, dispatch, transport operations |
| Communication | Unified Inbox, customer conversations |
| Business Growth | Advertising, campaigns, analytics |
| Services | Service management, bookings, customer requests |
| Finance | Payments, transactions, reconciliation |
| Administration | Team, roles, permissions, business settings |

This is a navigation taxonomy, not a claim that every capability exists or is production-ready. Audit before marking tools as available. The hub should include recent tools, unfinished tasks and operational reminders only when supported by reliable data and authorization.

**Business context recommendation:** show one selected business at a time, with a clear switcher for other businesses the user is authorized to operate. Do not merge multiple businesses' operational records into an ambiguous default view. A cross-business overview requires a separately approved scope and permission model.

## Identity and access model

Keep these concepts distinct:
- Person: authenticated individual.
- Business identity: organization represented or managed.
- Role: assigned permissions/capabilities in a context.
- Active context: person/business/role under which an action occurs.

Switching business or role must not create another user identity. It changes the authorized working context. Display the active context for sensitive actions. Backend authorization is authoritative; hiding a button is not a security boundary. Audit existing AccountRole, active-role session and guards before proposing changes; do not create a competing identity/role system.

## Experience ↔ Tools contract

Operational data is **not automatically social content**.

| Tools activity | Experience behavior |
|---|---|
| Product created | May be intentionally published using the authoritative product record |
| Offer created | May be intentionally published to an eligible public surface |
| Enquiry received | Conversation is available through shared Inbox |
| Public profile updated | Approved public identity details are reflected |
| POS sale recorded | Private operational data by default |
| Shipment status changes | Operational/tracking data; never automatically a public post |
| Ad campaign created | Approved sponsored content may appear in eligible placements |

Publishing requires an explicit action, identity attribution, visibility controls and authorization. Protect internal records, customer data, sales, payments, shipment details and staff activity.

Domain authority remains with existing domains: catalogue owns product management; POS/commerce own transactions and inventory; logistics owns shipment state; communication owns conversations; identity/access owns identity and permissions; Experience owns social presentation and interaction. Do not create parallel sources of truth.

## Inbox, notifications and intelligence

Inbox is shared: Experience offers conversation entry; Workspace supports business communication workflows. Both must resolve to the same authorized conversation, identity and history. External channels retain their existing identity and permission rules.

Distinguish social, operational/business and security/account notifications. Route each to the correct authorized context. Operational notifications never become public feed items. Reuse existing notification and event infrastructure; do not create a competing system.

AI may summarize and recommend using authorized context. It must not become the authority for permissions, payments, orders, inventory or shipment state.

## Logical responsibilities

| Responsibility | Owns |
|---|---|
| Experience shell | Home, Discover, Create, public profiles and social navigation |
| Workspace shell | My Workspace, tool catalogue, tool navigation and context presentation |
| Identity/access | Person, business, roles, permissions and active context |
| Social/content | Posts, Moments, reactions, comments, follows and public visibility |
| Communication | Conversations, messages and channel connections |
| Commerce | Products, listings, orders, POS and transactions |
| Logistics | Shipments, offices/hubs, transport and assignments |
| Activity/notifications | Structured events, notifications and auditability |
| Intelligence | Search, AI orchestration, insights and recommendations |

These are responsibility boundaries, not a mandate for microservices. Prefer the current architecture unless an audit justifies change.

## UX and security principles

- Keep Home socially useful and free of operational dashboard clutter.
- Make Workspace professional, task-oriented and capability-aware.
- Preserve Kentexa's shared visual identity; use readable text, clear labels, large touch targets and mobile-first flows.
- No decorative emojis in product UI.
- Enforce authorization on the backend for every protected operation.
- Never leak private operational/customer data into public surfaces.
- Avoid duplicate identity, role, product, order, payment, shipment, notification or analytics authorities.

## Required read-only audit for Claude

Before implementation, inspect and report:

1. Frontend routes/navigation for Home, Discover, Create, profile, Inbox and existing tool entry points.
2. Existing workspace/dashboard shells.
3. Identity, business identity, AccountRole, active-role session and authorization guards.
4. POS, Office/logistics, Unified Inbox, Store Manager, advertising, services, payments and analytics; classify each as working, partial, absent or unknown.
5. API/domain ownership and active-business/permission resolution for each tool.
6. Notification and activity/event infrastructure.
7. Public/private publishing paths between Tools and Experience.
8. Mobile/desktop navigation, deep links, return paths and context preservation.
9. Tests, API contracts, migrations and production constraints.

Deliver exact file paths, current-state maps, capability matrix, APIs/entities, risks, reuse-first recommendations, proposed route map and unresolved product decisions. Do not infer backend behavior from UI alone; verify code/tests and label uncertainty.

## Delivery gates

1. Read-only audit.
2. Approve information architecture and business-switcher behavior.
3. Approve mobile/desktop visual designs.
4. Approve interaction specification for tool entry, context switching, Inbox, notifications and return behavior.
5. Approve technical specification including reuse, APIs, authorization, events, migrations, compatibility and tests.
6. Explicit product-owner authorization before implementation.
7. Test and owner review before release/deployment approval.

## Acceptance criteria

- All users land on Home after login.
- My Workspace is the dedicated tools hub.
- Users without business roles can use Experience.
- Only authorized tools and records are available.
- Users can switch authorized businesses without signing out; one active context is clear.
- Home is not converted into an operations dashboard.
- Inbox remains consistent across both entry points.
- Operational events do not automatically become public posts.
- Existing domains remain the single source of truth.

## Mandatory Claude instruction

Read this document with `CLAUDE.md`, `docs/KENTEXA_ROADMAP.md` and `docs/SOCIAL_ENGAGEMENT_ROADMAP.md` before changing Experience navigation, workspace/tool entry or identity context. Confirm branch and working tree, then perform the read-only audit above and return exact paths, current behavior, API/domain relationships, risks and recommendations.

**Do not code, edit files, create migrations, change branches, open implementation PRs or deploy until the product owner has reviewed and explicitly approved designs and technical specifications.**
