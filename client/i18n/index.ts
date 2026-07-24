import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import es from './locales/es.json';

if (!localStorage.getItem('language')) {
  localStorage.setItem('language', 'es');
}

const initialLng = localStorage.getItem('language') || 'es';

// Only Spanish (the default + fallback) is bundled into the main chunk.
// English is ~176 KB of JSON that ~all users never see, so it is loaded on
// demand the first time the language becomes 'en'. This keeps it out of the
// critical-path bundle that every visitor downloads on first paint.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
    },
    lng: initialLng,
    fallbackLng: 'es',
    partialBundledLanguages: true,
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
  });

let enLoading: Promise<void> | null = null;
async function ensureEnglishBundle(): Promise<void> {
  if (i18n.hasResourceBundle('en', 'translation')) return;
  if (!enLoading) {
    enLoading = import('./locales/en.json').then((mod) => {
      i18n.addResourceBundle('en', 'translation', mod.default, true, true);
    });
  }
  await enLoading;
}

// Load English when the user switches to it (from any language toggle), then
// re-apply so components re-render with the freshly-loaded strings.
i18n.on('languageChanged', (lng) => {
  if (lng === 'en' && !i18n.hasResourceBundle('en', 'translation')) {
    ensureEnglishBundle().then(() => i18n.changeLanguage('en'));
  }
});

// If the persisted language is already English on first load, fetch it now.
if (initialLng === 'en') {
  ensureEnglishBundle().then(() => i18n.changeLanguage('en'));
}

if (import.meta.hot) {
  import.meta.hot.accept('./locales/en.json', (mod) => {
    if (mod) i18n.addResourceBundle('en', 'translation', mod.default, true, true);
  });
  import.meta.hot.accept('./locales/es.json', (mod) => {
    if (mod) i18n.addResourceBundle('es', 'translation', mod.default, true, true);
  });
}

export default i18n;
