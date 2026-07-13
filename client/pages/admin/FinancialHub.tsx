import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, CreditCard, Send, TrendingUp, Loader2, Lock, Users, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

interface FinancialData {
  // Bandeja de pendientes (counts)
  paymentsToVerify: number;
  withdrawalsToProcess: number;
  workerPayoutsPending: number;
  openDisputes: number;
  // KPIs (amounts)
  totalRevenueARS: number;
  todayRevenue: number;
  escrowHeldARS: number;
  pendingWithdrawalsARS: number;
}

const money = (n?: number) => `$${(n || 0).toLocaleString('es-AR')}`;

export default function FinancialHub() {
  const navigate = useNavigate();
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/hubs/financial/overview', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const result = await res.json();
      if (result.success) setData(result.financial);
    } catch (err) {
      console.error('Error loading financial hub:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOverview(); }, []);

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>;

  const kpis = [
    { label: 'Ingresos totales', value: money(data?.totalRevenueARS), icon: TrendingUp, color: 'text-green-600', border: 'border-green-500' },
    { label: 'Ingresos hoy', value: money(data?.todayRevenue), icon: DollarSign, color: 'text-orange-600', border: 'border-orange-500' },
    { label: 'Retenido en escrow', value: money(data?.escrowHeldARS), icon: Lock, color: 'text-blue-600', border: 'border-blue-500' },
    { label: 'Retiros pendientes', value: money(data?.pendingWithdrawalsARS), icon: Send, color: 'text-purple-600', border: 'border-purple-500' },
  ];

  const inbox = [
    {
      label: 'Comprobantes a verificar',
      count: data?.paymentsToVerify || 0,
      hint: 'Pagos de clientes esperando verificación del comprobante.',
      icon: CreditCard,
      to: '/admin/pending-payments',
      accent: 'sky',
    },
    {
      label: 'Pagos a trabajadores por confirmar',
      count: data?.workerPayoutsPending || 0,
      hint: 'Pagos confirmados para transferir al trabajador.',
      icon: Users,
      to: '/admin/pending-payments',
      accent: 'emerald',
    },
    {
      label: 'Retiros a procesar',
      count: data?.withdrawalsToProcess || 0,
      hint: 'Solicitudes de retiro pendientes de aprobar o transferir.',
      icon: Send,
      to: '/admin/withdrawals',
      accent: 'purple',
    },
    {
      label: 'Disputas abiertas',
      count: data?.openDisputes || 0,
      hint: 'Reclamos que requieren resolución.',
      icon: AlertTriangle,
      to: '/admin/disputes',
      accent: 'rose',
    },
  ];

  const accentClasses: Record<string, { ring: string; text: string; bg: string }> = {
    sky: { ring: 'ring-sky-400 dark:ring-sky-600', text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-900/20' },
    emerald: { ring: 'ring-emerald-400 dark:ring-emerald-600', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    purple: { ring: 'ring-purple-400 dark:ring-purple-600', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    rose: { ring: 'ring-rose-400 dark:ring-rose-600', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20' },
  };

  const totalPending = inbox.reduce((s, i) => s + i.count, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-green-600 dark:text-green-400 flex items-center gap-3">
              <DollarSign className="w-7 h-7" /> Panel Financiero
            </h1>
            <p className="text-slate-600 dark:text-slate-300 mt-1 text-sm">
              Bandeja de pendientes y métricas de pagos, retiros e ingresos.
            </p>
          </div>
          <button onClick={fetchOverview} className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {kpis.map((k) => (
            <div key={k.label} className={`bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 ${k.border}`}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 truncate">{k.label}</p>
                  <p className={`text-xl font-bold ${k.color} truncate`}>{k.value}</p>
                </div>
                <k.icon className={`w-6 h-6 shrink-0 ${k.color}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Bandeja de pendientes */}
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bandeja de pendientes</h2>
          {totalPending > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {totalPending} por resolver
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {inbox.map((item) => {
            const a = accentClasses[item.accent];
            const active = item.count > 0;
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.to)}
                className={`text-left bg-white dark:bg-slate-800 rounded-xl shadow p-4 flex items-center gap-4 transition hover:shadow-md ${active ? `ring-2 ${a.ring}` : 'opacity-80'}`}
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${a.bg}`}>
                  <item.icon className={`w-6 h-6 ${a.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${active ? a.text : 'text-slate-400'}`}>{item.count}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.hint}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Accesos rápidos */}
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Gestión de pagos', to: '/admin/pending-payments' },
            { label: 'Retiros', to: '/admin/withdrawals' },
            { label: 'Transacciones', to: '/admin/financial-transactions' },
            { label: 'Disputas', to: '/admin/disputes' },
          ].map((l) => (
            <button
              key={l.to + l.label}
              onClick={() => navigate(l.to)}
              className="py-3 px-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
