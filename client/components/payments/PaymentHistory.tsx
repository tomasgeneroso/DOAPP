import { useEffect, useState } from "react";
import { paymentApi, Payment } from "@/lib/paymentApi";
import { ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle, XCircle } from "lucide-react";

interface PaymentHistoryProps {
  type?: "all" | "sent" | "received";
}

export function PaymentHistory({ type = "all" }: PaymentHistoryProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);

  useEffect(() => {
    loadPayments();
  }, [type, page]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const result = await paymentApi.getMyPayments(type, page, 10);
      setPayments(result.data);
      setPagination(result.pagination);
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "held_escrow":
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case "pending":
      case "processing":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "failed":
      case "refunded":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: "Pendiente",
      processing: "Procesando",
      completed: "Completado",
      failed: "Fallido",
      refunded: "Reembolsado",
      held_escrow: "En Escrow",
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "held_escrow":
        return "bg-yellow-100 text-yellow-800";
      case "pending":
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "failed":
      case "refunded":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <p className="text-gray-600">No hay pagos para mostrar</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4">
        {payments.map((payment) => (
          <div
            key={payment._id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-1">
                  {payment.paymentType === "contract_payment" &&
                  payment.payerId._id ? (
                    <ArrowUpCircle className="h-6 w-6 text-red-500" />
                  ) : (
                    <ArrowDownCircle className="h-6 w-6 text-green-500" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">
                      {payment.description || payment.contractId?.title || "Pago"}
                    </h3>
                    {payment.isEscrow && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        Escrow
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {payment.payerId.name && payment.recipientId.name ? (
                      <>
                        De <span className="font-medium">{payment.payerId.name}</span> a{" "}
                        <span className="font-medium">{payment.recipientId.name}</span>
                      </>
                    ) : (
                      "Información de pago"
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(payment.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right ml-4">
                <div className="flex items-center gap-2 mb-2">
                  {getStatusIcon(payment.status)}
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(
                      payment.status
                    )}`}
                  >
                    {getStatusText(payment.status)}
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  ${payment.amount.toFixed(2)} {payment.currency}
                </p>
                {payment.platformFee > 0 && (
                  <p className="text-xs text-gray-500">
                    +${payment.platformFee.toFixed(2)} tarifa
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-gray-700">
            Página {page} de {pagination.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
