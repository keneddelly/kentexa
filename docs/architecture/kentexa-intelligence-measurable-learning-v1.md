# Kentexa Intelligence — Measurable Learning System V1

**Status:** Product and architecture direction  
**Repository branch:** `worktree-service-provider-profiles`  
**Initial cohort:** 230+ existing accounts, subject to event coverage and contact/consent eligibility  
**First milestone:** Learn from every meaningful session and produce measurable intelligence reports.

## 1. Product thesis

Kentexa should turn legitimate first-party activity into evidence-backed intelligence that improves user discovery, demand/supply matching, product decisions, and the overall social commerce experience.

The defensible asset is not an AI-generated profile by itself. It is the compounding combination of:
- reliable behavioral event history;
- evidence-backed, revisable user intent and interest profiles;
- aggregated demand and supply patterns;
- recommendations connected to real outcomes;
- validated product opportunities and measured product improvements.

AI providers are replaceable components. Kentexa owns the data contracts, domain knowledge, evaluation, and business outcomes.

## 2. The learning loop

```text
Meaningful user activity
        |
        v
Event capture and validation
        |
        v
Session aggregation
        |
        v
Evidence-backed session report
        |
        v
User profile update (versioned, revisable)
        |
        +----------------------------+
        |                            |
        v                            v
Personalized discovery        Aggregated market insights
        |                            |
        v                            v
User action and outcome        Opportunity hypotheses
        |                            |
        +-------------+--------------+
                      |
                      v
             Outcome measurement
                      |
                      v
           Better recommendations,
           products and experiences
```

## 3. V1 deliverables

### A. Behavioral Event Engine

Audit existing Kentexa event, query, search, product, post, community, messaging, service, POS, commerce, and logistics activity before creating new infrastructure.

Normalize meaningful events with:
- event ID and schema version;
- event type and timestamp;
- internal user reference or pseudonymous session reference;
- source surface and domain/entity reference;
- action and outcome where available;
- provenance and eligibility/consent context.

Avoid logging every UI render or low-value click as an intelligence event. Define an explicit event taxonomy and meaningful-action criteria. Preserve existing domain systems as the source of truth for orders, payments, shipments, roles, and other business state.

### B. Session Intelligence

At the end of a meaningful session (or after a safe inactivity boundary), enqueue an asynchronous report job. Do not block the user's request or invoke Claude for every event.

A session report should include:
- session time window and event count;
- observed interests, clearly separated from inferred intent;
- user goals that have evidence;
- meaningful actions and outcomes;
- repeated searches or failed discovery signals;
- possible unmet needs, with confidence and supporting event references;
- recommended next actions only when supported by available Kentexa capabilities;
- language and model/prompt version where AI interpretation is used.

Reports must be idempotent, traceable to source events, and reproducible. A session with insufficient evidence should explicitly say so rather than fabricate a conclusion.

### C. Evolving User Intelligence Profile

Combine session reports into a versioned profile with multiple simultaneous interests and intents. Each inferred label must retain evidence references, confidence, recency, and expiry/decay rules. Distinguish:
- directly observed facts;
- model-inferred interpretations;
- user-declared preferences;
- unknown or insufficient evidence.

Allow recomputation and correction when new evidence arrives. Do not treat an intent as a permanent identity or force every person into a single segment.

### D. Collective / Market Intelligence

Aggregate only appropriate, privacy-protected data to discover:
- rising search and product demand;
- repeated searches with poor result coverage;
- categories with unmet demand;
- geographic patterns only at sufficiently coarse, privacy-safe aggregation levels;
- service and supplier gaps;
- common comparison criteria and price signals where reliable;
- demand/supply mismatches;
- community topics with sustained interest.

Do not publish small cohorts or reports that could reveal an individual's behavior. Apply minimum cohort thresholds and suppress sparse or identifying breakdowns.

### E. Product Opportunity Engine

Turn market signals into hypotheses, not automatic product decisions.

Each opportunity report should include:
- problem or demand signal;
- supporting aggregated evidence and date range;
- estimated reach and confidence;
- affected user and business segments, using non-sensitive categories;
- existing Kentexa capabilities that may address it;
- proposed experiment or product change;
- expected measurable outcome;
- risks, assumptions, and evidence gaps.

Require human product review before roadmap commitment, supplier outreach, or launch.

### F. Recommendation and Outcome Measurement

Recommendations must be eligible against current Kentexa domain data and permissions. Record recommendation impressions, clicks, meaningful follow-through, and negative outcomes where available. Measure whether recommendations create useful actions, not just opens or clicks.

## 4. Reporting cadence

- **Per meaningful session:** concise session intelligence report, generated asynchronously.
- **Daily:** operational data-quality and event-coverage report; no unsupported market conclusions.
- **Weekly:** aggregated user-interest, demand, supply-gap, and product-opportunity report.
- **Monthly:** cohort-level retention, recommendation lift, opportunity validation, and product impact review.

Reports should show time windows, sample sizes, coverage, confidence, limitations, and comparisons with prior periods. Never present illustrative or synthetic numbers as live Kentexa metrics.

## 5. Measurable scorecard

