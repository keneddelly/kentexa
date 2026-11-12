# Kentexa Social Interaction & Discovery Architecture (V1)

**Status:** Architecture proposal for review — not an implementation contract yet  
**Repository:** `keneddelly/kentexa`  
**Target base:** `worktree-service-provider-profiles`  
**Scope:** Hashtags, mentions, communities, content relationships, discovery, notifications, moderation and engagement signals.

## 1. Purpose

Build a reusable social interaction and discovery layer for Kentexa. It should help people express topics, refer to other people, participate in communities, and discover relevant content across the platform.

The layer connects domain systems; it does not replace them. Existing domain services remain authoritative for content, identity, membership, permissions, commerce and delivery.

The first implementation priority remains the **Hashtag Engine**. Mentions, community integration and the other capabilities described here are architectural boundaries and planned integrations, not a request to implement everything in one release.

## 2. Product principles

1. **One canonical identity:** equivalent hashtag spellings resolve to one canonical hashtag.
2. **Domain ownership:** posts own posts; identity owns users; communities own membership and community rules; products/services own their records; notifications own delivery state.
3. **Shared discovery, separate responsibilities:** hashtags, mentions, communities and search can cooperate without sharing ownership of each other's records.
4. **Incremental delivery:** ship a reliable hashtag foundation first, then add integrations behind stable contracts.
5. **Relevance over volume:** rank by relevance, freshness, quality and safety—not raw likes, member counts or hashtag frequency alone.
6. **Mobile-first and multilingual:** support Swahili, English and French, Unicode text and accessible user experiences.
7. **Privacy and permission-aware results:** discovery must never expose private content, private community information or restricted user details.
8. **Observable and recoverable:** indexes and counters must be rebuildable from authoritative records and auditable when they drift.

## 3. High-level architecture

```text
User actions / domain events
          |
          v
Content parsing & entity resolution
          |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
     Hashtag Engine       Mention Engine      Community Integration
          |                    |                    |
          +--------------------+--------------------+
                               |
                               v
                    Shared Discovery Index
                               |
              +----------------+----------------+
              |                |                |
              v                v                v
          Search          Recommendations    Trending
              |                |                |
              +----------------+----------------+
                               |
                               v
                    Permission-aware results

Separate domain authorities:
- Feed/Post domain: post and comment content, visibility, lifecycle
- Identity domain: user identity, profile and account status
- Community domain: community, membership, roles, rules and moderation
- Commerce/services domains: product and service records and availability
- Notification domain: inbox/push/email delivery, preferences and read state
- Trust & Safety: reports, blocks, restrictions and enforcement
```

The shared discovery index is a derived read model. It is never the source of truth for domain permissions or business state.

## 4. Hashtag Engine (first delivery priority)

### 4.1 Responsibilities

- Extract hashtags from supported text fields.
- Normalize and resolve equivalent spellings.
- Maintain canonical hashtag records and aliases.
- Link hashtag usage to supported content records.
- Provide hashtag lookup and content retrieval.
- Maintain usage and engagement aggregates.
- Later support trends, follows and recommendations.

### 4.2 Proposed records

| Record | Responsibility |
|---|---|
| `Hashtag` | Canonical tag ID, display form, normalized key, language metadata and lifecycle state |
| `HashtagAlias` | Alternate spelling or approved alias mapped to a canonical hashtag |
| `HashtagUsage` | Unique relation between a hashtag and a content item |
| `HashtagStats` | Derived usage, reach and engagement aggregates over defined windows |
| `HashtagFollow` | User's follow relationship with a hashtag, if/when product UX supports it |

A usage record should identify the content type and stable content ID, and enforce uniqueness for the same hashtag/content pair. It should also retain enough source metadata to support safe re-indexing and cleanup.

### 4.3 Parsing and normalization

- Parse hashtags only in explicitly supported fields; do not blindly scan arbitrary metadata or URLs.
- Preserve the original caption exactly as authored.
- Store a normalized lookup key separately from the display form.
- Handle case-insensitive duplicates and Unicode letters/marks/numbers.
- Define and test rules for punctuation, underscores, maximum length and malformed tags.
- Do not assume that visually similar characters from different scripts are identical.
- Do not merge different hashtags merely because they are semantically related.
- Aliases and related search terms must be explicit, reviewable relationships—not destructive renaming.
- Make extraction deterministic and reusable by post creation, editing and backfill jobs.

### 4.4 Lifecycle and consistency

- Create/update usage links transactionally where practical, or use an outbox/retryable event flow where writes cross service boundaries.
- On content edit, reconcile old and new hashtag sets.
- On content deletion, remove or deactivate usage links according to retention policy.
- Prevent duplicate usage records.
- Treat statistics and search indexes as derived data that can be rebuilt.
- Make backfills idempotent, resumable and observable.

## 5. Mention Engine

Mentions refer to platform identities; they are not hashtags and must not share hashtag identity or persistence rules.

