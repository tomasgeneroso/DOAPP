import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { paymentApi, Payment } from "@/lib/paymentApi";
import { PaymentModal } from "@/components/payments/PaymentModal";
import ContractExtensionRequest from "@/components/contracts/ContractExtensionRequest";
import ContractExtensionApproval from "@/components/contracts/ContractExtensionApproval";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageCircle,
  Flag,
  Key,
  Copy,
  Wifi,
  WifiOff,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isConnected, registerContractUpdateHandler } = useSocket();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const [contract, setContract] = useState<any>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [loadingPairing, setLoadingPairing] = useState(false);
  const [pairingMessage, setPairingMessage] = useState("");
  const [showExtensionForm, setShowExtensionForm] = useState(false);

  const loadContract = useCallback(async () => {
    try {
      const response = await api.get(`/contracts/${id}`);
      setContract(response.data);
    } catch (error) {
      console.error("Error loading contract:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPayments = useCallback(async () => {
    try {
      const result = await paymentApi.getContractPayments(id!);
      setPayments(result);
    } catch (error) {
      console.error("Error loading payments:", error);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadContract();
      loadPayments();
    }
  }, [id, loadContract, loadPayments]);

  // Register socket handler for real-time contract updates
  useEffect(() => {
    const handler = (data: any) => {
      console.log("📝 ContractDetail: Contract updated via socket:", data);
      // Only reload if this is the same contract
      if (data.contractId === id) {
        console.log("🔄 ContractDetail: Reloading contract data...");
        loadContract();
        loadPayments();
      }
    };
    registerContractUpdateHandler(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleReleaseEscrow = async (paymentId: string) => {
    if (!confirm("¿Estás seguro de liberar el pago del escrow?")) return;

    try {
      await paymentApi.releaseEscrow(paymentId);
      alert("Pago liberado exitosamente");
      loadPayments();
      loadContract();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleOpenChat = async () => {
    if (!id || loadingChat) return;

    setLoadingChat(true);
    try {
      const response = await api.get(`/chat/conversations/by-contract/${id}`);
      if (response.data.success && response.data.conversation) {
        // Navigate to chat with conversation ID
        navigate(`/chat/${response.data.conversation._id}`);
      }
    } catch (error) {
      console.error("Error opening chat:", error);
      alert("Error al abrir el chat. Inténtalo de nuevo.");
    } finally {
      setLoadingChat(false);
    }
  };

  const handleGeneratePairingCode = async () => {
    if (!id) return;

    setLoadingPairing(true);
    setPairingMessage("");
    try {
      const response = await api.post(`/contracts/${id}/generate-pairing`);
      if (response.data.success) {
        setPairingMessage("Código generado exitosamente");
        loadContract(); // Reload to get the new code
      }
    } catch (error: any) {
      setPairingMessage(error.response?.data?.message || "Error al generar código");
    } finally {
      setLoadingPairing(false);
    }
  };

  const handleConfirmPairing = async () => {
    if (!id || !pairingCode) return;

    setLoadingPairing(true);
    setPairingMessage("");
    try {
      const response = await api.post(`/contracts/${id}/confirm-pairing`, {
        code: pairingCode.toUpperCase()
      });
      if (response.data.success) {
        setPairingMessage("¡Código confirmado exitosamente!");
        setPairingCode("");
        loadContract();
      }
    } catch (error: any) {
      setPairingMessage(error.response?.data?.message || "Error al confirmar código");
    } finally {
      setLoadingPairing(false);
    }
  };

  const handleCopyCode = () => {
    if (contract?.pairingCode) {
      navigator.clipboard.writeText(contract.pairingCode);
      setPairingMessage("Código copiado al portapapeles");
      setTimeout(() => setPairingMessage(""), 3000);
    }
  };

  const getTimeUntilStart = () => {
    if (!contract?.startDate) return null;
    const now = new Date();
    const startDate = new Date(contract.startDate);
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilStart;
  };

  const canGeneratePairingCode = () => {
    if (!contract) return false;
    const hoursUntilStart = getTimeUntilStart();
    return (
      contract.status === 'accepted' &&
      contract.termsAcceptedByClient &&
      contract.termsAcceptedByDoer &&
      hoursUntilStart !== null &&
      hoursUntilStart <= 24 &&
      hoursUntilStart > 0 &&
      !contract.pairingCode
    );
  };

  const shouldShowPairingSection = () => {
    if (!contract) return false;

    // Show if both parties accepted and:
    // 1. We're within 24 hours before start (for generation)
    // 2. OR a code has been generated (show until contract ends)
    const hoursUntilStart = getTimeUntilStart();
    const bothAccepted = contract.termsAcceptedByClient && contract.termsAcceptedByDoer;

    if (!bothAccepted) return false;

    // If code already exists, show it until contract is completed/cancelled
    if (contract.pairingCode) {
      return ['accepted', 'in_progress'].includes(contract.status);
    }

    // If no code yet, only show if within 24 hours before start
    return (
      contract.status === 'accepted' &&
      hoursUntilStart !== null &&
      hoursUntilStart <= 24 &&
      hoursUntilStart > 0
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "accepted":
        return "bg-sky-100 text-sky-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "escrow":
      case "held_escrow":
        return "bg-yellow-100 text-yellow-800";
      case "pending":
        return "bg-blue-100 text-blue-800";
      case "refunded":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Contrato no encontrado</h2>
          <button
            onClick={() => navigate("/")}
            className="mt-4 text-sky-600 hover:text-sky-700"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const isClient = contract.clientId?._id === user?._id;
  const isDoer = contract.doerId?._id === user?._id;
  const escrowPayment = payments.find((p) => p.status === "held_escrow");
  const canPayContract =
    isClient &&
    contract.status === "accepted" &&
    contract.paymentStatus === "pending";

  return (
    <>
      <Helmet>
        <title>Contrato - {contract.title || "Detalle"} - Do</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button - Only visible on mobile */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver
          </button>

          {/* Header */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {contract.jobId?.title || "Contrato"}
                </h1>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span
                    className={`px-3 py-1 rounded-full font-medium ${getStatusColor(
                      contract.status
                    )}`}
                  >
                    {contract.status}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full font-medium ${getPaymentStatusColor(
                      contract.paymentStatus
                    )}`}
                  >
                    Pago: {contract.paymentStatus}
                  </span>
                  {isConnected ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <Wifi className="h-4 w-4" />
                      <span className="text-xs">Tiempo real</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-400">
                      <WifiOff className="h-4 w-4" />
                      <span className="text-xs">Offline</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleOpenChat}
                  disabled={loadingChat}
                  className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-sky-600 text-sky-600 rounded-lg hover:bg-sky-50 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MessageCircle className="h-5 w-5" />
                  {loadingChat ? "Cargando..." : "Chat"}
                </button>
                {hasPermission(PERMISSIONS.DISPUTE_CREATE) && contract?.status === 'in_progress' && (
                  <button
                    onClick={() => navigate(`/disputes/new?contractId=${id}`)}
                    className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition font-semibold"
                  >
                    <Flag className="h-5 w-5" />
                    Reportar Problema
                  </button>
                )}
                {canPayContract && (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition font-semibold"
                  >
                    Realizar Pago
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Contract Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-sky-600" />
                Partes del Contrato
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Cliente</p>
                  <p className="font-medium text-gray-900">
                    {contract.clientId?.name || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Proveedor</p>
                  <p className="font-medium text-gray-900">
                    {contract.doerId?.name || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-sky-600" />
                Detalles de Pago
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Precio:</span>
                  <span className="font-semibold">${contract.price?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Comisión:</span>
                  <span className="font-semibold">${contract.commission?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-semibold">Total:</span>
                  <span className="font-bold text-sky-600">
                    ${contract.totalPrice?.toFixed(2)}
                  </span>
                </div>
                {contract.escrowEnabled && (
                  <div className="bg-blue-50 rounded p-2 text-sm text-blue-800">
                    ✓ Protegido con Escrow
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-600" />
                Fechas
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Inicio:</p>
                  <p className="font-medium text-gray-900">
                    {new Date(contract.startDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Finalización:</p>
                  <p className="font-medium text-gray-900">
                    {new Date(contract.endDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-sky-600" />
                Estado
              </h2>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {contract.termsAcceptedByClient ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <span className="text-sm">Términos aceptados por cliente</span>
                </div>
                <div className="flex items-center gap-2">
                  {contract.termsAcceptedByDoer ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <span className="text-sm">Términos aceptados por proveedor</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pairing Code Section */}
          {shouldShowPairingSection() && (
            <div className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 rounded-lg shadow-lg p-6 mb-6 border-2 border-sky-200 dark:border-sky-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-sky-600 p-3 rounded-lg">
                  <Key className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Código de Pareamiento
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Ambas partes deben confirmar el código para iniciar el contrato
                  </p>
                </div>
              </div>

              {pairingMessage && (
                <div className={`mb-4 p-3 rounded-lg ${
                  pairingMessage.includes("Error") || pairingMessage.includes("incorrecto")
                    ? "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200"
                    : "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                }`}>
                  {pairingMessage}
                </div>
              )}

              {!contract.pairingCode && canGeneratePairingCode() && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
                  <p className="text-gray-700 dark:text-gray-300 mb-3">
                    El contrato comienza en menos de 24 horas. Genera el código de pareamiento para confirmar el inicio.
                  </p>
                  <button
                    onClick={handleGeneratePairingCode}
                    disabled={loadingPairing}
                    className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingPairing ? "Generando..." : "Generar Código"}
                  </button>
                </div>
              )}

              {contract.pairingCode && (
                <>
                  {/* Display Code */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Código de Pareamiento:
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                        <p className="text-3xl font-mono font-bold text-sky-600 dark:text-sky-400 text-center tracking-widest">
                          {contract.pairingCode}
                        </p>
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="p-3 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-900/50 rounded-lg transition"
                        title="Copiar código"
                      >
                        <Copy className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                      </button>
                    </div>
                    {contract.pairingExpiry && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                        Expira: {new Date(contract.pairingExpiry).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* Confirmation Status */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className={`p-4 rounded-lg border-2 ${
                      contract.clientConfirmedPairing
                        ? "bg-green-50 dark:bg-green-900/20 border-green-500"
                        : "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    }`}>
                      <div className="flex items-center gap-3">
                        {contract.clientConfirmedPairing ? (
                          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertCircle className="h-6 w-6 text-gray-400" />
                        )}
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {contract.clientId?.name || "Cliente"}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {contract.clientConfirmedPairing ? "✓ Confirmado" : "Pendiente"}
                          </p>
                          {contract.clientPairingConfirmedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(contract.clientPairingConfirmedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg border-2 ${
                      contract.doerConfirmedPairing
                        ? "bg-green-50 dark:bg-green-900/20 border-green-500"
                        : "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    }`}>
                      <div className="flex items-center gap-3">
                        {contract.doerConfirmedPairing ? (
                          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertCircle className="h-6 w-6 text-gray-400" />
                        )}
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {contract.doerId?.name || "Proveedor"}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {contract.doerConfirmedPairing ? "✓ Confirmado" : "Pendiente"}
                          </p>
                          {contract.doerPairingConfirmedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(contract.doerPairingConfirmedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input Code (if current user hasn't confirmed yet) */}
                  {((isClient && !contract.clientConfirmedPairing) || (isDoer && !contract.doerConfirmedPairing)) && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Ingresa el código para confirmar:
                      </p>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={pairingCode}
                          onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                          placeholder="Ingresa el código"
                          maxLength={10}
                          className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white font-mono text-lg"
                        />
                        <button
                          onClick={handleConfirmPairing}
                          disabled={loadingPairing || !pairingCode || pairingCode.length !== 10}
                          className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {loadingPairing ? "Confirmando..." : "Confirmar"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Success Message */}
                  {contract.clientConfirmedPairing && contract.doerConfirmedPairing && (
                    <div className="bg-green-100 dark:bg-green-900/20 border-2 border-green-500 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-green-800 dark:text-green-200">
                            ¡Ambas partes han confirmado!
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            El contrato ha iniciado. Pueden comenzar a trabajar.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Contract Extension Section */}
          {(contract.status === 'accepted' || contract.status === 'in_progress') && (
            <>
              {/* Show extension approval if there's a pending request */}
              {contract.extensionRequestedBy && !contract.extensionApprovedBy && (
                <div className="mb-6">
                  <ContractExtensionApproval
                    contract={contract}
                    onSuccess={() => {
                      loadContract();
                      setShowExtensionForm(false);
                    }}
                  />
                </div>
              )}

              {/* Show extension request button if no extension exists and no pending request */}
              {!contract.hasBeenExtended && !contract.extensionRequestedBy && !showExtensionForm && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowExtensionForm(true)}
                    className="w-full bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-4 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center gap-2"
                  >
                    <Clock className="h-5 w-5" />
                    Solicitar Extensión de Contrato
                  </button>
                </div>
              )}

              {/* Show extension request form */}
              {showExtensionForm && !contract.hasBeenExtended && (
                <div className="mb-6">
                  <ContractExtensionRequest
                    contract={contract}
                    onSuccess={() => {
                      loadContract();
                      setShowExtensionForm(false);
                    }}
                    onCancel={() => setShowExtensionForm(false)}
                  />
                </div>
              )}

              {/* Show extension info if already extended */}
              {contract.hasBeenExtended && (
                <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                        Contrato Extendido
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Se extendió {contract.extensionDays} días
                        {contract.extensionAmount && contract.extensionAmount > 0 && (
                          <> con un monto adicional de ${contract.extensionAmount.toLocaleString('es-AR')} ARS</>
                        )}
                      </p>
                      {contract.originalEndDate && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Fecha original: {new Date(contract.originalEndDate).toLocaleDateString('es-AR')} →
                          Nueva fecha: {new Date(contract.endDate).toLocaleDateString('es-AR')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Payments Section */}
          {payments.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Historial de Pagos
              </h2>
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment._id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          ${payment.amount.toFixed(2)} {payment.currency}
                        </p>
                        <p className="text-sm text-gray-600">
                          {payment.description || payment.paymentType}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(payment.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentStatusColor(
                            payment.status
                          )}`}
                        >
                          {payment.status}
                        </span>
                        {payment.isEscrow &&
                          payment.status === "held_escrow" &&
                          isClient && (
                            <button
                              onClick={() => handleReleaseEscrow(payment._id)}
                              className="mt-2 text-sm text-sky-600 hover:text-sky-700 font-medium"
                            >
                              Liberar Pago
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          contractId={contract._id}
          contractTitle={contract.jobId?.title || "Contrato"}
          amount={contract.price}
          recipientName={contract.doerId?.name || "Proveedor"}
          escrowEnabled={contract.escrowEnabled}
          onSuccess={() => {
            loadPayments();
            loadContract();
          }}
        />
      )}
    </>
  );
}
