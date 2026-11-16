# Kentexa Learning Center — V1 Implementation Blueprint

**Status:** Architecture and implementation brief  
**Target branch:** `worktree-service-provider-profiles`  
**Existing page to evolve:** `bishoo-frontend/src/public/pages/HowItWorks.js`  
**Existing company page to preserve:** `bishoo-frontend/src/public/pages/AboutUs.js`

## 1. Objective

Evolve Kentexa's existing How It Works page into a practical Learning Center that helps:
- New visitors understand what Kentexa is and what they can do on it.
- Buyers, sellers, resellers, businesses, service providers, agents and transport/office partners find relevant guidance.
- Existing users learn features and complete tasks confidently.
- People discover relevant Kentexa capabilities and navigate to the real feature.

Do not create a duplicate help center or replace About Us. Preserve the existing route and navigation compatibility.

## 2. Audit baseline (confirmed in current branch)

- `HowItWorks.js` currently has role tabs for buyer, seller, agent and super agent/office, six translated steps per role, payment information, a commission table, buyer protection content and CTAs.
- `AboutUs.js` contains company mission/story, values, milestones, team, stats and contact details.
- `Footer.js` links to About Us, How It Works, Terms, Privacy and Contact Us.
- `App.js` routes `HowItWorks` and `AboutUs`.
- Translations are in `bishoo-frontend/src/locales/en.json`, `sw.json` and `fr.json`; i18n is initialized in `bishoo-frontend/src/i18n.js`.
- `urlSync.js` supports generic page paths using `/p/<PageName>`. Keep existing `HowItWorks` navigation and refresh behavior working.
- Existing `UzaTena` and other feature pages/routes should be reused rather than duplicated.

This is a repository source audit, not a verified live production browser audit. Recheck the current branch before implementation.

## 3. Experience architecture

Build the Learning Center as a single coherent entry point with two complementary modes:

### A. Explore Kentexa
A newcomer-facing overview that explains the platform in plain language:
1. Discover — search, browse and find products, services, businesses and communities.
2. Participate — join communities, publish and interact with Moments/posts, use hashtags and mentions where supported.
3. Trade and earn — buy, sell, resell through Uza Tena and discover business opportunities.
4. Run a business — use business profiles, POS and available management tools.
5. Communicate — understand the Kentexa Inbox and supported communication workflows.
6. Move goods — understand parcel, office, agent, transport and tracking journeys.

Each section should explain the value, who it is for, a simple example and a clear CTA to the real feature or relevant guide.

### B. Learn how to use Kentexa
A searchable/browsable guide library grouped by user goal and role. Initial categories:
- Getting started and account/profile basics
- Buyers
- Sellers and businesses
- Resellers / Uza Tena
- Communities and social participation
- Services and service providers
- POS and business operations
- Inbox and communication
- Agents, offices and logistics
- Safety, trust, payments and troubleshooting

Do not show a category as fully documented until it has real, reviewed instructions.

## 4. Page structure and UX

Suggested information hierarchy:
1. Compact hero: "Learn what you can do with Kentexa" and one-sentence explanation.
2. Prominent search field for guide titles and topics.
3. Explore Kentexa feature map/cards.
4. "What are you here to do?" role/goal shortcuts.
5. Step-by-step guides grouped by category.
6. Frequently asked questions, only where answers are confirmed.
7. Still need help? Existing Contact Us/support path.

UX requirements:
- Mobile-first; comfortable body text around 16px and generous tap targets.
- Fast, readable, low-clutter layout; avoid a long wall of text.
- Use real Kentexa screenshots only when they accurately show the current interface. Never invent UI or capabilities.
- Clear labels and navigation; keyboard accessible search and controls.
- Responsive on desktop and mobile.
- Keep the Kentexa visual identity consistent with the current app.
- Use progressive disclosure for long instructions.

## 5. Guide content model

Before choosing a data model, inspect existing content patterns and routing. Prefer a lightweight local content registry/translation structure for V1 if that fits the repo. Do not add a backend CMS or database migration unless the audit proves it is necessary.

A guide should support:
- Stable ID and route/slug
- Category and intended audience
- Title and short summary
- Prerequisites (if any)
- Ordered steps
- Optional verified screenshots/media
- Related guides and feature destination
- Last reviewed/version note if useful

