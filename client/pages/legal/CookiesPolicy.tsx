import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, Cookie } from "lucide-react";

export default function CookiesPolicy() {
  return (
    <>
      <Helmet>
        <title>Política de Cookies - DOAPP</title>
        <meta
          name="description"
          content="Política de cookies y tecnologías de seguimiento de DOAPP"
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
              Volver
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Home className="h-4 w-4" />
              Inicio
            </Link>
          </div>

          {/* Contenido */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              <Cookie className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                Política de Cookies
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              Última actualización: 7 de Noviembre de 2025
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  1. ¿Qué son las Cookies?
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas un sitio web. Se utilizan ampliamente para hacer que los sitios web funcionen de manera más eficiente y para proporcionar información a los propietarios del sitio.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  En DOAPP, utilizamos cookies y tecnologías similares para mejorar tu experiencia, proporcionar funcionalidades esenciales y analizar el uso de nuestra plataforma.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  2. Tipos de Cookies que Utilizamos
                </h2>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  2.1 Cookies Estrictamente Necesarias
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Estas cookies son esenciales para que puedas navegar por la plataforma y utilizar sus funciones. Sin estas cookies, los servicios solicitados no pueden proporcionarse.
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Autenticación:</strong> Mantienen tu sesión iniciada mientras navegas</li>
                  <li><strong>Seguridad:</strong> Protegen contra ataques CSRF y XSS</li>
                  <li><strong>Balance de carga:</strong> Distribuyen el tráfico entre servidores</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm italic">
                  ⏱️ Duración: Sesión o hasta que cierres el navegador
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  2.2 Cookies de Funcionalidad
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Estas cookies permiten que la plataforma recuerde las elecciones que haces para proporcionar funcionalidades mejoradas y más personales.
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Preferencias de idioma:</strong> Recuerdan tu idioma seleccionado (ES/EN)</li>
                  <li><strong>Tema visual:</strong> Guardan tu preferencia de modo claro/oscuro</li>
                  <li><strong>Configuración de notificaciones:</strong> Mantienen tus preferencias de alertas</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm italic">
                  ⏱️ Duración: Hasta 1 año
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  2.3 Cookies de Rendimiento y Análisis
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Estas cookies recopilan información sobre cómo los visitantes utilizan la plataforma. La información es anónima y se utiliza para mejorar el funcionamiento del sitio.
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Páginas más visitadas</li>
                  <li>Tiempo de permanencia en el sitio</li>
                  <li>Rutas de navegación</li>
                  <li>Errores encontrados</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm italic">
                  ⏱️ Duración: Hasta 2 años
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  3. Cookies de Terceros
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Algunos de nuestros servicios utilizan cookies de terceros para proporcionar funcionalidades específicas:
                </p>

                <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-2">MercadoPago</h4>
                  <p className="text-slate-600 dark:text-slate-300 text-sm mb-2">
                    Para procesar pagos de manera segura. Cookies necesarias para el procesamiento de transacciones y prevención de fraudes.
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 text-xs">
                    🔗 <a href="https://www.mercadopago.com.ar/privacidad" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-700">Política de Privacidad de MercadoPago</a>
                  </p>
                </div>

                <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Redis</h4>
                  <p className="text-slate-600 dark:text-slate-300 text-sm">
                    Para almacenamiento en caché y mejorar el rendimiento de la plataforma. No recopila información personal.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  4. Local Storage y Session Storage
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Además de cookies, utilizamos tecnologías de almacenamiento local del navegador:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Local Storage:</strong> Para guardar preferencias que persisten entre sesiones (tema, idioma)</li>
                  <li><strong>Session Storage:</strong> Para datos temporales durante la sesión actual</li>
                  <li><strong>IndexedDB:</strong> Para almacenar caché de datos no sensibles que mejoran el rendimiento</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  5. Gestión de Cookies
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Tienes el derecho de decidir si aceptas o rechazas cookies. Puedes gestionar las cookies de varias maneras:
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  5.1 Configuración del Navegador
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  La mayoría de los navegadores aceptan cookies automáticamente, pero puedes modificar la configuración para rechazarlas:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Chrome:</strong> Configuración → Privacidad y seguridad → Cookies</li>
                  <li><strong>Firefox:</strong> Preferencias → Privacidad y seguridad → Cookies y datos del sitio</li>
                  <li><strong>Safari:</strong> Preferencias → Privacidad → Cookies y datos de sitios web</li>
                  <li><strong>Edge:</strong> Configuración → Privacidad, búsqueda y servicios → Cookies</li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  5.2 Limpiar Cookies Existentes
                </h3>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Puedes eliminar todas las cookies almacenadas en tu dispositivo. Ten en cuenta que esto cerrará tu sesión y eliminará tus preferencias guardadas.
                </p>

                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-r-lg mb-4">
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    <strong>⚠️ Importante:</strong> Si bloqueas o eliminas las cookies necesarias, algunas funcionalidades de DOAPP pueden no funcionar correctamente. Por ejemplo, no podrás mantener tu sesión iniciada.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  6. Cookies Específicas que Usamos
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-100 dark:bg-slate-700">
                      <tr>
                        <th className="px-4 py-2 text-left">Nombre</th>
                        <th className="px-4 py-2 text-left">Propósito</th>
                        <th className="px-4 py-2 text-left">Tipo</th>
                        <th className="px-4 py-2 text-left">Duración</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">access_token</td>
                        <td className="px-4 py-2">Autenticación JWT</td>
                        <td className="px-4 py-2">Necesaria</td>
                        <td className="px-4 py-2">7 días</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">refresh_token</td>
                        <td className="px-4 py-2">Renovación de sesión</td>
                        <td className="px-4 py-2">Necesaria</td>
                        <td className="px-4 py-2">30 días</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">i18next</td>
                        <td className="px-4 py-2">Preferencia de idioma</td>
                        <td className="px-4 py-2">Funcionalidad</td>
                        <td className="px-4 py-2">1 año</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">theme</td>
                        <td className="px-4 py-2">Modo claro/oscuro</td>
                        <td className="px-4 py-2">Funcionalidad</td>
                        <td className="px-4 py-2">1 año</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 font-mono text-xs">connect.sid</td>
                        <td className="px-4 py-2">ID de sesión</td>
                        <td className="px-4 py-2">Necesaria</td>
                        <td className="px-4 py-2">Sesión</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  7. Actualizaciones de esta Política
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Podemos actualizar esta Política de Cookies ocasionalmente para reflejar cambios en las cookies que utilizamos o por razones operativas, legales o regulatorias.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Te recomendamos que revises esta página periódicamente para estar informado sobre nuestro uso de cookies. La fecha de "Última actualización" al inicio del documento indica cuándo se revisó por última vez.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  8. Más Información
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Si tienes preguntas sobre nuestra Política de Cookies, contáctanos en:
                </p>
                <ul className="text-slate-600 dark:text-slate-300 space-y-2">
                  <li><strong>Email:</strong> privacy@doapp.com</li>
                  <li><strong>Soporte:</strong> support@doapp.com</li>
                </ul>
              </section>

              <div className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
                <p className="text-sm text-sky-900 dark:text-sky-100">
                  <strong>Tu control:</strong> Al utilizar DOAPP, aceptas el uso de cookies según se describe en esta política. Puedes gestionar tus preferencias de cookies en cualquier momento a través de la configuración de tu navegador.
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
              Términos y Condiciones
            </Link>
            <span className="text-slate-400">•</span>
            <Link
              to="/legal/privacidad"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              Política de Privacidad
            </Link>
            <span className="text-slate-400">•</span>
            <Link
              to="/legal/disputas"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              Resolución de Disputas
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
