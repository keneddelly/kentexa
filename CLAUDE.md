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
