/**
 * Single canonical source for Kentexa's supported UI languages — the data
 * (code/label/flag) AND the resolution/persistence logic that decides which
 * one is active. Before this file, the same en/sw/fr list was hand-copied
 * independently in App.js's first-visit picker, Navbar.js, and i18n.js's
 * fallbackLng — this is the fix for that (Landing Localization L1, §2).
 *
 * LanguageSwitcher.js re-exports SUPPORTED_LANGUAGES as `LANGUAGES` for the
 * existing call sites (PublicLogin.js, MyProfile.js) that already import it
 * that way — do not rename that export without updating both.
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English',   short: 'EN', flag: '🇬🇧' },
  { code: 'sw', label: 'Kiswahili', short: 'SW', flag: '🇹🇿' },
  { code: 'fr', label: 'Français',  short: 'FR', flag: '🇫🇷' },
];

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

export const DEFAULT_LANGUAGE = 'en';

export const STORAGE_KEY = 'kentexa_lang';

// 'en-US' -> 'en', 'sw-TZ' -> 'sw', unsupported/garbage -> null.
// Never treats a locale's country subtag (US, TZ, FR, ...) as a language
// selector — that would be geolocation-flavored inference, which the
// mission explicitly rules out for LANGUAGE choice.
export const normalizeLanguageCode = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const base = raw.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGE_CODES.includes(base) ? base : null;
};

// Precedence: explicit URL lang param > saved device preference >
// browser/device language > safe default. No geolocation/country input
// anywhere in this chain, by design.
export const resolveLanguage = ({ urlLang, savedLang, browserLanguages = [] } = {}) => {
  const fromUrl = normalizeLanguageCode(urlLang);
  if (fromUrl) return fromUrl;

  const fromSaved = normalizeLanguageCode(savedLang);
  if (fromSaved) return fromSaved;

  for (const candidate of browserLanguages) {
    const normalized = normalizeLanguageCode(candidate);
    if (normalized) return normalized;
  }

  return DEFAULT_LANGUAGE;
};

// The one place that changes the active language AND persists it as the
// device's explicit preference. Every language selector (Navbar, Welcome,
// PublicLogin's/MyProfile's LanguageSwitcher, App.js's first-visit picker)
// should call this instead of duplicating `i18n.changeLanguage` +
// `localStorage.setItem` inline.
export const changeLanguage = (i18nInstance, code) => {
  const resolved = normalizeLanguageCode(code) || DEFAULT_LANGUAGE;
  i18nInstance.changeLanguage(resolved);
  try { localStorage.setItem(STORAGE_KEY, resolved); } catch { /* storage unavailable */ }
  return resolved;
};

export const syncHtmlLang = (lang) => {
  const resolved = normalizeLanguageCode(lang) || DEFAULT_LANGUAGE;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = resolved;
  }
};

// Keeps <html lang> equal to the active i18n language for the life of the
// tab, not just at initial boot — covers every future change regardless of
// which component triggered it, since they all go through the same i18n
// instance's changeLanguage().
export const attachHtmlLangSync = (i18nInstance) => {
  syncHtmlLang(i18nInstance.language);
  i18nInstance.on('languageChanged', syncHtmlLang);
  return () => i18nInstance.off('languageChanged', syncHtmlLang);
};