| Metric | Definition / measurement |
|---|---|
| Event coverage | Share of eligible meaningful actions captured correctly |
| Session report coverage | Meaningful sessions with valid reports / eligible meaningful sessions |
| Evidence sufficiency | Reports meeting minimum evidence thresholds |
| Profile freshness | Share of active profiles updated within the defined freshness window |
| Intent precision | Agreement between inferred intent and later explicit/observable outcomes, evaluated on a reviewed sample |
| Recommendation follow-through | Recommendations leading to a defined meaningful action / recommendations shown |
| Incremental recommendation lift | Difference versus a randomized or staged holdout, where feasible |
| Discovery gap rate | Repeated eligible searches with no relevant result, normalized by query volume |
| Opportunity validation rate | Product hypotheses validated by follow-up evidence / hypotheses tested |
| Product adoption | Eligible users completing the target product action |
| Retention | Cohort-based 7-day and 30-day return and meaningful-action rates |
| User control | Opt-out, suppression, correction, and deletion requests handled within policy |

Define metric formulas, denominators, event sources, and ownership before dashboard implementation. Establish baseline values before setting numeric targets. Segment results by language, platform, and product surface only when sample sizes are adequate.

## 6. Experiment discipline

For recommendations and activation:
1. Define one hypothesis and one primary outcome.
2. Establish a baseline and eligible cohort.
3. Use a randomized holdout or staged rollout when practical.
4. Track delivery, exposure, meaningful actions, opt-outs, and adverse outcomes.
5. Report confidence intervals or uncertainty where appropriate.
6. Roll back or revise if the experience harms engagement, trust, or user control.

Do not optimize for time spent or compulsive engagement alone. Prefer successful task completion, useful connections, fulfilled demand, and user satisfaction.

## 7. Privacy, safety, and governance

- Use first-party data only for clearly disclosed, legitimate purposes.
- Respect applicable Tanzanian data-protection and electronic-marketing requirements and channel policies.
- Keep marketing consent and product analytics permissions distinct where required.
- Minimize data sent to external AI providers; pseudonymize references and send only the necessary evidence summary.
- Never send contact details, raw private messages, authentication data, payment credentials, or unrelated personal data to Claude.
- Do not infer or target sensitive personal attributes, vulnerabilities, health, religion, politics, ethnicity, sexual life, or financial hardship.
- Provide appropriate notice, access, correction, opt-out, and deletion workflows.
- Define retention periods for raw events, reports, and derived profiles.
- Enforce role-based access and audit administrative reads/exports.
- Aggregate market reports and suppress small cohorts that could identify individuals.
- AI output must be validated, explainable, and non-authoritative.

## 8. Architecture and operational requirements

- Reuse existing NestJS, TypeORM, PostgreSQL, event, and analytics infrastructure where suitable.
- Use an asynchronous queue/job pattern for session report generation; inspect existing queue infrastructure before introducing another dependency.
- Make ingestion and report generation idempotent and retry-safe.
- Keep event capture lightweight and resilient to temporary AI/provider failures.
- Store prompt/model/schema versions and report provenance.
- Apply timeouts, rate limits, budget controls, retries, and dead-letter handling to AI jobs.
- Validate structured AI output against a strict schema; reject unsupported labels and claims.
- Keep aggregation and core metrics deterministic in application code/SQL. Use Claude for bounded interpretation and language generation, not arithmetic, access control, or business authorization.
- Provide monitoring for job latency, failures, cost, data quality, and report coverage.

## 9. Implementation stages

**Stage 0 — Repository and data audit (no schema changes):**
Map current events, search history, session boundaries, domain activity, existing queues, admin permissions, privacy controls, and analytics. Identify coverage gaps and report real findings.

**Stage 1 — Event foundation:**
Define the event contract and taxonomy, validate meaningful event capture, and reuse current sources. Add schema only for proven gaps.

**Stage 2 — Session reports:**
Implement asynchronous session aggregation, report schema, evidence provenance, confidence thresholds, idempotency, and tests. Start with deterministic summaries before adding LLM interpretation.

**Stage 3 — User profiles:**
Build versioned profile updates with multi-label intent/interests, evidence, recency, expiry, and correction/recomputation.

**Stage 4 — Admin intelligence dashboard:**
Expose session and profile insights to authorized staff, with data coverage, confidence, source evidence, and audit logs.

**Stage 5 — Market and opportunity reports:**
Add privacy-preserving cohort aggregation, discovery-gap analysis, opportunity hypotheses, and weekly reporting.

**Stage 6 — Recommendations and experiments:**
Integrate with existing Kentexa surfaces only after eligibility, measurement, user controls, and holdout evaluation are ready.

## 10. Initial cohort

Use the existing 230+ accounts as an initial evaluation cohort only after verifying:
- account and event linkage;
- available historical depth and data quality;
- lawful/transparent purpose and applicable permissions;
- whether users have sufficient activity to infer anything.

Do not assume all registered accounts are active, reachable, or eligible for marketing. The first outcome is a data-quality and behavioral-coverage report, not a mass campaign.

## 11. Acceptance criteria for the first milestone

- A repository-specific audit documents actual event sources and missing coverage.
- Meaningful sessions are identified using a documented rule.
- Session reports are generated asynchronously without slowing user requests.
- Reports cite source event references and clearly distinguish observation from inference.
- Low-evidence sessions return an explicit insufficient-evidence result.
- Duplicate events/jobs do not create duplicate reports or profile updates.
- AI/provider failure does not break Kentexa activity capture.
- Admin access is role-restricted and audited.
- Privacy, retention, suppression, correction, and deletion requirements are tested.
- Dashboard metrics have documented formulas and never display invented sample numbers as actual results.
- No production migration, campaign delivery, or deployment occurs without review and explicit release approval.

**First task for Claude:** inspect the existing repository on `worktree-service-provider-profiles` and produce the Stage 0 audit. Do not implement speculative tables or services before reporting the actual data model, event coverage, and infrastructure.
