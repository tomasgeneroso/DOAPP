import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Eye, FileText, AlertCircle, Download, Loader2 } from "lucide-react";

interface PaymentProof {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  status: string;
  uploadedAt: string;
  binanceNickname?: string;
  binanceTransactionId?: string;
  transferAmount?: number;
  transferCurrency?: string;
  user?: {
    username: string;
    email: string;
  };
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentType: string;
  paymentMethod: string;
  description?: string;
  createdAt: string;
  payer?: {
    id: string;
    username: string;
    email: string;
    name: string;
  };
  job?: {
    id: string;
    title: string;
    status: string;
    price: number;
  };
  proofs?: PaymentProof[];
}

export default function PendingPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [notes, setNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending_verification");

  useEffect(() => {
    loadPayments();
  }, [statusFilter]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/pending?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setPayments(data.data || []);
      }
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewPayment = async (paymentId: string) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setSelectedPayment(data.data);
        setShowModal(true);
      }
    } catch (error) {
      console.error("Error loading payment details:", error);
    }
  };

  const handleApprove = async () => {
    if (!selectedPayment) return;

    try {
      setActionLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/${selectedPayment.id}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Pago aprobado exitosamente");
        setShowModal(false);
        setSelectedPayment(null);
        setNotes("");
        loadPayments();
      } else {
        alert(data.message || "Error aprobando pago");
      }
    } catch (error) {
      console.error("Error approving payment:", error);
      alert("Error aprobando pago");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPayment || !rejectReason.trim()) {
      alert("Debe proporcionar un motivo de rechazo");
      return;
    }

    try {
      setActionLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/${selectedPayment.id}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: rejectReason, notes }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Pago rechazado");
        setShowModal(false);
        setSelectedPayment(null);
        setRejectReason("");
        setNotes("");
        loadPayments();
      } else {
        alert(data.message || "Error rechazando pago");
      }
    } catch (error) {
      console.error("Error rejecting payment:", error);
      alert("Error rechazando pago");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending_verification: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      pending: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
    };
    return badges[status] || badges.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending_verification: "Verificación Pendiente",
      approved: "Aprobado",
      rejected: "Rechazado",
      pending: "Pendiente",
    };
    return labels[status] || status;
  };

  const getPaymentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      job_publication: "Publicación de Trabajo",
      contract_payment: "Pago de Contrato",
      membership: "Membresía",
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pagos Pendientes</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Gestiona y verifica los pagos pendientes de aprobación
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            >
              <option value="pending_verification">Verificación Pendiente</option>
              <option value="pending">Pendiente</option>
              <option value="approved">Aprobado</option>
              <option value="rejected">Rechazado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Pagos</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{payments.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Pendientes Verificación</div>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {payments.filter((p) => p.status === "pending_verification").length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Con Comprobante</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {payments.filter((p) => p.proofs && p.proofs.length > 0).length}
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Comprobante
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No se encontraron pagos
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {payment.payer?.name || payment.payer?.username || "N/A"}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {payment.payer?.email}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {getPaymentTypeLabel(payment.paymentType)}
                      </div>
                      {payment.job && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {payment.job.title}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        ${payment.amount.toLocaleString()} {payment.currency}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {payment.paymentMethod}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(
                          payment.status
                        )}`}
                      >
                        {getStatusLabel(payment.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {payment.proofs && payment.proofs.length > 0 ? (
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <FileText className="h-4 w-4" />
                          <span className="text-xs">{payment.proofs.length} archivo(s)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-400">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-xs">Sin comprobante</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {new Date(payment.createdAt).toLocaleDateString("es-AR")}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(payment.createdAt).toLocaleTimeString("es-AR")}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleViewPayment(payment.id)}
                        className="p-1 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                        title="Ver detalles"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Detail Modal */}
      {showModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Detalles del Pago
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    ID: {selectedPayment.id}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {/* Payment Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Usuario
                    </label>
                    <p className="text-gray-900 dark:text-white">
                      {selectedPayment.payer?.name || selectedPayment.payer?.username}
                    </p>
                    <p className="text-sm text-gray-500">{selectedPayment.payer?.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Tipo de Pago
                    </label>
                    <p className="text-gray-900 dark:text-white">
                      {getPaymentTypeLabel(selectedPayment.paymentType)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Método de Pago
                    </label>
                    <p className="text-gray-900 dark:text-white">
                      {selectedPayment.paymentMethod}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Monto
                    </label>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      ${selectedPayment.amount.toLocaleString()} {selectedPayment.currency}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Estado
                    </label>
                    <p>
                      <span
                        className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusBadge(
                          selectedPayment.status
                        )}`}
                      >
                        {getStatusLabel(selectedPayment.status)}
                      </span>
                    </p>
                  </div>
                  {selectedPayment.job && (
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Trabajo Relacionado
                      </label>
                      <p className="text-gray-900 dark:text-white">
                        {selectedPayment.job.title}
                      </p>
                      <p className="text-sm text-gray-500">
                        Precio: ${selectedPayment.job.price.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Proofs */}
              {selectedPayment.proofs && selectedPayment.proofs.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Comprobantes de Pago
                  </h3>
                  <div className="space-y-4">
                    {selectedPayment.proofs.map((proof) => (
                      <div
                        key={proof.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {proof.fileName}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Subido: {new Date(proof.uploadedAt).toLocaleString("es-AR")}
                            </p>
                            {proof.binanceNickname && (
                              <div className="mt-2 space-y-1">
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                  <span className="font-medium">Binance:</span>{" "}
                                  {proof.binanceNickname}
                                </p>
                                {proof.binanceTransactionId && (
                                  <p className="text-sm text-gray-700 dark:text-gray-300">
                                    <span className="font-medium">TX ID:</span>{" "}
                                    {proof.binanceTransactionId}
                                  </p>
                                )}
                                {proof.transferAmount && (
                                  <p className="text-sm text-gray-700 dark:text-gray-300">
                                    <span className="font-medium">Monto:</span>{" "}
                                    {proof.transferAmount} {proof.transferCurrency}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <a
                            href={proof.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm"
                          >
                            <Download className="h-4 w-4" />
                            Ver
                          </a>
                        </div>

                        {/* Image preview for image files */}
                        {(proof.fileType === "png" ||
                          proof.fileType === "jpg" ||
                          proof.fileType === "jpeg") && (
                          <div className="mt-3">
                            <img
                              src={proof.fileUrl}
                              alt="Comprobante"
                              className="max-w-full h-auto rounded-lg border border-gray-300 dark:border-gray-600"
                            />
                          </div>
                        )}

                        {/* PDF preview */}
                        {proof.fileType === "pdf" && (
                          <div className="mt-3">
                            <iframe
                              src={proof.fileUrl}
                              className="w-full h-96 border border-gray-300 dark:border-gray-600 rounded-lg"
                              title="PDF Preview"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Actions */}
              {selectedPayment.status === "pending_verification" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Notas (opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={3}
                      placeholder="Agrega notas sobre esta verificación..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                    >
                      {actionLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-5 w-5" />
                      )}
                      Aprobar Pago
                    </button>
                  </div>

                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Motivo de Rechazo (requerido para rechazar)
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                      placeholder="Explica el motivo del rechazo..."
                    />
                    <button
                      onClick={handleReject}
                      disabled={actionLoading || !rejectReason.trim()}
                      className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                    >
                      {actionLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <XCircle className="h-5 w-5" />
                      )}
                      Rechazar Pago
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
