import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-slate-900">
      <div className="text-center px-4">
        <h1 className="text-4xl font-bold mb-4 text-slate-900 dark:text-white">404</h1>
        <p className="text-xl text-gray-600 dark:text-slate-300 mb-4">{t('notFound.message', 'Esta página no existe o el enlace está roto.')}</p>
        <a href="/" className="text-blue-500 hover:text-blue-700 underline">
          {t('common.backToHome')}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
