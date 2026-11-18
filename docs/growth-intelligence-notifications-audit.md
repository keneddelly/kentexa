# Kentexa Growth Intelligence — Notification Intelligence Audit & Claude Handoff

**Status:** Architecture/audit specification only. No runtime code, database migration, push configuration, or production deployment is changed by this document.
**Base audited:** `worktree-service-provider-profiles`
**Documentation branch:** `docs/growth-intelligence-notifications`
**Product objective:** Turn Kentexa's existing notification capability into a behaviour-aware next-best-action system that improves activation, meaningful engagement, retention, and business outcomes without increasing notification noise.

---

## 1. Executive decision

Build an intelligence layer on top of the existing notification system. Do not replace the current notification delivery infrastructure and do not start with an LLM deciding every message.

The first production version should be **deterministic, explainable, event-driven and measurable**:

1. Collect reliable user and domain events.
2. Build a compact, role-aware picture of each user's current progress and needs.
3. Evaluate a small set of explicit growth rules.
4. Select at most one highest-value next action per user in a decision window.
5. Choose the best channel: push, in-app guidance, or no message.
6. Measure whether the user completed the suggested action.
7. Adjust cooldowns and suppressions based on outcomes.

AI can later help rank or generate copy within strict policy constraints. It must not invent events, override business rules, or send directly.

## 2. Repository audit — verified findings

The following findings were confirmed by reading the code on `worktree-service-provider-profiles`:

### 2.1 Existing notification delivery

- `src/notifications/notifications.module.ts` registers `NotificationsService`, `InAppNotificationService`, `PushService`, `NotificationController`, the `Notification` entity and the `PushSubscription` entity.
- `src/notifications/notification.controller.ts` exposes authenticated notification endpoints:
  - `GET /notifications/my`
  - `GET /notifications/unread-count`
  - `GET /notifications/:id`
  - `PATCH /notifications/read-all`
  - `PATCH /notifications/:id/read`
  - `GET /notifications/push/vapid-key`
  - `GET /notifications/push/status`
  - `POST /notifications/push/subscribe`
  - push unsubscribe endpoint (verify exact current route and payload while implementing).
- `src/notifications/push.service.ts` uses the `web-push` package and VAPID keys. It stores browser Push API subscriptions (endpoint, p256dh, auth, user agent), sends to all subscriptions belonging to a user, and removes expired endpoints on 404/410.
- This is verified **Web Push** infrastructure. The reviewed files do not prove that the Android application uses native Firebase Cloud Messaging (FCM). Do not assume Web Push subscriptions are the same as native Android device tokens. Audit the Android app's actual registration path before implementing any native delivery adapter.
- `src/notifications/in-app-notification.service.ts` persists in-app notifications and integrates push delivery. Its header documents push as a fire-and-forget side effect of notification creation. Inspect the complete current method and all call sites before changing fan-out behaviour.
- `src/notifications/entities/notification.entity.ts` already stores title, body, action routing information, read state, source identifiers and audience scope. Audience scopes include ACCOUNT, ROLE, WORKSPACE and TRANSACTION.
- `src/notifications/entities/push-subscription.entity.ts` models Web Push subscriptions and associates them with a user.

### 2.2 Existing behaviour and analytics signals

- `src/activity/activity-event.service.ts` and `src/activity/entities/activity-event.entity.ts` provide a server-side, append-only domain activity stream. The documented design explicitly separates domain activity from frontend browsing analytics.
- Activity event categories already cover AUTH, IDENTITY, BUSINESS, SOCIAL, CONTENT, SEARCH, MESSAGING, COMMERCE, PAYMENT, INVOICE, LOGISTICS, AGENT, TRANSPORT, VERIFICATION, REPUTATION, SECURITY, SYSTEM and AI.
- Activity records support actor identity, actor profile identity, business identity, target identity, related user/business, metadata, session and request IDs. The service is intentionally best-effort and does not break the business operation when event recording fails.
- `src/analytics/analytics.service.ts` stores frontend analytics events and sessions, including user/session identity, event type/category/label, page, target, metadata, scroll depth and time on page. This is useful for browsing behaviour but should not be treated as authoritative proof that a business transaction completed.
- `src/analytics/analytics.module.ts` exports the analytics service.
- `src/app.module.ts` imports ScheduleModule, ActivityModule, AnalyticsModule and NotificationsModule, so scheduled jobs and the required domains already exist at application level.

### 2.3 Existing user-context safeguards

