import { Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, Scale, AlertCircle } from "lucide-react";

export default function DisputeResolution() {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>Resolución de Disputas - DOAPP</title>
        <meta
          name="description"
          content="Proceso de resolución de disputas y mediación de DOAPP"
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
              <Scale className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                Resolución de Disputas
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              Última actualización: 7 de Noviembre de 2025
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  1. Introducción
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  En DOAPP, nos esforzamos por proporcionar un ambiente seguro y justo para todas las transacciones. Sin embargo, entendemos que pueden surgir desacuerdos entre las personas dentro de la app. Este documento establece el proceso formal de resolución de disputas.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Nuestro objetivo es resolver todos los conflictos de manera justa, transparente y eficiente, protegiendo los intereses de ambas partes.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  2. ¿Cuándo Iniciar una Disputa?
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Debes considerar iniciar una disputa en las siguientes situaciones:
                </p>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  Para Clientes:
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>El trabajo entregado no coincide con lo acordado en los detalles</li>
                  <li>El Doer no completó el trabajo según las especificaciones</li>
                  <li>El Doer incumplió los plazos sin justificación válida</li>
                  <li>La calidad del trabajo es significativamente inferior a lo esperado</li>
                  <li>El Doer no responde a comunicaciones durante un período prolongado</li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  Para Profesionales:
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>El cliente no aprueba el trabajo completado sin motivo válido</li>
                  <li>El cliente solicita cambios no incluidos en el acuerdo original</li>
                  <li>El cliente no proporciona información necesaria para completar el trabajo</li>
                  <li>El cliente rechaza injustificadamente el trabajo entregado correctamente</li>
                </ul>

                <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-r-lg mb-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>💡 Recomendación:</strong> Antes de iniciar una disputa formal, te recomendamos intentar resolver el problema directamente con la otra parte a través de la mensajería de la plataforma. Muchos conflictos se resuelven mediante comunicación directa.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  3. Proceso de Resolución de Disputas
                </h2>

                <div className="space-y-6">
                  <div className="border-l-4 border-sky-500 pl-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                      Paso 1: Apertura de Disputa
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-2">
                      Cualquier parte puede iniciar una disputa desde la página del contrato haciendo clic en "Abrir Disputa". Deberás proporcionar:
                    </p>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-1">
                      <li>Descripción detallada del problema</li>
                      <li>Evidencia relevante (capturas de pantalla, mensajes, archivos)</li>
                      <li>Resultado deseado</li>
                    </ul>
                    <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm italic">
                      ⏱️ Los fondos del contrato se congelan automáticamente hasta resolver la disputa
                    </p>
                  </div>

                  <div className="border-l-4 border-purple-500 pl-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                      Paso 2: Notificación y Respuesta
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-2">
                      La otra parte es notificada y tiene <strong>48 horas</strong> para responder con:
                    </p>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-1">
                      <li>Su versión de los hechos</li>
                      <li>Evidencia que respalde su posición</li>
                      <li>Propuesta de solución (opcional)</li>
                    </ul>
                  </div>

                  <div className="border-l-4 border-amber-500 pl-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                      Paso 3: Revisión del Equipo de DOAPP
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-2">
                      Nuestro equipo de mediación revisa toda la evidencia presentada:
                    </p>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-1">
                      <li>Mensajes intercambiados en la plataforma</li>
                      <li>Archivos y entregables</li>
                      <li>Términos acordados en el contrato</li>
                      <li>Historial de comportamiento de ambas partes</li>
                    </ul>
                    <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm italic">
                      ⏱️ Tiempo de revisión: 3-5 días hábiles
                    </p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                      Paso 4: Resolución
                    </h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-2">
                      El equipo de DOAPP emite una decisión que puede incluir:
                    </p>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-1">
                      <li><strong>Liberación total:</strong> El pago completo se libera al Doer</li>
                      <li><strong>Reembolso total:</strong> El monto completo se devuelve al cliente</li>
                      <li><strong>Reembolso parcial:</strong> Se divide el pago según corresponda</li>
                      <li><strong>Extensión de plazo:</strong> Se otorga más tiempo para completar el trabajo</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  4. Evidencia Requerida
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Para una resolución justa, es importante proporcionar evidencia clara. Ejemplos de evidencia válida:
                </p>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">✅ Evidencia Aceptable</h4>
                    <ul className="text-slate-600 dark:text-slate-300 text-sm space-y-1">
                      <li>• Capturas de pantalla de conversaciones</li>
                      <li>• Archivos entregables</li>
                      <li>• Registros de cambios solicitados</li>
                      <li>• Especificaciones del proyecto</li>
                      <li>• Emails o mensajes relevantes</li>
                      <li>• Comprobantes de entrega</li>
                    </ul>
                  </div>

                  <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">❌ Evidencia No Válida</h4>
                    <ul className="text-slate-600 dark:text-slate-300 text-sm space-y-1">
                      <li>• Comunicaciones fuera de la plataforma sin verificar</li>
                      <li>• Capturas modificadas o editadas</li>
                      <li>• Testimonios de terceros no verificables</li>
                      <li>• Suposiciones sin respaldo</li>
                      <li>• Evidencia irrelevante al caso</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-r-lg">
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    <strong>⚠️ Importante:</strong> Toda la comunicación relacionada con el contrato debe realizarse a través de la plataforma DOAPP. Las comunicaciones fuera de la plataforma no pueden ser verificadas y tendrán menos peso en la resolución.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  5. Criterios de Decisión
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Nuestro equipo basa sus decisiones en los siguientes criterios:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Términos del contrato:</strong> Cumplimiento de lo acordado originalmente</li>
                  <li><strong>Calidad del trabajo:</strong> Si cumple con estándares profesionales razonables</li>
                  <li><strong>Comunicación:</strong> Actitud colaborativa y profesional de ambas partes</li>
                  <li><strong>Plazos:</strong> Cumplimiento de fechas acordadas</li>
                  <li><strong>Cambios solicitados:</strong> Si estaban incluidos en el acuerdo original</li>
                  <li><strong>Historial:</strong> Comportamiento previo de las partes en la plataforma</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  6. Apelaciones
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Si no estás de acuerdo con la decisión inicial, puedes solicitar una apelación dentro de las <strong>72 horas</strong> posteriores a la resolución. Para apelar, debes:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Proporcionar evidencia nueva no presentada anteriormente</li>
                  <li>Explicar claramente por qué consideras que la decisión fue incorrecta</li>
                  <li>Presentar argumentos sólidos y documentados</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Un miembro diferente del equipo revisará la apelación. La decisión de la apelación es final e inapelable.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  7. Consecuencias de Disputas Frecuentes
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Los usuarios con múltiples disputas pueden enfrentar:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Primera disputa perdida:</strong> Advertencia en el perfil</li>
                  <li><strong>Segunda disputa perdida:</strong> Suspensión temporal (7-30 días)</li>
                  <li><strong>Tercera disputa perdida:</strong> Revisión completa de la cuenta</li>
                  <li><strong>Patrón de mal comportamiento:</strong> Suspensión permanente</li>
                </ul>

                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-lg">
                  <p className="text-sm text-red-900 dark:text-red-100">
                    <strong><AlertCircle className="inline h-4 w-4 mr-1" />Fraude:</strong> Iniciar disputas falsas o malintencionadas resultará en la suspensión inmediata de la cuenta y posibles acciones legales.
                  </p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  8. Prevención de Disputas
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Para minimizar la posibilidad de disputas, recomendamos:
                </p>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Para Clientes:</h4>
                    <ul className="text-slate-600 dark:text-slate-300 text-sm space-y-1">
                      <li>✓ Describe claramente lo que necesitas</li>
                      <li>✓ Proporciona ejemplos y referencias</li>
                      <li>✓ Establece plazos realistas</li>
                      <li>✓ Mantén comunicación regular</li>
                      <li>✓ Revisa el progreso periódicamente</li>
                      <li>✓ Proporciona feedback constructivo</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Para Profesionales:</h4>
                    <ul className="text-slate-600 dark:text-slate-300 text-sm space-y-1">
                      <li>✓ Aclara todos los requisitos antes de empezar</li>
                      <li>✓ Comunica el progreso regularmente</li>
                      <li>✓ Entrega según lo acordado</li>
                      <li>✓ Avisa inmediatamente de cualquier problema</li>
                      <li>✓ Documenta cambios solicitados</li>
                      <li>✓ Mantén profesionalismo siempre</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  9. Mediación Alternativa
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  En casos complejos, DOAPP puede sugerir mediación adicional antes de emitir una decisión final. Esto puede incluir:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Videoconferencia con ambas partes y un mediador</li>
                  <li>Período de negociación asistida</li>
                  <li>Revisión técnica por expertos externos (en casos específicos)</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  10. Contacto para Disputas
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Para iniciar una disputa o consultas sobre el proceso:
                </p>
                <ul className="text-slate-600 dark:text-slate-300 space-y-2">
                  <li><strong>Desde la plataforma:</strong> Botón "Abrir Disputa" en la página del contrato</li>
                  <li><strong>Email:</strong> disputes@doapp.com</li>
                  <li><strong>Soporte:</strong> Centro de ayuda en la plataforma</li>
                </ul>
              </section>

              <div className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
                <p className="text-sm text-sky-900 dark:text-sky-100 mb-2">
                  <strong>Compromiso de DOAPP:</strong> Nos comprometemos a resolver todas las disputas de manera justa, imparcial y transparente. Nuestro objetivo es proteger los intereses legítimos de ambas partes y mantener la confianza en nuestra plataforma.
                </p>
                <p className="text-sm text-sky-900 dark:text-sky-100">
                  Recuerda: La mejor disputa es la que se evita mediante buena comunicación y profesionalismo.
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
              to="/legal/cookies"
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              Política de Cookies
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
