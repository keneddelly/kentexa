# Kentexa POS — Free Core & Voluntary Monetization Direction

**Decision recorded:** 2026-11-09  
**Status:** Product/business direction approved; implementation is not authorized by this document.  
**Repository:** `keneddelly/kentexa`  
**Target market direction:** Tanzania first, designed to support additional countries progressively.

## 1. Executive decision

Kentexa POS should use a **free core + prepaid credits + optional one-time paid add-ons** model. The preferred payment approach is pay-as-you-go credit top-ups, not monthly subscriptions.

The owner's current growth priority is daily active users and adoption, not maximizing revenue per user. POS must therefore be useful enough that a small business can operate its everyday shop without paying Kentexa.

Monetization should happen when a business voluntarily chooses additional convenience, automation, capacity, or a service that creates a real operating cost for Kentexa.

**Core principle: Never force a business to pay just to continue its normal daily POS operations.**

This is the preferred commercial direction. Do not introduce monthly or annual recurring subscriptions as the default monetization model. Do not replace it with a mandatory trial, compulsory recurring payment, or paywall around essential POS workflows without explicit owner approval.

## 2. Keep essential POS free

The free tier should be a real, usable POS product — not a restricted demo. The intended baseline includes:

- Product catalogue and basic product management.
- Core stock/inventory management.
- Recording and processing ordinary sales.
- Basic receipts.
- Customer records.
- Basic expense recording.
- Basic in-app daily sales and business reports.
- Essential cashier/staff access needed for normal shop operations.

The exact free feature boundary must be validated against the actual product and cost structure before implementation. Do not arbitrarily remove an existing essential feature merely to create a paid tier.

## 3. Voluntary paid add-ons

Paid add-ons should be individually understandable and useful. A business should be able to choose only what it needs.

### A. SMS credits — first candidate

SMS is a strong first monetization candidate because every message creates a direct third-party cost for Kentexa.

Potential optional uses:
- Send sales summaries by SMS.
- Low-stock notifications by SMS.
- Payment or collection reminders.
- Customer receipts or order updates by SMS.
- Other business notifications where the owner explicitly enables them.

Rules:
- Basic reports remain viewable inside Kentexa POS for free.
- Never charge merely because a user opens or views their own report.
- Charge only when the business explicitly chooses an SMS delivery or another clearly priced SMS service.
- Show the number of messages and the credit cost before sending or enabling a recurring SMS automation. Recurring automation must consume credits transparently only when messages are actually sent.
- Make recurring messages opt-in, configurable, and easy to pause.
- Let businesses buy credits in advance, see their balance, review a clear transaction/usage history, and understand each deduction. Show delivery status where available.
- Do not claim a message was delivered when the SMS provider only accepted or queued it.
- Define fair handling for failed, rejected, duplicate, or uncertain provider submissions before billing is implemented. Use provider delivery evidence and idempotency; do not silently double-charge.
- SMS unit costs and prices must be country- and provider-aware. Tanzania and DRC may have different routes, costs, currencies, and delivery behavior.
- Pricing must be transparent and leave a sustainable margin without hiding the underlying cost.

### B. Advanced reports and analytics

Keep ordinary operational reports free. Possible paid enhancements include:
- Advanced trends and comparisons.
- Scheduled report delivery.
- Export formats or larger reporting periods, if they create meaningful additional value or cost.
- Deeper business performance and margin analysis.

Do not paywall basic visibility into a business's own sales or stock.

### C. Automation

Possible opt-in add-ons:
- Automated low-stock alerts.
- Reorder reminders.
- Customer follow-up campaigns.
- Scheduled business summaries.
- Other automations that create measurable value or third-party operating cost.

Any customer-facing communication must respect consent, frequency controls, and applicable local rules. AI or automation must not send consequential or sensitive messages without the appropriate authorization and controls.

## 4. Credit-based purchases and optional business add-ons

The preferred commercial experience is a prepaid wallet/credit balance that a business tops up when it wants to use paid Kentexa services. Avoid forcing merchants into monthly or annual subscriptions.

Possible credit-funded services include:
- SMS messages and other metered third-party services.
- Scheduled report delivery and premium report exports where there is a clear incremental cost or value.
- Optional automation runs or message campaigns.
- Other clearly described pay-as-you-go services.

For larger-business capabilities such as multi-branch management, consolidated reporting, or advanced staff controls, first validate the best one-time or credit-based purchase model. Do not silently turn these into recurring subscriptions. If a capability needs ongoing infrastructure costs, explain the cost and obtain the owner's approval for its pricing model before implementation.