- Notification records already support ACCOUNT / ROLE / WORKSPACE / TRANSACTION audience scopes.
- Existing role-context filtering in the in-app notification service is important. Growth notifications must not leak business-private or role-specific details into another active role or workspace.
- Preserve the current audience scoping and authorization rules. A user with multiple roles/business profiles must receive a recommendation relevant to the correct identity/context, while account-wide guidance can remain account-wide.

### 2.4 Important gaps / unknowns to verify before coding

The following are not proven by this limited file audit and must be checked against the current Android app, all backend call sites, migrations and production configuration:

1. Whether the Android app is a native Expo/React Native app, a WebView/PWA wrapper, or has separate push registration code in the active Android branch.
2. Whether native FCM tokens are stored and delivered anywhere; whether Expo Push Service is used; and whether the current production Android build has notification permission handling.
3. Whether all meaningful domain actions consistently call ActivityEventService.record(), and which events are currently emitted in production.
4. Whether existing notification preferences, category toggles, quiet hours, delivery logs, idempotency keys or per-device platform fields exist elsewhere.
5. Exact current event names and payload contracts for signup, profile completion, product listing, Moments, follows, comments, messaging, Resale, order lifecycle, seller activation, logistics and service-provider onboarding.
6. Whether push fan-out is currently duplicated by domain call sites or should be centralized further.
7. Current notification migrations and production schema state. Never rely on TypeORM synchronize in production.

**Claude must inspect these items before proposing or applying schema changes.**

---

## 3. Product principles

1. **Next best action, not notification volume.** The system succeeds when users complete valuable actions, not when it sends more pushes.
2. **One user, multiple identities.** Use active role, business/workspace and transaction context. Never assume a single user role.
3. **Domain authority stays in domain services.** A recommendation engine can suggest an action; it cannot create an order, confirm payment, approve a seller, assign a parcel or change a role.
4. **Push is a delivery channel, not the source of truth.** Persist the in-app notification/decision first; push is best-effort.
5. **Permission is user-controlled.** Show a clear pre-permission explanation, then request OS permission at a contextually useful moment. Never attempt to bypass OS permission or repeatedly nag after denial.
6. **Respect user choice.** Category preferences, quiet hours, frequency caps, opt-out, and account/device permission state must be respected.
7. **Explain every recommendation.** Every decision must record its rule, evidence, intended action and suppression outcome.
8. **No fabricated personalization.** Use actual recorded events and server-side state, not assumptions based on demographics or sensitive attributes.
9. **Do not use AI first.** Deterministic rules provide a reliable baseline and measurable ground truth.
10. **Never let growth messaging interrupt critical operations.** Security, payment, order, delivery and other essential transactional notifications retain their existing semantics and priority.

---

## 4. Target architecture

### Layer A — Event collection

Use existing ActivityEventService for server-confirmed domain events. Add missing event emissions at the domain transaction boundary, after successful state changes. Use AnalyticsEvent only for browsing/interaction signals.

Candidate event taxonomy (map to existing naming conventions; do not blindly create duplicates):

- AUTH: USER_REGISTERED, USER_LOGIN, USER_RETURNED
- IDENTITY: PROFILE_COMPLETED, PROFILE_FIELD_UPDATED, ROLE_ACTIVATED
- BUSINESS: BUSINESS_PROFILE_CREATED, BUSINESS_PROFILE_COMPLETED, SELLER_ACTIVATED
- CONTENT/SOCIAL: PRODUCT_PUBLISHED, MOMENT_PUBLISHED, POST_PUBLISHED, PROFILE_FOLLOWED, POST_COMMENTED, POST_SHARED
- MESSAGING: CONVERSATION_STARTED, MESSAGE_RECEIVED, MESSAGE_REPLIED
- COMMERCE: RESALE_PRODUCT_SELECTED, RESALE_LINK_CREATED, RESALE_SHARED, ORDER_CREATED, ORDER_PAID, ORDER_COMPLETED
- LOGISTICS/AGENT: AGENT_APPLICATION_STARTED, AGENT_APPROVED, SHIPMENT_CREATED, PARCEL_RECEIVED, DELIVERY_COMPLETED
- RETENTION: APP_OPENED, SESSION_STARTED (use analytics for client-only signals unless there is a trusted server event).

Do not record sensitive message bodies, payment secrets, authentication tokens or unnecessary personal data in event metadata. Prefer IDs, bounded enums and minimal metadata.

### Layer B — User growth context

Create a compact, derived context per user and, where necessary, per active CommerceProfile/workspace. Suggested dimensions:

- onboarding state: registered, profile incomplete/complete, verification pending/approved where applicable
- current role(s) and active profile/workspace
- seller state: store/profile readiness, active listings, listing freshness, response activity
- reseller state: opted in, selected products, share activity, attributed orders
- service/agent/transport state: application and activation stage, profile readiness, operational activity
- social state: follows, posts/Moments, comments, meaningful interactions
- messaging state: unread actionable conversations, last response time
- commerce state: order milestones, recent buyer/seller activity
- engagement state: last active time, recent sessions, notification exposure and outcomes
- delivery state: device/platform subscriptions, OS permission if the client can report it, user preferences.

This should be computed from authoritative domain tables plus events. Do not make the event log the only source of truth for current order, payment, approval or role state.

### Layer C — Candidate generation and decision

A rule produces a candidate, not a push. Candidate fields:

- userId
- context key (ACCOUNT or specific profile/workspace/role)
- rule key and rule version
- action key and safe route/deep-link parameters
- priority/expected value
- evidence references (event IDs and/or authoritative entity IDs)
- category (transactional, social, seller_growth, resale_growth, logistics, education, product_updates)
- createdAt, expiresAt
- required channel and eligibility conditions.

Decision flow:
1. Generate eligible candidates from events/state.
2. Validate that the suggested action is still possible and relevant.
3. Apply role/workspace audience scope.
4. Apply permissions, preferences, quiet hours and frequency caps.
5. Suppress duplicates and already-completed actions.
6. Rank candidates deterministically.
7. Select no more than one growth push per user per decision window; critical transactional pushes remain governed by existing policy.
8. Persist decision and delivery attempt.
9. Send via appropriate channel adapter.
10. Record outcome when the user opens or completes the suggested action.

### Layer D — Channel adapters

Use a provider abstraction, without prematurely replacing the existing Web Push service:

- WebPushAdapter: wraps current PushService.
- AndroidPushAdapter: implement only after confirming current Android architecture and provider (FCM or Expo Push). Store native tokens separately from Web Push subscriptions, with platform, app version, lastSeenAt, permission state where reported, and token lifecycle.
- InAppAdapter: creates an in-app notification using existing Notification entity and current audience scoping.
- Future email/SMS adapters only for justified use cases; SMS has real cost and must not be used as a generic engagement channel.

A single decision should not create duplicate notifications through both legacy and new paths. Introduce a feature flag and a migration plan for each event family.

### Layer E — Outcome learning

Track:
- candidate generated
- candidate suppressed (and reason)
- decision selected
- delivery attempted/succeeded/failed
- push opened (only when provider/client can reliably report it)
- destination opened
- recommended action completed
- conversion/retention outcome within a defined attribution window.

Do not treat push delivery as proof of user seeing it. Do not optimize solely for open rate; optimize for completion of the intended action and longer-term healthy engagement.

---

## 5. First-wave rules — deterministic MVP

Start with a small set of high-confidence, low-risk rules. Rule thresholds should be configurable and validated against actual user behaviour; suggested timings below are starting hypotheses, not established facts.

| Rule | Eligibility evidence | Suggested action | Suppress when |
|---|---|---|---|
| Complete profile | Registered; profile below completion threshold after initial onboarding window | Open profile completion | Already complete; recently prompted; user opted out |
| First seller listing | Seller profile active but no published products/listings after a reasonable setup period | Create first listing | Listing already exists; seller application pending/blocked |
| Share first product | Product published but no share action recorded | Share product/store link | Already shared; listing unavailable |
| First Resale share | User opted into Resale / selected an eligible product but no share recorded | Continue Resale share flow | Product no longer eligible; already shared |
| Reply to customer | Actionable unread conversation exists and recipient has not replied | Open exact conversation | Already replied; message already read; quiet hours for non-critical reminders |
| Publish first Moment | Active seller/business profile but no recent content | Create a useful Moment | Recent post/Moment; user has already dismissed prompt |
| Return to unfinished task | A real persisted draft/application/checkout remains unfinished | Resume exact task | Task completed, expired or no longer valid |
| Re-engage dormant user | Previously active user has a meaningful unfinished opportunity | Return to relevant destination | No relevant candidate; recent push; user inactive by choice or opted out |

Do not send generic “come back” pushes without a specific user-relevant reason. Do not send a seller-growth reminder to a buyer-only user unless they have expressed seller intent.

---

## 6. Ranking and frequency policy

MVP ranking should be rule-based and transparent. Suggested score components:

- relevance to current role/workspace
- recency of triggering evidence
- value of the suggested action
- confidence that the action is still available
- urgency (only when real)
- prior response to this rule/category
- fatigue penalty from recent notifications.

Hard constraints override scores:

