# Kentexa User Intelligence Engine (UIE) — V1 Architecture Proposal

**Status:** Architecture proposal / implementation brief  
**Target repository branch:** `worktree-service-provider-profiles`  
**Scope:** Foundational user-behavior intelligence and personalized activation  
**Initial cohort:** 230+ existing Kentexa accounts (eligibility and contactability must be verified)

## 1. Purpose

Build a reusable intelligence capability that helps Kentexa understand user interests, likely intent, and evolving needs from legitimate first-party product activity. Use these insights to make discovery, recommendations, community participation, commerce, services, and user activation more relevant.

This is not a standalone campaign-message generator. It is a platform capability that can later support multiple Kentexa domains.

## 2. Product principles

1. **Evidence before inference.** Every inferred interest or intent must be traceable to observed events, with timestamps and confidence.
2. **Intent is not identity.** Classify current task-oriented intent (for example, buying, selling, learning, earning, comparing, discovering, or connecting), not immutable personality or sensitive traits.
3. **Domain authority stays authoritative.** The intelligence layer may rank, explain, and recommend. It must not create orders, authorize payments, assign shipments, change account roles, or override domain rules.
4. **Useful before intrusive.** Personalization should improve the user's experience, not manipulate, pressure, or expose private behavior.
5. **Human-controlled activation.** V1 recommendations and outbound campaign messages require admin review and approval.
6. **Multilingual by design.** Support Swahili, English, and French while preserving the user's language preference.
7. **Graceful fallback.** Missing or low-quality history must result in a neutral experience, not fabricated personalization.

## 3. Proposed logical architecture

```text
Kentexa domain events
  ├── Search/query events
  ├── Product and listing views
  ├── Saves, shares, and contact actions
  ├── Community discovery and participation
  ├── Posts and content interactions
  ├── Store/POS and service discovery events
  └── Confirmed commerce outcomes (where available)
          |
          v
Event normalization and privacy/consent checks
          |
          v
User behavior aggregation (deterministic)
          |
          v
User interest + intent profile (versioned, evidence-backed)
          |
          +----------------------+
          |                      |
          v                      v
Recommendation candidates   Activation recommendations
          |                      |
          v                      v
Kentexa domain eligibility   Admin review / approval
and ranking rules                 |
          |                      v
          v                 Approved delivery provider
Kentexa surfaces                  |
(feed, search, communities,       v
marketplace, services)       Delivery + opt-out
          |
          v
Outcome measurement and feedback
```

Claude is an optional interpretation and language-generation component within this architecture. It is not the event store, source of truth, policy engine, or authorization layer.

## 4. V1 scope

### 4.1 Data audit first

Before implementation, inspect the existing NestJS modules, TypeORM entities, migrations, search/query logs, analytics events, user relationships, and current admin capabilities.

Produce an audit covering:
- Which events are already recorded and for how long.
- Whether events reliably map to authenticated users or anonymous sessions.
- Event volume, missing fields, duplicate events, and timestamp quality.
- Which interactions indicate intent versus passive exposure.
- Consent, privacy notice, retention, deletion, and marketing opt-out mechanisms.
- Existing analytics/profile infrastructure that should be reused.

Do not assume a table, event, endpoint, or provider exists until verified. Do not create duplicate event pipelines.

### 4.2 Normalized behavioral events

Reuse existing event records where possible. If a gap requires a new event contract, keep it minimal and versioned. Candidate fields:

- event ID and schema version
- event type and event timestamp
- user ID or pseudonymous session ID, when available
- domain/entity reference (for example product, post, community, service)
- source surface
- explicit action and outcome
- language and coarse context only where necessary
- consent/eligibility state where relevant

Avoid collecting message bodies, contact lists, precise location, or unrelated personal data for general interest inference. Do not send raw user identifiers to an LLM.

### 4.3 Intent taxonomy

Start with multi-label, revisable task intents:
- buy
- sell
- resell / earn
- compare / research
- learn
- discover / explore
- connect / discuss
- find a service
- operate a business

Interests should be topic/domain labels (for example electronics, cameras, business tools, logistics, fashion, or a community topic), not sensitive personal attributes.

A user can have several interests and intents at once. Do not force every user into one permanent segment.

### 4.4 Profile model

A profile should contain:
- user reference (internal ID only)
- profile schema and model version
- observed interest labels
- inferred intent labels
- evidence event references and evidence window
- confidence and recency per label
- last computed timestamp
- user-facing explanation where appropriate
- suppression / opt-out state

Separate observed facts from inferred labels. Store provenance and expiry/decay metadata so stale interests naturally lose influence. Provide a way to recompute and correct profiles.

### 4.5 Deterministic aggregation before LLM interpretation

Use normal application code and SQL for:
- event filtering and deduplication
- time-window aggregation
- frequency and recency
- explicit action weighting
- confidence calculation and minimum evidence thresholds

