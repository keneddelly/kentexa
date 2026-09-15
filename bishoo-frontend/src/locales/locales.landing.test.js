import en from './en.json';
import sw from './sw.json';
import fr from './fr.json';

// Landing Localization L1 (§9): every landing/intent/language-picker key
// introduced by this mission must exist in en, sw AND fr — never leave a
// new key missing from one supported locale. Deliberately scoped to just
// the keys this mission added, not a full-dictionary parity check (the
// pre-existing ~74/~4 key gaps between locales are a separate, older issue,
// out of scope here).
const REQUIRED_LANDING_KEYS = [
  'welcome.headline',
  'welcome.subheadline',
  'welcome.create_account_button',
  'welcome.log_in_button',
  'welcome.made_in_tanzania',
  'welcome.intent.service.headline',
  'welcome.intent.service.subheadline',
  'welcome.intent.service.cta',
  'welcome.intent.classified.headline',
  'welcome.intent.classified.subheadline',
  'welcome.intent.classified.cta',
  'welcome.intent.seller.headline',
  'welcome.intent.seller.subheadline',
  'welcome.intent.seller.cta',
  'welcome.language_picker.title',
  'welcome.language_picker.subtitle',
  'welcome.language_picker.recommended',
  'welcome.language_picker.hint',

  // Landing Localization L2 — product education body (LandingEducation.js)
  'welcome.discover_more_button',
  'landing.what_is.heading',
  'landing.what_is.body',
  'landing.what_is.chip_discover',
  'landing.what_is.chip_sell',
  'landing.what_is.chip_service',
  'landing.what_is.chip_classifieds',
  'landing.what_is.chip_moments',
  'landing.what_is.chip_communicate',
  'landing.features.heading',
  'landing.features.sell_title',
  'landing.features.sell_desc',
  'landing.features.service_title',
  'landing.features.service_desc',
  'landing.features.classifieds_title',
  'landing.features.classifieds_desc',
  'landing.features.moments_title',
  'landing.features.moments_desc',
  'landing.features.moments_flow_moment',
  'landing.features.moments_flow_discovery',
  'landing.features.moments_flow_profile',
  'landing.features.moments_flow_action',
  'landing.business.heading',
  'landing.business.intro',
  'landing.business.item1_title', 'landing.business.item1_desc',
  'landing.business.item2_title', 'landing.business.item2_desc',
  'landing.business.item3_title', 'landing.business.item3_desc',
  'landing.business.item4_title', 'landing.business.item4_desc',
  'landing.business.item5_title', 'landing.business.item5_desc',
  'landing.business.item6_title', 'landing.business.item6_desc',
  'landing.personal_vs_business.heading',
  'landing.personal_vs_business.personal_title',
  'landing.personal_vs_business.personal_desc',
  'landing.personal_vs_business.personal_example',
  'landing.personal_vs_business.business_title',
  'landing.personal_vs_business.business_desc',
  'landing.personal_vs_business.business_example',
  'landing.how_it_works.heading',
  'landing.how_it_works.subheading',
  'landing.how_it_works.step1_title', 'landing.how_it_works.step1_desc',
  'landing.how_it_works.step2_title', 'landing.how_it_works.step2_desc',
  'landing.how_it_works.step3_title', 'landing.how_it_works.step3_desc',
  'landing.how_it_works.step4_title', 'landing.how_it_works.step4_desc',
  'landing.how_it_works.step5_title', 'landing.how_it_works.step5_desc',
  'landing.how_it_works.cta_full',
  'landing.after_signup.heading',
  'landing.after_signup.path_sell_title', 'landing.after_signup.path_sell_step1', 'landing.after_signup.path_sell_step2', 'landing.after_signup.path_sell_step3',
  'landing.after_signup.path_service_title', 'landing.after_signup.path_service_step1', 'landing.after_signup.path_service_step2',
  'landing.after_signup.path_classified_title', 'landing.after_signup.path_classified_step1',
  'landing.after_signup.path_buy_title', 'landing.after_signup.path_buy_step1',
  'landing.after_signup.path_business_title', 'landing.after_signup.path_business_step1', 'landing.after_signup.path_business_step2',
  'landing.moments.heading',
  'landing.moments.body',
  'landing.moments.example1', 'landing.moments.example2', 'landing.moments.example3', 'landing.moments.example4', 'landing.moments.example5',
  'landing.logistics.heading',
  'landing.logistics.body',
  'landing.logistics.flow_step1', 'landing.logistics.flow_step2', 'landing.logistics.flow_step3',
  'landing.logistics.flow_step4', 'landing.logistics.flow_step5', 'landing.logistics.flow_step6',
  'landing.logistics.super_agent_title', 'landing.logistics.super_agent_desc',
  'landing.tracking.heading', 'landing.tracking.body', 'landing.tracking.cta',
  'landing.pos.heading', 'landing.pos.body',
  'landing.trust.heading',
  'landing.trust.point1', 'landing.trust.point2', 'landing.trust.point3', 'landing.trust.point4', 'landing.trust.point5',
  'landing.final_cta.heading', 'landing.final_cta.desc',
];

const getAtPath = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

describe.each([
  ['en', en],
  ['sw', sw],
  ['fr', fr],
])('%s.json landing key coverage', (locale, dict) => {
  test.each(REQUIRED_LANDING_KEYS)('has a non-empty string at %s', (key) => {
    const value = getAtPath(dict, key);
    expect(typeof value).toBe('string');
    expect(value.trim().length).toBeGreaterThan(0);
  });
});

test('intent keys are identical across all three locales (no missing/extra intent)', () => {
  const intentsFor = (dict) => Object.keys(dict.welcome.intent).sort();
  expect(intentsFor(en)).toEqual(['classified', 'seller', 'service']);
  expect(intentsFor(sw)).toEqual(intentsFor(en));
  expect(intentsFor(fr)).toEqual(intentsFor(en));
});
