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
  CREATE_INVOICE = 'CREATE_INVOICE',
  USE_ESCROW = 'USE_ESCROW',
  BECOME_SUPER_AGENT = 'BECOME_SUPER_AGENT',
  BECOME_TRANSPORTER = 'BECOME_TRANSPORTER',
  CREATE_SERVICE = 'CREATE_SERVICE',
  CREATE_SHIPMENT = 'CREATE_SHIPMENT',
  ACCESS_SELLER_WALLET = 'ACCESS_SELLER_WALLET',
}

// 2026-08-28 identity-verification architecture audit: CREATE_SHIPMENT sat
// declared here since Phase 1 but was never actually wired to any
// controller — the same gap now closed for every other operational
// (transaction/logistics/service) action a user can take. The rule this
// table encodes: BUYING/browsing needs nothing (level 0); the moment an
// account performs a SELLING/logistics/service action on behalf of itself
// or others, identity verification (level 1) is required first — this is
// the actual role-activation gate, not a side effect of Seller Level 1
// (CREATE_PRODUCT/RECEIVE_PAYMENT staying at level 2 is unrelated: that's
// the separate, later "approved seller" bar for the catalog/escrow
// pipeline specifically, not a precondition for identity verification
// itself). Every controller that performs an operational action should
// call VerificationService.requireFeature() against this table — never
// hardcode a level check inline, and never rely on a role/permission
// check (SellerScopeService, RolesGuard) alone, since role can describe
// WHICH business a caller may act for without saying anything about
// whether the real person behind the account has been identity-verified.
export const FEATURE_REQUIREMENTS: Record<Feature, number> = {
  [Feature.VIEW_LISTING]: 0,
  [Feature.BASIC_MESSAGING]: 0,
  [Feature.POST_CLASSIFIED]: 1,
  [Feature.CREATE_STORE]: 1,
  [Feature.CREATE_PRODUCT]: 2,
  [Feature.RECEIVE_PAYMENT]: 2,
  [Feature.REQUEST_INVOICE]: 0,
  [Feature.CREATE_INVOICE]: 1,
  [Feature.USE_ESCROW]: 2,
  [Feature.BECOME_SUPER_AGENT]: 1,
  [Feature.BECOME_TRANSPORTER]: 1,
  [Feature.CREATE_SERVICE]: 1,
  [Feature.CREATE_SHIPMENT]: 1,
  [Feature.ACCESS_SELLER_WALLET]: 2,
};
