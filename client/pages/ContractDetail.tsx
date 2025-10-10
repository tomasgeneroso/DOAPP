import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { paymentApi, Payment } from "@/lib/paymentApi";
import { PaymentModal } from "@/components/payments/PaymentModal";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contract, setContract] = useState<any>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (id) {
      loadContract();
      loadPayments();
    }
  }, [id]);

  const loadContract = async () => {
    try {
      const response = await api.get(`/contracts/${id}`);
      setContract(response.data);
    } catch (error) {
      console.error("Error loading contract:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadPayments = async () => {
    try {
      const result = await paymentApi.getContractPayments(id!);
      setPayments(result);
    } catch (error) {
      console.error("Error loading payments:", error);
    }
  };

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
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
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
                </div>
              </div>
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
