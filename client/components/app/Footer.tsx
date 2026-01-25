import { Link } from "react-router-dom";
import { Mail, MapPin, Phone, Facebook, Twitter, Instagram, Linkedin, Globe } from "lucide-react";
import { useState } from "react";

// Get initial language from localStorage or browser
const getInitialLanguage = (): string => {
  if (typeof window === 'undefined') return 'es';
  const savedLang = localStorage.getItem("language") || navigator.language.split("-")[0];
  return savedLang === "en" ? "en" : "es";
};

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const [currentLanguage, setCurrentLanguage] = useState<string>(getInitialLanguage);

  const handleLanguageChange = (lang: string) => {
    localStorage.setItem("language", lang);
    setCurrentLanguage(lang);

    // Set cookie for backend i18n
    document.cookie = `i18next=${lang}; path=/; max-age=31536000; SameSite=Strict`;

    // Reload page to apply language change
    window.location.reload();
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
              La plataforma de freelancing más confiable de Argentina. Conectamos talento con oportunidades.
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
              Enlaces Rápidos
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Buscar Trabajos
                </Link>
              </li>
              <li>
                <Link
                  to="/contracts/create"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Publicar Trabajo
                </Link>
              </li>
              <li>
                <Link
                  to="/blog"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  to="/help"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Centro de Ayuda
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Contacto
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Legal
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/legal/terminos-y-condiciones"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Términos y Condiciones
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/privacidad"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Política de Privacidad
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/cookies"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Política de Cookies
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/disputas"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition text-sm"
                >
                  Resolución de Disputas
                </Link>
              </li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Contacto
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-gray-600 dark:text-gray-400 text-sm">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Buenos Aires, Argentina</span>
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
              © {currentYear} DOAPP. Todos los derechos reservados.
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
                  Mapa del Sitio
                </Link>
                <Link
                  to="/accessibility"
                  className="text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition"
                >
                  Accesibilidad
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
