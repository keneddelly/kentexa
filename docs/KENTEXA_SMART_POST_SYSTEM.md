# Kentexa Smart Post System
**Status:** Product specification draft + repository audit handoff — NOT approved for implementation  
**Owner:** Kentexa product owner  
**Product/UX specification:** ChatGPT  
**Implementation:** Claude  
**Reference branch:** `worktree-service-provider-profiles`  
**Visual reference:** Approved Smart Post Composer concept generated 2026-11-01

> This document defines the intended product experience and the required read-only audit. It does not authorize code changes, migrations, branch changes, PRs or deployment.

## 1. Product purpose

Make creating a post on Kentexa meaningful, easy and rewarding. The composer should help people and businesses express themselves, invite genuine participation and create relevant connections without turning every post into an advertisement or forcing engagement mechanics.

**Product principle:** Expression → Participation → Connection → Trust → Commerce.

The system is an extension of the existing Kentexa social/feed domain. It must reuse existing posts, Moments, identity attribution, comments, engagement, visibility, notifications, AI orchestration and activity infrastructure wherever valid. It must not create parallel post/comment/identity systems.

## 2. Core design decision

Build a **Smart Post Composer** with contextual, optional interaction assistance.

- Guide users to a suitable post format.
- Let users write and attach media naturally.
- Offer an AI suggestion only when it is relevant and useful.
- Preview the complete post before publishing.
- Preserve author control over content, format, audience and publication.
- Allow a plain post with no poll, question or engagement prompt.

AI suggestions are assistive, never mandatory. The system must not rewrite, reclassify or publish content without the author's explicit action.

## 3. Post formats

These are product-level formats. Claude must map each to existing domain types and determine which require new capabilities only after audit.

1. **Discussion** — invite a conversation or exchange of views.
2. **Question** — request answers, advice or recommendations.
3. **Poll** — offer a finite set of choices and collect votes.
4. **Showcase** — show work, products, services, achievements or a discovery.
5. **Looking for** — express a need or request, e.g. “Natafuta spy camera”.
6. **Experience** — share a story, review, lesson or first-hand experience.
7. **Offer** — share a genuine business offer or availability, linked to authoritative commerce records where relevant.
8. **General Moment** — share an update without being forced into another format.

Separate three concepts in the product model:
- **Content type:** what this post is (photo, video, text, mixed media).
- **Post intent/format:** what the author wants to communicate (question, poll, need, showcase, etc.).
- **Interaction mechanic:** how viewers may participate (vote, comment, answer, react, share).

Do not collapse these into one overloaded enum without an audit-backed reason.

## 4. Composer experience

### Step A — Choose a purpose
Present a simple, mobile-first grid/list of post purposes:
- Start a discussion
- Ask a question
- Create a poll
- Showcase something
- Looking for
- Share an experience
- Offer or deal
- General Moment

Do not show a long intimidating form. Users may start with text or media first and select/accept a format suggestion later. Preserve a quick path to a plain Moment.

### Step B — Create content
Support the capabilities that are verified as available, with proposed targets:
- Text/caption with clear character guidance.
- Multiple images and video, subject to existing upload/storage limits.
- Media preview, remove/replace and upload error recovery.
- Optional identity-linked product/service/business/route reference.
- Active identity shown clearly (personal profile or selected business identity).
- Optional location only when explicitly chosen by the author.
- Audience/visibility control using existing authorized visibility semantics.
- Draft recovery only if a safe, reliable draft mechanism is designed and approved.

Never silently attach a business listing, infer a precise location or switch the active identity.

### Step C — Contextual interaction assistant
When the author has supplied enough context, offer one concise suggestion. Examples:
- Two shoe colours shown → “Would you like to ask people which colour they prefer?” Offer an optional poll.
- “Natafuta laptop” → suggest a request/recommendation prompt, not a sales ad.
- A repair problem → suggest asking for trusted repair recommendations.
- A business milestone → suggest inviting experiences or congratulations, without forcing it.
- A product showcase → suggest a useful question about use, fit or preference.

Controls:
- Use suggestion
- Edit suggestion
- See another suggestion (only if useful)
- Keep my original post / No thanks

The user must be able to dismiss suggestions. Avoid repeated prompts and engagement bait. AI failure must never block posting.

### Step D — Format-specific interaction setup
**Poll:** question, 2–6 editable options, optional end time only if supported, single-choice initially unless audit justifies multi-select, visible result policy explained before publishing. Prevent duplicate votes; define vote changes and poll closing rules. Do not display fabricated or sample vote counts.

**Question/discussion:** comments or answers use the existing authorized comment thread if appropriate. Distinguish a question format visually without creating a duplicate comment system.

**Looking for:** structured category/location/urgency fields only where justified and explicitly supplied. Visibility and contact preferences must be clear. No business lead exposure by default beyond the author's chosen audience.

