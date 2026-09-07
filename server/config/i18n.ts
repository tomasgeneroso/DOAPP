import i18next from "i18next";
import Backend from "i18next-fs-backend";
import * as middleware from "i18next-http-middleware";
import path from "path";


/**
 * Los nombres van sin guiones bajos a proposito.
 *
 * `__dirname` y `__filename` ya existen cuando este modulo se transpila a
 * CommonJS -- que es lo que hacen los tests de integracion, porque bajo ESM los
 * modelos no se pueden registrar por sus importaciones circulares. Declararlos
 * de nuevo tira "Identifier '__dirname' has already been declared" y el modulo
 * no carga, arrastrando a toda ruta que dependa de i18n.
 */
// Igual que en rolePasswordStore: sin import.meta, que no existe en CommonJS
// y hace que el modulo no parsee en los tests de integracion.
const carpetaLocales = path.join(process.cwd(), "server", "locales");

/**
 * Initialize i18next for server-side internationalization
 */
(i18next as any)
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
      loadPath: path.join(carpetaLocales, "{{lng}}/{{ns}}.json"),
      addPath: path.join(carpetaLocales, "{{lng}}/{{ns}}.missing.json"),
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
    missingKeyHandler: (lng: any, ns: any, key: any) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`Missing translation: ${lng}/${ns}/${key}`);
      }
    },
  });

export default i18next;
export const i18nMiddleware = middleware.handle(i18next);
