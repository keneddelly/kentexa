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