Search should index guide titles, summaries, category labels and relevant keywords. It should handle English, Swahili and French content consistently with the app's language selection.

## 6. Content accuracy and domain authority

Critical:
- Treat the live backend/domain behavior as authoritative, not old page copy.
- Verify payment flows, commission rates, platform fees, shipping fees, eligibility, verification requirements and role permissions before publishing.
- The current How It Works page has hard-coded fee percentages and operational descriptions. Audit these against current server-side rules and admin-configurable values. Do not carry forward stale numbers.
- Do not claim escrow or that Kentexa holds buyer funds. Existing source comments explicitly say buyers pay sellers directly.
- Do not invent WhatsApp/Instagram integrations, offline capabilities, delivery guarantees, tracking precision, AI capabilities or monetization claims.
- Distinguish available now, limited/pilot, planned and unavailable. Do not present planned features as live.
- If a fact cannot be verified, omit it or mark it for product-owner confirmation.

## 7. Internationalization

- Support English, Swahili and French using existing i18next setup.
- Add complete translations for every new visible string in all three locale files.
- Avoid hard-coded user-facing strings in components.
- Check long Swahili and French labels for mobile wrapping and layout overflow.
- Keep existing translations and routes intact.

## 8. Navigation and discoverability

- Keep the existing How It Works entry point and footer link working.
- The page should be reachable by a stable shareable URL using existing routing conventions.
- Add cross-links to existing feature pages only after confirming each destination and access requirements.
- Do not change global navigation or unrelated footer layout as part of this task unless required and approved.

## 9. Accessibility, performance and analytics

- Semantic heading hierarchy, labelled search, keyboard navigation and visible focus states.
- Ensure sufficient contrast and screen-reader labels.
- Avoid loading large screenshots until needed; use optimized assets already in the repo where possible.
- Use existing analytics/event infrastructure if available. First audit it; do not add a new tracking system solely for the Learning Center.
- Useful events, if existing conventions support them: learning_center_view, guide_search, guide_open, guide_step_progress, guide_cta_click and no_results_search. Do not collect sensitive content typed into search; define data minimization and retention first.

## 10. Implementation stages

### Stage 0 — Re-audit
Inspect current branch and actual app structure, translation conventions, reusable components, route handling, feature destinations and relevant backend/domain rules. Identify changed files since this brief was written.

Deliver a short audit report with:
- Reusable components and styles
- Verified feature destinations
- Confirmed content facts
- Outdated or unverified fee/payment claims
- Translation and testing approach

### Stage 1 — Structure and shell
Implement the Learning Center shell within the existing How It Works route. Preserve the existing About Us page and footer links. Add Explore and Learn modes and responsive layout.

### Stage 2 — Verified content
Populate only content that can be confirmed from current code and authoritative domain behavior. Reuse existing feature pages and links. Add explicit content gaps for owner review instead of guessing.

### Stage 3 — Guide search and navigation
Implement client-side search/filtering over approved guide content, empty states, category navigation and related guides. Ensure search is multilingual.

### Stage 4 — QA
Run relevant frontend tests, lint/build and route checks. Test all three languages, small mobile viewport, desktop, direct URL load, refresh, browser back/forward and signed-out visitor access. Check links and CTA permission behavior.

## 11. Acceptance criteria

- Existing How It Works route opens the new Learning Center without breaking existing links.
- About Us remains a separate page and is unchanged in purpose.
- Explore and Learn experiences are clear and navigable.
- No duplicate implementations of existing product features.
- No invented or stale product claims, rates or fees.
- English, Swahili and French are complete for new UI.
- Search returns relevant guide results and has a useful no-results state.
- All CTAs lead to verified existing routes.
- Mobile and desktop layouts pass checks.
- Existing app build/tests pass; any unrelated pre-existing failures are documented.
- No production deployment, database migration or unrelated refactor as part of this task.

## 12. Claude execution instruction

Work only on `worktree-service-provider-profiles`. Do not use `master`.

Start with Stage 0 and report findings before making structural changes. Then implement in small, reviewable commits. Do not deploy. Do not create migrations or a backend CMS for V1 without evidence and explicit approval. Do not overwrite unrelated in-progress work. Provide changed-file list, test commands/results, screenshots where available, known gaps and commit SHA for review.
