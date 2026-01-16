import { useState, useEffect } from "react";
import ExcelJS from "exceljs";
import {
  CheckCircle,
  XCircle,
  Eye,
  FileText,
  AlertCircle,
  Download,
  Loader2,
  DollarSign,
  Users,
  Building,
  CreditCard,
  User,
  RefreshCw,
} from "lucide-react";

interface WorkerPaymentInfo {
  workerId: string;
  workerName: string;
  workerEmail: string;
  workerDni: string | null;
  workerPhone: string | null;
  workerAddress: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  bankingInfo: {
    bankName: string | null;
    accountHolder: string | null;
    accountType: string | null;
    cbu: string | null;
    alias: string | null;
  } | null;
  hasBankingInfo: boolean;
  amountToPay: number;
  commission: number;
  percentageOfBudget: number | null;
}

interface ContractPaymentRow {
  contractId: string;
  contractNumber: number;
  jobId: string;
  jobTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  totalContractAmount: number;
  totalCommission: number;
  completedAt: string;
  paymentStatus: string;
  escrowStatus: string;
  contractStatus: string;
  workers: WorkerPaymentInfo[];
}

interface ReportSummary {
  totalContracts: number;
  totalWorkers: number;
  totalAmountToPay: number;
  totalCommissionCollected: number;
  averagePaymentPerWorker: number;
  bankBreakdown: Record<string, { count: number; totalAmount: number }>;
}

interface PaymentDetails {
  contract: {
    id: string;
    status: string;
    paymentStatus: string;
    escrowStatus: string;
    price: number;
    commission: number;
    totalPrice: number;
    allocatedAmount?: number;
    percentageOfBudget?: number;
    startDate: string;
    endDate: string;
    completedAt?: string;
  };
  job: {
    id: string;
    title: string;
    description: string;
    totalBudget: number;
    maxWorkers: number;
    selectedWorkersCount: number;
    location: string;
  };
  client: {
    id: string;
    name: string;
    email: string;
    dni?: string;
    phone?: string;
    address?: any;
  };
  worker: {
    id: string;
    name: string;
    email: string;
    dni?: string;
    phone?: string;
    address?: any;
    bankingInfo?: {
      bankName?: string;
      accountHolder?: string;
      accountType?: string;
      cbu?: string;
      alias?: string;
    };
  };
  payment?: {
    id: string;
    status: string;
    amount: number;
    workerPaymentAmount?: number;
    mercadopagoId?: string;
    paidAt?: string;
  };
}