Use Claude only where it adds value: interpreting ambiguous query themes, mapping evidence to the approved taxonomy, and drafting a concise recommendation/message. Constrain output to a validated JSON schema. Reject unsupported labels, unsupported claims, malformed output, and low-confidence results. Do not let an LLM issue database writes or trigger outbound delivery.

### 4.6 Recommendation mapping

Map supported intent and interest labels to existing Kentexa capabilities only after checking actual feature availability and domain eligibility. Examples:
- buying intent → relevant marketplace discovery
- reselling/earning intent → reseller program education
- topic interest → relevant community discovery
- business-operation intent → existing store/POS tools
- service-seeking intent → relevant service discovery

Never recommend a feature that is unavailable to that user, unavailable in their market, or not supported by current product data.

## 5. Personalized activation V1

For the initial 230+ accounts:

1. Establish the eligible cohort from actual account and event data.
2. Generate profiles in a dry-run batch.
3. Show admins each user's evidence summary, inferred interests/intents, confidence, recommended feature, and draft message.
4. Allow approve, reject, edit, and regenerate actions.
5. Enforce consent, suppression, frequency caps, and opt-out before any delivery.
6. Start with a small controlled cohort and compare against a holdout group where practical.
7. Measure meaningful return actions, not just opens or clicks.

V1 must not automatically send campaigns. Contact details should remain in Kentexa's authorized delivery systems and must not be passed to Claude.

## 6. Measurement

Track at minimum:
- eligible profiles and profile coverage
- evidence sufficiency and low-confidence rate
- admin approval / rejection rate
- delivery success and opt-outs
- return sessions after activation
- first meaningful action by feature
- community join or contribution
- product save/contact/cart/order actions where those events exist
- reseller onboarding/activation where those events exist
- 7-day and 30-day retention

Use a holdout or staged rollout to distinguish campaign impact from normal activity. Do not treat message delivery as activation.

## 7. Privacy, safety, and user control

- Use first-party data only for purposes described in Kentexa's privacy notice.
- Respect applicable Tanzanian privacy and electronic marketing requirements, user consent, and channel-specific policies.
- Provide clear opt-out and suppression handling for marketing messages.
- Minimize data sent to Claude; use pseudonymous references and short, relevant evidence summaries.
- Do not infer or target sensitive attributes, vulnerabilities, health, religion, politics, ethnicity, sexual life, or financial hardship.
- Do not infer precise location or personality traits.
- Define retention and deletion behavior for raw events, derived profiles, and generated messages.
- Restrict profile and campaign access by role and audit administrative access.
- Never expose one user's behavioral profile to another user.

## 8. Technical implementation sequence

**Stage 0 — Audit (no schema changes):**
Inspect current event/query storage, domain modules, admin authorization, messaging providers, migrations, tests, and deployment configuration. Deliver an evidence-backed data map and gap analysis.

**Stage 1 — Foundation:**
Agree on event taxonomy, profile schema, privacy controls, and deterministic aggregation. Reuse existing tables/services where suitable. Add migrations only for verified gaps.

**Stage 2 — Profile computation:**
Implement a repeatable, idempotent profile computation service with versioning, evidence provenance, confidence, decay, and tests.

**Stage 3 — Claude adapter:**
Implement a provider abstraction, server-side secret configuration, strict structured output validation, timeouts/retries, cost controls, redaction, and safe fallback. No direct LLM database access.

**Stage 4 — Admin activation review:**
Add authorized profile review and campaign preview/approval workflow. Keep message delivery disabled until consent and suppression checks are verified.

**Stage 5 — Pilot and evaluation:**
Run dry-run evaluation, manually review profile quality, launch a small approved cohort, and measure incremental activation.

## 9. Non-goals for V1

- Replacing Kentexa search, feed ranking, or domain business logic.
- Building a generalized personality score or permanent user classification.
- Automatically sending messages to all registered accounts.
- Using private message contents as general behavioral training data.
- Building a full real-time recommendation platform before event quality is established.
- Claiming AI understands a user beyond what the available evidence supports.

## 10. Acceptance criteria

- Existing query/search behavior remains unchanged.
- The data audit identifies real sources, gaps, and data quality.
- Profiles are reproducible, versioned, evidence-backed, and explainable.
- Low-evidence users receive no speculative personalization.
- Claude output is schema-validated and cannot execute actions.
- Consent, opt-out, role access, and audit controls are tested.
- Admin approval is required before campaign delivery.
- Unit/integration tests cover aggregation, profile updates, confidence thresholds, suppression, and failure fallback.
- No production deployment or migration occurs without review and explicit release approval.

**First deliverable:** a repository-specific audit report. Do not begin speculative schema or feature implementation before the audit is complete.
