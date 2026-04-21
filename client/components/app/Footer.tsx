import { Link, useLocation } from "react-router-dom";
import { Mail, MapPin, Phone, Facebook, Twitter, Instagram, Linkedin, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { features } from "../../../shared/featureFlags";
import { useAuth } from "../../hooks/useAuth";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;
  const { user } = useAuth();
  const location = useLocation();
  const isVisitorHome = !user && location.pathname === '/';

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <footer className={`border-t mt-auto ${isVisitorHome ? 'bg-[#070d1a] border-slate-800/60' : 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-slate-200/80 dark:border-slate-800/60'}`}>
      <div className={`container mx-auto px-4 py-14${isVisitorHome ? ' dark' : ''}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Sobre DOAPP */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-600 shadow-lg shadow-sky-500/30">
                <span className="text-lg font-black text-white tracking-tight">DO</span>
              </div>
              <span className="text-xl font-black bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent dark:from-sky-400 dark:to-blue-400 tracking-tight">APP</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
              {t('footer.description')}
            </p>
            <div className="flex gap-3">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200"
              >
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Enlaces Rápidos */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-widest">
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
              {features.sitemap && (
              <li>
                <Link
                  to="/sitemap"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  {t('footer.sitemap')}
                </Link>
              </li>
              )}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-widest">
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
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-widest">
              {t('footer.contactInfo')}
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{t('footer.location')}</span>
              </li>
              <li className="flex items-start gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <a href="mailto:support@doapp.com" className="hover:text-sky-600 dark:hover:text-sky-400 transition">
                  support@doapp.com
                </a>
              </li>
              <li className="flex items-start gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <a href="tel:+5491112345678" className="hover:text-sky-600 dark:hover:text-sky-400 transition">
                  +54 9 11 1234-5678
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 pt-8 border-t border-slate-200/80 dark:border-slate-800/60">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-500 dark:text-slate-400 text-sm text-center md:text-left">
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
                  className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200"
                >
                  {t('footer.sitemap')}
                </Link>
                <Link
                  to="/accessibility"
                  className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-200"
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
