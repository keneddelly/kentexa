import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import sw from './locales/sw.json';
import fr from './locales/fr.json';

// ✅ Default to Swahili for Tanzania — respect saved preference
const savedLang = localStorage.getItem('kentexa_lang');
const defaultLang = savedLang || 'sw';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sw: { translation: sw },
      fr: { translation: fr },
    },
    lng:          defaultLang,
    fallbackLng:  'sw',
    interpolation: { escapeValue: false },
  });

// Expose globally so App.js language picker can change it
window.i18nInstance = i18n;

export default i18n;