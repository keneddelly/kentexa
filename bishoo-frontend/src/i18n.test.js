// Regression test for a real bug found via local browser acceptance testing
// (Landing Localization L1 acceptance pass): the mission's own Test 1
// requires "switch language manually on landing -> reload -> selection
// remains." Since this app never updates the address bar for most
// navigation, a visitor who arrives via ?lang=en and then manually switches
// to Swahili would see English again on every reload — the still-present
// ?lang=en kept outranking their later choice, per the mission's own
// precedence order (URL > saved preference). The fix: once a valid ?lang=
// has been applied, strip it from the URL so a later reload of the SAME tab
// falls through to the (now up to date) saved preference instead.

const setUrl = (search) => { window.history.replaceState({}, '', `/${search}`); };

const loadI18nFresh = () => {
  let mod;
  jest.isolateModules(() => { mod = require('./i18n').default; });
  return mod;
};

describe('i18n.js bootstrap — ?lang= resolution and consumption', () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl('');
  });

  test('a valid ?lang= is applied, saved, and then stripped from the URL — other params untouched', () => {
    setUrl('?lang=sw&intent=service&track=KTX-1');
    const instance = loadI18nFresh();
    expect(instance.language).toBe('sw');
    expect(localStorage.getItem('kentexa_lang')).toBe('sw');

    const params = new URLSearchParams(window.location.search);
    expect(params.get('lang')).toBeNull();
    expect(params.get('intent')).toBe('service');
    expect(params.get('track')).toBe('KTX-1');
  });

  test('an invalid ?lang= is ignored, falls back safely, and is left in the URL (nothing valid to spend)', () => {
    setUrl('?lang=xx');
    const instance = loadI18nFresh();
    expect(instance.language).toBe('en');
    expect(localStorage.getItem('kentexa_lang')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('lang')).toBe('xx');
  });

  test('no ?lang= at all resolves from saved preference and never touches the URL', () => {
    localStorage.setItem('kentexa_lang', 'fr');
    setUrl('?intent=seller');
    const instance = loadI18nFresh();
    expect(instance.language).toBe('fr');
    expect(window.location.search).toBe('?intent=seller');
  });

  test('a reload after a manual in-session switch no longer gets overridden by the original URL value', () => {
    // First load: cold entry via ?lang=en (e.g. an ad link).
    setUrl('?lang=en');
    loadI18nFresh();
    expect(localStorage.getItem('kentexa_lang')).toBe('en');
    // ?lang= was stripped, so the address bar no longer carries it.
    expect(new URLSearchParams(window.location.search).get('lang')).toBeNull();

    // Visitor manually switches to Swahili via the selector (not re-tested
    // here — utils/supportedLanguages.test.js covers changeLanguage itself).
    localStorage.setItem('kentexa_lang', 'sw');

    // Reload of the SAME tab: URL has no ?lang= any more, so resolution
    // falls through to the saved preference the visitor just picked.
    const instanceAfterReload = loadI18nFresh();
    expect(instanceAfterReload.language).toBe('sw');
  });
});