### 5.1 Responsibilities

- Recognize supported mention syntax, initially `@username` or the platform's canonical public handle format.
- Resolve handles to stable user IDs at publish/edit time.
- Validate account status and mention eligibility.
- Store mention references separately from rendered text.
- Support mention navigation and notification events.
- Reconcile mentions when content is edited or deleted.

### 5.2 Proposed records

| Record | Responsibility |
|---|---|
| `MentionReference` | Content type/ID, author ID, mentioned user ID, token position or source reference, creation time and active state |
| `MentionPreference` | User-level controls for who may mention them |
| `MentionDelivery` | Optional idempotency/delivery reference if notification domain does not already provide one |

### 5.3 Rules

- Resolve users to immutable IDs; never use a mutable username as the relationship key.
- A mention must not grant access to private content.
- Respect blocks, account restrictions, privacy settings and community permissions.
- Avoid notifying a user about a mention in content they cannot view.
- Prevent duplicate notifications for repeated occurrences in one content item unless product design explicitly requires otherwise.
- Editing a post must add newly mentioned users and withdraw/deactivate removed references as appropriate.
- Mention notifications must be generated through the Notification domain, not sent directly by the parser.

## 6. Community integration

The Community domain remains authoritative for community records, membership, roles, visibility, rules and moderation.

The discovery layer may index approved community metadata:
- Community name and description
- Category and administrator-approved related keywords
- Public visibility and discoverability state
- Freshness/activity signals that are safe to expose
- Public discussion references, subject to permissions

Community-specific keywords are **not automatically hashtags**. They are structured discovery terms owned by the Community domain and may be mapped into the shared discovery index.

Community membership and community discussions must never be inferred from a hashtag match. Joining, posting, reading and moderating must go through Community domain authorization.

A future integration may connect a hashtag to relevant public communities, and community discussions may use hashtags. These are related discovery paths, not one combined data model.

## 7. Other content integrations

The architecture should allow approved indexing adapters for:
- Moments/posts and comments
- Public community discussions
- Products and stores
- Services and service-provider profiles
- Public events or other future content types

Each adapter must provide a stable content reference, searchable text, visibility metadata, timestamps and a way to re-check current authorization. Do not duplicate full domain records into the discovery system.

Not every content type must support hashtags or mentions. Each capability must be explicitly enabled for each type.

## 8. Shared Discovery Index

The index is a derived, permission-aware read model for retrieval—not a replacement database.

A normalized indexed document may contain:
- Content type and stable content ID
- Owner/author ID where appropriate
- Searchable title/body excerpts and normalized terms
- Canonical hashtag IDs
- Mention references where appropriate
- Community ID/category/approved keywords where appropriate
- Created/updated timestamps
- Visibility and moderation state references
- Derived engagement-quality signals

Avoid indexing sensitive/private fields. Re-check authorization against the owning domain before returning protected content. Search snippets must not leak hidden text.

## 9. Search, ranking and trends

### Search
- Support exact hashtag lookup and prefix suggestions.
- Support ordinary text search across permitted indexed content.
- Allow related-term expansion only where configured and explainable.
- Keep hashtag identity separate from related keywords.
- Apply visibility, block, moderation and access filters before results are shown.

### Ranking
Use a balanced, explainable score with configurable signals:
- Query/topic relevance
- Recency and freshness
- Meaningful engagement (replies, saves, qualified interactions)
- Content quality and safety
- User-declared interests and follows
- Community/context relevance where applicable
- Diversity and repetition controls

Do not rank solely by likes, member count, posting frequency or hashtag count. Avoid allowing one high-volume account or one community to dominate discovery.

### Trending
- Calculate trends over explicit time windows.
- Use rate of change and meaningful engagement, with spam/abuse controls.
- Apply minimum data thresholds and language/region context where appropriate.
- Label trends accurately; do not call a tag trending based on lifetime usage.
- Make trend calculations reproducible and monitor manipulation.

## 10. Notifications and activity

Hashtag follows, mentions, replies and community activity can generate notification events, but the Notification domain owns preferences, delivery, read state, deduplication and channel routing.

Potential event types:
- User mentioned in content
- Reply to user's content
- Followed hashtag has relevant new activity (only if enabled)
- Community activity or invitation (according to membership and notification settings)

Use idempotency keys and deduplication. Respect quiet hours, channel preferences, blocks and user controls. Do not turn every hashtag occurrence into a notification.

## 11. Trust, safety and moderation

- Integrate with existing report, block, mute and moderation capabilities.
- Support spam detection for repeated/tag-stuffed content and coordinated trend manipulation.
- Allow moderators to restrict or suppress abusive tags without corrupting historical content.
- Keep an audit trail for moderation actions.
- Ensure hidden, removed or restricted content is excluded from public discovery.
- Provide rate limits for mention autocomplete, tag creation and search endpoints.
- Do not expose private community names, membership or discussion snippets through autocomplete or related-content suggestions.

