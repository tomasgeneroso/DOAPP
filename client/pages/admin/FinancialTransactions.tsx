import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import ExcelJS from "exceljs";
import {
  DollarSign,
  TrendingUp,
  Lock,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Filter,
  Download,
  Search,
  X,
  BarChart3,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from "recharts";

interface Transaction {
  id: string;
  date: string;
  type: string;
  status: string;
  totalAmount: number;
  currency: string;
  platformFee: number;
  platformFeePercentage: number;
  // Doer info (from contract or from job for job_publication)
  doer?: { id?: string; name: string; email: string } | null;
  // Job info (for job_publication without contract)
  jobTitle?: string;
  jobPrice?: number;
  contract: {
    id: string;
    title: string;
    price: number;
    currency: string;
    commission: number;
    status: string;
    client: { name: string; email: string };
    doer: { name: string; email: string };
  } | null;
  payer: { name: string; email: string };
  recipient: { name: string; email: string } | null;
  isEscrow: boolean;
  escrowAmount?: number;
  escrowReleased: boolean;
  description: string;
  // Payment method details
  paymentMethod?: string;
  cardBrand?: string;
  cardLastFourDigits?: string;
  paymentMethodId?: string;
  mercadopagoPaymentId?: string;
  // Bank transfer details
  isOwnBankAccount?: boolean;
  thirdPartyAccountHolder?: string;
  senderBankName?: string;
}

type ChartType = 'escrow' | 'recent' | 'commissions' | 'total' | null;
type SortField = 'date' | 'type' | 'description' | 'client' | 'doer' | 'amount' | 'commission' | 'status' | 'released' | 'paymentMethod';
type SortDirection = 'asc' | 'desc' | null;

export default function FinancialTransactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const [selectedChart, setSelectedChart] = useState<ChartType>(null);
  const [chartData, setChartData] = useState<any>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [rejectModal, setRejectModal] = useState<{ paymentId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    search: ''
  });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadTransactions();
    loadStats();
  }, [page, filters]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(filters.type !== 'all' && { type: filters.type }),
        ...(filters.status !== 'all' && { status: filters.status })
      });

      const response = await fetch(`/api/admin/company-balance/transactions?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setTransactions(data.data.transactions);
        setPagination(data.data.pagination);
      }
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch('/api/admin/company-balance/transaction-stats', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const handleExportXLSX = async () => {
    setExporting(true);
    try {
      const sortedData = getSortedTransactions();

      const typeLabels: Record<string, string> = {
        contract_payment: 'Contrato',
        membership: 'Membresía',
        job_publication: 'Publicación',
        budget_increase: 'Aumento Presupuesto',
        escrow_deposit: 'Escrow',
        escrow_release: 'Liberación'
      };

      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'DoApp';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Movimientos');

      // Define columns with headers and widths
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 36 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Tipo', key: 'tipo', width: 15 },
        { header: 'Descripción', key: 'descripcion', width: 30 },
        { header: 'Cliente', key: 'cliente', width: 20 },
        { header: 'Email Cliente', key: 'emailCliente', width: 25 },
        { header: 'Doer', key: 'doer', width: 20 },
        { header: 'Email Doer', key: 'emailDoer', width: 25 },
        { header: 'Monto Total', key: 'montoTotal', width: 15 },
        { header: 'Moneda', key: 'moneda', width: 8 },
        { header: 'Comisión', key: 'comision', width: 12 },
        { header: '% Comisión', key: 'porcentajeComision', width: 12 },
        { header: 'Estado', key: 'estado', width: 15 },
        { header: 'Método Pago', key: 'metodoPago', width: 15 },
        { header: 'Tarjeta', key: 'tarjeta', width: 12 },
        { header: 'Últimos 4', key: 'ultimos4', width: 10 },
        { header: 'Banco Origen', key: 'bancoOrigen', width: 20 },
        { header: 'Cuenta Propia', key: 'cuentaPropia', width: 12 },
        { header: 'Titular Tercero', key: 'titularTercero', width: 25 },
        { header: 'Escrow', key: 'escrow', width: 12 },
        { header: 'Monto Escrow', key: 'montoEscrow', width: 15 },
        { header: 'ID MercadoPago', key: 'idMercadoPago', width: 20 },
      ];

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' }
      };

      // Add data rows
      sortedData.forEach(t => {
        worksheet.addRow({
          id: t.id,
          fecha: new Date(t.date).toLocaleDateString('es-AR'),
          tipo: typeLabels[t.type] || t.type,
          descripcion: t.contract?.title || t.jobTitle || t.description || '',
          cliente: t.contract?.client?.name || t.payer?.name || '',
          emailCliente: t.contract?.client?.email || t.payer?.email || '',
          doer: t.doer?.name || t.contract?.doer?.name || t.recipient?.name || '',
          emailDoer: t.doer?.email || t.contract?.doer?.email || t.recipient?.email || '',
          montoTotal: Number(t.totalAmount || 0),
          moneda: t.currency || 'ARS',
          comision: Number(t.platformFee || 0),
          porcentajeComision: Number(t.platformFeePercentage || 0),
          estado: t.status,
          metodoPago: t.paymentMethod || '',
          tarjeta: t.cardBrand || '',
          ultimos4: t.cardLastFourDigits || '',
          bancoOrigen: t.senderBankName || '',
          cuentaPropia: t.isOwnBankAccount === true ? 'Sí' : (t.isOwnBankAccount === false ? 'No' : ''),
          titularTercero: t.thirdPartyAccountHolder || '',
          escrow: (t.isEscrow || t.type === 'escrow_deposit' || t.type === 'contract_payment') ? (t.escrowReleased ? 'Liberado' : 'Retenido') : '',
          montoEscrow: Number(t.escrowAmount || 0),
          idMercadoPago: t.mercadopagoPaymentId || ''
        });
      });

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `movimientos-financieros-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting XLSX:", error);
      alert("Error al exportar Excel");
    } finally {
      setExporting(false);
    }
  };

  // Payment actions
  const handleApprovePayment = async (paymentId: string) => {
    if (!confirm("¿Estás seguro de aprobar este pago?")) return;

    try {
      setActionLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/${paymentId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: "" }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Pago aprobado exitosamente");
        loadTransactions();
        loadStats();
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error approving payment:", error);
      alert("Error al aprobar el pago");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectPayment = (paymentId: string) => {
    setRejectReason("");
    setRejectModal({ paymentId });
  };

  const confirmRejectPayment = async () => {
    if (!rejectModal || !rejectReason.trim()) {
      alert("Debe proporcionar una razón para rechazar");
      return;
    }

    try {
      setActionLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/${rejectModal.paymentId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectReason }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Pago rechazado");
        setRejectModal(null);
        setRejectReason("");
        loadTransactions();
        loadStats();
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error rejecting payment:", error);
      alert("Error al rechazar el pago");
    } finally {
      setActionLoading(false);
    }
  };

  const loadChartData = async (chartType: ChartType) => {
    if (!chartType) return;

    setChartLoading(true);
    try {
      const token = localStorage.getItem("token");

      // Simulate chart data based on type
      // In a real scenario, you would fetch this from the backend
      let data: any = null;

      switch (chartType) {
        case 'escrow':
          // Escrow status distribution
          data = {
            pieData: [
              { name: 'En Escrow', value: stats.escrow?.held || 0, color: '#3b82f6' },
              { name: 'Liberados', value: (stats.escrow?.totals?.[0]?.total || 0) - (stats.escrow?.held || 0), color: '#10b981' }
            ],
            trend: generateTrendData('Escrow', 30)
          };
          break;

        case 'recent':
          // Last 30 days trend
          data = {
            lineData: generateTrendData('Transacciones', 30),
            barData: generateTransactionTypeData()
          };
          break;

        case 'commissions':
          // Commissions breakdown
          data = {
            areaData: generateTrendData('Comisiones', 30),
            pieData: [
              { name: 'Contratos (8%)', value: 8, color: '#8b5cf6' },
              { name: 'PRO (3%)', value: 3, color: '#3b82f6' },
              { name: 'SUPER PRO (2%)', value: 2, color: '#10b981' }
            ]
          };
          break;

        case 'total':
          // Total transactions over time
          data = {
            barData: generateMonthlyTransactions(),
            statusData: [
              { name: 'Completados', value: pagination?.total ? Math.floor(pagination.total * 0.7) : 0, color: '#10b981' },
              { name: 'En Escrow', value: stats.escrow?.held || 0, color: '#3b82f6' },
              { name: 'Pendientes', value: pagination?.total ? Math.floor(pagination.total * 0.1) : 0, color: '#f59e0b' },
              { name: 'Fallidos', value: pagination?.total ? Math.floor(pagination.total * 0.05) : 0, color: '#ef4444' }
            ]
          };
          break;
      }

      setChartData(data);
    } catch (error) {
      console.error("Error loading chart data:", error);
    } finally {
      setChartLoading(false);
    }
  };

  // Helper functions to generate mock data
  const generateTrendData = (name: string, days: number) => {
    const data = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
        value: Math.floor(Math.random() * 50) + 10,
        name
      });
    }
    return data;
  };

  const generateTransactionTypeData = () => {
    return [
      { name: 'Contratos', value: 45 },
      { name: 'Membresías', value: 15 },
      { name: 'Publicaciones', value: 8 },
      { name: 'Escrow', value: 32 }
    ];
  };

  const generateMonthlyTransactions = () => {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const currentMonth = new Date().getMonth();
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12;
      data.push({
        month: months[monthIndex],
        transactions: Math.floor(Math.random() * 100) + 20
      });
    }
    return data;
  };

  const handleCardClick = (chartType: ChartType) => {
    setSelectedChart(chartType);
    loadChartData(chartType);
  };

  const closeModal = () => {
    setSelectedChart(null);
    setChartData(null);
  };

  const handleSort = (field: SortField) => {
    let newDirection: SortDirection = 'asc';

    if (sortField === field) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
      }
    }

    setSortField(newDirection === null ? null : field);
    setSortDirection(newDirection);
  };

  const getSortedTransactions = () => {
    // First filter by search
    let filtered = transactions;
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = transactions.filter(t => {
        const id = t.id.toLowerCase();
        const description = (t.contract?.title || t.jobTitle || t.description || '').toLowerCase();
        const clientName = (t.contract?.client?.name || t.payer?.name || '').toLowerCase();
        const doerName = (t.doer?.name || t.contract?.doer?.name || t.recipient?.name || '').toLowerCase();
        return id.includes(searchLower) || description.includes(searchLower) || clientName.includes(searchLower) || doerName.includes(searchLower);
      });
    }

    if (!sortField || !sortDirection) return filtered;

    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type, 'es');
          break;
        case 'description':
          const descA = a.contract?.title || a.description;
          const descB = b.contract?.title || b.description;
          comparison = descA.localeCompare(descB, 'es');
          break;
        case 'client':
          const clientA = a.contract?.client?.name || a.payer?.name || '';
          const clientB = b.contract?.client?.name || b.payer?.name || '';
          comparison = clientA.localeCompare(clientB, 'es');
          break;
        case 'doer':
          const doerA = a.doer?.name || a.contract?.doer?.name || a.recipient?.name || '';
          const doerB = b.doer?.name || b.contract?.doer?.name || b.recipient?.name || '';
          comparison = doerA.localeCompare(doerB, 'es');
          break;
        case 'amount':
          comparison = (Number(a.totalAmount) || 0) - (Number(b.totalAmount) || 0);
          break;
        case 'commission':
          comparison = (Number(a.platformFee) || 0) - (Number(b.platformFee) || 0);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'released':
          comparison = (a.escrowReleased ? 1 : 0) - (b.escrowReleased ? 1 : 0);
          break;
        case 'paymentMethod':
          const methodA = a.paymentMethod || '';
          const methodB = b.paymentMethod || '';
          comparison = methodA.localeCompare(methodB, 'es');
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4" />
      : <ArrowDown className="w-4 h-4" />;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; icon: any; tooltip: string }> = {
      pending: {
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
        icon: Clock,
        tooltip: 'Pago iniciado pero no completado. Esperando confirmación de MercadoPago o verificación del comprobante.'
      },
      processing: {
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
        icon: Clock,
        tooltip: 'Pago en proceso de verificación por el equipo administrativo.'
      },
      held_escrow: {
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
        icon: Lock,
        tooltip: 'Fondos retenidos en escrow. Se liberarán cuando ambas partes confirmen que el trabajo fue completado.'
      },
      awaiting_confirmation: {
        color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400',
        icon: Clock,
        tooltip: 'Esperando que el cliente y el trabajador confirmen que el trabajo fue completado.'
      },
      completed: {
        color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
        icon: CheckCircle,
        tooltip: 'Pago completado exitosamente. Los fondos fueron procesados.'
      },
      released: {
        color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
        icon: CheckCircle,
        tooltip: 'Escrow liberado. El trabajador recibió los fondos después de la confirmación del trabajo.'
      },
      failed: {
        color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
        icon: XCircle,
        tooltip: 'Pago fallido. Hubo un error en el procesamiento o fue rechazado por MercadoPago.'
      },
      refunded: {
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
        icon: ArrowRight,
        tooltip: 'Pago reembolsado al cliente. Puede ser por cancelación, disputa resuelta o error.'
      },
      cancelled: {
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
        icon: XCircle,
        tooltip: 'Pago cancelado antes de completarse.'
      },
      disputed: {
        color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
        icon: XCircle,
        tooltip: 'Pago en disputa. El escrow está congelado hasta que se resuelva.'
      }
    };

    const badge = badges[status] || {
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
      icon: Clock,
      tooltip: `Estado: ${status}`
    };
    const Icon = badge.icon;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-help ${badge.color}`}
        title={badge.tooltip}
      >
        <Icon className="w-3 h-3" />
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const types: Record<string, { label: string; tooltip: string; color: string }> = {
      contract_payment: {
        label: 'Contrato',
        tooltip: 'Pago por un contrato de trabajo. Incluye el monto del servicio más la comisión de la plataforma.',
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
      },
      membership: {
        label: 'Membresía',
        tooltip: 'Pago de suscripción PRO o SUPER PRO. Otorga beneficios como menor comisión y mayor visibilidad.',
        color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400'
      },
      job_publication: {
        label: 'Publicación',
        tooltip: 'Pago por publicar un trabajo en la plataforma. El trabajo queda visible para que los profesionales apliquen.',
        color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/20 dark:text-sky-400'
      },
      budget_increase: {
        label: 'Aumento Presupuesto',
        tooltip: 'Pago adicional cuando el cliente aumenta el presupuesto de un trabajo ya publicado.',
        color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-400'
      },
      escrow_deposit: {
        label: 'Escrow',
        tooltip: 'Depósito en escrow. Los fondos quedan retenidos hasta que se complete y confirme el trabajo.',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
      },
      escrow_release: {
        label: 'Liberación',
        tooltip: 'Liberación de fondos desde escrow al trabajador después de confirmar el trabajo completado.',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
      },
      refund: {
        label: 'Reembolso',
        tooltip: 'Devolución de fondos al cliente. Puede ser por cancelación o disputa resuelta a favor del cliente.',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
      },
      contract: {
        label: 'Contrato',
        tooltip: 'Pago asociado a un contrato de trabajo.',
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
      }
    };

    const typeInfo = types[type] || {
      label: type,
      tooltip: `Tipo de transacción: ${type}`,
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
    };

    return (
      <span
        className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium cursor-help ${typeInfo.color}`}
        title={typeInfo.tooltip}
      >
        {typeInfo.label}
      </span>
    );
  };

  const getCardBrandLogo = (brand?: string) => {
    const logos: Record<string, { bg: string; text: string; label: string }> = {
      visa: { bg: 'bg-blue-600', text: 'text-white', label: 'VISA' },
      mastercard: { bg: 'bg-red-500', text: 'text-white', label: 'MC' },
      master: { bg: 'bg-red-500', text: 'text-white', label: 'MC' },
      amex: { bg: 'bg-blue-400', text: 'text-white', label: 'AMEX' },
      american_express: { bg: 'bg-blue-400', text: 'text-white', label: 'AMEX' },
      naranja: { bg: 'bg-orange-500', text: 'text-white', label: 'NAR' },
      cabal: { bg: 'bg-green-600', text: 'text-white', label: 'CAB' },
      mercadopago: { bg: 'bg-sky-500', text: 'text-white', label: 'MP' },
      account_money: { bg: 'bg-sky-500', text: 'text-white', label: 'MP' },
      debit: { bg: 'bg-gray-500', text: 'text-white', label: 'DEB' },
      credit: { bg: 'bg-purple-500', text: 'text-white', label: 'CRED' },
    };
    const normalizedBrand = brand?.toLowerCase().replace(/\s+/g, '_') || '';
    return logos[normalizedBrand] || { bg: 'bg-gray-400', text: 'text-white', label: brand?.slice(0, 4).toUpperCase() || '?' };
  };

  const renderPaymentMethod = (transaction: Transaction) => {
    const { paymentMethod, cardBrand, cardLastFourDigits, mercadopagoPaymentId, isOwnBankAccount, thirdPartyAccountHolder, senderBankName } = transaction;

    if (!paymentMethod && !cardBrand && !mercadopagoPaymentId) {
      return <span className="text-gray-400">-</span>;
    }

    // Check if it's a bank transfer with bank info
    if (paymentMethod === 'bank_transfer' && senderBankName) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white">
              TRANSF
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {senderBankName}
            </span>
          </div>
          <div className="text-xs">
            {isOwnBankAccount ? (
              <span className="text-green-600 dark:text-green-400">Cuenta propia</span>
            ) : (
              <span className="text-orange-600 dark:text-orange-400">
                Tercero: {thirdPartyAccountHolder || 'N/A'}
              </span>
            )}
          </div>
        </div>
      );
    }

    const logo = getCardBrandLogo(cardBrand || paymentMethod);

    return (
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${logo.bg} ${logo.text}`}>
          {logo.label}
        </span>
        {cardLastFourDigits && (
          <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
            •••• {cardLastFourDigits}
          </span>
        )}
      </div>
    );
  };

  const getChartTitle = () => {
    const titles = {
      escrow: 'Análisis de Pagos en Escrow',
      recent: 'Transacciones - Últimos 30 Días',
      commissions: 'Análisis de Comisiones',
      total: 'Análisis de Total de Transacciones'
    };
    return titles[selectedChart as keyof typeof titles] || '';
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (loading && transactions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Movimientos Financieros</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Historial completo de transacciones y comisiones
          </p>
        </div>
        <button
          onClick={handleExportXLSX}
          disabled={exporting || transactions.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Exportando...' : 'Exportar Excel'}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <button
            onClick={() => handleCardClick('escrow')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white text-left hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <Lock className="h-6 w-6" />
              <BarChart3 className="h-5 w-5 opacity-75" />
            </div>
            <h3 className="text-2xl font-bold">{stats.escrow?.held || 0}</h3>
            <p className="text-sm opacity-90">Pagos en Escrow</p>
            <p className="text-xs opacity-75 mt-1">Click para ver gráfico</p>
          </button>

          <button
            onClick={() => handleCardClick('recent')}
            className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white text-left hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="h-6 w-6" />
              <BarChart3 className="h-5 w-5 opacity-75" />
            </div>
            <h3 className="text-2xl font-bold">{stats.recent?.transactions || 0}</h3>
            <p className="text-sm opacity-90">Últimos 30 días</p>
            <p className="text-xs opacity-75 mt-1">Click para ver gráfico</p>
          </button>

          <button
            onClick={() => handleCardClick('commissions')}
            className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white text-left hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="h-6 w-6" />
              <BarChart3 className="h-5 w-5 opacity-75" />
            </div>
            <h3 className="text-2xl font-bold">
              ${stats.recent?.revenue?.toLocaleString() || 0}
            </h3>
            <p className="text-sm opacity-90">Comisiones (30d)</p>
            <p className="text-xs opacity-75 mt-1">Click para ver gráfico</p>
          </button>

          <button
            onClick={() => handleCardClick('total')}
            className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white text-left hover:shadow-xl transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="h-6 w-6" />
              <BarChart3 className="h-5 w-5 opacity-75" />
            </div>
            <h3 className="text-2xl font-bold">{pagination?.total || 0}</h3>
            <p className="text-sm opacity-90">Total Transacciones</p>
            <p className="text-xs opacity-75 mt-1">Click para ver gráfico</p>
          </button>
        </div>
      )}

      {/* Chart Modal */}
      {selectedChart && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="h-6 w-6" />
                {getChartTitle()}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="h-6 w-6 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {chartLoading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
                </div>
              ) : chartData ? (
                <div className="space-y-8">
                  {/* Escrow Charts */}
                  {selectedChart === 'escrow' && chartData.pieData && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Distribución de Pagos en Escrow
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={chartData.pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry) => `${entry.name}: ${entry.value}`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chartData.pieData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Tendencia de Escrow (Últimos 30 días)
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={chartData.trend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} name="Escrow" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}

                  {/* Recent Transactions Charts */}
                  {selectedChart === 'recent' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Transacciones Diarias (Últimos 30 días)
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={chartData.lineData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Transacciones" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Distribución por Tipo de Transacción
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartData.barData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="value" fill="#10b981" name="Cantidad" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}

                  {/* Commissions Charts */}
                  {selectedChart === 'commissions' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Comisiones Diarias (Últimos 30 días)
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={chartData.areaData}>
                            <defs>
                              <linearGradient id="colorCommission" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="value" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorCommission)" name="Comisiones ($)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Distribución de Tasas de Comisión
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={chartData.pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry) => `${entry.name}: ${entry.value}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chartData.pieData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}

                  {/* Total Transactions Charts */}
                  {selectedChart === 'total' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Transacciones Mensuales
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartData.barData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="transactions" fill="#f97316" name="Transacciones" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Distribución por Estado
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={chartData.statusData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry) => `${entry.name}: ${entry.value}`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chartData.statusData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                  No hay datos disponibles
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Buscar
            </label>
            <input
              type="text"
              placeholder="Buscar por ID, descripción, cliente o doer..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tipo
            </label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">Todos</option>
              <option value="contract_payment">Contratos</option>
              <option value="membership">Membresías</option>
              <option value="job_publication">Publicaciones</option>
              <option value="budget_increase">Aumento Presupuesto</option>
              <option value="escrow_deposit">Escrow</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estado
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="held_escrow">En Escrow</option>
              <option value="completed">Completado</option>
              <option value="released">Liberado</option>
              <option value="failed">Fallido</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" title="Identificador único del pago">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Fecha y hora en que se realizó el pago"
                  >
                    Fecha
                    <SortIcon field="date" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('type')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Tipo de transacción: Contrato, Membresía, Publicación, Escrow, etc."
                  >
                    Tipo
                    <SortIcon field="type" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('description')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Título del trabajo o descripción del pago"
                  >
                    Descripción
                    <SortIcon field="description" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('client')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Persona que realizó el pago (quien contrata el servicio)"
                  >
                    Cliente
                    <SortIcon field="client" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('doer')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Trabajador asignado al trabajo (quien realiza el servicio)"
                  >
                    Doer
                    <SortIcon field="doer" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('amount')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Monto total del pago incluyendo comisiones"
                  >
                    Monto Total
                    <SortIcon field="amount" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('commission')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Tipo de membresía del usuario y porcentaje de comisión aplicado (FREE: 8%, PRO: 3%, SUPER PRO: 2%)"
                  >
                    Suscripción
                    <SortIcon field="commission" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Estado actual del pago. Pasa el mouse sobre el badge para más detalles."
                  >
                    Estado
                    <SortIcon field="status" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('paymentMethod')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Método usado para el pago: tarjeta, transferencia bancaria, saldo de MercadoPago"
                  >
                    Método Pago
                    <SortIcon field="paymentMethod" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('released')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Estado del escrow: Retenido (esperando confirmación) o Liberado (pagado al trabajador)"
                  >
                    Escrow
                    <SortIcon field="released" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" title="Ver detalles completos del pago">
                  Ver
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {getSortedTransactions().map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div
                      className="text-xs font-mono text-gray-600 dark:text-gray-400 cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                      title={`Click para copiar ID completo: ${transaction.id}`}
                      onClick={() => {
                        navigator.clipboard.writeText(transaction.id);
                      }}
                    >
                      {transaction.id.slice(-8).toUpperCase()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {new Date(transaction.date).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getTypeBadge(transaction.type)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {transaction.contract ? (
                        <p className="font-medium">{transaction.contract.title}</p>
                      ) : transaction.jobTitle ? (
                        <p className="font-medium">{transaction.jobTitle}</p>
                      ) : (
                        <p>{transaction.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      {transaction.contract?.client ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.contract.client.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.contract.client.email}</p>
                        </>
                      ) : transaction.payer ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.payer.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.payer.email}</p>
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      {transaction.doer ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.doer.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.doer.email}</p>
                        </>
                      ) : transaction.contract?.doer ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.contract.doer.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.contract.doer.email}</p>
                        </>
                      ) : transaction.recipient ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">{transaction.recipient.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.recipient.email}</p>
                        </>
                      ) : transaction.type === 'job_publication' ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400" title="Pago de publicación - aún no hay trabajador asignado">
                          Sin asignar
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    <div>
                      <p className="font-bold">
                        ${(Number(transaction.totalAmount) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{transaction.currency || 'ARS'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      {transaction.type === 'membership' ? (
                        <>
                          <p className="font-medium text-purple-600 dark:text-purple-400">
                            {(Number(transaction.platformFeePercentage) || 0) >= 3 ? 'PRO' :
                             (Number(transaction.platformFeePercentage) || 0) >= 2 ? 'SUPER PRO' : 'FREE'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {(Number(transaction.platformFeePercentage) || 8)}%
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-gray-600 dark:text-gray-400">
                            {(Number(transaction.platformFeePercentage) || 8) <= 2 ? 'SUPER PRO' :
                             (Number(transaction.platformFeePercentage) || 8) <= 3 ? 'PRO' : 'FREE'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {(Number(transaction.platformFeePercentage) || 8).toFixed(1)}%
                          </p>
                        </>
                      )}
                      {(Number(transaction.platformFee) || 0) > 0 && (
                        <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">
                          ${(Number(transaction.platformFee) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(transaction.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {renderPaymentMethod(transaction)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {transaction.isEscrow || transaction.type === 'escrow_deposit' || transaction.type === 'contract_payment' ? (
                      <div className="flex flex-col items-center gap-1">
                        {transaction.escrowReleased ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 cursor-help"
                            title="Fondos liberados al trabajador. El trabajo fue confirmado como completado por ambas partes."
                          >
                            <CheckCircle className="w-3 h-3" />
                            Liberado
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 cursor-help"
                            title="Fondos retenidos en escrow. Se liberarán cuando el cliente y trabajador confirmen que el trabajo fue completado."
                          >
                            <Lock className="w-3 h-3" />
                            Retenido
                          </span>
                        )}
                        {(transaction.escrowAmount || 0) > 0 && (
                          <span
                            className="text-xs text-gray-600 dark:text-gray-400 font-medium cursor-help"
                            title="Monto en escrow (fondos retenidos o liberados)"
                          >
                            ${Number(transaction.escrowAmount).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400" title="Este tipo de pago no utiliza escrow">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      {/* View details link only - no approve/reject actions */}
                      <button
                        onClick={() => setSelectedTransaction(transaction)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                        title="Ver detalles"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Mostrando {((page - 1) * 50) + 1} - {Math.min(page * 50, pagination.total)} de {pagination.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Anterior
              </button>
              <span className="px-3 py-1">
                Página {page} de {pagination.pages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.pages}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Payment Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setRejectModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Rechazar Pago</h3>

            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-300">
                <strong>⚠️ Atención:</strong> Al rechazar este pago, el usuario será notificado y podrá subir un nuevo comprobante.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Razón del rechazo (requerida)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value.slice(0, 200))}
                placeholder="Ej: Comprobante ilegible, monto incorrecto, fecha no coincide..."
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-gray-900 dark:text-white"
                rows={3}
                maxLength={200}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">
                {rejectReason.length}/200 caracteres
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRejectPayment}
                disabled={actionLoading || !rejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Procesando...' : 'Rechazar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedTransaction(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Detalles del Pago</h3>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">ID</p>
                  <p className="font-medium text-gray-900 dark:text-white text-xs">{selectedTransaction.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fecha</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(selectedTransaction.date).toLocaleDateString('es-AR')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tipo</p>
                  {getTypeBadge(selectedTransaction.type)}
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Estado</p>
                  {getStatusBadge(selectedTransaction.status)}
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Monto Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${Number(selectedTransaction.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })} {selectedTransaction.currency}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Comisión</p>
                  <p className="font-medium text-green-600 dark:text-green-400">
                    ${Number(selectedTransaction.platformFee).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Porcentaje</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {Number(selectedTransaction.platformFeePercentage).toFixed(1)}%
                  </p>
                </div>
              </div>

              {selectedTransaction.payer && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Pagador</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedTransaction.payer.name}</p>
                  <p className="text-sm text-gray-500">{selectedTransaction.payer.email}</p>
                </div>
              )}

              {selectedTransaction.recipient && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Destinatario</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedTransaction.recipient.name}</p>
                  <p className="text-sm text-gray-500">{selectedTransaction.recipient.email}</p>
                </div>
              )}

              {selectedTransaction.description && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Descripción</p>
                  <p className="text-gray-900 dark:text-white">{selectedTransaction.description}</p>
                </div>
              )}

              {/* Info: Go to PendingPayments for approvals */}
              {selectedTransaction.status === 'pending_verification' && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Para aprobar o rechazar pagos, ve a <span className="font-medium text-sky-600">Pagos Pendientes</span> en el menú lateral.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
