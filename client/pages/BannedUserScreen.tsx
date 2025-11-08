import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Ban, Mail, Send, AlertCircle } from "lucide-react";

const SUPPORT_EMAIL = "support@doapp.com.ar";

export default function BannedUserScreen() {
  const { user, logout } = useAuth();
  const [appealText, setAppealText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!appealText.trim()) {
      alert("Por favor ingresa tu reclamo");
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem("token");

      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: "Apelación de baneo - Solicitud de revisión",
          message: appealText,
          priority: "high",
          category: "account"
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setAppealSubmitted(true);
        setAppealText("");
      } else {
        throw new Error(data.message || "Error al enviar la apelación");
      }
    } catch (error: any) {
      console.error("Error submitting appeal:", error);
      alert(error.message || "Error al enviar la apelación. Por favor contacta directamente a soporte.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl p-8 border-b-4 border-red-500">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full">
              <Ban className="w-16 h-16 text-red-600 dark:text-red-400" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">
            Cuenta Suspendida
          </h1>

          <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
            Tu cuenta ha sido suspendida y no puedes acceder a la plataforma en este momento.
          </p>

          {/* Ban Details */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 dark:text-red-200 mb-1">
                  Motivo de la suspensión:
                </h3>
                <p className="text-red-800 dark:text-red-300">
                  {user?.banReason || "No se especificó un motivo"}
                </p>
                {user?.bannedAt && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                    Fecha: {new Date(user.bannedAt).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
                {user?.banExpiresAt && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Expira: {new Date(user.banExpiresAt).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Appeal Form */}
        <div className="bg-white dark:bg-gray-800 rounded-b-2xl shadow-2xl p-8">
          {!appealSubmitted ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Solicitar Revisión
              </h2>

              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Si crees que esta suspensión es un error o deseas apelar esta decisión,
                por favor completa el siguiente formulario. Nuestro equipo de soporte
                revisará tu caso.
              </p>

              <form onSubmit={handleSubmitAppeal} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Describe tu situación
                  </label>
                  <textarea
                    value={appealText}
                    onChange={(e) => setAppealText(e.target.value)}
                    placeholder="Explica por qué consideras que esta suspensión debería ser revisada..."
                    rows={6}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg"
                >
                  <Send className="w-5 h-5" />
                  {isSubmitting ? "Enviando..." : "Enviar Apelación"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Send className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Apelación Enviada
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Tu apelación ha sido enviada exitosamente. Nuestro equipo de soporte
                la revisará y te contactará por email.
              </p>
            </div>
          )}

          {/* Support Contact */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
              <Mail className="w-5 h-5" />
              <span className="text-sm">
                ¿Necesitas ayuda? Contacta a soporte:
              </span>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="block text-center mt-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>

          {/* Logout Button */}
          <div className="mt-6">
            <button
              onClick={logout}
              className="w-full px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
