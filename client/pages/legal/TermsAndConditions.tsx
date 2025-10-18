import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, FileText } from "lucide-react";

export default function TermsAndConditions() {
  return (
    <>
      <Helmet>
        <title>Términos y Condiciones - Doers</title>
        <meta
          name="description"
          content="Términos y condiciones de uso de la plataforma Doers"
        />
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Navegación */}
          <div className="flex items-center justify-between mb-8">
            <Link
              to="/register"
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
              <FileText className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                Términos y Condiciones
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              Última actualización: 18 de Octubre de 2025
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  1. Aceptación de los Términos
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Al acceder y utilizar Doers ("la Plataforma"), aceptas estar legalmente vinculado por estos
                  Términos y Condiciones. Si no estás de acuerdo con alguna parte de estos términos, no debes
                  utilizar nuestros servicios.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  2. Descripción del Servicio
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Doers es una plataforma que conecta a clientes que necesitan servicios con profesionales
                  ("Doers") que pueden realizarlos. Facilitamos:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>La publicación y búsqueda de trabajos</li>
                  <li>Sistemas de pago seguros con garantía de depósito (escrow)</li>
                  <li>Comunicación entre partes</li>
                  <li>Sistema de calificaciones y reseñas</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  3. Registro y Cuenta
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Para utilizar la Plataforma debes:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Ser mayor de 18 años</li>
                  <li>Proporcionar información veraz y actualizada</li>
                  <li>Mantener la seguridad de tu cuenta</li>
                  <li>Notificar inmediatamente cualquier uso no autorizado</li>
                  <li>Aceptar responsabilidad por todas las actividades realizadas desde tu cuenta</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  4. Pagos y Comisiones
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Doers cobra una comisión del 5% sobre el monto total de cada transacción completada. Esta
                  comisión cubre:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Servicio de garantía de pago (escrow)</li>
                  <li>Procesamiento de pagos seguros</li>
                  <li>Soporte y mediación en caso de disputas</li>
                  <li>Mantenimiento de la plataforma</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  5. Garantía de Pago (Escrow)
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  El cliente deposita el pago al inicio del contrato. Los fondos se mantienen en garantía
                  hasta que:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>El trabajo sea completado según lo acordado</li>
                  <li>El cliente apruebe la entrega</li>
                  <li>En caso de disputa, se resuelva mediante mediación</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  6. Responsabilidades
                </h2>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  6.1 De los Clientes
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Proporcionar información clara sobre el trabajo requerido</li>
                  <li>Pagar el monto acordado</li>
                  <li>Aprobar o rechazar el trabajo de manera oportuna</li>
                </ul>

                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                  6.2 De los Doers
                </h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Completar el trabajo según lo acordado</li>
                  <li>Cumplir con los plazos establecidos</li>
                  <li>Mantener comunicación profesional</li>
                  <li>Entregar trabajo de calidad</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  7. Prohibiciones
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Está prohibido:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Realizar transacciones fuera de la plataforma</li>
                  <li>Proporcionar información falsa o engañosa</li>
                  <li>Acosar, amenazar o discriminar a otros usuarios</li>
                  <li>Publicar contenido ilegal, ofensivo o inapropiado</li>
                  <li>Intentar eludir el sistema de comisiones</li>
                  <li>Crear múltiples cuentas sin autorización</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  8. Resolución de Disputas
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  En caso de conflicto, Doers actuará como mediador. Nos reservamos el derecho de:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Solicitar evidencia a ambas partes</li>
                  <li>Retener fondos hasta resolver la disputa</li>
                  <li>Tomar decisiones finales sobre la distribución de pagos</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  9. Limitación de Responsabilidad
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Doers actúa como intermediario. No somos responsables por:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>La calidad del trabajo realizado</li>
                  <li>Daños o pérdidas derivadas de los servicios</li>
                  <li>Incumplimientos de contrato entre usuarios</li>
                  <li>Información inexacta proporcionada por los usuarios</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  10. Programa de Referidos
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Al invitar a un amigo con tu código de referido:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Tu amigo debe registrarse usando tu código único</li>
                  <li>Debe completar su primer contrato como cliente o Doer</li>
                  <li>Recibirás un contrato libre de comisión (5% de descuento) una vez que se complete el primer contrato de tu referido</li>
                  <li>El beneficio se aplica automáticamente a tu próximo contrato</li>
                  <li>No hay límite en la cantidad de referidos</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  11. Modificaciones
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios
                  serán efectivos al ser publicados en la plataforma. El uso continuado del servicio implica
                  la aceptación de los nuevos términos.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  12. Terminación
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Podemos suspender o terminar tu cuenta si:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>Violas estos términos y condiciones</li>
                  <li>Realizas actividades fraudulentas</li>
                  <li>Recibes múltiples quejas verificadas</li>
                  <li>Por cualquier otra razón que consideremos apropiada</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  13. Ley Aplicable
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Estos términos se rigen por las leyes de Argentina. Cualquier disputa será resuelta en los
                  tribunales de la Ciudad Autónoma de Buenos Aires.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  14. Contacto
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  Para preguntas sobre estos términos, contáctanos en:
                </p>
                <ul className="text-slate-600 dark:text-slate-300 space-y-2">
                  <li>Email: legal@doers.com</li>
                  <li>WhatsApp: +54 9 11 XXXX-XXXX</li>
                </ul>
              </section>

              <div className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
                <p className="text-sm text-sky-900 dark:text-sky-100">
                  <strong>Nota importante:</strong> Al registrarte y utilizar Doers, confirmas que has leído,
                  entendido y aceptado estos Términos y Condiciones en su totalidad.
                </p>
              </div>
            </div>
          </div>

          {/* Footer con enlaces */}
          <div className="mt-8 text-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 transition-colors"
            >
              Acepto los términos, continuar con el registro
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
