import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, Shield } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <>
      <Helmet>
        <title>Política de Privacidad - DOAPP</title>
        <meta
          name="description"
          content="Política de privacidad y protección de datos de DOAPP"
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
              <Shield className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                Política de Privacidad
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              Última actualización: 7 de Noviembre de 2025
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  1. Información que Recopilamos
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  En DOAPP, recopilamos diferentes tipos de información para brindarte un mejor servicio:
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  1.1 Información de Registro
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Nombre completo y datos de contacto</li>
                  <li>Correo electrónico y número de teléfono</li>
                  <li>Información de perfil profesional</li>
                  <li>Fotografía de perfil (opcional)</li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  1.2 Información Financiera
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Datos bancarios para transferencias (CBU/CVU)</li>
                  <li>Información de pagos procesada a través de MercadoPago</li>
                  <li>Historial de transacciones en la plataforma</li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  1.3 Información de Uso
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Contratos publicados y completados</li>
                  <li>Mensajes y comunicaciones en la plataforma</li>
                  <li>Calificaciones y reseñas</li>
                  <li>Actividad de navegación y preferencias</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  2. Cómo Utilizamos tu Información
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Utilizamos la información recopilada para:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Proporcionar y mejorar nuestros servicios</li>
                  <li>Procesar pagos y transacciones de manera segura</li>
                  <li>Verificar la identidad de los usuarios</li>
                  <li>Detectar y prevenir fraudes</li>
                  <li>Enviar notificaciones importantes sobre tu cuenta</li>
                  <li>Personalizar tu experiencia en la plataforma</li>
                  <li>Cumplir con obligaciones legales y regulatorias</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  3. Compartir Información
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  No vendemos tu información personal. Compartimos información solo en los siguientes casos:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Con otros usuarios:</strong> Tu perfil público, calificaciones y portfolio son visibles para otros usuarios</li>
                  <li><strong>Proveedores de servicios:</strong> MercadoPago para procesamiento de pagos, servicios de email, etc.</li>
                  <li><strong>Cumplimiento legal:</strong> Cuando sea requerido por ley o para proteger nuestros derechos</li>
                  <li><strong>Transferencias empresariales:</strong> En caso de fusión, venta o reorganización</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  4. Seguridad de Datos
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Implementamos medidas de seguridad para proteger tu información:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Cifrado de datos sensibles (contraseñas, información bancaria)</li>
                  <li>Autenticación de dos factores (2FA) disponible</li>
                  <li>Conexiones seguras mediante HTTPS/SSL</li>
                  <li>Monitoreo continuo de seguridad</li>
                  <li>Acceso restringido a información personal</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  5. Tus Derechos
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Conforme a la Ley de Protección de Datos Personales de Argentina (Ley 25.326), tienes derecho a:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Acceso:</strong> Solicitar una copia de tu información personal</li>
                  <li><strong>Rectificación:</strong> Corregir información inexacta o incompleta</li>
                  <li><strong>Supresión:</strong> Solicitar la eliminación de tu información (sujeto a limitaciones legales)</li>
                  <li><strong>Oposición:</strong> Oponerte al procesamiento de tus datos para ciertos fines</li>
                  <li><strong>Portabilidad:</strong> Recibir tus datos en un formato estructurado y transferible</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Para ejercer estos derechos, contáctanos en privacy@doapp.com
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  6. Cookies y Tecnologías Similares
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Utilizamos cookies y tecnologías similares para:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Mantener tu sesión iniciada</li>
                  <li>Recordar tus preferencias (idioma, tema)</li>
                  <li>Analizar el uso de la plataforma</li>
                  <li>Mejorar el rendimiento del sitio</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Para más información, consulta nuestra <Link to="/legal/cookies" className="text-sky-600 hover:text-sky-700 font-medium">Política de Cookies</Link>.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  7. Retención de Datos
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Conservamos tu información personal mientras:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Tu cuenta esté activa</li>
                  <li>Sea necesaria para proporcionar servicios</li>
                  <li>Tengamos obligaciones legales de conservarla</li>
                  <li>Sea necesaria para resolver disputas</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Tras eliminar tu cuenta, conservaremos cierta información según lo requiera la ley (registros contables, historial de transacciones para auditorías).
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  8. Menores de Edad
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  DOAPP no está dirigida a menores de 18 años. No recopilamos intencionalmente información de menores. Si descubrimos que hemos recopilado información de un menor, la eliminaremos inmediatamente.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  9. Cambios a esta Política
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Podemos actualizar esta política periódicamente. Te notificaremos sobre cambios significativos mediante:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Un aviso destacado en la plataforma</li>
                  <li>Notificación por correo electrónico</li>
                  <li>Actualización de la fecha "Última actualización" al inicio de este documento</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  10. Contacto
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Para preguntas sobre esta política de privacidad o el manejo de tus datos:
                </p>
                <ul className="text-slate-600 dark:text-slate-300 space-y-2">
                  <li><strong>Email:</strong> privacy@doapp.com</li>
                  <li><strong>Responsable de Protección de Datos:</strong> dpo@doapp.com</li>
                  <li><strong>Dirección:</strong> Buenos Aires, Argentina</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mt-4">
                  También puedes presentar una queja ante la Agencia de Acceso a la Información Pública (AAIP) de Argentina.
                </p>
              </section>

              <div className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
                <p className="text-sm text-sky-900 dark:text-sky-100">
                  <strong>Compromiso de privacidad:</strong> En DOAPP valoramos tu privacidad y nos comprometemos a proteger tu información personal. Si tienes alguna pregunta o inquietud, no dudes en contactarnos.
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
              to="/legal/cookies"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              Política de Cookies
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
