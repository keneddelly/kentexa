/**
 * TransportQuote's component contract — Stage 3S-B5: Final Quote
 * Composition + Transparent Charges.
 *
 * Repository-first assessment (required before any of this was written,
 * per Issue #61): Kentexa has NO canonical, quote-domain-reachable
 * authority today for any component beyond transportBase.
 *
 *   - agentPickup / lastMileDelivery: Agent.collectionFeeUrban /
 *     collectionFeeRural / deliveryCommission (src/agents/entities/
 *     agent.entity.ts) are real, already customer-facing fee VALUES —
 *     AgentsService.findByCity() explicitly frames deliveryCommission as
 *     "the delivery rate — what buyer sees and agrees to before requesting
 *     delivery". But nothing in the Transport/Shipment/Quote domain has a
 *     SELECTION mechanism for a SPECIFIC agent: Shipment.pickupOption /
 *     deliveryOption is a handoff-METHOD enum (door/agent/station), never
 *     an agentId FK, and CreateQuoteDto has no such field either. A fee
 *     value cannot be applied without knowing which agent it belongs to —
 *     adding that selection would be a new request/pricing dimension, not
 *     "reusing an existing authority", so it stays out of bounds for this
 *     gate rather than being invented.
 *   - hubHandling: SuperAgent.commissionRate (src/super-agents/entities/
 *     super-agent.entity.ts) is a REVENUE SPLIT of the existing transport
 *     amount (the hub's own cut of it), not a separate add-on charge to the
 *     customer. SuperAgent.totalPlatformFeesCharged / platformFeePerOrder
 *     is Kentexa billing the SUPER AGENT business per order it processes
 *     (a B2B relationship), unrelated to what a shipment customer pays. No
 *     customer-facing hub add-on fee authority exists anywhere in the
 *     repository for this gate to reuse.
 *   - platformService: PLATFORM_CONFIG.platformFeePercent (src/config/
 *     platform.config.ts) is Kentexa's marketplace commission on a
 *     PRODUCT/classified SALE (Order.platformFeePercent, ClassifiedInvoice
 *     -Request), computed from a sale price — an unrelated commerce domain.
 *     Applying it to a transport quote would be repurposing a fee authority
 *     for something it was never built to price, which this gate's own
 *     instructions explicitly warn against (the same principle as "do not
 *     repurpose ShippingRate" for the transport base).
 *   - a COD-related charge does exist (COD_HANDLING_FEE_PERCENT, src/cod/
 *     cod-policy.config.ts) but is by its own documented design a
 *     SETTLEMENT-time deduction from cash actually collected in person at
 *     delivery (Order.codRemainingBalance, applied in SuperAgentsService's
 *     COD-collection path) — never a charge known or applicable at
 *     quote-creation time. Excluded from this component contract entirely,
 *     not even carried as an always-absent key.
 *
 * Every non-base key below is therefore OPTIONAL and, as of this gate,
 * never populated — present in the shape so a FUTURE gate that adds a real
 * selection mechanism (e.g. an agentId on the quote/shipment request) can
 * populate it without another schema change, per this table's own original
 * jsonb design (Stage 3S-B3's own doc comment on TransportQuote.components).
 */
export interface TransportQuoteComponents {
  transportBase: number;
  agentPickup?: number;
  hubHandling?: number;
  lastMileDelivery?: number;
  platformService?: number;
}

export const TRANSPORT_QUOTE_COMPONENT_KEYS: readonly (keyof TransportQuoteComponents)[] = [
  'transportBase',
  'agentPickup',
  'hubHandling',
  'lastMileDelivery',
  'platformService',
];

// The ONE place a quote's total is derived from its components — reused by
// createQuote() now, and by any future caller (Super Agent counter, Intent)
// that composes a components map through this same contract, so "final
// total = deterministic sum of persisted components" never drifts into a
// second, hand-rolled addition somewhere else.
export function sumQuoteComponents(components: TransportQuoteComponents): number {
  return TRANSPORT_QUOTE_COMPONENT_KEYS.reduce(
    (sum, key) => sum + (components[key] ?? 0),
    0,
  );
}
