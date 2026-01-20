import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  DollarSign,
  Gift,
  Settings as SettingsIcon,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  CreditCard,
  Banknote,
  Building2,
} from "lucide-react";
import type { BalanceTransaction } from "@/types";

export default function BalancePage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "refund" | "payment" | "bonus">("all");

  useEffect(() => {
    fetchBalanceData();
  }, []);

  const fetchBalanceData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      // Fetch balance
      const balanceRes = await fetch("/api/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const balanceData = await balanceRes.json();
      if (balanceData.success) {
        setBalance(balanceData.balance);
      }

      // Fetch summary
      const summaryRes = await fetch("/api/balance/summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const summaryData = await summaryRes.json();
      if (summaryData.success) {
        setSummary(summaryData.summary);
        setTransactions(summaryData.summary.recentTransactions || []);
      }
    } catch (error) {
      console.error("Error fetching balance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (type?: string) => {
    try {
      const token = localStorage.getItem("token");
      const url = type && type !== "all"
        ? `/api/balance/transactions?type=${type}&limit=50`
        : `/api/balance/transactions?limit=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    fetchTransactions(tab === "all" ? undefined : tab);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "refund":
        return <ArrowDownCircle className="h-5 w-5 text-green-500" />;
      case "payment":
        return <ArrowUpCircle className="h-5 w-5 text-red-500" />;
      case "bonus":
        return <Gift className="h-5 w-5 text-purple-500" />;
      case "adjustment":
        return <SettingsIcon className="h-5 w-5 text-blue-500" />;
      default:
        return <RefreshCw className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      refund: "Reembolso",
      payment: "Pago",
      bonus: "Bonus",
      adjustment: "Ajuste",
      withdrawal: "Retiro",
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "refund":
      case "bonus":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "payment":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case "adjustment":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  // Get payment method icon based on card brand or payment type
  const getPaymentMethodIcon = (transaction: BalanceTransaction) => {
    const payment = transaction.relatedPayment;
    if (!payment || typeof payment === 'string') return null;

    const { cardBrand, paymentTypeId, paymentMethod } = payment;

    // Card brands
    if (cardBrand) {
      const brand = cardBrand.toLowerCase();
      if (brand.includes('visa')) {
        return (
          <div className="flex items-center gap-1.5">
            <div className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">VISA</div>
          </div>
        );
      }
      if (brand.includes('master')) {
        return (
          <div className="flex items-center gap-1.5">
            <div className="flex">
              <div className="w-4 h-4 bg-red-500 rounded-full -mr-1.5"></div>
              <div className="w-4 h-4 bg-yellow-500 rounded-full opacity-80"></div>
            </div>
          </div>
        );
      }
      if (brand.includes('amex') || brand.includes('american')) {
        return (
          <div className="flex items-center gap-1.5">
            <div className="bg-blue-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">AMEX</div>
          </div>
        );
      }
      // Generic card
      return <CreditCard className="h-4 w-4 text-slate-500" />;
    }

    // Payment types
    if (paymentTypeId === 'bank_transfer' || paymentMethod === 'bank_transfer') {
      return <Building2 className="h-4 w-4 text-green-600" />;
    }
    if (paymentTypeId === 'account_money') {
      return <Wallet className="h-4 w-4 text-sky-500" />;
    }
    if (paymentTypeId === 'credit_card' || paymentTypeId === 'debit_card') {
      return <CreditCard className="h-4 w-4 text-slate-500" />;
    }

    return null;
  };

  // Get payment method label with last 4 digits
  const getPaymentMethodLabel = (transaction: BalanceTransaction) => {
    const payment = transaction.relatedPayment;
    if (!payment || typeof payment === 'string') return null;

    const { cardLastFourDigits, cardBrand, paymentTypeId, paymentMethod } = payment;

    if (cardLastFourDigits && cardBrand) {
      return `•••• ${cardLastFourDigits}`;
    }

    if (paymentTypeId === 'bank_transfer' || paymentMethod === 'bank_transfer') {
      return 'Transferencia';
    }
    if (paymentTypeId === 'account_money') {
      return 'Dinero en cuenta';
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Mi Saldo - DoApp</title>
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <Wallet className="h-8 w-8 text-sky-600" />
              Mi Saldo
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Administra tu saldo y revisa tu historial de transacciones
            </p>
          </div>

          {/* Balance Card */}
          <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl p-8 text-white shadow-lg mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90">Saldo Disponible</p>
                <p className="text-5xl font-bold mt-2">
                  ${(balance || 0).toLocaleString("es-AR")}
                </p>
                <p className="text-xs opacity-70 mt-1">ARS (Pesos Argentinos)</p>
              </div>
              <div className="flex flex-col items-end gap-4">
                <button
                  onClick={fetchBalanceData}
                  className="p-3 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                  title="Actualizar saldo"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
                <div className="text-right">
                  <p className="text-sm opacity-90">Usuario: {user?.name}</p>
                  <p className="text-xs opacity-70">ID: {user?._id?.slice(-8)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Reembolsos Totales</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                      ${summary.totalRefunds.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <TrendingDown className="h-10 w-10 text-green-500 opacity-20" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Pagos Totales</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                      ${summary.totalPayments.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <TrendingUp className="h-10 w-10 text-red-500 opacity-20" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Bonus Recibidos</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                      ${summary.totalBonuses.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <Gift className="h-10 w-10 text-purple-500 opacity-20" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Transacciones</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {summary.transactionCount}
                    </p>
                  </div>
                  <DollarSign className="h-10 w-10 text-slate-500 opacity-20" />
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-700">
              <nav className="flex -mb-px">
                {[
                  { id: "all", label: "Todas" },
                  { id: "refund", label: "Reembolsos" },
                  { id: "payment", label: "Pagos" },
                  { id: "bonus", label: "Bonus" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id as typeof activeTab)}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? "border-sky-500 text-sky-600 dark:text-sky-400"
                        : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Transactions List */}
            <div className="p-6">
              {transactions.length === 0 ? (
                <div className="text-center py-12">
                  <Wallet className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-600 dark:text-slate-400">
                    No hay transacciones registradas
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction._id}
                      className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg">
                          {getTypeIcon(transaction.type)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {transaction.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(transaction.type)}`}>
                              {getTypeLabel(transaction.type)}
                            </span>
                            {/* Payment method badge */}
                            {getPaymentMethodIcon(transaction) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                {getPaymentMethodIcon(transaction)}
                                {getPaymentMethodLabel(transaction) && (
                                  <span className="font-mono">{getPaymentMethodLabel(transaction)}</span>
                                )}
                              </span>
                            )}
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {new Date(transaction.createdAt).toLocaleDateString("es-AR", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xl font-bold ${
                            transaction.amount >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {transaction.amount >= 0 ? "+" : ""}${Math.abs(transaction.amount).toLocaleString("es-AR")}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Saldo: ${transaction.balanceAfter.toLocaleString("es-AR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Info Boxes */}
          <div className="mt-8 space-y-4">
            <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-6">
              <h3 className="font-semibold text-sky-900 dark:text-sky-100 mb-2 flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                ¿Qué es el saldo a favor?
              </h3>
              <p className="text-sm text-sky-800 dark:text-sky-300">
                Tu saldo a favor se genera cuando reduces el precio de un contrato o cuando recibes
                reembolsos. Puedes usar este saldo para aumentar el precio de contratos futuros sin
                necesidad de realizar un nuevo pago.
              </p>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
              <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                <Banknote className="h-5 w-5" />
                Pagos rápidos con MercadoPago
              </h3>
              <p className="text-sm text-green-800 dark:text-green-300">
                Al usar Mercado Pago, los pagos de los trabajos se acreditarán dentro de las 48 horas
                posteriores a la finalización del trabajo, <strong>sin comisiones bancarias</strong>.
                Tu dinero llega de forma rápida y segura.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
