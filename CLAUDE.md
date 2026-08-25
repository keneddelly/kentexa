# Kentexa — Core Product Philosophy

Read this before developing or modifying Kentexa. It overrides the default instinct to treat this as a product marketplace.

## Definition

Kentexa is **not** primarily a product marketplace. Kentexa is a digital business identity and commerce network powered by AI.

> Kentexa is an AI-powered digital business identity and commerce network where businesses, sellers, service providers, professionals, agents and organizations build their digital identity, share what they are doing, interact with customers in real time, build trust and conduct commerce.

Kentexa is **not**: "A marketplace where people list products."
Kentexa **is**: "A living digital identity for business — where interaction, trust and commerce happen around that identity."

## 1. Core model

```
Identity → Content → Interaction → Trust → Commerce
```

Not:

```
Product → Listing → Sale
```

Products, services, ads, Moments, conversations, orders, invoices, payments, delivery, and reviews are **activities connected to an identity**. A product should never become more important than the business or person behind it.

## 2. Social commerce identity platform

Kentexa combines business identity, social interaction, content publishing, real-time communication, discovery, commerce, payments, logistics, reputation, and AI-powered business tools. This is intentional — businesses need to communicate with customers continuously, not only when they have something for sale. It should feel natural to users of Instagram/Facebook/TikTok while providing deeper business/commerce functionality underneath.

## 3. Business identity is persistent

An identity does not disappear when a product sells or a listing expires. It's the foundation; products/listings are objects connected to it. A persistent identity carries: name, logo, description, verification status, location, contact info, category, products, services, Moments, reviews, followers, customers, conversations, orders, invoices, reputation, and activity history.

## 4. Not every business is a product seller

Never assume every business owns products, stores inventory, ships, or needs a catalogue. Manufacturers, factories, transport/logistics companies, service providers, consultants, restaurants, hotels, repair companies, freelancers, real-estate professionals, Super Agents, transporters, distributors, wholesalers, and retailers may all need Kentexa identity/interaction features without needing to sell products.

**Features must be role/capability-based, not forced on every business.** Don't show "Ship Product" to a manufacturer that doesn't sell individual products. Derive capabilities instead: can sell products? provide services? ship? transport? receive orders? issue invoices? deliver? The interface adapts to actual capabilities.

