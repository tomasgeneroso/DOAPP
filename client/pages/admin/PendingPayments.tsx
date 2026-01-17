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
  Upload,
  Receipt,
  Copy,
  Check,
  Calculator,
  Percent,
  Banknote,
  Clock,
  History,
  ExternalLink,
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

interface CompletedPayment {
  contractId: string;
  rowNumber: number;
  jobId: string;
  jobTitle: string;
  clientName: string;
  clientEmail: string;
  workerName: string;
  workerEmail: string;
  bankName: string;
  cbu: string;
  grossAmount: number;
  commission: number;
  netAmount: number;
  paymentProofUrl?: string;
  paymentAdminNotes?: string;
  processedBy: string;
  processedByEmail?: string;
  processedAt: string;
  completedAt: string;
}

interface CompletedSummary {
  totalPayments: number;
  totalGrossAmount: number;
  totalCommission: number;
  totalNetPaid: number;
}

export default function PendingPayments() {
  // Tab state
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");

  const [payments, setPayments] = useState<ContractPaymentRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<PaymentDetails | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  // Completed payments state
  const [completedPayments, setCompletedPayments] = useState<CompletedPayment[]>([]);
  const [completedSummary, setCompletedSummary] = useState<CompletedSummary | null>(null);
  const [completedLoading, setCompletedLoading] = useState(false);

  // Liquidation form state
  const [bankFee, setBankFee] = useState<number>(0);
  const [taxPercentage, setTaxPercentage] = useState<number>(0);
  const [otherDeductions, setOtherDeductions] = useState<number>(0);
  const [otherDeductionsDescription, setOtherDeductionsDescription] = useState("");
  const [copiedCBU, setCopiedCBU] = useState(false);

  // Filters
  const [period, setPeriod] = useState("daily");
  const [completedPeriod, setCompletedPeriod] = useState("monthly");
  const [sortBy, setSortBy] = useState("completedAt");
  const [sortOrder, setSortOrder] = useState("desc");

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
        setPayments(data.data || []);
        setSummary(data.summary || null);
      }
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedPayments = async () => {
    try {
      setCompletedLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/admin/pending-payments/completed/list?period=${completedPeriod}&sortBy=paymentProcessedAt&sortOrder=${sortOrder}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (data.success) {
        setCompletedPayments(data.data || []);
        setCompletedSummary(data.summary || null);
      }
    } catch (error) {
      console.error("Error loading completed payments:", error);
    } finally {
      setCompletedLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "pending") {
      loadPayments();
    } else {
      loadCompletedPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, completedPeriod, sortBy, sortOrder, activeTab]);

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

  // Calculate final amount after all deductions
  const calculateFinalAmount = () => {
    if (!selectedPayment) return 0;
    const grossAmount = selectedPayment.contract.price;
    const platformCommission = selectedPayment.contract.commission;
    const netBeforeDeductions = grossAmount - platformCommission;
    const taxAmount = netBeforeDeductions * (taxPercentage / 100);
    const finalAmount = netBeforeDeductions - bankFee - taxAmount - otherDeductions;
    return Math.max(0, finalAmount);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCBU(true);
      setTimeout(() => setCopiedCBU(false), 2000);
    } catch (err) {
      console.error("Error copying to clipboard:", err);
    }
  };

  // Reset liquidation form when modal opens
  const handleViewPaymentWithReset = async (contractId: string) => {
    setBankFee(0);
    setTaxPercentage(0);
    setOtherDeductions(0);
    setOtherDeductionsDescription("");
    setPaymentProof(null);
    setAdminNotes("");
    await handleViewPayment(contractId);
  };

  const handleMarkAsPaid = async (contractId: string, skipConfirm = false) => {
    if (!skipConfirm && !confirm("¿Confirmas que el pago al trabajador fue realizado mediante transferencia bancaria?")) return;

    try {
      setMarkingPaidId(contractId);
      const token = localStorage.getItem("token");

      // If there's a payment proof file, upload it first
      let proofUrl = "";
      if (paymentProof) {
        const formData = new FormData();
        formData.append("file", paymentProof);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.url) {
          proofUrl = uploadData.url;
        }
      }

      const response = await fetch(`/api/admin/pending-payments/${contractId}/mark-paid`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod: "bank_transfer",
          proofOfPayment: proofUrl,
          adminNotes: adminNotes || "Pago procesado manualmente",
          deductions: {
            bankFee,
            taxPercentage,
            taxAmount: (selectedPayment ? (selectedPayment.contract.price - selectedPayment.contract.commission) * (taxPercentage / 100) : 0),
            otherDeductions,
            otherDeductionsDescription,
            finalAmountPaid: calculateFinalAmount(),
          }
        }),
      });

      const data = await response.json();
      if (data.success) {
        loadPayments();
        if (showModal) {
          setShowModal(false);
          setSelectedPayment(null);
          setPaymentProof(null);
          setAdminNotes("");
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
      pending_payout: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      released: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", // Legacy - treat as pending_payout
      completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    };
    return badges[status] || badges.pending;
  };

  const getPaymentStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      held: "En Escrow",
      escrow: "En Escrow",
      pending_payout: "Pendiente de Pago",
      released: "Pendiente de Pago", // Legacy - treat as pending_payout
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestión de Pagos</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Administra los pagos pendientes y el historial de pagos realizados
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => activeTab === "pending" ? loadPayments() : loadCompletedPayments()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
          {activeTab === "pending" && (
            <button
              onClick={handleExportXLSX}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
            >
              <Download className="h-4 w-4" />
              Exportar Excel
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-4">
          <button
            onClick={() => setActiveTab("pending")}
            className={`py-3 px-4 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === "pending"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <Clock className="h-4 w-4" />
            Pendientes
            {summary && summary.totalContracts > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                {summary.totalContracts}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={`py-3 px-4 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === "completed"
                ? "border-green-500 text-green-600 dark:text-green-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <History className="h-4 w-4" />
            Pagos Realizados
            {completedSummary && completedSummary.totalPayments > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                {completedSummary.totalPayments}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Pending Payments Tab Content */}
      {activeTab === "pending" && (
        <>
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
                          onClick={() => handleViewPaymentWithReset(payment.contractId)}
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
        </>
      )}

      {/* Completed Payments Tab Content */}
      {activeTab === "completed" && (
        <>
          {/* Filters for Completed */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Período
                </label>
                <select
                  value={completedPeriod}
                  onChange={(e) => setCompletedPeriod(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
                >
                  <option value="daily">Hoy</option>
                  <option value="weekly">Esta Semana</option>
                  <option value="monthly">Este Mes</option>
                  <option value="all">Todo el historial</option>
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

          {/* Completed Summary Stats */}
          {completedSummary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Pagos Realizados</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {completedSummary.totalPayments}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Bruto</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      ${completedSummary.totalGrossAmount.toLocaleString('es-AR')}
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
                      ${completedSummary.totalCommission.toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Pagado</div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      ${completedSummary.totalNetPaid.toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Completed Payments Table */}
          {completedLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
            </div>
          ) : (
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
                        Trabajador
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Banco / CBU
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Monto
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Procesado por
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fecha Pago
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Comprobante
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {completedPayments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No hay pagos completados en este período
                        </td>
                      </tr>
                    ) : (
                      completedPayments.map((payment) => (
                        <tr key={payment.contractId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                            {payment.rowNumber}
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {payment.jobTitle}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.clientName}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {payment.workerName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.workerEmail}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-xs text-gray-900 dark:text-white">
                              {payment.bankName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {payment.cbu !== 'N/A' ? `${payment.cbu.slice(0, 8)}...` : 'N/A'}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-green-600 dark:text-green-400">
                              ${payment.netAmount.toLocaleString('es-AR')}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Com: ${payment.commission.toLocaleString('es-AR')}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {payment.processedBy}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {payment.processedAt ? new Date(payment.processedAt).toLocaleDateString("es-AR") : '-'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.processedAt ? new Date(payment.processedAt).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {payment.paymentProofUrl ? (
                              <a
                                href={payment.paymentProofUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Ver
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">Sin comprobante</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

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
                    <div className="space-y-3">
                      {selectedPayment.worker.bankingInfo ? (
                        <>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Banco:</span> {selectedPayment.worker.bankingInfo.bankName || 'N/A'}
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Titular:</span> {selectedPayment.worker.bankingInfo.accountHolder || 'N/A'}
                          </p>
                          {/* CBU with copy button */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CBU/CVU:</span>
                            <code className="flex-1 font-mono text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-700">
                              {selectedPayment.worker.bankingInfo.cbu || 'N/A'}
                            </code>
                            {selectedPayment.worker.bankingInfo.cbu && (
                              <button
                                onClick={() => copyToClipboard(selectedPayment.worker.bankingInfo?.cbu || '')}
                                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                                title="Copiar CBU"
                              >
                                {copiedCBU ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Alias:</span> {selectedPayment.worker.bankingInfo.alias || 'N/A'}
                          </p>
                        </>
                      ) : (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                          <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                            ⚠️ Sin datos bancarios registrados
                          </p>
                          <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                            El trabajador debe completar sus datos bancarios para recibir el pago.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Liquidation Form */}
              {selectedPayment.contract.paymentStatus !== 'completed' && (
                <div className="space-y-6">
                  {/* Section Header */}
                  <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    <Calculator className="h-5 w-5 text-sky-500" />
                    Formulario de Liquidación
                  </div>

                  {/* Deductions Form */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Deducciones (opcional)
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Bank Fee */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Comisión bancaria (ARS)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={bankFee || ''}
                            onChange={(e) => setBankFee(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>

                      {/* Tax Percentage */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Retención impositiva (%)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={taxPercentage || ''}
                            onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Other Deductions */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Otras deducciones (ARS)
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={otherDeductions || ''}
                            onChange={(e) => setOtherDeductions(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <input
                          type="text"
                          value={otherDeductionsDescription}
                          onChange={(e) => setOtherDeductionsDescription(e.target.value)}
                          placeholder="Descripción..."
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-green-800 dark:text-green-300 mb-3 flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Desglose del Pago
                    </h4>

                    <div className="space-y-2 text-sm">
                      {/* Gross Amount */}
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Monto bruto del contrato:</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          ${selectedPayment.contract.price.toLocaleString('es-AR')}
                        </span>
                      </div>

                      {/* Platform Commission */}
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Comisión plataforma:</span>
                        <span className="text-red-600 dark:text-red-400">
                          -${selectedPayment.contract.commission.toLocaleString('es-AR')}
                        </span>
                      </div>

                      {/* Subtotal */}
                      <div className="flex justify-between border-t border-green-200 dark:border-green-700 pt-2 mt-2">
                        <span className="text-gray-700 dark:text-gray-300">Neto antes de deducciones:</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          ${(selectedPayment.contract.price - selectedPayment.contract.commission).toLocaleString('es-AR')}
                        </span>
                      </div>

                      {/* Bank Fee (if any) */}
                      {bankFee > 0 && (
                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                          <span>Comisión bancaria:</span>
                          <span>-${bankFee.toLocaleString('es-AR')}</span>
                        </div>
                      )}

                      {/* Tax (if any) */}
                      {taxPercentage > 0 && (
                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                          <span>Retención impositiva ({taxPercentage}%):</span>
                          <span>
                            -${((selectedPayment.contract.price - selectedPayment.contract.commission) * (taxPercentage / 100)).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {/* Other Deductions (if any) */}
                      {otherDeductions > 0 && (
                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                          <span>Otras deducciones{otherDeductionsDescription ? ` (${otherDeductionsDescription})` : ''}:</span>
                          <span>-${otherDeductions.toLocaleString('es-AR')}</span>
                        </div>
                      )}

                      {/* Final Amount */}
                      <div className="flex justify-between border-t-2 border-green-300 dark:border-green-600 pt-3 mt-3">
                        <span className="font-bold text-green-800 dark:text-green-300 text-base">
                          MONTO FINAL A TRANSFERIR:
                        </span>
                        <span className="font-bold text-green-700 dark:text-green-400 text-xl">
                          ${calculateFinalAmount().toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bank Info Summary for Transfer */}
                  {selectedPayment.worker.bankingInfo?.cbu && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                        📋 Datos para transferir:
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-blue-600 dark:text-blue-400">CBU/CVU:</span>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="font-mono text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-800/50 px-2 py-1 rounded text-xs">
                              {selectedPayment.worker.bankingInfo.cbu}
                            </code>
                            <button
                              onClick={() => copyToClipboard(selectedPayment.worker.bankingInfo?.cbu || '')}
                              className="p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded"
                            >
                              {copiedCBU ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <span className="text-blue-600 dark:text-blue-400">Monto:</span>
                          <div className="font-bold text-blue-800 dark:text-blue-200 mt-1">
                            ${calculateFinalAmount().toLocaleString('es-AR', { maximumFractionDigits: 2 })} ARS
                          </div>
                        </div>
                        {selectedPayment.worker.bankingInfo.bankName && (
                          <div>
                            <span className="text-blue-600 dark:text-blue-400">Banco:</span>
                            <div className="text-blue-800 dark:text-blue-200 mt-1">
                              {selectedPayment.worker.bankingInfo.bankName}
                            </div>
                          </div>
                        )}
                        {selectedPayment.worker.bankingInfo.accountHolder && (
                          <div>
                            <span className="text-blue-600 dark:text-blue-400">Titular:</span>
                            <div className="text-blue-800 dark:text-blue-200 mt-1">
                              {selectedPayment.worker.bankingInfo.accountHolder}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Payment Proof Upload */}
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Comprobante de Transferencia
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-sky-500 dark:hover:border-sky-400 transition">
                        <Upload className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {paymentProof ? paymentProof.name : "Subir comprobante (opcional)"}
                        </span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => setPaymentProof(e.target.files?.[0] || null)}
                        />
                      </label>
                      {paymentProof && (
                        <button
                          onClick={() => setPaymentProof(null)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <XCircle className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Admin Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Notas internas (opcional)
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Notas sobre el pago, referencia de transferencia, etc..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                      rows={2}
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={() => handleMarkAsPaid(selectedPayment.contract.id, true)}
                    disabled={markingPaidId === selectedPayment.contract.id || !selectedPayment.worker.bankingInfo?.cbu}
                    className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-medium transition shadow-lg shadow-green-500/25"
                  >
                    {markingPaidId === selectedPayment.contract.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-5 w-5" />
                    )}
                    Confirmar Liquidación - ${calculateFinalAmount().toLocaleString('es-AR')} ARS
                  </button>

                  {!selectedPayment.worker.bankingInfo?.cbu && (
                    <p className="text-center text-sm text-red-500">
                      No se puede procesar el pago sin datos bancarios
                    </p>
                  )}
                </div>
              )}

              {/* Completed Payment Info */}
              {selectedPayment.contract.paymentStatus === 'completed' && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Pago completado</span>
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
