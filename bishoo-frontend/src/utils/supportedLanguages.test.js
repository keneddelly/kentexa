import {
  SUPPORTED_LANGUAGE_CODES, normalizeLanguageCode, resolveLanguage,
  changeLanguage, syncHtmlLang, attachHtmlLangSync, STORAGE_KEY,
} from './supportedLanguages';

describe('normalizeLanguageCode', () => {
  test('accepts bare supported codes', () => {
    expect(normalizeLanguageCode('en')).toBe('en');
    expect(normalizeLanguageCode('sw')).toBe('sw');
    expect(normalizeLanguageCode('fr')).toBe('fr');
  });
  test('normalizes region-tagged browser locales', () => {
    expect(normalizeLanguageCode('en-US')).toBe('en');
    expect(normalizeLanguageCode('sw-TZ')).toBe('sw');
    expect(normalizeLanguageCode('fr-FR')).toBe('fr');
  });
  test('rejects unsupported/garbage input safely', () => {
    expect(normalizeLanguageCode('de-DE')).toBeNull();
    expect(normalizeLanguageCode('rw')).toBeNull();
    expect(normalizeLanguageCode('')).toBeNull();
    expect(normalizeLanguageCode(null)).toBeNull();
    expect(normalizeLanguageCode(undefined)).toBeNull();
    expect(normalizeLanguageCode('<script>')).toBeNull();
  });
});

describe('resolveLanguage precedence', () => {
  test('explicit URL lang outranks saved preference', () => {
    expect(resolveLanguage({ urlLang: 'sw', savedLang: 'fr', browserLanguages: ['en'] })).toBe('sw');
  });
  test('saved preference outranks browser language when URL is absent', () => {
    expect(resolveLanguage({ urlLang: null, savedLang: 'fr', browserLanguages: ['en-US'] })).toBe('fr');
  });
  test('browser language used when neither URL nor saved preference exist', () => {
    expect(resolveLanguage({ urlLang: null, savedLang: null, browserLanguages: ['sw-TZ', 'en-US'] })).toBe('sw');
  });
  test('falls back through browserLanguages list to find a supported one', () => {
    expect(resolveLanguage({ urlLang: null, savedLang: null, browserLanguages: ['de-DE', 'fr-FR'] })).toBe('fr');
  });
  test('unsupported browser locale falls through to default en', () => {
    expect(resolveLanguage({ urlLang: null, savedLang: null, browserLanguages: ['de-DE'] })).toBe('en');
  });
  test('safe default when nothing is provided at all', () => {
    expect(resolveLanguage({})).toBe('en');
    expect(resolveLanguage()).toBe('en');
  });
  test('an invalid URL lang value is ignored, resolution falls through', () => {
    expect(resolveLanguage({ urlLang: 'xx', savedLang: 'fr', browserLanguages: [] })).toBe('fr');
    expect(resolveLanguage({ urlLang: 'xx', savedLang: null, browserLanguages: ['sw'] })).toBe('sw');
  });
});

describe('changeLanguage', () => {
  beforeEach(() => { localStorage.clear(); });

  test('calls i18n.changeLanguage and persists the normalized code', () => {
    const i18n = { changeLanguage: jest.fn() };
    const result = changeLanguage(i18n, 'sw-TZ');
    expect(result).toBe('sw');
    expect(i18n.changeLanguage).toHaveBeenCalledWith('sw');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sw');
  });

  test('falls back to default language for an unsupported code', () => {
    const i18n = { changeLanguage: jest.fn() };
    const result = changeLanguage(i18n, 'de');
    expect(result).toBe('en');
    expect(i18n.changeLanguage).toHaveBeenCalledWith('en');
  });
});

describe('html lang sync', () => {
  test('syncHtmlLang writes a normalized code to <html lang>', () => {
    syncHtmlLang('fr-FR');
    expect(document.documentElement.lang).toBe('fr');
  });

  test('attachHtmlLangSync syncs immediately and again on every languageChanged event', () => {
    const listeners = {};
    const i18n = {
      language: 'en',
      on: (event, cb) => { listeners[event] = cb; },
      off: jest.fn(),
    };
    attachHtmlLangSync(i18n);
    expect(document.documentElement.lang).toBe('en');

    listeners.languageChanged('sw');
    expect(document.documentElement.lang).toBe('sw');

    listeners.languageChanged('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});

test('SUPPORTED_LANGUAGE_CODES matches the mission-required set (en, sw, fr)', () => {
  expect(SUPPORTED_LANGUAGE_CODES.sort()).toEqual(['en', 'fr', 'sw']);
});