(Kentexa's multi-role architecture — separate Business/Seller/Transport Provider/Super Agent/Service Provider entities with capability-derived UI — is the concrete implementation of this rule. See `src/business/`, `src/commerce-profiles/`.)

## 5. Moments are core, not advertising

A Moment lets an identity communicate what's happening *now*: new stock, new service, an offer, a completed delivery, an announcement, a new branch, behind-the-scenes activity, a milestone, an update. The purpose is to keep the identity alive and active — not simply to advertise products. Users should: Follow → Discover → View → React → Comment → Message → Engage → Transact.

## 6. Real-time interaction is essential

Not a static classified site. Messaging, comments, reactions, Moments, notifications, unified inbox, customer conversations, and business updates should build a **Customer ↔ Business** relationship, not just a **Buyer ↔ Product** transaction.

## 7. Commerce emerges from identity and interaction

A customer discovers a business via a Moment, search, recommendation, product/service, comment, referral, another business, a Super Agent, location, or AI — then moves naturally into conversation and commerce:

```
Discover Moment → Visit Business Identity → Ask Question → Chat →
View Product/Service → Request Invoice → Pay → Delivery/Service →
Review → Follow Business
```

This is the Kentexa commerce loop.

## 8. Products are always connected to identity

Every product/listing has a clear owner. Users can always move Product → Business Identity and Business Identity → Products/Services. The identity stays visible throughout the commerce journey.

## 9. Classifieds are part of Kentexa, not all of it

Classifieds are an important capability, but Kentexa must never be architecturally or visually reduced to "a website where people post products for sale." A classified can still connect to a user identity even when that user isn't a formally verified business. Verification unlocks additional capability and trust — it doesn't create a separate ecosystem.

## 10. Trust is built around identity

```
Identity → Reputation → Trust
```

Not:

```
Product → Trust
```

Verification, reviews, transaction history, and activity strengthen the identity, so a customer learns "I trust this business," not just "I trust this listing" — this compounds across repeat interactions.

## 11. Unified inbox belongs to the identity

Messages connect to context: customer, product, service, order, invoice, delivery, Moment, or prior conversation. This is a business communication system, not just a chat feature. Any future external-channel integration (WhatsApp, etc.) should still route through the appropriate identity and customer relationship.

## 12. Super Agents and transporters have identity too

Not just logistics records — they get their own identity and reputation:

- **Super Agent identity**: city/hub, verification, services, available logistics, Moments, customer interactions, shipments, reputation, earnings.
- **Transporter identity**: transport services, routes, vehicle/capability info, availability, shipments, tracking, reputation, customer interaction.

This makes the logistics network part of the identity ecosystem, not a bolt-on.

## 13. AI understands identities, not only products

Kentexa AI should reason over relationships between users, businesses, sellers, products, services, customers, agents, transporters, locations, conversations, transactions, Moments, and reputation. It should be able to answer "which businesses can provide this service near me?" — not only "which product matches this search?" AI should understand business capability and identity, not just listing text.

(Relevant to `src/ai/`, `src/search/` — e.g. the AI search parser's domain classification and `CommerceProfile.category`/`aiKeywords` matching should keep improving toward identity-first, capability-aware results, not just literal listing matches.)

## 14. Design principle — ask before building any feature

1. Does this strengthen the user's or business's identity?
2. Does it improve interaction?
3. Does it improve trust?
4. Does it make commerce easier?
5. Does it unnecessarily force every entity to behave like a product seller?

If the answer to #5 is yes, redesign the feature.

## 15. UI/UX principle

The interface should feel socially alive — a following feed, recommended businesses, Moments, products, services, classifieds, business discovery, AI recommendations, local activity — but every path should lead back to an identity:

Moment → Business identity · Product → Business identity · Review → Business identity · Message → Business identity · Order → Business identity · Invoice → Business identity · Delivery → Business identity

The identity is the common thread through the whole experience.

## 16. Development rule

Don't ask only "how does this work for a product?" Ask **"how does this work for the identity behind the activity?"** This principle should guide database architecture, API design, permissions, UI/UX, notifications, search, AI, analytics, reputation, payments, and logistics for every future Kentexa feature.

---

# Kentexa Internal AI Intelligence & Activity Monitoring System

Kentexa needs an internal AI intelligence layer that continuously understands activity across the platform — not a chatbot, but the layer that observes structured events, correlates them, detects patterns, and generates reports/recommendations. It extends the core philosophy one step further:

```
Identity → Activity → Interaction → Trust → Commerce → Intelligence
```

## The activity event system

Every meaningful action (auth, identity/business changes, social, commerce, logistics, agent activity) should generate a **structured internal event**, not an ad-hoc log. Build one centralized Kentexa Activity/Event model — not a different logging shape per module.

A standard event carries: `eventId`, `eventType`, `actorId`, `actorType`, `businessId`, `targetType`, `targetId`, `relatedUserId`, `relatedBusinessId`, `timestamp`, `location`, `source`, `metadata`, `sessionId`, `requestId`, `severity`, `visibility`. Exact fields can adapt to what already exists, but every module should converge on one consistent shape.

Events are categorized: `AUTH`, `IDENTITY`, `BUSINESS`, `SOCIAL`, `CONTENT`, `SEARCH`, `MESSAGING`, `COMMERCE`, `PAYMENT`, `INVOICE`, `LOGISTICS`, `AGENT`, `TRANSPORT`, `VERIFICATION`, `REPUTATION`, `SECURITY`, `SYSTEM`, `AI`.

## Immutable activity record

The raw event is the source of truth. AI interpretation can change later; **the original event never gets rewritten.** This matters for auditing, security, financial investigation, disputes, and fraud detection. Example: the event `ORDER_COMPLETED` stays fixed forever; an AI's *interpretation* of it ("Business X should follow up with the customer") is a separate, mutable layer on top.

## What the intelligence layer does

- **Understands** what happened from raw events.
- **Correlates** multiple events into one story — e.g. viewed product → opened business profile → followed → messaged → requested invoice → paid → shipment created is ONE customer journey, not seven unrelated rows.
- **Detects patterns** — rising demand, declining engagement, abandoned purchases, repeated inquiries, suspicious activity, high-performing or growing/declining businesses, frequently searched products/services.
- **Reports** to authorized users: a verified business gets a daily-style intelligence summary (customer activity, commerce, engagement, an AI insight, a recommendation); Kentexa admins get a broader platform dashboard (new users/businesses/listings/Moments, network intelligence — fast-growing businesses, popular categories/locations, logistics bottlenecks, complaints).

## Business-identity aggregation, not per-product noise

If a business sells 20 products, the AI should say "Business X received 43 customer interactions across 12 products this week," not list per-product counts in isolation. Always able to aggregate at both the product and identity level, but identity-level framing is the default.

## Customer journey intelligence

Discover Moment → Visit Business → View Product → Message → Response → Invoice → Pay → Shipment → Delivery → Review. The AI should read this as one arc — Discovery → Interest → Conversation → Purchase → Delivery → Reputation — a core source of Kentexa intelligence.

## Anomaly detection is advisory, not punitive

Flag unusual activity (spikes, repeated failed payments, unusual logins, coordinated multi-account behavior, suspicious transactions, abnormal referral/commission activity, repeated shipment failures, fake engagement) for authorized review. The flow is:

```
Detection → Risk score → Human/system policy review → Action
```

never:

```
AI suspicion → automatic punishment
```

— unless a predefined deterministic security rule explicitly allows the automated action.

## Layered cost architecture — don't send every event to an LLM

```
Layer 1 — Event collection            (record structured events)
Layer 2 — Deterministic analytics     (counts, totals, rates, status — plain code/SQL)
Layer 3 — Rules engine                (predefined pattern detection)
Layer 4 — AI reasoning                (only when interpretation/summarization/
                                        correlation/recommendation actually needs it)
```

This keeps it scalable and affordable — most questions get answered by layers 1–3.

## AI actions stay separated and auditable

Keep these three distinct capabilities separate, never blurred:

- **Observation** — "Customer has not received a response for 4 hours."
- **Recommendation** — "Recommend responding to the customer."
- **Automated action** — "Send an approved notification." (only for pre-approved, narrow, deterministic-gated actions)

Every AI-generated recommendation or automated action should itself produce an AI event (`AI_EVENT` / `AI_ACTION` with source event ids, reason, confidence, action, status) — accountability for the AI, same as for any other actor on the platform.

## Guardrails

- **Never invent activity.** Conclusions come only from recorded events, authorized data, and valid system state. Never fabricate orders, payments, messages, customers, reviews, shipments, or revenue. If data is insufficient, say "Insufficient activity data" rather than guessing.
- **Respect existing authorization.** A business's AI report only sees what that business is authorized to see; a Super Agent only sees relevant logistics; a transporter only sees assigned shipments. Being an internal service is never a reason to bypass normal permission checks.
- **Never store sensitive personal data just because it exists.** Only retain what's needed for legitimate function, analytics, security, personalization, or operations.
- **AI never becomes the source of truth for deterministic state** — wallet balances, payment status, order status, shipment status, commission calculation, permissions, verification status stay owned by the actual application logic. AI interprets and reports on those states; it doesn't replace them.
- **Provider-agnostic.** Route through the existing AI orchestration layer (`src/ai/`) rather than hard-coupling new intelligence features to one specific provider.

## Before building any major new feature, answer

1. What activity/events does this generate?
2. Who owns those activities?
3. Which identity are they connected to?
4. Should it be visible to the user/business?
5. Should it feed analytics?
6. Should AI understand it?
7. Does it affect trust/reputation?
8. Does it affect commerce?
9. Does it affect logistics?
10. Does it need an audit trail?
11. What permissions apply?
12. Can it be correlated with prior activity?

## The long-term vision

Kentexa should evolve from a platform that stores transactions into a platform that understands business activity — able to answer: what happened, who was involved, which identity, what led to it, what happened afterward, is this normal, what does it mean, and what should happen next.
