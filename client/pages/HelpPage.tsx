import { Link } from "react-router-dom";
import { usePermissions } from "../hooks/usePermissions";
import { HelpCircle, AlertCircle, FileText, MessageCircle, BookOpen, Shield } from "lucide-react";

export default function HelpPage() {
  const { hasPermission, PERMISSIONS } = usePermissions();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Centro de Ayuda y Soporte
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            ¿Necesitas ayuda? Selecciona una opción para obtener asistencia
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {hasPermission(PERMISSIONS.TICKET_CREATE) && (
            <Link
              to="/tickets/new"
              className="bg-white dark:bg-gray-800 rounded-lg border-2 border-blue-200 dark:border-blue-800 p-6 hover:border-blue-400 dark:hover:border-blue-600 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition">
                  <HelpCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Crear Ticket de Soporte
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Reporta un problema técnico, bug o solicita ayuda general de nuestro equipo de soporte
                  </p>
                </div>
              </div>
            </Link>
          )}

          {hasPermission(PERMISSIONS.DISPUTE_CREATE) && (
            <Link
              to="/disputes/new"
              className="bg-white dark:bg-gray-800 rounded-lg border-2 border-orange-200 dark:border-orange-800 p-6 hover:border-orange-400 dark:hover:border-orange-600 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg group-hover:bg-orange-200 dark:group-hover:bg-orange-900/50 transition">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Reportar una Disputa
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Tienes un problema con un contrato? Reporta una disputa con evidencia (fotos, videos, documentos)
                  </p>
                </div>
              </div>
            </Link>
          )}

          <Link
            to="/contact"
            className="bg-white dark:bg-gray-800 rounded-lg border-2 border-green-200 dark:border-green-800 p-6 hover:border-green-400 dark:hover:border-green-600 transition-colors group"
          >
            <div className="flex items-start gap-4">
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition">
                <MessageCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Contacto Directo
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Envía un mensaje directo a nuestro equipo para consultas generales
                </p>
              </div>
            </div>
          </Link>

          <Link
            to="/contracts"
            className="bg-white dark:bg-gray-800 rounded-lg border-2 border-purple-200 dark:border-purple-800 p-6 hover:border-purple-400 dark:hover:border-purple-600 transition-colors group"
          >
            <div className="flex items-start gap-4">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition">
                <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Ver Mis Contratos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Reporta problemas directamente desde un contrato específico
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* FAQ Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Preguntas Frecuentes
            </h2>
          </div>

          <div className="space-y-4">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                <span className="font-medium text-gray-900 dark:text-white">
                  ¿Cuál es la diferencia entre un ticket y una disputa?
                </span>
                <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="p-4 text-gray-600 dark:text-gray-400 text-sm">
                <p><strong>Tickets</strong> son para problemas técnicos, bugs, preguntas generales o solicitudes de soporte que no involucran dinero.</p>
                <p className="mt-2"><strong>Disputas</strong> son para problemas relacionados con contratos específicos donde hay dinero en juego (escrow). Requieren evidencia y pueden resultar en reembolsos o liberación de pagos.</p>
              </div>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                <span className="font-medium text-gray-900 dark:text-white">
                  ¿Cuánto tiempo tarda en resolverse un ticket?
                </span>
                <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="p-4 text-gray-600 dark:text-gray-400 text-sm">
                <p>Los tickets generalmente se responden en 24-48 horas hábiles. Los tickets urgentes tienen prioridad y pueden responderse en menos tiempo.</p>
              </div>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                <span className="font-medium text-gray-900 dark:text-white">
                  ¿Qué evidencia debo incluir en una disputa?
                </span>
                <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="p-4 text-gray-600 dark:text-gray-400 text-sm">
                <p>Para disputas, es importante adjuntar toda la evidencia posible:</p>
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>Capturas de pantalla de conversaciones</li>
                  <li>Fotos o videos del trabajo realizado</li>
                  <li>Documentos relevantes (contratos, acuerdos, etc.)</li>
                  <li>Cualquier otra prueba que respalde tu caso</li>
                </ul>
              </div>
            </details>

            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                <span className="font-medium text-gray-900 dark:text-white">
                  ¿Puedo cancelar un contrato?
                </span>
                <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="p-4 text-gray-600 dark:text-gray-400 text-sm">
                <p>Sí, puedes cancelar un contrato hasta 2 días antes de la fecha de inicio sin penalización. Ambas partes deben estar de acuerdo con la cancelación.</p>
              </div>
            </details>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-start gap-4">
            <Shield className="h-8 w-8 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold mb-2">
                ¿Necesitas ayuda inmediata?
              </h3>
              <p className="text-sky-50 mb-4">
                Nuestro equipo está disponible para ayudarte. Contáctanos a través de cualquiera de nuestros canales de soporte.
              </p>
              <Link
                to="/contact"
                className="inline-block bg-white text-sky-600 px-6 py-2 rounded-lg font-medium hover:bg-sky-50 transition"
              >
                Contactar Soporte
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