- critical transactional/security notifications follow existing policies
- no duplicate active candidate for same rule + context + target
- maximum one growth push per user in a rolling 24-hour period initially
- maximum three growth pushes per user in a rolling 7-day period initially
- category-specific cooldowns (e.g. do not repeat the same nudge for at least 7 days)
- quiet hours in user local time; use saved timezone when available, otherwise safe platform default and do not infer exact location
- stop nudging once the recommended action is completed
- respect push permission and preferences
- no push after a user dismisses/opts out of that category.

These are initial conservative defaults. Make caps configurable and evaluate complaints, opt-outs, action completion and retention before relaxing them.

---

## 7. Notification activation and Android permissions

The user wants every user to be guided to enable notifications. Implement this as **required-to-see onboarding education, not forced OS permission**:

1. Check actual platform permission/subscription status.
2. If already granted and token/subscription is registered, do not show the activation gate.
3. If not yet asked, show a short in-app explainer with clear benefits and a user-controlled “Enable notifications” action.
4. Only after the user taps, invoke the platform's official permission prompt.
5. If denied, explain how to enable notifications in system settings. Do not repeatedly invoke the OS prompt where the platform will not show it.
6. Keep the core app usable if the user declines.
7. Re-check permission on app foreground/resume and reconcile subscription/token status.
8. Distinguish OS permission granted from server token successfully registered; these are not the same state.
9. On Android 13+, handle POST_NOTIFICATIONS runtime permission. Confirm target SDK and actual build configuration.
10. Verify older Android behaviour and any WebView/PWA wrapper separately.

Do not treat a browser Web Push VAPID subscription as a native Android FCM token. No permission bypass, deceptive prompt, or dark pattern.

---

## 8. Data model proposal — validate before migration

Claude should inspect existing migrations/entities first and reuse existing structures where appropriate. Avoid duplicate event, preference or delivery tables if equivalents already exist.

Potential additive entities:

### growth_notification_rule
- id, key (unique), version, enabled, category, config JSON, createdAt, updatedAt.

### growth_notification_candidate
- id, userId, contextType, contextId, ruleKey, ruleVersion, actionKey, actionParams JSON, evidence JSON, priority, status, expiresAt, createdAt.
- Unique/idempotency strategy for user + context + rule + target + active time window.

### notification_decision
- id, userId, candidateId, selectedChannel, decision (selected/suppressed), reason, score, decidedAt, metadata JSON.
- Store suppression reasons to explain why no push was sent.

### notification_delivery_attempt
- id, decisionId, provider, endpoint/device reference, status, providerMessageId, errorCode, attemptedAt, deliveredAt/openedAt when reliably available.
- Never store raw auth secrets or full push endpoint credentials in logs.

### user_notification_preference (only if no equivalent exists)
- userId, category, enabled, quietHoursStart, quietHoursEnd, timezone, updatedAt.
- Preserve essential transactional/security notifications according to policy and law; allow users to control non-essential categories.

### device registration
- Extend only if current model is suitable. Otherwise create a separate native device token entity with userId, platform, provider, token, appVersion, permissionStatus, lastSeenAt, revokedAt. Unique token and safe token rotation are required.

Use migrations only. Add indexes for due candidate scans, user history, idempotency keys and status/time queries. Define retention and cleanup policy for high-volume events and delivery logs.

---

## 9. API and operational design

Possible internal services (names are suggestions, align with codebase conventions):

- GrowthContextService — reads authoritative user/profile state and recent activity.
- GrowthCandidateService — creates candidates from domain events and scheduled evaluation.
- GrowthDecisionService — eligibility, ranking, suppression and idempotency.
- NotificationPolicyService — preferences, quiet hours, cooldowns and frequency caps.
- NotificationChannelRouter — dispatches to Web Push, native Android provider and in-app adapters.
- GrowthOutcomeService — records opens and completed actions.
- GrowthEvaluationJob — bounded scheduled recovery for dormant/unfinished-task candidates.

Prefer event-triggered candidate generation for immediate actions and scheduled jobs for inactivity/unfinished-task evaluation. Use existing ScheduleModule; do not add a new queue dependency without evidence it is needed. If volume requires a queue later, define retries, backoff, dead-letter/reconciliation and idempotency.

Never send pushes directly inside a database transaction. Commit the authoritative domain change first, then enqueue/record the event through a reliable post-commit or outbox pattern where necessary. Preserve the current fire-and-forget safety posture for non-critical notification side effects.

---

## 10. Admin observability

Build internal reporting before broad rollout:

