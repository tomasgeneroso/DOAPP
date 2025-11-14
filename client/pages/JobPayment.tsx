import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { CreditCard, ArrowLeft, Loader2, Calendar, FileText } from "lucide-react";

export default function JobPayment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate commission based on user tier
  const getCommissionRate = () => {
    if (user?.membershipTier === 'super_pro') return 2;
    if (user?.membershipTier === 'pro') return 3;
    return 8; // FREE users
  };

  const calculateCommission = () => {
    const jobPrice = job?.price || job?.budget || 0;
    if (!jobPrice) return 0;

    // Check if user has initial free contracts available
    const freeContractsRemaining = user?.freeContractsRemaining || 0;

    if (freeContractsRemaining > 0) {
      return 0; // No commission for initial free contracts
    }

    // Check if user has monthly free contracts (PRO: 1, SUPER PRO: 2)
    const proContractsUsed = user?.proContractsUsedThisMonth || 0;
    let monthlyFreeLimit = 0;
    if (user?.membershipTier === 'super_pro') monthlyFreeLimit = 2;
    else if (user?.membershipTier === 'pro') monthlyFreeLimit = 1;

    if (proContractsUsed < monthlyFreeLimit) {
      return 0; // No commission for monthly free contracts
    }

    const rate = getCommissionRate();
    const MINIMUM_CONTRACT_AMOUNT = 8000;
    const MINIMUM_COMMISSION = 1000;

    if (jobPrice < MINIMUM_CONTRACT_AMOUNT) {
      return MINIMUM_COMMISSION;
    }
    return jobPrice * (rate / 100);
  };

  const jobPrice = job?.price || job?.budget || 0;
  const commissionRate = getCommissionRate();

  // Free contracts info
  const freeContractsRemaining = user?.freeContractsRemaining || 0;
  const freeContractsLimit = 3; // Default initial free contracts

  // Monthly free contracts info
  const proContractsUsed = user?.proContractsUsedThisMonth || 0;
  let monthlyFreeLimit = 0;
  if (user?.membershipTier === 'super_pro') monthlyFreeLimit = 2;
  else if (user?.membershipTier === 'pro') monthlyFreeLimit = 1;
  const monthlyFreeRemaining = Math.max(0, monthlyFreeLimit - proContractsUsed);

  const isFreeContract = freeContractsRemaining > 0 || monthlyFreeRemaining > 0;

  // Calculate costs - for free contracts, no commission or payment required
  const publicationCost = calculateCommission();
  const totalAmount = isFreeContract ? 0 : publicationCost;

  useEffect(() => {
    loadJob();
    // Refresh user data to ensure contract counts are up-to-date
    refreshUser();
  }, [id]);

  const loadJob = async () => {
    try {
      const response = await fetch(`/api/jobs/${id}`, {
        credentials: 'include', // Importante: envía las cookies automáticamente
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setJob(data.job);
      } else {
        setError(data.message || "No se pudo cargar el trabajo");
      }
    } catch (error) {
      console.error("Error loading job:", error);
      setError("Error al cargar el trabajo");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    try {
      setProcessing(true);
      setError(null);

      // Create payment order for job publication
      const response = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include', // Importante: envía las cookies automáticamente
        body: JSON.stringify({
          jobId: id,
          paymentType: "job_publication",
          returnUrl: `${window.location.origin}/payment/success`,
          cancelUrl: `${window.location.origin}/payment/cancel`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al crear la orden de pago");
      }

      // Check if payment was not required (free contract)
      if (data.requiresPayment === false) {
        // Refresh user data to update contract counts
        await refreshUser();

        // Job was published successfully without payment
        navigate("/", {
          state: {
            message: "¡Trabajo publicado exitosamente! (Contrato gratuito)",
            type: "success"
          }
        });
        return;
      }

      // Redirect to PayPal or MercadoPago for paid contracts
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
      } else {
        throw new Error("No se recibió URL de pago");
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "Error al procesar el pago");
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-sky-600" />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="container mx-auto max-w-2xl py-12 px-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <p className="text-red-800 dark:text-red-300">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 text-sky-600 hover:text-sky-700 font-medium"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Pago de Publicación - Doers</title>
      </Helmet>

      <div className="container mx-auto max-w-3xl py-12 px-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-600 to-blue-600 p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="w-8 h-8" />
              <h1 className="text-2xl font-bold">Pago de Publicación</h1>
            </div>
            <p className="text-sky-100">
              Completa el pago para publicar tu trabajo en la plataforma
            </p>
          </div>

          {/* Job Details */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Detalles del Trabajo
            </h2>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
              {/* Título */}
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Título:</span>
                <p className="font-medium text-gray-900 dark:text-white mt-1">
                  {job?.title || '-'}
                </p>
              </div>

              {/* Categoría */}
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Categoría:</span>
                <p className="text-gray-900 dark:text-white mt-1">{job?.category || '-'}</p>
              </div>

              {/* Descripción */}
              {job?.description && (
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Descripción:</span>
                  <p className="text-gray-900 dark:text-white mt-1 text-sm line-clamp-3">
                    {job.description}
                  </p>
                </div>
              )}

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <Calendar className="w-4 h-4" />
                    Fecha de inicio
                  </div>
                  <p className="text-gray-900 dark:text-white text-sm">
                    {job?.startDate ? new Date(job.startDate).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    }) : '-'}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <Calendar className="w-4 h-4" />
                    Fecha de finalización
                  </div>
                  <p className="text-gray-900 dark:text-white text-sm">
                    {job?.endDate ? new Date(job.endDate).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    }) : '-'}
                  </p>
                </div>
              </div>

              {/* Presupuesto */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-400">Presupuesto:</span>
                <p className="font-bold text-gray-900 dark:text-white text-lg mt-1">
                  ${jobPrice.toLocaleString('es-AR')} ARS
                </p>
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Resumen del Pago
            </h2>

            {/* Free contracts info */}
            {isFreeContract && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <FileText className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-green-800 dark:text-green-300">
                    <p className="font-semibold mb-1">🎉 Contrato Gratuito</p>
                    {freeContractsRemaining > 0 ? (
                      <>
                        <p>
                          Este es uno de tus contratos gratuitos iniciales. No pagarás comisión de publicación.
                        </p>
                        <p className="mt-1 text-xs">
                          Contratos gratis restantes: <strong>{freeContractsRemaining}</strong>
                          {freeContractsRemaining > 1 ? ` • Quedan ${freeContractsRemaining - 1} después de este` : ' • Este es el último'}
                        </p>
                      </>
                    ) : monthlyFreeRemaining > 0 ? (
                      <>
                        <p>
                          Este es uno de tus {monthlyFreeLimit} contratos mensuales sin comisión. No pagarás comisión de publicación.
                        </p>
                        <p className="mt-1 text-xs">
                          Usando contrato mensual gratis: <strong>{proContractsUsed + 1} de {monthlyFreeLimit}</strong> este mes
                          {monthlyFreeRemaining > 1 ? ` • Quedan ${monthlyFreeRemaining - 1} más` : ' • Este es el último este mes'}
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Warning for contracts below minimum */}
            {!isFreeContract && jobPrice < 8000 && (
              <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-800 dark:text-orange-300">
                    <p className="font-semibold mb-1">Mínimo de contrato</p>
                    <p>
                      El presupuesto es menor a $8,000 ARS. La comisión de publicación será de $1,000 ARS (comisión mínima).
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between text-gray-600 dark:text-gray-400 text-sm">
                <div className="flex flex-col">
                  <span>Presupuesto del trabajo</span>
                  <span className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    (Se pagará al freelancer al completar)
                  </span>
                </div>
                <span>${jobPrice.toLocaleString('es-AR')} ARS</span>
              </div>
              <div className="flex justify-between text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-col">
                  <span className="font-medium">Comisión de publicación {!isFreeContract && `(${commissionRate}%)`}</span>
                  {isFreeContract && (
                    <span className="text-xs text-green-600 dark:text-green-400 mt-1">
                      ✨ Gratis - {freeContractsRemaining > 0 ? `${freeContractsRemaining} restantes` : `${proContractsUsed + 1} de ${monthlyFreeLimit} este mes`}
                    </span>
                  )}
                  {!isFreeContract && jobPrice < 8000 && (
                    <span className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      * Comisión mínima de $1,000 ARS
                    </span>
                  )}
                </div>
                <span className={isFreeContract ? "text-green-600 dark:text-green-400 font-semibold" : "font-semibold"}>
                  ${publicationCost.toLocaleString('es-AR')} ARS
                </span>
              </div>
              <div className="flex justify-between text-xl font-bold text-gray-900 dark:text-white pt-3 border-t-2 border-gray-300 dark:border-gray-600">
                <span>Total a pagar ahora</span>
                <span className={totalAmount === 0 ? "text-green-600 dark:text-green-400" : ""}>
                  ${totalAmount.toLocaleString('es-AR')} ARS
                </span>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="p-6 bg-blue-50 dark:bg-blue-900/20">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
              Comisión de Publicación
            </h3>
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
              <p>
                La comisión de publicación varía según tu membresía:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Usuario FREE:</strong> 8% del presupuesto</li>
                <li><strong>Usuario PRO:</strong> 3% del presupuesto</li>
                <li><strong>Usuario SUPER PRO:</strong> 2% del presupuesto</li>
              </ul>
              <p className="pt-2">
                <strong>Nota:</strong> Para contratos menores a $8,000 ARS, se aplica una comisión mínima de $1,000 ARS.
              </p>
              {user?.membershipTier === 'free' && (
                <p className="pt-2">
                  💡 <strong>Tip:</strong> Actualiza a PRO o SUPER PRO para reducir tus comisiones.{" "}
                  <button
                    onClick={() => navigate("/settings?tab=membership")}
                    className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700"
                  >
                    Ver planes
                  </button>
                </p>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-6 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
              <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="p-6 bg-gray-50 dark:bg-gray-900">
            <button
              onClick={handlePayment}
              disabled={processing}
              className={`w-full ${isFreeContract ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-400' : 'bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400'} text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2`}
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isFreeContract ? "Publicando..." : "Procesando..."}
                </>
              ) : isFreeContract ? (
                <>
                  <CreditCard className="w-5 h-5" />
                  🎉 Publicar Gratis
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  Proceder al Pago
                </>
              )}
            </button>
            <button
              onClick={() => navigate("/")}
              disabled={processing}
              className="w-full mt-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
