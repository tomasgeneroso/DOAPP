import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Clock, Users, FileText, ArrowRight, Crown, BarChart3, Shield, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

interface PaymentConfirmation {
  token: string;
  payerId: string;
  status: "processing" | "confirmed" | "error";
  contractId?: string;
  jobId?: string;
  amount?: number;
  message?: string;
}

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const paymentType = searchParams.get("type") || "contract"; // 'membership' or 'contract'
  const membershipPlan = searchParams.get("plan") || "monthly"; // 'monthly', 'quarterly', 'super_pro'

  const [confirmation, setConfirmation] = useState<PaymentConfirmation>({
    token: searchParams.get("token") || "",
    payerId: searchParams.get("PayerID") || "",
    status: "processing",
  });
  const [countdown, setCountdown] = useState(15);
  const [isMounted, setIsMounted] = useState(false);

  // Log on mount to verify component is rendering
  useEffect(() => {
    console.log("🎬 PaymentSuccess component mounted");
    console.log("🌐 Current URL:", window.location.href);
    console.log("📍 Pathname:", window.location.pathname);
    console.log("🔗 Search:", window.location.search);
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // MercadoPago parameters: collection_id, collection_status, payment_id, status, preference_id
    // PayPal parameters (legacy): token, PayerID
    const collection_id = searchParams.get("collection_id");
    const payment_id = searchParams.get("payment_id");
    const preference_id = searchParams.get("preference_id");
    const status = searchParams.get("status");
    const collection_status = searchParams.get("collection_status");

    // Legacy PayPal (commented)
    // const token = searchParams.get("token");
    // const payerId = searchParams.get("PayerID");

    console.log("🔍 Payment Success - MercadoPago params:", {
      collection_id,
      payment_id,
      preference_id,
      status,
      collection_status,
      type: paymentType,
      plan: membershipPlan
    });
    console.log("🔍 All search params:", Object.fromEntries(searchParams));
    console.log("🔍 URL keys:", Array.from(searchParams.keys()));

    // Check for required MercadoPago parameters
    if (!collection_id && !payment_id && !preference_id) {
      console.error("❌ Missing MercadoPago payment parameters");
      console.error("❌ collection_id:", collection_id);
      console.error("❌ payment_id:", payment_id);
      console.error("❌ preference_id:", preference_id);
      console.error("❌ Full URL:", window.location.href);
      console.error("❌ Search params:", window.location.search);

      setConfirmation(prev => ({
        ...prev,
        status: "error",
        message: `No se encontraron parámetros de pago en la URL.

Esta página debe ser accedida desde MercadoPago después de completar un pago.

URL actual: ${window.location.href}

Si acabas de realizar un pago y ves este error, por favor contacta a soporte.`
      }));
      return;
    }

    // Check payment status from MercadoPago
    if (status === "null" || status === "failure" || collection_status === "null") {
      console.error("❌ Payment failed or was cancelled");
      setConfirmation(prev => ({
        ...prev,
        status: "error",
        message: "El pago fue rechazado o cancelado."
      }));
      return;
    }

    // Capture/Verify the MercadoPago payment
    const confirmPayment = async () => {
      try {
        console.log("📡 Verifying MercadoPago payment:", payment_id || collection_id);

        const authToken = localStorage.getItem("token");
        console.log("🔑 Auth token exists:", !!authToken);

        const response = await fetch(`${import.meta.env.VITE_API_URL}/payments/capture-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken || ""}`
          },
          credentials: "include",
          body: JSON.stringify({
            paymentId: payment_id || collection_id,
            collection_id,
            preference_id,
          }),
        });

        console.log("📥 Capture response status:", response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error("❌ Capture failed:", errorData);
          throw new Error(errorData.message || "Error al capturar el pago");
        }

        const data = await response.json();
        console.log("✅ Payment captured successfully:", data);

        // Refrescar usuario para obtener la membresía actualizada
        if (paymentType === 'membership' || data.data?.membershipActivated) {
          console.log("🔄 Refrescando datos del usuario para actualizar membresía...");
          await refreshUser();
          console.log("✅ Usuario refrescado con nueva membresía");
        }

        setConfirmation({
          token: payment_id || collection_id || "",
          payerId: preference_id || "",
          status: "confirmed",
          contractId: data.data?.contractId,
          jobId: data.data?.jobId,
          amount: data.data?.amount || data.amount || data.data?.payment?.amount || 0,
        });
      } catch (error: any) {
        console.error("❌❌❌ Payment capture error:", error);
        console.error("❌ Error details:", {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });

        // Set error state instead of pretending it succeeded
        setConfirmation({
          token: payment_id || collection_id || "",
          payerId: preference_id || "",
          status: "error",
          message: error.response?.data?.message || error.message || "Error al capturar el pago",
        });
      }
    };

    confirmPayment();
  }, [searchParams]);

  // Countdown for auto-redirect
  useEffect(() => {
    if (confirmation.status === "confirmed" && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      navigate("/");
    }
  }, [confirmation.status, countdown, navigate]);

  // Emergency fallback - always visible
  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#1e293b' }}>
        <div className="max-w-2xl w-full rounded-2xl shadow-2xl p-8 md:p-12" style={{ backgroundColor: '#334155', border: '2px solid #60a5fa' }}>
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4" style={{ color: '#ffffff' }}>
              Cargando página de pago...
            </h1>
            <div className="animate-spin rounded-full h-10 w-10 mx-auto" style={{ border: '4px solid #60a5fa', borderTopColor: 'transparent' }}></div>
          </div>
        </div>
      </div>
    );
  }

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
              {confirmation.message?.includes('No se encontraron parámetros')
                ? 'Acceso Incorrecto a Página de Pago'
                : 'Error al Capturar el Pago'}
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {confirmation.message?.includes('No se encontraron parámetros')
                ? 'Esta página debe ser accedida desde MercadoPago después de completar un pago.'
                : 'MercadoPago aprobó tu pago, pero hubo un problema al procesarlo en nuestra plataforma.'}
            </p>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-red-800 dark:text-red-300 whitespace-pre-line">
                {confirmation.message}
              </p>
            </div>
            {!confirmation.message?.includes('No se encontraron parámetros') && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 text-left">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                  Información para debugging:
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Token:</strong> {confirmation.token}
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>PayerID:</strong> {confirmation.payerId}
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-300 mt-2">
                  Por favor, guarda esta información y contacta al soporte.
                </p>
              </div>
            )}
            <div className="space-y-3">
              <button
                onClick={() => navigate("/")}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                Volver al Inicio
              </button>
              {confirmation.message?.includes('No se encontraron parámetros') && (
                <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    <strong>Tip:</strong> Para realizar un pago, debes crear un contrato, publicar un trabajo o comprar una membresía desde la plataforma.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (confirmation.status === "processing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12 border-2 border-blue-500 dark:border-blue-400">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900 rounded-full mb-6 border-4 border-blue-200 dark:border-blue-700">
              <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-t-4 border-blue-600 dark:border-blue-400"></div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Procesando Pago...
            </h1>
            <p className="text-gray-600 dark:text-gray-300 text-lg">
              Estamos confirmando tu pago con MercadoPago. Por favor espera.
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-4">
              Esto puede tomar unos segundos
            </p>

            {/* Debug info */}
            <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-left text-xs">
              <p className="font-semibold text-gray-900 dark:text-white mb-2">Debug Info:</p>
              <p className="text-gray-700 dark:text-gray-300">Token: {confirmation.token || 'No token'}</p>
              <p className="text-gray-700 dark:text-gray-300">PayerID: {confirmation.payerId || 'No PayerID'}</p>
              <p className="text-gray-700 dark:text-gray-300">Status: {confirmation.status}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header con animación de éxito */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 md:p-12 text-white text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-full mb-6 animate-bounce">
            <CheckCircle className="w-16 h-16 text-green-500" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            ¡Pago Confirmado!
          </h1>
          <p className="text-xl text-green-100">
            Tu pago ha sido procesado exitosamente
          </p>
        </div>

        {/* Información del pago */}
        <div className="p-8 md:p-12">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600 dark:text-gray-300 font-medium">Monto pagado:</span>
              <span className="text-3xl font-bold text-gray-900 dark:text-white">
                ${Number(confirmation.amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">ID de transacción:</span>
              <span className="text-gray-700 dark:text-gray-300 font-mono">
                {confirmation.token.substring(0, 16)}...
              </span>
            </div>
          </div>

          {/* Próximos pasos */}
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              {paymentType === 'membership' ? '¡Bienvenido a tu membresía!' : '¿Qué sigue ahora?'}
            </h2>

            {paymentType === 'membership' ? (
              // Contenido para pago de membresía
              <>
                {/* Beneficio 1 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      membershipPlan === 'super_pro'
                        ? 'bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900'
                        : 'bg-sky-100 dark:bg-sky-900'
                    }`}>
                      <Crown className={`w-6 h-6 ${
                        membershipPlan === 'super_pro'
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-sky-600 dark:text-sky-400'
                      }`} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Tu membresía {membershipPlan === 'super_pro' ? 'SUPER PRO' : 'PRO'} está activa
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      Ya tienes acceso a todos los beneficios {membershipPlan === 'super_pro' ? 'premium' : 'PRO'}. Tu perfil ahora muestra el badge {membershipPlan === 'super_pro' ? 'SUPER PRO' : 'PRO'} dorado.
                    </p>
                  </div>
                </div>

                {/* Beneficio 2 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      membershipPlan === 'super_pro'
                        ? 'bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900'
                        : 'bg-green-100 dark:bg-green-900'
                    }`}>
                      <CheckCircle className={`w-6 h-6 ${
                        membershipPlan === 'super_pro'
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-green-600 dark:text-green-400'
                      }`} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Comisión reducida al {membershipPlan === 'super_pro' ? '2%' : '3%'}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      A partir de ahora, pagarás solo {membershipPlan === 'super_pro' ? '2%' : '3%'} de comisión en tus próximos 3 contratos mensuales. {membershipPlan === 'super_pro' ? '¡La tarifa más baja de la plataforma!' : '¡Ahorra 5% vs el plan Free!'}
                    </p>
                  </div>
                </div>

                {/* Beneficio 3 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      membershipPlan === 'super_pro'
                        ? 'bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900'
                        : 'bg-blue-100 dark:bg-blue-900'
                    }`}>
                      <Shield className={`w-6 h-6 ${
                        membershipPlan === 'super_pro'
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Prioridad en búsquedas y verificación
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      Tu perfil aparecerá primero en los resultados de búsqueda. Además, tienes acceso a verificación de identidad completa para ganar más confianza.
                    </p>
                  </div>
                </div>

                {/* Beneficio 4 - Solo para Super PRO */}
                {membershipPlan === 'super_pro' && (
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 rounded-full flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        Dashboard exclusivo con analytics avanzados
                        <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300">
                        Accede a estadísticas detalladas de visitas a tu perfil, analytics de conversaciones, métricas de contratos completados, y reportes mensuales automatizados.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              // Contenido original para pago de contrato
              <>
                {/* Paso 1 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                      <FileText className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      1. Tu trabajo está publicado
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      Tu solicitud de trabajo ha sido publicada en la plataforma y ya está visible para todos los profesionales.
                    </p>
                  </div>
                </div>

                {/* Paso 2 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      2. Espera las propuestas de los profesionales
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      Los trabajadores interesados enviarán sus propuestas. Recibirás notificaciones cuando lleguen nuevas ofertas.
                    </p>
                  </div>
                </div>

                {/* Paso 3 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      3. Selecciona al profesional que más te guste
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      Revisa las propuestas, perfiles y calificaciones. Elige al profesional que mejor se ajuste a tus necesidades.
                    </p>
                  </div>
                </div>

                {/* Paso 4 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                      <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      4. Tu dinero está seguro en escrow
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      El pago está retenido de forma segura. Solo se liberará cuando el trabajo esté completado y ambas partes confirmen.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Nota importante sobre escrow - Solo para contratos */}
          {paymentType !== 'membership' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-8">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                  Sistema de Protección Escrow
                </h4>
                <p className="text-blue-800 dark:text-blue-300 text-sm">
                  Tu dinero está protegido. No se le pagará al profesional hasta que:
                </p>
                <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 text-sm mt-2 space-y-1">
                  <li>El trabajo esté completado según lo acordado</li>
                  <li>Tú confirmes que estás satisfecho con el resultado</li>
                  <li>El profesional confirme que completó el trabajo</li>
                </ul>
              </div>
            </div>
          </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => window.location.href = "/"}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-4 rounded-xl transition-colors flex items-center justify-center gap-2 group"
            >
              Ver Trabajos
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => window.location.href = "/dashboard"}
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold px-6 py-4 rounded-xl transition-colors"
            >
              Ir al Dashboard
            </button>
          </div>

          {/* Auto-redirect countdown */}
          <div className="text-center mt-8 text-sm text-gray-500 dark:text-gray-400">
            Redirigiendo automáticamente en {countdown} segundos...
          </div>
        </div>
      </div>
    </div>
  );
}