**Showcase/offer:** link to an authoritative product/service/business entity when appropriate. The social post is not the source of truth for price, inventory, order, payment or service availability.

### Step E — Preview and publish
Preview must match the feed card as closely as practical:
- Correct author identity and verification presentation.
- Text and media order.
- Poll/question interaction surface where selected.
- Audience indicator.
- Linked entity presentation.
- Clear publish action and return/edit path.

Publishing is an explicit user action. Show a clear success state only after the server confirms publication. Preserve entered content after recoverable failures.

## 5. Feed rendering principles

- Preserve Kentexa's approved clean, readable, Twitter-style Home Feed language and existing Moments.
- A poll is visibly tappable and easy to understand; results are shown only from real votes and according to the published result policy.
- Questions invite useful answers, not generic “engagement”.
- Showcase and offer posts retain the identity behind the content.
- Looking-for posts are recognizable as requests, but not automatically exposed as commercial leads.
- General Moments remain first-class and do not receive an interaction prompt by force.
- No decorative emoji UI. Use clear labels, accessible icons and strong touch targets.
- Do not force one image aspect ratio or destructively crop original media.
- Avoid ad-like cards and engagement mechanics that interrupt reading.

## 6. AI behavior and boundaries

Use the existing provider-agnostic AI orchestration in `src/ai/` if the audit confirms a suitable interface. Do not create a second AI provider integration for this feature.

AI input must be limited to the content and context the author is authorized to use for composing. Suggestions should be:
- Relevant to the actual post.
- Short, specific and optional.
- Clearly presented as suggestions.
- Safe and non-deceptive.
- Low-cost: do not invoke an LLM for every keystroke; use deliberate checkpoints/debounce or an explicit “Suggest” action after audit.

AI may suggest format/wording/interaction mechanics. It must not determine authoritative identity, permission, audience access, product truth, price, availability, order, payment, shipment or moderation enforcement. Do not use private posts or hidden demand signals for supply discovery. Do not enable unsolicited bulk outreach or external lead harvesting.

## 7. Identity, visibility and safety

- Resolve the acting identity from the server-authorized active role/profile context, not from a client-selected identity alone.
- Preserve existing public/follower/limited visibility semantics and verify actual enforcement on every read path.
- The author controls audience and any contact preference.
- Do not reveal precise location, private contact details, hidden intent or private content to businesses.
- Inferred intent is probabilistic. Ordinary mentions are not automatically buying intent.
- Do not automatically edit, reclassify, route or publish posts based on inferred intent.
- Apply existing moderation/reporting/blocking/rate-limit rules; identify gaps during audit.
- Keep operational notifications separate from public social content.

## 8. Measurement

Measure quality, not raw activity alone:
- Composer start-to-publish completion and abandonment.
- Format distribution and optional suggestion acceptance/dismissal.
- Real poll participation and meaningful comment/answer rate.
- Relevant conversations and author-approved connections.
- Repeat posting and repeat participation.
- AI suggestion relevance/false-positive rate.
- Reports, hides, blocks, unwanted contact and opt-outs.
- Performance by format without rewarding spam or artificial engagement.

Use existing event/analytics infrastructure where suitable. Define events and privacy/retention before adding instrumentation.

## 9. Existing repository reconnaissance (verified)

Branch inspected: `worktree-service-provider-profiles`.

Verified files:
- `bishoo-frontend/src/public/pages/HomeFeed.js` — current Home Feed; fetches feed content, displays commerce/social cards and comments; routes real feed-post engagement through `/feed/:id/engage` and comments through `/feed/:id/comments`.
- `bishoo-frontend/src/public/components/CreateMomentModal.js` — current Moment/Looking For composer; supports a single selected image in the inspected path, caption, active identity attribution, optional linked entities, category for Looking For, and a sale-intent helper that may route sale-like content to classified creation unless the author chooses to keep it a Moment.
- `bishoo-frontend/src/public/components/PostModal.js` — central “what do you want to do?” creation sheet; Moment entry plus separate listing, shipment, service and business actions, with role/context-specific actions.
- `src/feed/feed.controller.ts` — `GET /feed`, `GET /feed/discover`, `GET /feed/trending`, `GET /feed/moments/stories`, `POST /feed/publish`, post engagement and comment routes.
- `src/feed/feed.service.ts` — feed publishing, intent derivation and profile-scope authorization; injects notification, activity-event and search-index services.
- `src/business/entities/business-feed-item.entity.ts` — `BusinessFeedItem` stores current post type, body/title/media URL, linked entity, intent, action, status, urgency, location fields, visibility, engagement counters and commerce-profile attribution.
- `src/feed/entities/post-comment.entity.ts` — unified comment record supports comments/questions/reviews/seller replies/AI summaries; this is a strong reason not to create another comment table.
- `src/feed/entities/post-engagement.entity.ts` — engagement records currently include save/comment/share/view/purchase/shipment.
- `src/feed/engagements.controller.ts` and `src/feed/feed.module.ts` — comment/engagement handling and existing module dependencies, including AI, notifications, activity, commerce profiles and search.
- `src/notifications/`, `src/activity/`, `src/ai/`, `src/search/` exist as backend modules and must be audited for reuse.

