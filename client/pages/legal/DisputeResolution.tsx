import { Link } from "react-router-dom";
import { useTranslation, Trans } from 'react-i18next';
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, Scale, AlertCircle } from "lucide-react";

export default function DisputeResolution() {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t('disputeRes.metaTitle', 'Resolución de Disputas - DOAPP')}</title>
        <meta
          name="description"
          content={t('disputeRes.metaDescription', 'Proceso de resolución de disputas y mediación de DOAPP')}
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
              {t('disputeRes.back', 'Volver')}
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Home className="h-4 w-4" />
              {t('disputeRes.home', 'Inicio')}
            </Link>
          </div>

          {/* Contenido */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              <Scale className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                {t('disputeRes.title', 'Resolución de Disputas')}
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              {t('disputeRes.lastUpdated', 'Última actualización: 7 de Noviembre de 2025')}
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s1Title', '1. Introducción')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s1p1', 'En DOAPP, nos esforzamos por proporcionar un ambiente seguro y justo para todas las transacciones. Sin embargo, entendemos que pueden surgir desacuerdos entre las personas dentro de la app. Este documento establece el proceso formal de resolución de disputas.')}
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s1p2', 'Nuestro objetivo es resolver todos los conflictos de manera justa, transparente y eficiente, protegiendo los intereses de ambas partes.')}
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s2Title', '2. ¿Cuándo Iniciar una Disputa?')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s2p', 'Debes considerar iniciar una disputa en las siguientes situaciones:')}
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('disputeRes.s2ClientsTitle', 'Para Clientes:')}
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('disputeRes.s2c1', 'El trabajo entregado no coincide con lo acordado en los detalles')}</li>
                  <li>{t('disputeRes.s2c2', 'El Doer no completó el trabajo según las especificaciones')}</li>
                  <li>{t('disputeRes.s2c3', 'El Doer incumplió los plazos sin justificación válida')}</li>
                  <li>{t('disputeRes.s2c4', 'La calidad del trabajo es significativamente inferior a lo esperado')}</li>
                  <li>{t('disputeRes.s2c5', 'El Doer no responde a comunicaciones durante un período prolongado')}</li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  {t('disputeRes.s2WorkersTitle', 'Para Profesionales:')}
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('disputeRes.s2w1', 'El cliente no aprueba el trabajo completado sin motivo válido')}</li>
                  <li>{t('disputeRes.s2w2', 'El cliente solicita cambios no incluidos en el acuerdo original')}</li>
                  <li>{t('disputeRes.s2w3', 'El cliente no proporciona información necesaria para completar el trabajo')}</li>
                  <li>{t('disputeRes.s2w4', 'El cliente rechaza injustificadamente el trabajo entregado correctamente')}</li>
                </ul>

                <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-r-lg mb-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <Trans i18nKey="disputeRes.s2tip" components={{ b: <strong /> }} defaults="<b>💡 Recomendación:</b> Antes de iniciar una disputa formal, te recomendamos intentar resolver el problema directamente con la otra parte a través de la mensajería de la plataforma. Muchos conflictos se resuelven mediante comunicación directa." />
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s3Title', '3. Proceso de Resolución de Disputas')}
                </h2>

                <div className="space-y-6">
                  <div className="border-l-4 border-sky-500 pl-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                      {t('disputeRes.step1Title', 'Paso 1: Apertura de Disputa')}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-2">
                      {t('disputeRes.step1p', 'Cualquier parte puede iniciar una disputa desde la página del contrato haciendo clic en "Abrir Disputa". Deberás proporcionar:')}
                    </p>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-1">
                      <li>{t('disputeRes.step1li1', 'Descripción detallada del problema')}</li>
                      <li>{t('disputeRes.step1li2', 'Evidencia relevante (capturas de pantalla, mensajes, archivos)')}</li>
                      <li>{t('disputeRes.step1li3', 'Resultado deseado')}</li>
                    </ul>
                    <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm italic">
                      {t('disputeRes.step1note', '⏱️ Los fondos del contrato se congelan automáticamente hasta resolver la disputa')}
                    </p>
                  </div>

                  <div className="border-l-4 border-purple-500 pl-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                      {t('disputeRes.step2Title', 'Paso 2: Notificación y Respuesta')}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-2">
                      <Trans i18nKey="disputeRes.step2p" components={{ b: <strong /> }} defaults="La otra parte es notificada y tiene <b>48 horas</b> para responder con:" />
                    </p>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-1">
                      <li>{t('disputeRes.step2li1', 'Su versión de los hechos')}</li>
                      <li>{t('disputeRes.step2li2', 'Evidencia que respalde su posición')}</li>
                      <li>{t('disputeRes.step2li3', 'Propuesta de solución (opcional)')}</li>
                    </ul>
                  </div>

                  <div className="border-l-4 border-amber-500 pl-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                      {t('disputeRes.step3Title', 'Paso 3: Revisión del Equipo de DOAPP')}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-2">
                      {t('disputeRes.step3p', 'Nuestro equipo de mediación revisa toda la evidencia presentada:')}
                    </p>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-1">
                      <li>{t('disputeRes.step3li1', 'Mensajes intercambiados en la plataforma')}</li>
                      <li>{t('disputeRes.step3li2', 'Archivos y entregables')}</li>
                      <li>{t('disputeRes.step3li3', 'Términos acordados en el contrato')}</li>
                      <li>{t('disputeRes.step3li4', 'Historial de comportamiento de ambas partes')}</li>
                    </ul>
                    <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm italic">
                      {t('disputeRes.step3note', '⏱️ Tiempo de revisión: 3-5 días hábiles')}
                    </p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                      {t('disputeRes.step4Title', 'Paso 4: Resolución')}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-2">
                      {t('disputeRes.step4p', 'El equipo de DOAPP emite una decisión que puede incluir:')}
                    </p>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-1">
                      <li><Trans i18nKey="disputeRes.step4li1" components={{ b: <strong /> }} defaults="<b>Liberación total:</b> El pago completo se libera al Doer" /></li>
                      <li><Trans i18nKey="disputeRes.step4li2" components={{ b: <strong /> }} defaults="<b>Reembolso total:</b> El monto completo se devuelve al cliente" /></li>
                      <li><Trans i18nKey="disputeRes.step4li3" components={{ b: <strong /> }} defaults="<b>Reembolso parcial:</b> Se divide el pago según corresponda" /></li>
                      <li><Trans i18nKey="disputeRes.step4li4" components={{ b: <strong /> }} defaults="<b>Extensión de plazo:</b> Se otorga más tiempo para completar el trabajo" /></li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s4Title', '4. Evidencia Requerida')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s4p', 'Para una resolución justa, es importante proporcionar evidencia clara. Ejemplos de evidencia válida:')}
                </p>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">{t('disputeRes.acceptableTitle', '✅ Evidencia Aceptable')}</h4>
                    <ul className="text-slate-600 dark:text-slate-300 text-sm space-y-1">
                      <li>{t('disputeRes.acc1', '• Capturas de pantalla de conversaciones')}</li>
                      <li>{t('disputeRes.acc2', '• Archivos entregables')}</li>
                      <li>{t('disputeRes.acc3', '• Registros de cambios solicitados')}</li>
                      <li>{t('disputeRes.acc4', '• Especificaciones del proyecto')}</li>
                      <li>{t('disputeRes.acc5', '• Emails o mensajes relevantes')}</li>
                      <li>{t('disputeRes.acc6', '• Comprobantes de entrega')}</li>
                    </ul>
                  </div>

                  <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">{t('disputeRes.invalidTitle', '❌ Evidencia No Válida')}</h4>
                    <ul className="text-slate-600 dark:text-slate-300 text-sm space-y-1">
                      <li>{t('disputeRes.inv1', '• Comunicaciones fuera de la plataforma sin verificar')}</li>
                      <li>{t('disputeRes.inv2', '• Capturas modificadas o editadas')}</li>
                      <li>{t('disputeRes.inv3', '• Testimonios de terceros no verificables')}</li>
                      <li>{t('disputeRes.inv4', '• Suposiciones sin respaldo')}</li>
                      <li>{t('disputeRes.inv5', '• Evidencia irrelevante al caso')}</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-r-lg">
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    <Trans i18nKey="disputeRes.s4warning" components={{ b: <strong /> }} defaults="<b>⚠️ Importante:</b> Toda la comunicación relacionada con el contrato debe realizarse a través de la plataforma DOAPP. Las comunicaciones fuera de la plataforma no pueden ser verificadas y tendrán menos peso en la resolución." />
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s5Title', '5. Criterios de Decisión')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s5p', 'Nuestro equipo basa sus decisiones en los siguientes criterios:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><Trans i18nKey="disputeRes.s5li1" components={{ b: <strong /> }} defaults="<b>Términos del contrato:</b> Cumplimiento de lo acordado originalmente" /></li>
                  <li><Trans i18nKey="disputeRes.s5li2" components={{ b: <strong /> }} defaults="<b>Calidad del trabajo:</b> Si cumple con estándares profesionales razonables" /></li>
                  <li><Trans i18nKey="disputeRes.s5li3" components={{ b: <strong /> }} defaults="<b>Comunicación:</b> Actitud colaborativa y profesional de ambas partes" /></li>
                  <li><Trans i18nKey="disputeRes.s5li4" components={{ b: <strong /> }} defaults="<b>Plazos:</b> Cumplimiento de fechas acordadas" /></li>
                  <li><Trans i18nKey="disputeRes.s5li5" components={{ b: <strong /> }} defaults="<b>Cambios solicitados:</b> Si estaban incluidos en el acuerdo original" /></li>
                  <li><Trans i18nKey="disputeRes.s5li6" components={{ b: <strong /> }} defaults="<b>Historial:</b> Comportamiento previo de las partes en la plataforma" /></li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s6Title', '6. Apelaciones')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  <Trans i18nKey="disputeRes.s6p" components={{ b: <strong /> }} defaults="Si no estás de acuerdo con la decisión inicial, puedes solicitar una apelación dentro de las <b>72 horas</b> posteriores a la resolución. Para apelar, debes:" />
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('disputeRes.s6li1', 'Proporcionar evidencia nueva no presentada anteriormente')}</li>
                  <li>{t('disputeRes.s6li2', 'Explicar claramente por qué consideras que la decisión fue incorrecta')}</li>
                  <li>{t('disputeRes.s6li3', 'Presentar argumentos sólidos y documentados')}</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s6note', 'Un miembro diferente del equipo revisará la apelación. La decisión de la apelación es final e inapelable.')}
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s7Title', '7. Consecuencias de Disputas Frecuentes')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s7p', 'Los usuarios con múltiples disputas pueden enfrentar:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><Trans i18nKey="disputeRes.s7li1" components={{ b: <strong /> }} defaults="<b>Primera disputa perdida:</b> Advertencia en el perfil" /></li>
                  <li><Trans i18nKey="disputeRes.s7li2" components={{ b: <strong /> }} defaults="<b>Segunda disputa perdida:</b> Suspensión temporal (7-30 días)" /></li>
                  <li><Trans i18nKey="disputeRes.s7li3" components={{ b: <strong /> }} defaults="<b>Tercera disputa perdida:</b> Revisión completa de la cuenta" /></li>
                  <li><Trans i18nKey="disputeRes.s7li4" components={{ b: <strong /> }} defaults="<b>Patrón de mal comportamiento:</b> Suspensión permanente" /></li>
                </ul>

                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-lg">
                  <p className="text-sm text-red-900 dark:text-red-100">
                    <strong><AlertCircle className="inline h-4 w-4 mr-1" />{t('disputeRes.fraudLabel', 'Fraude:')}</strong> {t('disputeRes.fraudText', 'Iniciar disputas falsas o malintencionadas resultará en la suspensión inmediata de la cuenta y posibles acciones legales.')}
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s8Title', '8. Prevención de Disputas')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s8p', 'Para minimizar la posibilidad de disputas, recomendamos:')}
                </p>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">{t('disputeRes.s8ClientsTitle', 'Para Clientes:')}</h4>
                    <ul className="text-slate-600 dark:text-slate-300 text-sm space-y-1">
                      <li>{t('disputeRes.s8c1', '✓ Describe claramente lo que necesitas')}</li>
                      <li>{t('disputeRes.s8c2', '✓ Proporciona ejemplos y referencias')}</li>
                      <li>{t('disputeRes.s8c3', '✓ Establece plazos realistas')}</li>
                      <li>{t('disputeRes.s8c4', '✓ Mantén comunicación regular')}</li>
                      <li>{t('disputeRes.s8c5', '✓ Revisa el progreso periódicamente')}</li>
                      <li>{t('disputeRes.s8c6', '✓ Proporciona feedback constructivo')}</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">{t('disputeRes.s8WorkersTitle', 'Para Profesionales:')}</h4>
                    <ul className="text-slate-600 dark:text-slate-300 text-sm space-y-1">
                      <li>{t('disputeRes.s8w1', '✓ Aclara todos los requisitos antes de empezar')}</li>
                      <li>{t('disputeRes.s8w2', '✓ Comunica el progreso regularmente')}</li>
                      <li>{t('disputeRes.s8w3', '✓ Entrega según lo acordado')}</li>
                      <li>{t('disputeRes.s8w4', '✓ Avisa inmediatamente de cualquier problema')}</li>
                      <li>{t('disputeRes.s8w5', '✓ Documenta cambios solicitados')}</li>
                      <li>{t('disputeRes.s8w6', '✓ Mantén profesionalismo siempre')}</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s9Title', '9. Mediación Alternativa')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s9p', 'En casos complejos, DOAPP puede sugerir mediación adicional antes de emitir una decisión final. Esto puede incluir:')}
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>{t('disputeRes.s9li1', 'Videoconferencia con ambas partes y un mediador')}</li>
                  <li>{t('disputeRes.s9li2', 'Período de negociación asistida')}</li>
                  <li>{t('disputeRes.s9li3', 'Revisión técnica por expertos externos (en casos específicos)')}</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  {t('disputeRes.s10Title', '10. Contacto para Disputas')}
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {t('disputeRes.s10p', 'Para iniciar una disputa o consultas sobre el proceso:')}
                </p>
                <ul className="text-slate-600 dark:text-slate-300 space-y-2">
                  <li><Trans i18nKey="disputeRes.s10li1" components={{ b: <strong /> }} defaults="<b>Desde la plataforma:</b> Botón &quot;Abrir Disputa&quot; en la página del contrato" /></li>
                  <li><Trans i18nKey="disputeRes.s10li2" components={{ b: <strong /> }} defaults="<b>Email:</b> disputes@doapp.com" /></li>
                  <li><Trans i18nKey="disputeRes.s10li3" components={{ b: <strong /> }} defaults="<b>Soporte:</b> Centro de ayuda en la plataforma" /></li>
                </ul>
              </section>

              <div className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
                <p className="text-sm text-sky-900 dark:text-sky-100 mb-2">
                  <Trans i18nKey="disputeRes.commitment" components={{ b: <strong /> }} defaults="<b>Compromiso de DOAPP:</b> Nos comprometemos a resolver todas las disputas de manera justa, imparcial y transparente. Nuestro objetivo es proteger los intereses legítimos de ambas partes y mantener la confianza en nuestra plataforma." />
                </p>
                <p className="text-sm text-sky-900 dark:text-sky-100">
                  {t('disputeRes.remember', 'Recuerda: La mejor disputa es la que se evita mediante buena comunicación y profesionalismo.')}
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
              {t('disputeRes.linkTerms', 'Términos y Condiciones')}
            </Link>
            <span className="text-slate-400">•</span>
            <Link
              to="/legal/privacidad"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t('disputeRes.linkPrivacy', 'Política de Privacidad')}
            </Link>
            <span className="text-slate-400">•</span>
            <Link
              to="/legal/cookies"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t('disputeRes.linkCookies', 'Política de Cookies')}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
