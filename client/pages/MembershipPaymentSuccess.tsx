import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Crown, TrendingUp, Shield, BarChart3, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

interface PaymentConfirmation {
  status: "processing" | "confirmed" | "error";
  message?: string;
}

export default function MembershipPaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  // Get initial state from URL params
  const getInitialState = (): PaymentConfirmation => {
    const status = searchParams.get("status");
    const paymentId = searchParams.get("payment_id");

    if (status === "approved" && paymentId) {
      return { status: "processing" };
    } else if (status === "pending") {
      return {
        status: "processing",
        message: "Tu pago está siendo procesado. Te notificaremos cuando se complete."
      };
    } else {
      return {
        status: "error",
        message: "No se pudo confirmar el pago. Por favor contacta a soporte si ya realizaste el pago."
      };
    }
  };

  const [confirmation, setConfirmation] = useState<PaymentConfirmation>(getInitialState);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    // ========================================
    // NUEVO: Parámetros de MercadoPago
    // ========================================
    const paymentId = searchParams.get("payment_id");
    const status = searchParams.get("status");
    const preferenceId = searchParams.get("preference_id");
    const plan = searchParams.get("plan");

    console.log("🔍 Membership Payment Success - MercadoPago params:", {
      paymentId,
      status,
      preferenceId,
      plan
    });

    // Si es aprobado, activar la membresía automáticamente
    if (status === "approved" && paymentId) {
      const confirmPayment = async () => {
        try {
          console.log("📡 Activating membership with MercadoPago payment:", paymentId);

          const authToken = localStorage.getItem("token");
          console.log("🔑 Auth token exists:", !!authToken);

          // Refrescar usuario para obtener la membresía actualizada
          // La membresía se activa automáticamente desde el webhook de MercadoPago
          console.log("🔄 Refrescando datos del usuario para actualizar membresía...");
          await refreshUser();
          console.log("✅ Usuario refrescado con nueva membresía");

          setConfirmation({ status: "confirmed" });
        } catch (error: any) {
          console.error("❌ Error activating membership:", error);
          setConfirmation({ status: "error", message: error.message || "Error al activar la membresía" });
        }
      };

      confirmPayment();
    }
    // Other cases (pending, error) are handled by initial state

    // ========================================
    // LEGACY: Código PayPal (comentado)
    // ========================================
    /*
    const token = searchParams.get("token");
    const payerId = searchParams.get("PayerID");

    if (!token || !payerId) {
      console.error("❌ Missing payment parameters");
      setConfirmation({ status: "error", message: "Parámetros de pago faltantes" });
      return;
    }

    const confirmPayment = async () => {
      try {
        console.log("📡 Capturing PayPal order:", token);
        const authToken = localStorage.getItem("token");

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/payments/capture-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken || ""}`
          },
          credentials: "include",
          body: JSON.stringify({ orderId: token }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Error al capturar el pago");
        }

        const data = await response.json();

        if (data.data?.membershipActivated) {
          await refreshUser();
        }

        setConfirmation({ status: "confirmed" });
      } catch (error: any) {
        setConfirmation({ status: "error", message: error.message || "Error al procesar el pago" });
      }
    };

    confirmPayment();
    */
  }, [searchParams, refreshUser]);

  // Countdown for auto-redirect
  useEffect(() => {
    if (confirmation.status === "confirmed" && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      navigate("/pro/usage");
    }
  }, [confirmation.status, countdown, navigate]);

  if (confirmation.status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 dark:bg-red-900 rounded-full mb-6">
              <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Error en el Pago
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mb-8">
              {confirmation.message || "Hubo un problema al procesar tu pago de membresía. Por favor, intenta nuevamente."}
            </p>
            <button
              onClick={() => navigate("/membership")}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Volver a Membresías
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (confirmation.status === "processing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-sky-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-purple-100 to-sky-100 dark:from-purple-900 dark:to-sky-900 rounded-full mb-6">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 dark:border-purple-400"></div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Procesando Pago de Membresía...
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Estamos confirmando tu pago con MercadoPago y activando tu membresía PRO.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-sky-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header con animación de éxito y gradiente PRO */}
        <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-sky-600 p-8 md:p-12 text-white text-center relative overflow-hidden">
          {/* Estrellas decorativas */}
          <div className="absolute top-4 left-4 animate-pulse">
            <Sparkles className="w-8 h-8 text-yellow-300" />
          </div>
          <div className="absolute top-4 right-4 animate-pulse delay-150">
            <Sparkles className="w-6 h-6 text-yellow-300" />
          </div>
          <div className="absolute bottom-4 left-1/4 animate-pulse delay-300">
            <Sparkles className="w-5 h-5 text-yellow-300" />
          </div>

          <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-full mb-6 animate-bounce">
            <Crown className="w-16 h-16 text-yellow-500" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            ¡Bienvenido a PRO! 🎉
          </h1>
          <p className="text-xl text-purple-100">
            Tu membresía PRO ha sido activada exitosamente
          </p>
        </div>

        {/* Información del pago */}
        <div className="p-8 md:p-12">
          <div className="bg-gradient-to-r from-purple-50 to-sky-50 dark:from-purple-900/20 dark:to-sky-900/20 rounded-xl p-6 mb-8 border border-purple-200 dark:border-purple-800">
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-300 mb-2">Tu inversión mensual</p>
              <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-sky-600">
                €5.99
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Renovación automática mensual
              </p>
            </div>
          </div>

          {/* Beneficios desbloqueados */}
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
              🚀 Ya tenés acceso a todos estos beneficios:
            </h2>

            {/* Beneficio 1 */}
            <div className="flex gap-4 bg-white dark:bg-gray-700 p-4 rounded-xl shadow-md border border-gray-100 dark:border-gray-600">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900 dark:to-emerald-900 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  ⚡ Comisión reducida al 2%
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Ahorrá un 4% en cada transacción. Tus primeros 3 contratos mensuales solo tendrán 2% de comisión.
                </p>
              </div>
            </div>

            {/* Beneficio 2 */}
            <div className="flex gap-4 bg-white dark:bg-gray-700 p-4 rounded-xl shadow-md border border-gray-100 dark:border-gray-600">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 rounded-full flex items-center justify-center">
                  <Crown className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  👑 Badge PRO Dorado
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Tu perfil ahora muestra un badge dorado. Destacá como profesional verificado.
                </p>
              </div>
            </div>

            {/* Beneficio 3 */}
            <div className="flex gap-4 bg-white dark:bg-gray-700 p-4 rounded-xl shadow-md border border-gray-100 dark:border-gray-600">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900 dark:to-sky-900 rounded-full flex items-center justify-center">
                  <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  🔍 Prioridad en Búsquedas
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Aparecés primero cuando clientes busquen servicios. Más visibilidad = más trabajos.
                </p>
              </div>
            </div>

            {/* Beneficio 4 */}
            <div className="flex gap-4 bg-white dark:bg-gray-700 p-4 rounded-xl shadow-md border border-gray-100 dark:border-gray-600">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900 dark:to-orange-900 rounded-full flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  📊 Estadísticas Avanzadas
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Accedé a analytics detallados de tus contratos, aplicaciones y balances.
                </p>
              </div>
            </div>
          </div>

          {/* Bonus contract info */}
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 mb-8">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <Sparkles className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
                  🎁 Bonus Mensual Disponible
                </h4>
                <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                  Completá 3 contratos este mes y ganás <strong>1 contrato gratis</strong> con comisión 0%.
                  ¡Aprovechá al máximo tu membresía!
                </p>
              </div>
            </div>
          </div>

          {/* Próximos pasos */}
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-6 mb-8">
            <h3 className="font-bold text-sky-900 dark:text-sky-300 mb-4 text-lg">
              📋 Próximos Pasos
            </h3>
            <ul className="space-y-3 text-sky-800 dark:text-sky-300 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Visitá tu Dashboard PRO</strong> para ver tu uso mensual de contratos
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Empezá a publicar trabajos</strong> con solo 2% de comisión
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Aplicá a más trabajos</strong> y destacá con tu badge PRO
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Monitoreá tus estadísticas</strong> en el panel de analytics
                </span>
              </li>
            </ul>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => navigate("/pro/usage")}
              className="flex-1 bg-gradient-to-r from-purple-600 to-sky-600 hover:from-purple-700 hover:to-sky-700 text-white font-semibold px-6 py-4 rounded-xl transition-all flex items-center justify-center gap-2 group shadow-lg"
            >
              <Crown className="w-5 h-5" />
              Ver Dashboard PRO
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate("/")}
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold px-6 py-4 rounded-xl transition-colors"
            >
              Explorar Trabajos
            </button>
          </div>

          {/* Auto-redirect countdown */}
          <div className="text-center mt-8 text-sm text-gray-500 dark:text-gray-400">
            Redirigiendo a tu Dashboard PRO en {countdown} segundos...
          </div>
        </div>
      </div>
    </div>
  );
}