Important limitations of this reconnaissance:
- This is not yet a complete code audit. It verifies file presence and inspected excerpts, not every method, endpoint, test, migration, permission branch or runtime behavior.
- Native poll/vote capability is **not yet verified**.
- Multi-image/video support in the complete Moment publishing pipeline is **not yet verified**.
- Draft persistence, edit-after-publish, scheduling and full visibility enforcement are **not yet verified**.
- The current inspected Moment composer uses one selected file and a 140-character caption limit; confirm the full implementation and whether other post paths differ before treating this as a platform-wide limit.
- Search, AI, activity and notifications exist, but their suitability for this feature remains to be established.

## 10. Required read-only audit for Claude

Read `CLAUDE.md`, `docs/KENTEXA_ROADMAP.md`, `docs/SOCIAL_ENGAGEMENT_ROADMAP.md`, and this document. Confirm the exact branch and clean/dirty working-tree state in the actual workspace before inspecting.

Audit and report exact file paths, methods, DTOs, entities, migrations, tests, API payloads and frontend call sites for:

1. All composer entry points, including Home Feed, bottom navigation, Moment story ring, profile/business pages and role-specific contexts.
2. `CreateMomentModal`, `PostModal`, HomeFeed and any legacy/alternate post creation flows.
3. Feed item entity, enums, migrations, publish/read/update/delete routes and feed rendering.
4. Existing media upload pipeline, limits, MIME validation, storage, multiple files, video processing and cleanup.
5. Comments, question threads, reactions, saves, shares, engagement counters and ranking.
6. Whether poll/vote entities, endpoints, UI, migrations or tests already exist anywhere in the repository.
7. Visibility enforcement for public/followers/limited/private content across feed, discover, stories, business feeds, search, notifications, shared links and direct API access.
8. RoleContext, active CommerceProfile attribution, business-scope permissions and personal/business switching.
9. AI orchestration interfaces, prompt templates, token/cost controls, moderation and failure behavior.
10. Search, demand/intent detection, business discovery and any matching/supply opportunity flow.
11. Activity events, analytics, notification routing, reporting, blocking and abuse controls.
12. Existing tests, known faults, API contracts, migrations and production constraints.

For each capability classify **working / partial / absent / unknown** and cite exact paths and relevant line ranges or symbols. Verify backend behavior; do not infer it from UI alone. Identify duplicate/legacy flows and recommend the smallest safe reuse-first design. Do not modify any files during the audit.

## 11. Proposed delivery sequence (subject to audit)

- **Phase 0 — Audit and UX validation:** map existing capabilities, validate the visual concept against actual app components, identify gaps.
- **Phase 1 — Composer foundation:** unify entry experience and format selection while preserving existing Moment/Looking For behavior and identity/visibility rules.
- **Phase 2 — Participation mechanics:** implement or reuse question/poll mechanics only after audit and explicit schema/API approval.
- **Phase 3 — Optional AI suggestions:** add contextual suggestions with cost, privacy, dismissal and failure controls.
- **Phase 4 — Measurement and refinement:** instrument meaningful participation and safety outcomes using approved event definitions.

Do not commit to phases as implementation scope until the owner reviews audit findings and approves the technical specification.

## 12. Acceptance criteria for the eventual implementation

- Existing Moment and Looking For publishing remains functional.
- Existing personal/business identity attribution and backend authorization remain authoritative.
- Users can publish a plain Moment without AI or interaction mechanics.
- AI suggestions are relevant, optional, dismissible and never block publishing.
- No post is automatically rewritten, reclassified or published.
- Polls, if approved, use real server-side vote records, enforce one vote policy and display accurate results.
- Audience visibility is enforced server-side across all feed/discovery/search/share paths.
- Linked product/service/business information remains owned by its existing domain.
- Mobile composer and preview are readable, accessible and usable with large touch targets.
- Existing feed, comment, engagement, Moment and role-context tests continue to pass; new tests cover the approved feature behavior.
- No unrelated logistics, POS, inbox, payments or production data changes.
- No deployment or release without separate owner approval.

## 13. Approval gates

1. Claude returns the read-only audit report.
2. ChatGPT converts verified findings into a final reuse-first technical design and screen-by-screen specification.
3. Product owner reviews and approves the visual and interaction specification.
4. Product owner separately approves APIs, data model/migrations, permissions, events, tests and rollout plan.
5. Only then may Claude implement the explicitly approved scope.
6. Owner reviews test evidence and production impact before deployment approval.

**Current instruction: AUDIT ONLY. No coding, edits, migrations, branch changes, PRs or deployment.**
