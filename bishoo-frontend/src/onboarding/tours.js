/**
 * tours.js — per-feature coach-mark tour configuration.
 *
 * This is the "admin control" layer the onboarding spec asked for: every
 * tour is one config entry (title, role, ordered steps, optional final
 * CTA) rather than tutorial logic scattered inside each page. A future
 * backend-driven config (GET /onboarding/tours) can replace the static
 * export below without the FeatureTour engine changing at all — nothing
 * that consumes getTour()/getTourForPage() needs to know where the data
 * came from.
 *
 * Step shape:
 *   id            unique within the tour
 *   target        'data-tour' attribute value to highlight, or omitted for
 *                 a centered (non-spotlight) explanatory step
 *   titleKey/descKey  i18n keys (locales/{en,sw,fr}.json under "tours.*")
 *   requiresState optional — host page state to set (via onStepChange)
 *                 before this step's target is measured, e.g. switching
 *                 tabs so the target actually exists in the DOM
 *   placement     'top' | 'bottom' | 'auto' (default 'auto')
 */

export const TOURS = {
  super_agent_first_parcel: {
    titleKey: 'tours.super_agent_first_parcel_title',
    role: 'super_agent',
    page: 'SuperAgentDashboard',
    steps: [
      {
        id: 'intro',
        titleKey: 'tours.sa_step_intro_title',
        descKey: 'tours.sa_step_intro_desc',
      },
      {
        id: 'hub',
        target: 'sa-tab-pokea',
        requiresState: { activeTab: 'pokea', pokeaMode: 'list' },
        titleKey: 'tours.sa_step_hub_title',
        descKey: 'tours.sa_step_hub_desc',
      },
      {
        id: 'receive',
        target: 'sa-walkin-trigger',
        requiresState: { activeTab: 'pokea', pokeaMode: 'list' },
        titleKey: 'tours.sa_step_receive_title',
        descKey: 'tours.sa_step_receive_desc',
      },
      {
        id: 'prepare',
        target: 'sa-tab-tuma',
        requiresState: { activeTab: 'tuma' },
        titleKey: 'tours.sa_step_prepare_title',
        descKey: 'tours.sa_step_prepare_desc',
      },
      {
        id: 'handover',
        titleKey: 'tours.sa_step_handover_title',
        descKey: 'tours.sa_step_handover_desc',
      },
      {
        id: 'tracking',
        target: 'sa-tab-historia',
        requiresState: { activeTab: 'historia' },
        titleKey: 'tours.sa_step_tracking_title',
        descKey: 'tours.sa_step_tracking_desc',
      },
      {
        id: 'earnings',
        target: 'sa-tab-mapato',
        requiresState: { activeTab: 'mapato' },
        titleKey: 'tours.sa_step_earnings_title',
        descKey: 'tours.sa_step_earnings_desc',
      },
      {
        id: 'cta_destination',
        target: 'sa-walkin-destination',
        requiresState: { activeTab: 'pokea', pokeaMode: 'walk_in' },
        titleKey: 'tours.sa_step_cta_title',
        descKey: 'tours.sa_step_cta_destination_desc',
      },
      {
        id: 'cta_submit',
        target: 'sa-walkin-submit',
        requiresState: { activeTab: 'pokea', pokeaMode: 'walk_in' },
        titleKey: 'tours.sa_step_cta_title',
        descKey: 'tours.sa_step_cta_submit_desc',
        isFinal: true,
      },
    ],
  },
};

export const getTour = (key) => TOURS[key] || null;

export const getTourForPage = (pageKey) =>
  Object.entries(TOURS)
    .filter(([, tour]) => tour.page === pageKey)
    .map(([key, tour]) => ({ key, ...tour }));
