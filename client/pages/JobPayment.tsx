import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { CreditCard, ArrowLeft, Loader2, Calendar, FileText, Upload, Eye } from "lucide-react";
import PaymentMethodSelector, { PaymentMethod, BinancePaymentData } from "@/components/payments/PaymentMethodSelector";

export default function JobPayment() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if this is a budget increase payment
  const amountParam = searchParams.get('amount');
  const reasonParam = searchParams.get('reason');
  const oldPriceParam = searchParams.get('oldPrice');
  const newPriceParam = searchParams.get('newPrice');
  const isBudgetIncrease = reasonParam === 'budget_increase' && amountParam;

  // Payment method selection
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mercadopago');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Binance payment data
  const [binanceData, setBinanceData] = useState<BinancePaymentData>({
    transactionId: '',
    senderUserId: '',
  });

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
    const MINIMUM_COMMISSION = 1000;

    // Calculate commission based on rate
    const calculatedCommission = jobPrice * (rate / 100);

    // Always apply minimum commission of $1000 ARS
    return Math.max(calculatedCommission, MINIMUM_COMMISSION);
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

  // Calculate costs
  // For budget increase, use the amount from URL params (already includes commission)
  // For regular job payment, calculate commission based on job price
  const publicationCost = isBudgetIncrease ? 0 : calculateCommission();
  const totalAmount = isBudgetIncrease
    ? parseFloat(amountParam || '0')
    : (isFreeContract ? 0 : jobPrice + publicationCost);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type based on payment method
    let validTypes: string[];
    let errorMessage: string;

    if (paymentMethod === 'binance') {
      validTypes = ['image/png', 'image/jpeg'];
      errorMessage = 'Solo se permiten imágenes PNG o JPG para Binance';
    } else {
      validTypes = ['application/pdf', 'image/png', 'image/jpeg'];
      errorMessage = 'Solo se permiten archivos PDF, PNG o JPG';
    }

    if (!validTypes.includes(file.type)) {
      toast.error('Formato inválido', errorMessage);
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Archivo muy grande', 'El archivo no debe superar los 5MB');
      return;
    }

    setProofFile(file);
    setError(null);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setProofPreview(null);
    }
  };

  // Cancelar el cambio de presupuesto pendiente
  const handleCancelBudgetChange = async () => {
    if (!isBudgetIncrease || !id) {
      navigate("/");
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${id}/cancel-budget-change`, {
        method: "PATCH",
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Cambio cancelado', 'El cambio de presupuesto ha sido cancelado');
      }
      // Navegar independientemente del resultado
      navigate(`/jobs/${id}`);
    } catch (error) {
      console.error("Error canceling budget change:", error);
      // Navegar de todos modos
      navigate(`/jobs/${id}`);
    }
  };

  const handlePayment = async () => {
    try {
      setProcessing(true);
      setError(null);

      // Validate bank transfer has proof
      if (paymentMethod === 'bank_transfer' && !isFreeContract && !proofFile) {
        toast.error('Comprobante requerido', 'Debes subir el comprobante de transferencia');
        setProcessing(false);
        return;
      }

      // Validate Binance payment data
      if (paymentMethod === 'binance' && !isFreeContract) {
        if (!binanceData.transactionId || !binanceData.senderUserId) {
          toast.error('Datos incompletos', 'Debes completar el Transaction ID y tu Binance ID');
          setProcessing(false);
          return;
        }
        if (!proofFile) {
          toast.error('Comprobante requerido', 'Debes subir el comprobante de la transferencia de Binance');
          setProcessing(false);
          return;
        }
      }

      // Create payment order for job publication or budget increase
      const createOrderPayload = {
        jobId: id,
        paymentType: isBudgetIncrease ? 'budget_increase' : 'job_publication',
        paymentMethod: paymentMethod,
        amount: isBudgetIncrease ? totalAmount : undefined,
        returnUrl: `${window.location.origin}/payment/success`,
        cancelUrl: `${window.location.origin}/payment/cancel`,
      };

      const response = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify(createOrderPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al crear la orden de pago");
      }

      // Check if payment was not required (free contract)
      if (data.requiresPayment === false) {
        await refreshUser();
        toast.success('Trabajo publicado', 'Tu trabajo se ha publicado exitosamente con tu contrato gratuito');
        navigate("/");
        return;
      }

      // Handle bank transfer or Binance - upload proof separately
      if ((paymentMethod === 'bank_transfer' || paymentMethod === 'binance') && proofFile && data.paymentId) {
        // Upload proof file
        const proofFormData = new FormData();
        proofFormData.append('proof', proofFile);

        // Add Binance specific data if applicable
        if (paymentMethod === 'binance') {
          proofFormData.append('binanceTransactionId', binanceData.transactionId);
          proofFormData.append('binanceSenderUserId', binanceData.senderUserId);
        }

        const proofResponse = await fetch(`/api/payments/${data.paymentId}/upload-proof`, {
          method: "POST",
          credentials: 'include',
          body: proofFormData,
        });

        const proofData = await proofResponse.json();

        if (!proofResponse.ok) {
          throw new Error(proofData.message || "Error al subir comprobante");
        }

        const verificationTime = paymentMethod === 'binance' ? '5-15 minutos' : '24-48hs hábiles';

        // Show appropriate message based on payment type
        if (isBudgetIncrease) {
          toast.success(
            'Comprobante recibido',
            `Tu pago será verificado en ${verificationTime}. Una vez aprobado, el presupuesto se actualizará y tu trabajo se reactivará automáticamente.`
          );
        } else {
          toast.success('Comprobante recibido', `Tu pago será verificado en ${verificationTime}`);
        }
        navigate("/");
        return;
      }

      // Redirect to MercadoPago for paid contracts
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
      } else {
        throw new Error("No se recibió URL de pago");
      }
    } catch (err: any) {
      console.error("Payment error:", err);
      toast.error('Error de pago', err.message || "Error al procesar el pago");
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
        <title>{isBudgetIncrease ? 'Pago de Aumento de Presupuesto' : 'Pago de Publicación'} - Doers</title>
      </Helmet>

      <div className="container mx-auto max-w-3xl py-12 px-4">
        <button
          onClick={isBudgetIncrease ? handleCancelBudgetChange : () => navigate(-1)}
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
              <h1 className="text-2xl font-bold">
                {isBudgetIncrease ? 'Pago de Aumento de Presupuesto' : 'Pago de Publicación'}
              </h1>
            </div>
            <p className="text-sky-100">
              {isBudgetIncrease
                ? 'Completa el pago para confirmar el aumento de presupuesto'
                : 'Completa el pago para publicar tu trabajo en la plataforma'}
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
              {isBudgetIncrease ? (
                // Budget increase payment breakdown - Show full operation details
                <>
                  {/* Previous price */}
                  <div className="flex justify-between text-gray-600 dark:text-gray-400 text-sm">
                    <span>Presupuesto anterior</span>
                    <span>${parseFloat(oldPriceParam || '0').toLocaleString('es-AR')} ARS</span>
                  </div>

                  {/* New price */}
                  <div className="flex justify-between text-gray-600 dark:text-gray-400 text-sm">
                    <span>Nuevo presupuesto</span>
                    <span>${parseFloat(newPriceParam || '0').toLocaleString('es-AR')} ARS</span>
                  </div>

                  {/* Price difference */}
                  <div className="flex justify-between text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="font-medium">Diferencia de presupuesto</span>
                    <span className="font-semibold text-orange-600 dark:text-orange-400">
                      +${(parseFloat(newPriceParam || '0') - parseFloat(oldPriceParam || '0')).toLocaleString('es-AR')} ARS
                    </span>
                  </div>

                  {/* Commission on difference */}
                  <div className="flex justify-between text-gray-600 dark:text-gray-400 text-sm">
                    <div className="flex flex-col">
                      <span>Comisión sobre la diferencia ({commissionRate}%)</span>
                      <span className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Según tu membresía: {user?.membershipTier === 'super_pro' ? 'SUPER PRO' : user?.membershipTier === 'pro' ? 'PRO' : 'FREE'}
                      </span>
                    </div>
                    <span>
                      +${((parseFloat(newPriceParam || '0') - parseFloat(oldPriceParam || '0')) * (commissionRate / 100)).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                    </span>
                  </div>

                  {/* Total */}
                  <div className="flex justify-between text-xl font-bold text-gray-900 dark:text-white pt-3 border-t-2 border-gray-300 dark:border-gray-600">
                    <span>Total a pagar ahora</span>
                    <span className="text-sky-600 dark:text-sky-400">${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS</span>
                  </div>

                  {/* Info note */}
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-300">
                    <p>
                      <strong>Nota:</strong> El trabajo permanecerá pausado hasta que completes este pago.
                      Una vez procesado, se reactivará automáticamente.
                    </p>
                  </div>
                </>
              ) : (
                // Regular job publication payment breakdown
                <>
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
                </>
              )}
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

          {/* Payment Method Selector - Only show if not free contract */}
          {!isFreeContract && (
            <div className="p-6 border-t border-gray-200 dark:border-gray-700">
              <PaymentMethodSelector
                selectedMethod={paymentMethod}
                onMethodChange={setPaymentMethod}
                amount={totalAmount}
                currency="ARS"
                onBinanceDataChange={setBinanceData}
              />

              {/* Binance Transfer - Upload Proof */}
              {paymentMethod === 'binance' && (
                <div className="mt-6 space-y-4">
                  {/* Upload Proof */}
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3 flex items-center gap-2">
                      <Upload className="w-5 h-5" />
                      Subir Comprobante de Transferencia
                    </h4>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                      Sube una captura de pantalla del comprobante de Binance en formato PNG o JPG.
                    </p>
                    <div className="space-y-2 mb-4">
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                        <span className="font-semibold">📸</span>
                        <span>Asegúrate que se vea claramente el Transaction ID, monto y fecha.</span>
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                        <span className="font-semibold">✅</span>
                        <span>El trabajo se publicará una vez que se apruebe el pago (5-15 min).</span>
                      </p>
                    </div>

                    <div className="space-y-3">
                      <label className="block">
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg"
                          onChange={handleFileChange}
                          className="block w-full text-sm text-gray-900 dark:text-gray-100
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-lg file:border-0
                            file:text-sm file:font-semibold
                            file:bg-yellow-600 file:text-white
                            hover:file:bg-yellow-700
                            file:cursor-pointer cursor-pointer"
                        />
                      </label>

                      {proofFile && (
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {proofFile.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({(proofFile.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setProofFile(null);
                                setProofPreview(null);
                              }}
                              className="text-red-600 hover:text-red-700 text-sm"
                            >
                              Eliminar
                            </button>
                          </div>

                          {proofPreview && (
                            <div className="mt-3">
                              <img
                                src={proofPreview}
                                alt="Vista previa"
                                className="max-h-40 rounded border border-gray-300 dark:border-gray-600"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Bank Transfer Details */}
              {paymentMethod === 'bank_transfer' && (
                <div className="mt-6 space-y-4">
                  {/* DOAPP Bank Account Info */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      🏦 Datos para Transferencia
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-gray-600 dark:text-gray-400">Titular:</span>
                        <span className="col-span-2 font-medium text-gray-900 dark:text-white">DOAPP S.R.L.</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-gray-600 dark:text-gray-400">CUIT:</span>
                        <span className="col-span-2 font-medium text-gray-900 dark:text-white">30-12345678-9</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-gray-600 dark:text-gray-400">Banco:</span>
                        <span className="col-span-2 font-medium text-gray-900 dark:text-white">Banco Galicia</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-gray-600 dark:text-gray-400">CBU:</span>
                        <div className="col-span-2">
                          <span className="font-mono font-medium text-gray-900 dark:text-white">0070-0999-2000-0123-4567-8</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText('00700999200001234567');
                              alert('CBU copiado al portapapeles');
                            }}
                            className="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Copiar
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-gray-600 dark:text-gray-400">Alias:</span>
                        <span className="col-span-2 font-medium text-gray-900 dark:text-white">DOAPP.PAGOS</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">Monto:</span>
                        <span className="col-span-2 font-bold text-lg text-gray-900 dark:text-white">
                          ${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Upload Proof */}
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3 flex items-center gap-2">
                      <Upload className="w-5 h-5" />
                      Subir Comprobante de Transferencia
                    </h4>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                      Una vez realizada la transferencia, sube el comprobante en formato PDF o imagen (PNG/JPG).
                    </p>
                    <div className="space-y-2 mb-4">
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                        <span className="font-semibold">⏰</span>
                        <span>Tienes <strong>24 horas</strong> para subir el comprobante.</span>
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                        <span className="font-semibold">📄</span>
                        <span>También puedes subirlo desde la vista del trabajo.</span>
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                        <span className="font-semibold">✅</span>
                        <span>El trabajo se publicará una vez que se apruebe el pago.</span>
                      </p>
                    </div>

                    <div className="space-y-3">
                      <label className="block">
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={handleFileChange}
                          className="block w-full text-sm text-gray-900 dark:text-gray-100
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-lg file:border-0
                            file:text-sm file:font-semibold
                            file:bg-yellow-600 file:text-white
                            hover:file:bg-yellow-700
                            file:cursor-pointer cursor-pointer"
                        />
                      </label>

                      {proofFile && (
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {proofFile.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({(proofFile.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setProofFile(null);
                                setProofPreview(null);
                              }}
                              className="text-red-600 hover:text-red-700 text-sm"
                            >
                              Eliminar
                            </button>
                          </div>

                          {proofPreview && (
                            <div className="mt-3">
                              <img
                                src={proofPreview}
                                alt="Vista previa"
                                className="max-h-40 rounded border border-gray-300 dark:border-gray-600"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

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
              onClick={isBudgetIncrease ? handleCancelBudgetChange : () => navigate("/")}
              disabled={processing}
              className="w-full mt-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {isBudgetIncrease ? "Cancelar Cambio" : "Cancelar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