export default function PendingPayments() {
  const [payments, setPayments] = useState<ContractPaymentRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<PaymentDetails | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  // Filters
  const [period, setPeriod] = useState("daily");
  const [sortBy, setSortBy] = useState("completedAt");
  const [sortOrder, setSortOrder] = useState("desc");

  useEffect(() => {
    loadPayments();
  }, [period, sortBy, sortOrder]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/admin/pending-payments?period=${period}&sortBy=${sortBy}&sortOrder=${sortOrder}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (data.success) {
        setPayments(data.report?.data || []);
        setSummary(data.report?.summary || null);
      }
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewPayment = async (contractId: string) => {
    try {
      setActionLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/pending-payments/${contractId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setSelectedPayment(data.paymentDetails);
        setShowModal(true);
      }
    } catch (error) {
      console.error("Error loading payment details:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAsPaid = async (contractId: string) => {
    if (!confirm("¿Confirmas que el pago al trabajador fue realizado mediante transferencia bancaria?")) return;

    try {
      setMarkingPaidId(contractId);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/pending-payments/${contractId}/mark-paid`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod: "bank_transfer",
          adminNotes: "Pago procesado manualmente"
        }),
      });

      const data = await response.json();
      if (data.success) {
        loadPayments();
        if (showModal) {
          setShowModal(false);
          setSelectedPayment(null);
        }
      } else {
        alert(data.message || "Error al marcar pago");
      }
    } catch (error) {
      console.error("Error marking payment:", error);
      alert("Error al marcar pago como completado");
    } finally {
      setMarkingPaidId(null);
    }
  };

  const handleExportXLSX = async () => {
    try {
      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'DoApp';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Pagos Pendientes');

      // Define columns with headers and widths
      worksheet.columns = [
        { header: 'ID Contrato', key: 'contractId', width: 36 },
        { header: '# Contrato', key: 'contractNumber', width: 12 },
        { header: 'ID Trabajo', key: 'jobId', width: 36 },
        { header: 'Título Trabajo', key: 'jobTitle', width: 30 },
        { header: 'Cliente', key: 'clientName', width: 20 },
        { header: 'Email Cliente', key: 'clientEmail', width: 25 },
        { header: 'Trabajador', key: 'workerName', width: 20 },
        { header: 'Email Trabajador', key: 'workerEmail', width: 25 },
        { header: 'DNI Trabajador', key: 'workerDni', width: 12 },
        { header: 'Teléfono', key: 'workerPhone', width: 15 },
        { header: 'Banco', key: 'bankName', width: 20 },
        { header: 'Titular Cuenta', key: 'accountHolder', width: 20 },
        { header: 'Tipo Cuenta', key: 'accountType', width: 12 },
        { header: 'CBU', key: 'cbu', width: 25 },
        { header: 'Alias', key: 'alias', width: 20 },
        { header: 'Monto a Pagar', key: 'amountToPay', width: 15 },
        { header: 'Comisión', key: 'commission', width: 12 },
        { header: '% del Presupuesto', key: 'percentageOfBudget', width: 15 },
        { header: 'Total Contrato', key: 'totalContractAmount', width: 15 },
        { header: 'Estado Pago', key: 'paymentStatus', width: 15 },
        { header: 'Estado Escrow', key: 'escrowStatus', width: 15 },
        { header: 'Fecha Completado', key: 'completedAt', width: 15 },
      ];

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' }
      };

      // Flatten workers into rows - one row per worker
      payments.forEach((payment) => {
        payment.workers.forEach((worker) => {
          worksheet.addRow({
            contractId: payment.contractId,
            contractNumber: payment.contractNumber,
            jobId: payment.jobId,
            jobTitle: payment.jobTitle,
            clientName: payment.clientName,
            clientEmail: payment.clientEmail,
            workerName: worker.workerName,
            workerEmail: worker.workerEmail,
            workerDni: worker.workerDni || '',
            workerPhone: worker.workerPhone || '',
            bankName: worker.bankingInfo?.bankName || '',
            accountHolder: worker.bankingInfo?.accountHolder || '',
            accountType: worker.bankingInfo?.accountType || '',
            cbu: worker.bankingInfo?.cbu || '',
            alias: worker.bankingInfo?.alias || '',
            amountToPay: worker.amountToPay,
            commission: worker.commission,
            percentageOfBudget: worker.percentageOfBudget || 100,
            totalContractAmount: payment.totalContractAmount,
            paymentStatus: payment.paymentStatus,
            escrowStatus: payment.escrowStatus,
            completedAt: new Date(payment.completedAt).toLocaleDateString('es-AR'),
          });
        });
      });

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pagos-pendientes-${period}-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting XLSX:", error);
      alert("Error al exportar Excel");
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      held: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      escrow: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      released: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    };
    return badges[status] || badges.pending;
  };

  const getPaymentStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      held: "En Escrow",
      escrow: "En Escrow",
      released: "Liberado",
      completed: "Completado",
    };
    return labels[status] || status;
  };

  const getEscrowStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      held_escrow: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      released: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      refunded: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    return badges[status] || "bg-gray-100 text-gray-800";
  };

  const getEscrowStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      held_escrow: "En Escrow",
      released: "Liberado",
      refunded: "Reembolsado",
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pagos Pendientes</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Gestiona los pagos a trabajadores de contratos completados
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadPayments}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
          <button
            onClick={handleExportXLSX}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Período
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            >
              <option value="daily">Hoy</option>
              <option value="weekly">Esta Semana</option>
              <option value="monthly">Este Mes</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ordenar por
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            >
              <option value="completedAt">Fecha Completado</option>
              <option value="amount">Monto</option>
              <option value="workerCount">Cant. Trabajadores</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Orden
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            >
              <option value="desc">Más reciente</option>
              <option value="asc">Más antiguo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Contratos</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.totalContracts}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Trabajadores</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.totalWorkers}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total a Pagar</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${summary.totalAmountToPay.toLocaleString('es-AR')}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Comisiones</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${summary.totalCommissionCollected.toLocaleString('es-AR')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Trabajo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Trabajadores
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Escrow
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
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No hay pagos pendientes en este período
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.contractId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {payment.contractNumber}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {payment.jobTitle}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ID: {payment.jobId.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {payment.clientName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {payment.clientEmail}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-900 dark:text-white">
                          {payment.workers.length}
                        </span>
                      </div>
                      {payment.workers.slice(0, 2).map((w, i) => (
                        <div key={i} className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                          {w.workerName}
                        </div>
                      ))}
                      {payment.workers.length > 2 && (
                        <div className="text-xs text-gray-400">
                          +{payment.workers.length - 2} más
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-green-600 dark:text-green-400">
                        ${payment.totalContractAmount.toLocaleString('es-AR')}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Com: ${payment.totalCommission.toLocaleString('es-AR')}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getEscrowStatusBadge(payment.escrowStatus)}`}>
                          {getEscrowStatusLabel(payment.escrowStatus)}
                        </span>
                        <div className="text-xs text-gray-500">
                          Pago: {getPaymentStatusLabel(payment.paymentStatus)}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {new Date(payment.completedAt).toLocaleDateString("es-AR")}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(payment.completedAt).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewPayment(payment.contractId)}
                          className="p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {payment.paymentStatus !== 'completed' && (
                          <button
                            onClick={() => handleMarkAsPaid(payment.contractId)}
                            disabled={markingPaidId === payment.contractId}
                            className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50"
                            title="Marcar como pagado (transferencia)"
                          >
                            {markingPaidId === payment.contractId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
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
                    Contrato ID: {selectedPayment.contract.id.slice(0, 8)}...
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {/* Status badges */}
              <div className="flex gap-3 mb-6">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getPaymentStatusBadge(selectedPayment.contract.paymentStatus)}`}>
                  Pago: {getPaymentStatusLabel(selectedPayment.contract.paymentStatus)}
                </span>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getEscrowStatusBadge(selectedPayment.contract.escrowStatus)}`}>
                  Escrow: {getEscrowStatusLabel(selectedPayment.contract.escrowStatus)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Job Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Trabajo
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedPayment.job.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedPayment.job.location}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Presupuesto total: ${selectedPayment.job.totalBudget.toLocaleString('es-AR')}
                    </p>
                    {selectedPayment.job.maxWorkers > 1 && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Trabajadores: {selectedPayment.job.selectedWorkersCount} / {selectedPayment.job.maxWorkers}
                      </p>
                    )}
                  </div>
                </div>

                {/* Client Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Cliente
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedPayment.client.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedPayment.client.email}
                    </p>
                    {selectedPayment.client.dni && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        DNI: {selectedPayment.client.dni}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Worker & Payment Info */}
              <div className="space-y-4 mb-6">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Trabajador - Datos de Pago
                </h3>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {selectedPayment.worker.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedPayment.worker.email}
                      </p>
                      {selectedPayment.worker.dni && (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          DNI: {selectedPayment.worker.dni}
                        </p>
                      )}
                      {selectedPayment.worker.phone && (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Tel: {selectedPayment.worker.phone}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {selectedPayment.worker.bankingInfo ? (
                        <>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Banco:</span> {selectedPayment.worker.bankingInfo.bankName || 'N/A'}
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Titular:</span> {selectedPayment.worker.bankingInfo.accountHolder || 'N/A'}
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">CBU:</span>{' '}
                            <span className="font-mono bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded">
                              {selectedPayment.worker.bankingInfo.cbu || 'N/A'}
                            </span>
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Alias:</span> {selectedPayment.worker.bankingInfo.alias || 'N/A'}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-red-500">
                          Sin datos bancarios registrados
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Amount */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-green-700 dark:text-green-300">Monto a pagar al trabajador</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      (Precio: ${selectedPayment.contract.price.toLocaleString('es-AR')} - Comisión: ${selectedPayment.contract.commission.toLocaleString('es-AR')})
                    </p>
                  </div>
                  <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                    ${(selectedPayment.contract.price - selectedPayment.contract.commission).toLocaleString('es-AR')}
                  </p>
                </div>
              </div>

              {/* Actions */}
              {selectedPayment.contract.paymentStatus !== 'completed' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleMarkAsPaid(selectedPayment.contract.id)}
                    disabled={markingPaidId === selectedPayment.contract.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                  >
                    {markingPaidId === selectedPayment.contract.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-5 w-5" />
                    )}
                    Marcar como Pagado
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
