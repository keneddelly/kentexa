// Central Cash-on-Delivery policy — the ONE place these values live.
// Every COD entry point (online order, manual sale, classified invoice)
// reads from here instead of hardcoding a percentage inline. Changing a
// value still requires a deploy (no live admin UI yet — Kentexa has no
// DB-backed settings system for ANY fee today, not just COD's; building
// one is a deliberately separate follow-up, not bundled into this pass).
//
// Why an upfront payment exists at all (see the product spec): it reduces
// fake orders, buyer refusal, and unpaid shipping/return costs for
// intercity COD, where the seller and Super Agent network take on real
// risk before the buyer is ever physically reachable. Same-city COD is
// lower risk (the seller/local agent can usually resolve a problem in
// person), so it defaults to no upfront requirement.

// Percentage of the transaction total required upfront before an
// intercity COD order/sale/invoice can proceed to shipment.
export const INTERCITY_UPFRONT_PERCENT = 20;

// Same-city COD does not require an upfront payment by default.
export const SAME_CITY_UPFRONT_PERCENT = 0;

// Below this transaction value, COD is not offered at all — too small to
// be worth the upfront-payment friction or the return-shipping risk.
export const MIN_COD_ORDER_VALUE = 10_000; // TZS

// Above this transaction value, COD is not offered — high-value orders
// carry too much fraud/loss risk for cash collection at the doorstep.
export const MAX_COD_ORDER_VALUE = 2_000_000; // TZS

// When a buyer refuses an intercity COD delivery, the seller keeps the
// already-collected upfront payment by default (it already funded real
// shipping cost) rather than it being refunded — see
// DisputesService.resolve()'s SPLIT branch for where this is applied.
export const REFUSED_DELIVERY_UPFRONT_REFUNDABLE = false;
