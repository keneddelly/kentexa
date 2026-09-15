import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import sw from './locales/sw.json';
import fr from './locales/fr.json';
import {
  resolveLanguage, normalizeLanguageCode, attachHtmlLangSync, STORAGE_KEY,
} from './utils/supportedLanguages';

// Language resolution precedence (Landing Localization L1, §3): explicit
// URL ?lang= on cold entry > saved kentexa_lang preference > browser/device
// language > safe default 'en'. No geolocation/country input anywhere here.
let urlLang = null;
try { urlLang = new URLSearchParams(window.location.search).get('lang'); } catch { /* no window — SSR */ }

let savedLang = null;
try { savedLang = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }

const browserLanguages = (typeof navigator !== 'undefined'
  && (navigator.languages || (navigator.language ? [navigator.language] : []))) || [];

const resolvedLang = resolveLanguage({ urlLang, savedLang, browserLanguages });

// Only an explicit URL ?lang= is persisted as the device's saved preference
// here — it's the visitor (or the ad link) explicitly asking for a
// language, same as picking one from a selector. A browser-detected or
// default-tier resolution is NOT written to storage: doing so would
// silently satisfy the first-visit-picker's `!localStorage.getItem(...)`
// gate (App.js) after the very first load, and that picker choosing to
// still ask is intentional, not a bug this should paper over.
if (normalizeLanguageCode(urlLang)) {
  try { localStorage.setItem(STORAGE_KEY, resolvedLang); } catch { /* storage unavailable */ }
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sw: { translation: sw },
      fr: { translation: fr },
    },
    lng:          resolvedLang,
    fallbackLng:  ['en', 'sw', 'fr'],
    interpolation: { escapeValue: false },
  });

// Keeps <html lang> equal to the active language for the life of the tab,
// not just at this initial boot (Landing Localization L1, §5).
attachHtmlLangSync(i18n);

// Expose globally — App.js's first-visit picker changes language before it
// has ever called useTranslation() itself.
window.i18nInstance = i18n;

export default i18n;