Credit rules:
- Show the credit price before a purchase or action.
- Let the merchant choose when and how much to top up; no automatic recurring recharge by default.
- Show the balance, top-up history, usage ledger, and reason for every deduction.
- Use country-aware pricing and currency handling.
- Handle payment confirmation, duplicate callbacks, refunds, failed actions, and uncertain provider outcomes safely and idempotently.
- Do not deduct credits twice for a single action.
- Define expiry/refund policy transparently and obtain owner approval before setting one.

Credits are for optional paid services. They must never be required to record ordinary sales, manage essential stock, or view basic business records.

## 5. International-ready product direction

The POS should be designed so that it can be used by businesses outside Tanzania as country support is deliberately activated.

Do not hardcode Tanzania-specific assumptions into the general POS business model.

Country/business configuration should eventually account for:
- Country and business location.
- Operating currency and supported transaction currencies.
- Time zone and locale.
- Language and receipt conventions.
- Configurable tax settings and country-specific compliance requirements.
- Available payment providers.
- SMS providers, routes, costs, and sender requirements.
- Local integrations and service availability.

For example, a business in Kinshasa should not be forced to use Tanzanian payment providers or Tanzanian SMS assumptions. DRC support must be validated against local provider availability, currency handling, tax and legal requirements.

International readiness does not mean every country is automatically supported or compliant. Activate countries and integrations progressively after validation.

## 6. Guardrails for pricing and user trust

1. No mandatory subscription or recurring payment for core POS use.
2. No hidden deductions or surprise billing.
3. Show the price before an optional paid action.
4. Make recurring automations explicitly opt-in; charge credits only for the usage the merchant authorized.
5. Allow users to see balances, usage, and transaction history.
6. Explain what is free and what is paid in plain language.
7. Do not make basic access to business records conditional on payment.
8. Do not make SMS or other third-party services appear free when Kentexa bears a real cost.
9. Keep prices and provider-cost logic configurable by country; do not hardcode TZS-only pricing into the global model.
10. Measure merchant adoption, repeat use, retention, and feature value alongside revenue.

## 7. Suggested rollout — not an implementation schedule

When POS monetization work is actually prioritized:

1. Validate the existing free POS workflows and identify their true infrastructure costs.
2. Measure merchant demand for SMS reports, alerts, reminders, and advanced reports.
3. Design transparent prepaid credits and country-specific provider-cost handling, starting with SMS.
4. Test voluntary credit-funded add-ons with real businesses and validate credit pricing against actual costs.
5. Validate which larger-business capabilities merit one-time purchases or other non-recurring credit-funded options.
6. Introduce international country configurations progressively, starting with markets where real demand and provider coverage exist.

Do not introduce monetization complexity ahead of product usefulness and merchant adoption.

## 8. Instructions for Claude

This document records a product decision for future POS planning. It is **not a request to start POS implementation now**.

When asked to work on POS in the future:

- Read this decision note together with `docs/KENTEXA_ROADMAP.md` and inspect the current repository state.
- Confirm the current POS implementation, existing entitlements, billing/payment records, notification/SMS integrations, reporting, business/branch model, and role permissions before proposing architecture or code.
- Do not assume the candidate features above already exist.
- Do not implement billing, credit wallets, top-ups, SMS credits, migrations, or payment changes solely because this note exists.
- Treat prepaid credits/pay-as-you-go as the approved direction; do not design monthly subscriptions unless the owner explicitly changes this decision.
- When the owner reaches the POS architecture/development stage, prepare a repository-grounded architecture first, including domain boundaries, data model, authorization, country configuration, provider adapters, accounting/idempotency, failure handling, and migration strategy.
- Preserve the free-core principle and voluntary nature of all paid capabilities.
- Any concrete pricing, tier limits, paid feature boundary, or rollout country requires owner validation.
- Keep this work documentation-only until a separate implementation task is explicitly approved.

## 9. Success measures

The primary near-term objective remains product adoption and daily active use, not revenue maximization per merchant.

Evaluate POS using:
- New businesses activated.
- First sale completed.
- Daily and weekly active POS businesses.
- Repeat usage and merchant retention.
- Products and stock managed.
- Sales processed successfully.
- Use and perceived value of optional paid add-ons.
- SMS cost recovery and delivery quality.
- Credit purchase, usage, repeat top-ups, and paid add-on adoption.

**Product promise:** A business can start and keep using Kentexa POS for its essential daily operations for free. It buys credits only when it chooses additional value or a clearly priced service, then uses those credits as needed.
