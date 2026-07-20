import { Link } from "react-router-dom";
import { useTranslation, Trans } from 'react-i18next';
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, Shield } from "lucide-react";

export default function PrivacyPolicy() {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t('privacy.metaTitle', 'Política de Privacidad - DOAPP')}</title>
        <meta
          name="description"
          content={t('privacy.metaDescription', 'Política de privacidad y protección de datos de DOAPP')}
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
              {t('privacy.back', 'Volver')}
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Home className="h-4 w-4" />
              {t('privacy.home', 'Inicio')}
            </Link>
          </div>

          {/* Contenido */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                {t('privacy.title', 'Política de Privacidad')}
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              {t('privacy.lastUpdated', 'Última actualización: 7 de Noviembre de 2025')}
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s1Title', '1. Información que Recopilamos')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s1p', 'En DOAPP, recopilamos diferentes tipos de información para brindarte un mejor servicio:')}
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('privacy.s1_1Title', '1.1 Información de Registro')}
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('privacy.s1_1li1', 'Nombre completo y datos de contacto')}</li>
                  <li>{t('privacy.s1_1li2', 'Correo electrónico y número de teléfono')}</li>
                  <li>{t('privacy.s1_1li3', 'Información de perfil profesional')}</li>
                  <li>{t('privacy.s1_1li4', 'Fotografía de perfil (opcional)')}</li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('privacy.s1_2Title', '1.2 Información Financiera')}
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('privacy.s1_2li1', 'Datos bancarios para transferencias (CBU/CVU)')}</li>
                  <li>{t('privacy.s1_2li2', 'Información de pagos procesada a través de MercadoPago')}</li>
                  <li>{t('privacy.s1_2li3', 'Historial de transacciones en la plataforma')}</li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('privacy.s1_3Title', '1.3 Información de Uso')}
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('privacy.s1_3li1', 'Contratos publicados y completados')}</li>
                  <li>{t('privacy.s1_3li2', 'Mensajes y comunicaciones en la plataforma')}</li>
                  <li>{t('privacy.s1_3li3', 'Calificaciones y reseñas')}</li>
                  <li>{t('privacy.s1_3li4', 'Actividad de navegación y preferencias')}</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s2Title', '2. Cómo Utilizamos tu Información')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s2p', 'Utilizamos la información recopilada para:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('privacy.s2li1', 'Proporcionar y mejorar nuestros servicios')}</li>
                  <li>{t('privacy.s2li2', 'Procesar pagos y transacciones de manera segura')}</li>
                  <li>{t('privacy.s2li3', 'Verificar la identidad de los usuarios')}</li>
                  <li>{t('privacy.s2li4', 'Detectar y prevenir fraudes')}</li>
                  <li>{t('privacy.s2li5', 'Enviar notificaciones importantes sobre tu cuenta')}</li>
                  <li>{t('privacy.s2li6', 'Personalizar tu experiencia en la plataforma')}</li>
                  <li>{t('privacy.s2li7', 'Cumplir con obligaciones legales y regulatorias')}</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s3Title', '3. Compartir Información')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s3p', 'No vendemos tu información personal. Compartimos información solo en los siguientes casos:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><Trans i18nKey="privacy.s3li1" components={{ b: <strong /> }} defaults="<b>Con otros usuarios:</b> Tu perfil público, calificaciones y portfolio son visibles para otros usuarios" /></li>
                  <li><Trans i18nKey="privacy.s3li2" components={{ b: <strong /> }} defaults="<b>Proveedores de servicios:</b> MercadoPago para procesamiento de pagos, servicios de email, etc." /></li>
                  <li><Trans i18nKey="privacy.s3li3" components={{ b: <strong /> }} defaults="<b>Cumplimiento legal:</b> Cuando sea requerido por ley o para proteger nuestros derechos" /></li>
                  <li><Trans i18nKey="privacy.s3li4" components={{ b: <strong /> }} defaults="<b>Transferencias empresariales:</b> En caso de fusión, venta o reorganización" /></li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s4Title', '4. Seguridad de Datos')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s4p', 'Implementamos medidas de seguridad para proteger tu información:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('privacy.s4li1', 'Cifrado de datos sensibles (contraseñas, información bancaria)')}</li>
                  <li>{t('privacy.s4li2', 'Autenticación de dos factores (2FA) disponible')}</li>
                  <li>{t('privacy.s4li3', 'Conexiones seguras mediante HTTPS/SSL')}</li>
                  <li>{t('privacy.s4li4', 'Monitoreo continuo de seguridad')}</li>
                  <li>{t('privacy.s4li5', 'Acceso restringido a información personal')}</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s5Title', '5. Tus Derechos')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s5p', 'Conforme a la Ley de Protección de Datos Personales de Argentina (Ley 25.326), tienes derecho a:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><Trans i18nKey="privacy.s5li1" components={{ b: <strong /> }} defaults="<b>Acceso:</b> Solicitar una copia de tu información personal" /></li>
                  <li><Trans i18nKey="privacy.s5li2" components={{ b: <strong /> }} defaults="<b>Rectificación:</b> Corregir información inexacta o incompleta" /></li>
                  <li><Trans i18nKey="privacy.s5li3" components={{ b: <strong /> }} defaults="<b>Supresión:</b> Solicitar la eliminación de tu información (sujeto a limitaciones legales)" /></li>
                  <li><Trans i18nKey="privacy.s5li4" components={{ b: <strong /> }} defaults="<b>Oposición:</b> Oponerte al procesamiento de tus datos para ciertos fines" /></li>
                  <li><Trans i18nKey="privacy.s5li5" components={{ b: <strong /> }} defaults="<b>Portabilidad:</b> Recibir tus datos en un formato estructurado y transferible" /></li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s5contact', 'Para ejercer estos derechos, contáctanos en privacy@doapp.com')}
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s6Title', '6. Cookies y Tecnologías Similares')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s6p', 'Utilizamos cookies y tecnologías similares para:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('privacy.s6li1', 'Mantener tu sesión iniciada')}</li>
                  <li>{t('privacy.s6li2', 'Recordar tus preferencias (idioma, tema)')}</li>
                  <li>{t('privacy.s6li3', 'Analizar el uso de la plataforma')}</li>
                  <li>{t('privacy.s6li4', 'Mejorar el rendimiento del sitio')}</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  <Trans i18nKey="privacy.s6more" components={{ lnk: <Link to="/legal/cookies" className="text-sky-600 hover:text-sky-700 font-medium" /> }} defaults="Para más información, consulta nuestra <lnk>Política de Cookies</lnk>." />
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s7Title', '7. Retención de Datos')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s7p', 'Conservamos tu información personal mientras:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('privacy.s7li1', 'Tu cuenta esté activa')}</li>
                  <li>{t('privacy.s7li2', 'Sea necesaria para proporcionar servicios')}</li>
                  <li>{t('privacy.s7li3', 'Tengamos obligaciones legales de conservarla')}</li>
                  <li>{t('privacy.s7li4', 'Sea necesaria para resolver disputas')}</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s7note', 'Tras eliminar tu cuenta, conservaremos cierta información según lo requiera la ley (registros contables, historial de transacciones para auditorías).')}
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s8Title', '8. Menores de Edad')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s8p', 'DOAPP no está dirigida a menores de 18 años. No recopilamos intencionalmente información de menores. Si descubrimos que hemos recopilado información de un menor, la eliminaremos inmediatamente.')}
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s9Title', '9. Cambios a esta Política')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s9p', 'Podemos actualizar esta política periódicamente. Te notificaremos sobre cambios significativos mediante:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('privacy.s9li1', 'Un aviso destacado en la plataforma')}</li>
                  <li>{t('privacy.s9li2', 'Notificación por correo electrónico')}</li>
                  <li>{t('privacy.s9li3', 'Actualización de la fecha "Última actualización" al inicio de este documento')}</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('privacy.s10Title', '10. Contacto')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('privacy.s10p', 'Para preguntas sobre esta política de privacidad o el manejo de tus datos:')}
                </p>
                <ul className="text-slate-600 dark:text-slate-300 space-y-2">
                  <li><Trans i18nKey="privacy.emailLine" components={{ b: <strong /> }} defaults="<b>Email:</b> privacy@doapp.com" /></li>
                  <li><Trans i18nKey="privacy.dpoLine" components={{ b: <strong /> }} defaults="<b>Responsable de Protección de Datos:</b> dpo@doapp.com" /></li>
                  <li><Trans i18nKey="privacy.addressLine" components={{ b: <strong /> }} defaults="<b>Dirección:</b> Buenos Aires, Argentina" /></li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mt-4">
                  {t('privacy.s10note', 'También puedes presentar una queja ante la Agencia de Acceso a la Información Pública (AAIP) de Argentina.')}
                </p>
              </section>

              <div className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
                <p className="text-sm text-sky-900 dark:text-sky-100">
                  <Trans i18nKey="privacy.commitment" components={{ b: <strong /> }} defaults="<b>Compromiso de privacidad:</b> En DOAPP valoramos tu privacidad y nos comprometemos a proteger tu información personal. Si tienes alguna pregunta o inquietud, no dudes en contactarnos." />
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
              {t('privacy.linkTerms', 'Términos y Condiciones')}
            </Link>
            <span className="text-slate-400">•</span>
            <Link
              to="/legal/cookies"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t('privacy.linkCookies', 'Política de Cookies')}
            </Link>
            <span className="text-slate-400">•</span>
            <Link
              to="/legal/disputas"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t('privacy.linkDisputes', 'Resolución de Disputas')}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
