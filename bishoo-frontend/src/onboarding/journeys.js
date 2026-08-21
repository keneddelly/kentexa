/**
 * journeys.js — per-role setup checklists.
 *
 * Pure data, no components. Each journey is a short ordered list of steps;
 * a step is "done" either because the user completed it through a feature
 * tour (see tours.js), or because `computeDone(context)` can tell from
 * real data already loaded on the host page (no extra network call).
 *
 * Adding a new role's journey is just adding a new entry here — nothing
 * else in the onboarding system needs to change.
 */

export const JOURNEYS = {
  seller: {
    labelKey: 'onboarding.journey_seller_label',
    steps: [
      { id: 'account', labelKey: 'onboarding.journey_seller_step_account', targetPage: 'MyProfile' },
      { id: 'business_profile', labelKey: 'onboarding.journey_seller_step_business_profile', targetPage: 'BecomeSeller' },
      { id: 'first_product', labelKey: 'onboarding.journey_seller_step_first_product', targetPage: 'SellerProducts' },
      { id: 'first_order', labelKey: 'onboarding.journey_seller_step_first_order', targetPage: 'SellerOrders' },
      { id: 'shipping_setup', labelKey: 'onboarding.journey_seller_step_shipping_setup', targetPage: 'SellerShipment' },
    ],
  },

  super_agent: {
    labelKey: 'onboarding.journey_super_agent_label',
    steps: [
      { id: 'hub_setup', labelKey: 'onboarding.journey_super_agent_step_hub_setup', targetPage: 'SuperAgentSettings',
        computeDone: ctx => ctx.profileStatus === 'active' },
      { id: 'receive_parcel', labelKey: 'onboarding.journey_super_agent_step_receive_parcel', targetPage: 'SuperAgentDashboard',
        computeDone: ctx => Number(ctx.dashData?.stats?.totalParcels || 0) > 0 },
      { id: 'register_parcel', labelKey: 'onboarding.journey_super_agent_step_register_parcel', targetPage: 'SuperAgentDashboard',
        computeDone: ctx => Number(ctx.dashData?.stats?.totalParcels || 0) > 0 },
      { id: 'prepare_shipment', labelKey: 'onboarding.journey_super_agent_step_prepare_shipment', targetPage: 'SuperAgentDashboard' },
      { id: 'handover', labelKey: 'onboarding.journey_super_agent_step_handover', targetPage: 'SuperAgentDashboard' },
      { id: 'tracking', labelKey: 'onboarding.journey_super_agent_step_tracking', targetPage: 'SuperAgentDashboard' },
      { id: 'earnings', labelKey: 'onboarding.journey_super_agent_step_earnings', targetPage: 'SuperAgentDashboard' },
    ],
  },

  transport_provider: {
    labelKey: 'onboarding.journey_transport_provider_label',
    steps: [
      { id: 'transport_profile', labelKey: 'onboarding.journey_transport_provider_step_profile', targetPage: 'TransportProviderSettings' },
      { id: 'create_route', labelKey: 'onboarding.journey_transport_provider_step_route', targetPage: 'TransportProviderDashboard' },
      { id: 'add_capacity', labelKey: 'onboarding.journey_transport_provider_step_capacity', targetPage: 'TransportProviderDashboard' },
      { id: 'receive_assignment', labelKey: 'onboarding.journey_transport_provider_step_assignment', targetPage: 'TransportProviderDashboard' },
      { id: 'update_shipment', labelKey: 'onboarding.journey_transport_provider_step_update', targetPage: 'TransportProviderDashboard' },
      { id: 'complete_delivery', labelKey: 'onboarding.journey_transport_provider_step_complete', targetPage: 'TransportProviderDashboard' },
      { id: 'earnings', labelKey: 'onboarding.journey_transport_provider_step_earnings', targetPage: 'TransportProviderDashboard' },
    ],
  },

  buyer: {
    labelKey: 'onboarding.journey_buyer_label',
    steps: [
      { id: 'search', labelKey: 'onboarding.journey_buyer_step_search', targetPage: 'Search' },
      { id: 'product', labelKey: 'onboarding.journey_buyer_step_product', targetPage: 'Search' },
      { id: 'order', labelKey: 'onboarding.journey_buyer_step_order', targetPage: 'Checkout' },
      { id: 'payment', labelKey: 'onboarding.journey_buyer_step_payment', targetPage: 'Checkout' },
      { id: 'tracking', labelKey: 'onboarding.journey_buyer_step_tracking', targetPage: 'TrackParcel' },
    ],
  },
};

export const getJourney = (key) => JOURNEYS[key] || null;
