// Centralized feature -> required-verification-level map (spec section 11).
// Code constant for now, not a DB table — becomes one once more than a
// couple of features actually need to be gated through it. Every
// controller that needs a gate should call VerificationService, never
// hardcode a level check inline.
export enum Feature {
  VIEW_LISTING = 'VIEW_LISTING',
  BASIC_MESSAGING = 'BASIC_MESSAGING',
  POST_CLASSIFIED = 'POST_CLASSIFIED',
  CREATE_STORE = 'CREATE_STORE',
  CREATE_PRODUCT = 'CREATE_PRODUCT',
  RECEIVE_PAYMENT = 'RECEIVE_PAYMENT',
  REQUEST_INVOICE = 'REQUEST_INVOICE',
  USE_ESCROW = 'USE_ESCROW',
  BECOME_SUPER_AGENT = 'BECOME_SUPER_AGENT',
  CREATE_SHIPMENT = 'CREATE_SHIPMENT',
  ACCESS_SELLER_WALLET = 'ACCESS_SELLER_WALLET',
}

// Only POST_CLASSIFIED is actually wired to a real gate in Phase 1 — the
// rest of the map exists so later phases extend this one table instead of
// redefining it, per the spec's "do not hard-code verification
// requirements throughout unrelated controllers" instruction.
export const FEATURE_REQUIREMENTS: Record<Feature, number> = {
  [Feature.VIEW_LISTING]: 0,
  [Feature.BASIC_MESSAGING]: 0,
  [Feature.POST_CLASSIFIED]: 1,
  [Feature.CREATE_STORE]: 1,
  [Feature.CREATE_PRODUCT]: 2,
  [Feature.RECEIVE_PAYMENT]: 2,
  [Feature.REQUEST_INVOICE]: 0,
  [Feature.USE_ESCROW]: 2,
  [Feature.BECOME_SUPER_AGENT]: 1,
  [Feature.CREATE_SHIPMENT]: 1,
  [Feature.ACCESS_SELLER_WALLET]: 2,
};