## 12. API and event boundaries

Exact routes and event names must be aligned with the existing NestJS modules and API conventions after repository audit. The following are capability contracts, not prescribed endpoint names.

### Hashtag capabilities
- Extract/preview hashtags from text.
- Resolve a hashtag by normalized key or alias.
- Retrieve paginated content for a hashtag.
- Retrieve related tags and trend summaries when available.
- Follow/unfollow a hashtag when supported.

### Mention capabilities
- Search eligible users for mention autocomplete.
- Resolve mention tokens to user IDs.
- Retrieve a user's permitted mention activity.
- Publish mention-change events to Notification.

### Community capabilities
- Search discoverable communities by name, description, category and approved keywords.
- Retrieve relevant public communities for a topic or hashtag.
- Delegate join/read/post/moderation operations to Community domain APIs.

### Event-driven integration
Use existing event/outbox conventions where available. Candidate domain events include:
- ContentCreated / ContentUpdated / ContentDeleted
- CommunityCreated / CommunityUpdated / CommunityVisibilityChanged
- UserHandleChanged / UserRestricted
- ContentModerated / ContentRestored
- EngagementRecorded

Consumers must be idempotent, retryable and observable. Do not introduce a new message broker solely for this feature without an architecture and operational justification.

## 13. Analytics and operational health

Track:
- Extraction success/failure and parsing latency
- Hashtag usage-link consistency
- Indexing lag and retry/dead-letter counts
- Search latency, empty-result rate and click-through
- Mention resolution and notification delivery/deduplication
- Discovery engagement and repeat participation
- Spam, report and moderation rates

Provide a reconciliation job to compare derived usage/index state with authoritative content. Avoid treating raw counts as the only success metric.

## 14. Delivery roadmap

### Phase 0 — Repository and architecture audit
- Inspect existing feed, Moment, identity, notification, community and search modules.
- Inspect database conventions, migrations, events/outbox, permissions and tests.
- Confirm whether hashtag work in PR #357 is still open and how it fits the implementation sequence.
- Record existing capabilities before proposing new tables or APIs.

### Phase 1 — Hashtag foundation
- Finalize schema and migration strategy.
- Implement parser, normalization, alias resolution and deterministic tests.
- Add usage persistence and edit/delete reconciliation.
- Add safe backfill and consistency checks.
- Integrate Moment create/edit without changing unrelated behavior.

### Phase 2 — Hashtag retrieval
- Hashtag lookup and paginated hashtag content.
- Clickable hashtag presentation and shareable hashtag route.
- Permission-aware search and index maintenance.

### Phase 3 — Mention foundation
- Handle autocomplete and identity resolution.
- Persist mention references.
- Integrate notification events and privacy/preferences.
- Add edit/delete reconciliation and abuse controls.

### Phase 4 — Community and content adapters
- Index discoverable community metadata and approved keywords.
- Connect public discussions and other approved content types.
- Keep membership and permissions in Community domain.

### Phase 5 — Intelligence
- Hashtag follows, trends, related topics and personalized recommendations.
- Add ranking experiments, analytics and anti-manipulation controls.

Each phase should have its own tests, migration review, observability and release gate. Do not bundle the whole roadmap into one large PR.

## 15. Acceptance criteria for the first Hashtag Engine release

- Equivalent case variants resolve to one canonical hashtag.
- Swahili and Unicode hashtags are handled according to documented parsing rules.
- Duplicate tags in one content item create one usage relationship.
- Editing content reconciles added and removed hashtags.
- Deleting content does not leave active orphaned usage relationships.
- Backfill and reconciliation are safe to run more than once.
- Original authored text is preserved.
- Existing Moment publishing behavior and API contracts remain compatible.
- No hashtag result bypasses content visibility or moderation rules.
- Tests cover parser edge cases, persistence, lifecycle, authorization and failure recovery.

## 16. Non-goals for this architecture document

- Replacing the existing feed, community, identity or notification systems.
- Implementing all capabilities in one release.
- Automatically creating communities from hashtags.
- Treating community keywords as hashtags.
- Allowing a discovery index to authorize access.
- Changing unrelated Kentexa UX, payment, logistics or commerce behavior.

## 17. Implementation guardrails

- Work only from `worktree-service-provider-profiles`; never use `master`.
- Audit current implementation before adding schema or APIs.
- Preserve existing contracts unless a reviewed migration is necessary.
- Prefer the smallest complete vertical slice.
- Add migrations and rollback/recovery considerations.
- Run focused tests and the repository's required production checks.
- Merge only after required CI passes and review is complete.
- Verify the resulting deployment separately; a Git merge is not proof of production deployment.

---
**Decision requested:** Review this architecture as the shared direction. The immediate engineering task is Phase 0 followed by Phase 1 (Hashtag Engine), not simultaneous implementation of mentions, communities and every discovery feature.
