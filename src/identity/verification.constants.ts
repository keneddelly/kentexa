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

// Business/store creation can happen before identity verification, but activating
// selling requires at least Level 1 identity (ID submitted). Pending review is
// sufficient to apply (FEATURES_ALLOWING_PENDING_ID); admin approval remains a separate
// activation decision and still needs the ID VERIFIED (capability-owner-identity.ts).
// RoleContext and capability checks remain independent at their service boundaries.
export const FEATURE_REQUIREMENTS: Record<Feature, number> = {
  [Feature.VIEW_LISTING]: 0,
  [Feature.BASIC_MESSAGING]: 0,
  [Feature.POST_CLASSIFIED]: 0,
  [Feature.CREATE_STORE]: 1,
  [Feature.CREATE_PRODUCT]: 0,
  [Feature.RECEIVE_PAYMENT]: 2,
  [Feature.REQUEST_INVOICE]: 0,
  [Feature.CREATE_INVOICE]: 1,
  [Feature.USE_ESCROW]: 2,
  [Feature.BECOME_SUPER_AGENT]: 1,
  [Feature.BECOME_TRANSPORTER]: 1,
  [Feature.CREATE_SERVICE]: 0,
  [Feature.CREATE_SHIPMENT]: 1,
  [Feature.ACCESS_SELLER_WALLET]: 2,
};

// Features a person may use while their ID is sent and waiting for review (owner 2026-11-09:
// "when a business needs to start selling the ID is asked"): asking to sell needs the ID SENT,
// not yet checked. Before this, a sent ID still showed the ID form again and again.
export const FEATURES_ALLOWING_PENDING_ID: ReadonlySet<Feature> = new Set([Feature.CREATE_STORE]);

// Sellers who asked to sell through their Business before the ID gate (2026-11-06) never sent an
// ID. An admin may mark their ID as checked (owner 2026-11-09 chose this), recorded with who/why.
export const SELLER_ID_GATE_STARTED_AT = new Date('2026-11-07T00:00:00+03:00');
