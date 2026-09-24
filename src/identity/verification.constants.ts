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

// Low-risk presence and listing creation is available without identity
// documents. Identity remains necessary for funds/custody and authority
// applications below. RoleContext and capability checks are independent
// and still run at their respective service boundaries.
export const FEATURE_REQUIREMENTS: Record<Feature, number> = {
  [Feature.VIEW_LISTING]: 0,
  [Feature.BASIC_MESSAGING]: 0,
  [Feature.POST_CLASSIFIED]: 0,
  [Feature.CREATE_STORE]: 0,
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
