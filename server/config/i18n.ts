import i18next from "i18next";
import Backend from "i18next-fs-backend";
import middleware from "i18next-http-middleware";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize i18next for server-side internationalization
 */
i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    // Supported languages
    supportedLngs: ["es", "en"],
    fallbackLng: "es", // Default language
    preload: ["es", "en"],

    // Namespace
    ns: ["translation", "errors", "emails"],
    defaultNS: "translation",

    // Backend configuration
    backend: {
      loadPath: path.join(__dirname, "../locales/{{lng}}/{{ns}}.json"),
      addPath: path.join(__dirname, "../locales/{{lng}}/{{ns}}.missing.json"),
    },

    // Detection options
    detection: {
      order: ["querystring", "cookie", "header"],
      caches: ["cookie"],
      lookupQuerystring: "lng",
      lookupCookie: "i18next",
      lookupHeader: "accept-language",
      cookieSecure: process.env.NODE_ENV === "production",
      cookieSameSite: "strict",
    },

    // Interpolation
    interpolation: {
      escapeValue: false, // React already escapes values
    },

    // Development options
    saveMissing: process.env.NODE_ENV === "development",
    missingKeyHandler: (lng, ns, key) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`Missing translation: ${lng}/${ns}/${key}`);
      }
    },
  });

export default i18next;
export const i18nMiddleware = middleware.handle(i18next);