- candidates generated by rule
- selected vs suppressed and suppression reasons
- provider delivery success/failure
- push opens where measurable
- action completion rate by rule
- time from prompt to action
- 7-day/30-day retention comparison
- notification opt-outs and permission denial rates
- frequency distribution per user
- errors, stale tokens and duplicate prevention.

Admin controls:
- enable/disable rule
- edit copy and route mapping
- adjust thresholds/cooldowns within validated bounds
- pause a provider
- inspect a user's decision history with appropriate admin permissions
- preview a candidate without sending it.

Do not expose private user content in the dashboard.

---

## 11. Rollout plan for Claude

### Stage 0 — Complete repository and Android audit (no code changes)
- Identify actual active production branch and commit before work.
- Inspect all Android app files, app config, AndroidManifest/Expo config, build target SDK, notification libraries, token registration and notification tap/deep-link handling.
- Inspect all notification call sites and all ActivityEventService.record() call sites.
- Inspect migrations, preferences, jobs, analytics events, and production env names (never reveal secret values).
- Produce a verified event coverage matrix and a file-by-file implementation plan.
- Report uncertainties rather than guessing.

### Stage 1 — Instrumentation and event quality
- Add only missing high-value server-side domain events.
- Ensure event emission follows successful domain changes.
- Add tests for duplicate events, failure isolation and correct actor/profile context.
- Do not change existing push delivery behaviour yet.

### Stage 2 — Policy and preference foundation
- Add/extend notification preferences and platform/device registration only after audit.
- Implement permission education flow in Android app with platform-correct permission request.
- Add quiet hours, caps, cooldowns, category settings and user-controlled opt-out.
- Keep app usable if permission denied.

### Stage 3 — Deterministic growth rules
- Implement a small set: profile completion, first listing, first Resale share, unanswered customer conversation, unfinished application/task.
- Persist candidates, decisions and suppression reasons.
- Use feature flags; start with internal/test users and then a small percentage.
- Ensure no duplicate legacy + new pushes.

### Stage 4 — Outcome measurement and admin reporting
- Measure action completion, not just push opens.
- Add rule-level metrics and operational controls.
- Tune only after enough reliable data exists.

### Stage 5 — Expand carefully
- Add seller content, Moments, agent/service-provider activation, buyer discovery and dormant-user journeys.
- Consider AI only after deterministic rules and event coverage are reliable.
- If AI is introduced, it may rank pre-approved candidates or draft copy; a policy engine must validate every result before delivery.

---

## 12. Required acceptance tests

1. Existing transactional notifications still work and are not duplicated.
2. A user with multiple roles receives growth guidance for the correct account/profile/workspace.
3. Completing an action suppresses its pending candidate immediately.
4. Replaying the same domain event cannot create duplicate candidates or deliveries.
5. A user who has denied push permission is not sent a push; eligible in-app guidance can still appear.
6. A user who opts out of a category receives no non-essential notifications in that category.
7. Quiet hours and frequency caps are enforced using the user's configured timezone.
8. A stale Web Push endpoint is removed only for the matching subscription; native token lifecycle is handled separately.
9. A push provider outage does not break checkout, payment, messaging, logistics or other business operations.
10. Push tap opens the correct authenticated route and respects role/workspace authorization.
11. Notification audience scopes remain enforced in read APIs and push targeting.
12. Every decision is explainable from rule version, evidence, score and suppression reason.
13. A client-reported open is not misrepresented as guaranteed delivery or proof of attention.
14. No growth notification includes sensitive/private transaction or message details on a lock screen.
15. Migrations are additive, reversible where practical, and verified against the real production migration baseline.

---

## 13. Explicit non-goals

- Do not replace the current notification system.
- Do not force OS permission or lock users out for declining.
- Do not use AI to invent user state or bypass domain services.
- Do not send generic daily blasts as a substitute for personalization.
- Do not turn all analytics clicks into push triggers.
- Do not send marketing SMS as a default engagement channel.
- Do not make unreviewed production database changes.
- Do not deploy or enable rules globally until test coverage, feature flags and metrics are in place.

## 14. Claude's first response expected

Before writing code, Claude must return:

1. Current branch and commit inspected.
2. Android push architecture (native FCM, Expo, Web Push/PWA, or other) with exact files and evidence.
3. Existing notification pipeline diagram with exact files.
4. Existing event coverage matrix: event, source file, persisted event, gaps.
5. Existing preferences/device token/delivery log/job structures and migration status.
6. Risks and compatibility concerns.
7. Proposed Stage 0/1 implementation plan with exact files and tests.

**Stop after the audit and plan. Do not implement or deploy until the user reviews the findings and authorizes the next stage.**
