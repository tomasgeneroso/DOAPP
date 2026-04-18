import { Link } from "react-router-dom";
import { Mail, MapPin, Phone, Facebook, Twitter, Instagram, Linkedin, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { features } from "../../../shared/featureFlags";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Sobre DOAPP */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              DOAPP
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              {t('footer.description')}
            </p>
            <div className="flex gap-3">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition"
              >
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Enlaces Rápidos */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('footer.quickLinks')}
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.searchJobs')}
                </Link>
              </li>
              <li>
                <Link
                  to="/contracts/create"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.publishJob')}
                </Link>
              </li>
              {features.blog && (
              <li>
                <Link
                  to="/blog"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Blog
                </Link>
              </li>
              )}
              <li>
                <Link
                  to="/help"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.helpCenter')}
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.contact')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('footer.legal')}
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/legal/terminos-y-condiciones"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/privacidad"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/cookies"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.cookies')}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/disputas"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.disputes')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {t('footer.contactInfo')}
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{t('footer.location')}</span>
              </li>
              <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm">
                <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <a href="mailto:support@doapp.com" className="hover:text-sky-600 dark:hover:text-sky-400 transition">
                  support@doapp.com
                </a>
              </li>
              <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm">
                <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <a href="tel:+5491112345678" className="hover:text-sky-600 dark:hover:text-sky-400 transition">
                  +54 9 11 1234-5678
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-600 dark:text-gray-400 text-sm text-center md:text-left">
              © {currentYear} DOAPP. {t('footer.allRightsReserved')}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Language Selector */}
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleLanguageChange("es")}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      currentLanguage === "es"
                        ? "bg-sky-600 text-white font-medium"
                        : "text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400"
                    }`}
                  >
                    ES
                  </button>
                  <button
                    onClick={() => handleLanguageChange("en")}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      currentLanguage === "en"
                        ? "bg-sky-600 text-white font-medium"
                        : "text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400"
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>

              {/* Other Links */}
              <div className="flex gap-6 text-sm">
                <Link
                  to="/sitemap"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition"
                >
                  {t('footer.sitemap')}
                </Link>
                <Link
                  to="/accessibility"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition"
                >
                  {t('footer.accessibility')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
