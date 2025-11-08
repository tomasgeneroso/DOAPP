import { useNavigate } from "react-router-dom";
import { XCircle, ArrowLeft, HelpCircle } from "lucide-react";

export default function PaymentCancel() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-8 md:p-12 text-white text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-full mb-6">
            <XCircle className="w-16 h-16 text-amber-500" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Pago Cancelado
          </h1>
          <p className="text-xl text-amber-100">
            No se procesó ningún cargo
          </p>
        </div>

        {/* Content */}
        <div className="p-8 md:p-12">
          <div className="text-center mb-8">
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
              Cancelaste el proceso de pago. Tu trabajo no ha sido publicado y no se realizó ningún cargo a tu cuenta.
            </p>
          </div>

          {/* Opciones */}
          <div className="space-y-4 mb-8">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-500" />
                ¿Qué puedes hacer ahora?
              </h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  <span>Intentar nuevamente con otro método de pago</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  <span>Revisar los detalles de tu trabajo antes de publicar</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  <span>Contactar con soporte si tuviste algún problema</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => window.history.back()}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2 group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              Intentar Nuevamente
            </button>
            <button
              onClick={() => window.location.href = "/"}
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold px-6 py-4 rounded-xl transition-colors"
            >
              Ver Trabajos
            </button>
          </div>

          {/* Ayuda */}
          <div className="text-center mt-8">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ¿Necesitas ayuda?{" "}
              <button
                onClick={() => navigate("/help")}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Contacta con soporte
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
