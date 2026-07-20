import { Link } from "react-router-dom";
import { useTranslation, Trans } from 'react-i18next';
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, Cookie } from "lucide-react";

export default function CookiesPolicy() {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t('cookies.metaTitle', 'Política de Cookies - DOAPP')}</title>
        <meta
          name="description"
          content={t('cookies.metaDescription', 'Política de cookies y tecnologías de seguimiento de DOAPP')}
        />
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Navegación */}
          <div className="flex items-center justify-between mb-8">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('cookies.back', 'Volver')}
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Home className="h-4 w-4" />
              {t('cookies.home', 'Inicio')}
            </Link>
          </div>

          {/* Contenido */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              <Cookie className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                {t('cookies.title', 'Política de Cookies')}
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              {t('cookies.lastUpdated', 'Última actualización: 7 de Noviembre de 2025')}
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('cookies.s1Title', '1. ¿Qué son las Cookies?')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s1p1', 'Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas un sitio web. Se utilizan ampliamente para hacer que los sitios web funcionen de manera más eficiente y para proporcionar información a los propietarios del sitio.')}
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s1p2', 'En DOAPP, utilizamos cookies y tecnologías similares para mejorar tu experiencia, proporcionar funcionalidades esenciales y analizar el uso de nuestra plataforma.')}
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('cookies.s2Title', '2. Tipos de Cookies que Utilizamos')}
                </h2>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('cookies.s2_1Title', '2.1 Cookies Estrictamente Necesarias')}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s2_1p', 'Estas cookies son esenciales para que puedas navegar por la plataforma y utilizar sus funciones. Sin estas cookies, los servicios solicitados no pueden proporcionarse.')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><Trans i18nKey="cookies.s2_1li1" components={{ b: <strong /> }} defaults="<b>Autenticación:</b> Mantienen tu sesión iniciada mientras navegas" /></li>
                  <li><Trans i18nKey="cookies.s2_1li2" components={{ b: <strong /> }} defaults="<b>Seguridad:</b> Protegen contra ataques CSRF y XSS" /></li>
                  <li><Trans i18nKey="cookies.s2_1li3" components={{ b: <strong /> }} defaults="<b>Balance de carga:</b> Distribuyen el tráfico entre servidores" /></li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm italic">
                  {t('cookies.s2_1dur', '⏱️ Duración: Sesión o hasta que cierres el navegador')}
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('cookies.s2_2Title', '2.2 Cookies de Funcionalidad')}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s2_2p', 'Estas cookies permiten que la plataforma recuerde las elecciones que haces para proporcionar funcionalidades mejoradas y más personales.')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><Trans i18nKey="cookies.s2_2li1" components={{ b: <strong /> }} defaults="<b>Preferencias de idioma:</b> Recuerdan tu idioma seleccionado (ES/EN)" /></li>
                  <li><Trans i18nKey="cookies.s2_2li2" components={{ b: <strong /> }} defaults="<b>Tema visual:</b> Guardan tu preferencia de modo claro/oscuro" /></li>
                  <li><Trans i18nKey="cookies.s2_2li3" components={{ b: <strong /> }} defaults="<b>Configuración de notificaciones:</b> Mantienen tus preferencias de alertas" /></li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm italic">
                  {t('cookies.s2_2dur', '⏱️ Duración: Hasta 1 año')}
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('cookies.s2_3Title', '2.3 Cookies de Rendimiento y Análisis')}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s2_3p', 'Estas cookies recopilan información sobre cómo los visitantes utilizan la plataforma. La información es anónima y se utiliza para mejorar el funcionamiento del sitio.')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('cookies.s2_3li1', 'Páginas más visitadas')}</li>
                  <li>{t('cookies.s2_3li2', 'Tiempo de permanencia en el sitio')}</li>
                  <li>{t('cookies.s2_3li3', 'Rutas de navegación')}</li>
                  <li>{t('cookies.s2_3li4', 'Errores encontrados')}</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm italic">
                  {t('cookies.s2_3dur', '⏱️ Duración: Hasta 2 años')}
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('cookies.s3Title', '3. Cookies de Terceros')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s3p', 'Algunos de nuestros servicios utilizan cookies de terceros para proporcionar funcionalidades específicas:')}
                </p>

                <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-2">MercadoPago</h4>
                  <p className="text-slate-600 dark:text-slate-300 text-sm mb-2">
                    {t('cookies.mpDesc', 'Para procesar pagos de manera segura. Cookies necesarias para el procesamiento de transacciones y prevención de fraudes.')}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 text-xs">
                    🔗 <a href="https://www.mercadopago.com.ar/privacidad" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-700">{t('cookies.mpLink', 'Política de Privacidad de MercadoPago')}</a>
                  </p>
                </div>

                <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Redis</h4>
                  <p className="text-slate-600 dark:text-slate-300 text-sm">
                    {t('cookies.redisDesc', 'Para almacenamiento en caché y mejorar el rendimiento de la plataforma. No recopila información personal.')}
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('cookies.s4Title', '4. Local Storage y Session Storage')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s4p', 'Además de cookies, utilizamos tecnologías de almacenamiento local del navegador:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><Trans i18nKey="cookies.s4li1" components={{ b: <strong /> }} defaults="<b>Local Storage:</b> Para guardar preferencias que persisten entre sesiones (tema, idioma)" /></li>
                  <li><Trans i18nKey="cookies.s4li2" components={{ b: <strong /> }} defaults="<b>Session Storage:</b> Para datos temporales durante la sesión actual" /></li>
                  <li><Trans i18nKey="cookies.s4li3" components={{ b: <strong /> }} defaults="<b>IndexedDB:</b> Para almacenar caché de datos no sensibles que mejoran el rendimiento" /></li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('cookies.s5Title', '5. Gestión de Cookies')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s5p', 'Tienes el derecho de decidir si aceptas o rechazas cookies. Puedes gestionar las cookies de varias maneras:')}
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('cookies.s5_1Title', '5.1 Configuración del Navegador')}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s5_1p', 'La mayoría de los navegadores aceptan cookies automáticamente, pero puedes modificar la configuración para rechazarlas:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><Trans i18nKey="cookies.s5_1chrome" components={{ b: <strong /> }} defaults="<b>Chrome:</b> Configuración → Privacidad y seguridad → Cookies" /></li>
                  <li><Trans i18nKey="cookies.s5_1firefox" components={{ b: <strong /> }} defaults="<b>Firefox:</b> Preferencias → Privacidad y seguridad → Cookies y datos del sitio" /></li>
                  <li><Trans i18nKey="cookies.s5_1safari" components={{ b: <strong /> }} defaults="<b>Safari:</b> Preferencias → Privacidad → Cookies y datos de sitios web" /></li>
                  <li><Trans i18nKey="cookies.s5_1edge" components={{ b: <strong /> }} defaults="<b>Edge:</b> Configuración → Privacidad, búsqueda y servicios → Cookies" /></li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('cookies.s5_2Title', '5.2 Limpiar Cookies Existentes')}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s5_2p', 'Puedes eliminar todas las cookies almacenadas en tu dispositivo. Ten en cuenta que esto cerrará tu sesión y eliminará tus preferencias guardadas.')}
                </p>

                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-r-lg mb-4">
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    <Trans i18nKey="cookies.s5Warning" components={{ b: <strong /> }} defaults="<b>⚠️ Importante:</b> Si bloqueas o eliminas las cookies necesarias, algunas funcionalidades de DOAPP pueden no funcionar correctamente. Por ejemplo, no podrás mantener tu sesión iniciada." />
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('cookies.s6Title', '6. Cookies Específicas que Usamos')}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-100 dark:bg-slate-700">
                      <tr>
                        <th className="px-4 py-2 text-left">{t('cookies.thName', 'Nombre')}</th>
                        <th className="px-4 py-2 text-left">{t('cookies.thPurpose', 'Propósito')}</th>
                        <th className="px-4 py-2 text-left">{t('cookies.thType', 'Tipo')}</th>
                        <th className="px-4 py-2 text-left">{t('cookies.thDuration', 'Duración')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">access_token</td>
                        <td className="px-4 py-2">{t('cookies.rowAccessPurpose', 'Autenticación JWT')}</td>
                        <td className="px-4 py-2">{t('cookies.typeNecessary', 'Necesaria')}</td>
                        <td className="px-4 py-2">{t('cookies.dur7d', '7 días')}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">refresh_token</td>
                        <td className="px-4 py-2">{t('cookies.rowRefreshPurpose', 'Renovación de sesión')}</td>
                        <td className="px-4 py-2">{t('cookies.typeNecessary', 'Necesaria')}</td>
                        <td className="px-4 py-2">{t('cookies.dur30d', '30 días')}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">i18next</td>
                        <td className="px-4 py-2">{t('cookies.rowI18nPurpose', 'Preferencia de idioma')}</td>
                        <td className="px-4 py-2">{t('cookies.typeFunctionality', 'Funcionalidad')}</td>
                        <td className="px-4 py-2">{t('cookies.dur1y', '1 año')}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">theme</td>
                        <td className="px-4 py-2">{t('cookies.rowThemePurpose', 'Modo claro/oscuro')}</td>
                        <td className="px-4 py-2">{t('cookies.typeFunctionality', 'Funcionalidad')}</td>
                        <td className="px-4 py-2">{t('cookies.dur1y', '1 año')}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">connect.sid</td>
                        <td className="px-4 py-2">{t('cookies.rowSidPurpose', 'ID de sesión')}</td>
                        <td className="px-4 py-2">{t('cookies.typeNecessary', 'Necesaria')}</td>
                        <td className="px-4 py-2">{t('cookies.durSession', 'Sesión')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('cookies.s7Title', '7. Actualizaciones de esta Política')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s7p1', 'Podemos actualizar esta Política de Cookies ocasionalmente para reflejar cambios en las cookies que utilizamos o por razones operativas, legales o regulatorias.')}
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s7p2', 'Te recomendamos que revises esta página periódicamente para estar informado sobre nuestro uso de cookies. La fecha de "Última actualización" al inicio del documento indica cuándo se revisó por última vez.')}
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('cookies.s8Title', '8. Más Información')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('cookies.s8p', 'Si tienes preguntas sobre nuestra Política de Cookies, contáctanos en:')}
                </p>
                <ul className="text-slate-600 dark:text-slate-300 space-y-2">
                  <li><Trans i18nKey="cookies.emailLine" components={{ b: <strong /> }} defaults="<b>Email:</b> privacy@doapp.com" /></li>
                  <li><Trans i18nKey="cookies.supportLine" components={{ b: <strong /> }} defaults="<b>Soporte:</b> support@doapp.com" /></li>
                </ul>
              </section>

              <div className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
                <p className="text-sm text-sky-900 dark:text-sky-100">
                  <Trans i18nKey="cookies.control" components={{ b: <strong /> }} defaults="<b>Tu control:</b> Al utilizar DOAPP, aceptas el uso de cookies según se describe en esta política. Puedes gestionar tus preferencias de cookies en cualquier momento a través de la configuración de tu navegador." />
                </p>
              </div>
            </div>
          </div>

          {/* Footer con enlaces relacionados */}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/legal/terminos-y-condiciones"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t('cookies.linkTerms', 'Términos y Condiciones')}
            </Link>
            <span className="text-slate-400">•</span>
            <Link
              to="/legal/privacidad"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t('cookies.linkPrivacy', 'Política de Privacidad')}
            </Link>
            <span className="text-slate-400">•</span>
            <Link
              to="/legal/disputas"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t('cookies.linkDisputes', 'Resolución de Disputas')}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
