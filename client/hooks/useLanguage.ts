/**
 * Client-side language hook
 * Reads the language preference from localStorage and provides translations
 */

export type Language = 'es' | 'en';

export function getLanguage(): Language {
  if (typeof window === 'undefined') return 'es';
  const saved = localStorage.getItem('language');
  if (saved === 'en') return 'en';
  return 'es';
}

export function setLanguage(lang: Language) {
  localStorage.setItem('language', lang);
  document.cookie = `i18next=${lang}; path=/; max-age=31536000; SameSite=Strict`;
}

// Translation dictionaries
const translations: Record<Language, Record<string, string>> = {
  es: {
    // Footer
    'footer.about': 'La plataforma de freelancing más confiable de Argentina. Conectamos talento con oportunidades.',
    'footer.quickLinks': 'Enlaces Rápidos',
    'footer.searchJobs': 'Buscar Trabajos',
    'footer.postJob': 'Publicar Trabajo',
    'footer.blog': 'Blog',
    'footer.helpCenter': 'Centro de Ayuda',
    'footer.contact': 'Contacto',
    'footer.legal': 'Legal',
    'footer.terms': 'Términos y Condiciones',
    'footer.privacy': 'Política de Privacidad',
    'footer.cookies': 'Política de Cookies',
    'footer.disputes': 'Resolución de Disputas',
    'footer.rights': 'Todos los derechos reservados.',
    'footer.sitemap': 'Mapa del Sitio',
    'footer.accessibility': 'Accesibilidad',

    // Header
    'header.search': 'Buscar trabajos...',
    'header.postJob': 'Publicar Trabajo',
    'header.login': 'Iniciar Sesión',
    'header.register': 'Registrarse',
    'header.notifications': 'Notificaciones',
    'header.messages': 'Mensajes',
    'header.profile': 'Mi Perfil',
    'header.myJobs': 'Mis Trabajos',
    'header.contracts': 'Contratos',
    'header.settings': 'Configuración',
    'header.logout': 'Cerrar Sesión',
    'header.balance': 'Mi Balance',
    'header.dashboard': 'Dashboard',

    // Index / Landing
    'index.heroTitle': 'Encontrá el profesional que necesitás',
    'index.heroSubtitleLoggedIn': '¿Listo para empezar un nuevo proyecto o buscar oportunidades? Estás en el lugar correcto.',
    'index.heroSubtitle': 'Publicá trabajos y contratá profesionales con garantía de pago.',
    'index.searchPlaceholder': '¿Qué servicio necesitás?',
    'index.search': 'Buscar',
    'index.featuredJobs': 'Trabajos Destacados',
    'index.viewAll': 'Ver todos',
    'index.noJobs': 'No hay trabajos disponibles',
    'index.categories': 'Categorías',
    'index.howItWorks': 'Cómo Funciona',
    'index.loading': 'Cargando...',

    // Common
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'common.loading': 'Cargando...',
    'common.error': 'Error',
    'common.success': 'Éxito',
    'common.apply': 'Postularse',
    'common.perDay': '/día',
  },
  en: {
    // Footer
    'footer.about': 'Argentina\'s most trusted freelancing platform. We connect talent with opportunities.',
    'footer.quickLinks': 'Quick Links',
    'footer.searchJobs': 'Find Jobs',
    'footer.postJob': 'Post a Job',
    'footer.blog': 'Blog',
    'footer.helpCenter': 'Help Center',
    'footer.contact': 'Contact',
    'footer.legal': 'Legal',
    'footer.terms': 'Terms & Conditions',
    'footer.privacy': 'Privacy Policy',
    'footer.cookies': 'Cookie Policy',
    'footer.disputes': 'Dispute Resolution',
    'footer.rights': 'All rights reserved.',
    'footer.sitemap': 'Sitemap',
    'footer.accessibility': 'Accessibility',

    // Header
    'header.search': 'Search jobs...',
    'header.postJob': 'Post a Job',
    'header.login': 'Log In',
    'header.register': 'Sign Up',
    'header.notifications': 'Notifications',
    'header.messages': 'Messages',
    'header.profile': 'My Profile',
    'header.myJobs': 'My Jobs',
    'header.contracts': 'Contracts',
    'header.settings': 'Settings',
    'header.logout': 'Log Out',
    'header.balance': 'My Balance',
    'header.dashboard': 'Dashboard',

    // Index / Landing
    'index.heroTitle': 'Find the professional you need',
    'index.heroSubtitleLoggedIn': 'Ready to start a new project or search for opportunities? You\'re in the right place.',
    'index.heroSubtitle': 'Post jobs and hire professionals with payment guarantee.',
    'index.searchPlaceholder': 'What service do you need?',
    'index.search': 'Search',
    'index.featuredJobs': 'Featured Jobs',
    'index.viewAll': 'View all',
    'index.noJobs': 'No jobs available',
    'index.categories': 'Categories',
    'index.howItWorks': 'How It Works',
    'index.loading': 'Loading...',

    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.apply': 'Apply',
    'common.perDay': '/day',
  },
};

/**
 * Get a translated string by key
 */
export function t(key: string): string {
  const lang = getLanguage();
  return translations[lang][key] || translations.es[key] || key;
}

/**
 * React hook for language - returns { lang, t } and re-reads on mount
 */
export function useLanguage() {
  const lang = getLanguage();
  return { lang, t };
}
