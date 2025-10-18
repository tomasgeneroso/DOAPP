import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
} from "lucide-react";

interface DashboardStats {
  totalEarnings: number;
  totalSpent: number;
  activeContracts: number;
  completedContracts: number;
  rejectedProposals: number;
  pendingProposals: number;
  approvedProposals: number;
  totalProposals: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalEarnings: 0,
    totalSpent: 0,
    activeContracts: 0,
    completedContracts: 0,
    rejectedProposals: 0,
    pendingProposals: 0,
    approvedProposals: 0,
    totalProposals: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);

      // Fetch contracts
      const contractsRes = await fetch("/api/contracts", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const contractsData = await contractsRes.json();

      // Fetch proposals
      const proposalsRes = await fetch("/api/proposals", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const proposalsData = await proposalsRes.json();

      if (contractsData.success && proposalsData.success) {
        const contracts = contractsData.contracts || [];
        const proposals = proposalsData.proposals || [];

        // Calcular estadísticas
        const earnings = contracts
          .filter((c: any) => c.doer?._id === user?._id && c.status === "completed")
          .reduce((sum: number, c: any) => sum + c.price, 0);

        const spent = contracts
          .filter((c: any) => c.client?._id === user?._id && c.status === "completed")
          .reduce((sum: number, c: any) => sum + c.totalPrice, 0);

        const active = contracts.filter(
          (c: any) =>
            (c.client?._id === user?._id || c.doer?._id === user?._id) &&
            (c.status === "pending" || c.status === "accepted" || c.status === "in_progress")
        ).length;

        const completed = contracts.filter(
          (c: any) =>
            (c.client?._id === user?._id || c.doer?._id === user?._id) &&
            c.status === "completed"
        ).length;

        // Propuestas enviadas por el usuario (como freelancer)
        const sentProposals = proposals.filter((p: any) => p.freelancer?._id === user?._id);
        const pending = sentProposals.filter((p: any) => p.status === "pending").length;
        const approved = sentProposals.filter((p: any) => p.status === "approved").length;
        const rejected = sentProposals.filter(
          (p: any) => p.status === "rejected" || p.status === "withdrawn"
        ).length;

        setStats({
          totalEarnings: earnings,
          totalSpent: spent,
          activeContracts: active,
          completedContracts: completed,
          rejectedProposals: rejected,
          pendingProposals: pending,
          approvedProposals: approved,
          totalProposals: sentProposals.length,
        });
      }
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Ingresos Totales",
      value: `$${stats.totalEarnings.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-green-500",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      link: "/dashboard/earnings",
    },
    {
      title: "Gastos Totales",
      value: `$${stats.totalSpent.toLocaleString()}`,
      icon: TrendingDown,
      color: "text-red-500",
      bgColor: "bg-red-100 dark:bg-red-900/20",
      link: "/dashboard/expenses",
    },
    {
      title: "Contratos Activos",
      value: stats.activeContracts.toString(),
      icon: Briefcase,
      color: "text-sky-500",
      bgColor: "bg-sky-100 dark:bg-sky-900/20",
      link: "/dashboard/active-contracts",
    },
    {
      title: "Contratos Completados",
      value: stats.completedContracts.toString(),
      icon: CheckCircle,
      color: "text-emerald-500",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/20",
      link: "/contracts?status=completed",
    },
    {
      title: "Propuestas Pendientes",
      value: stats.pendingProposals.toString(),
      icon: Clock,
      color: "text-amber-500",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      link: "/dashboard/proposals?status=pending",
    },
    {
      title: "Propuestas Aprobadas",
      value: stats.approvedProposals.toString(),
      icon: CheckCircle,
      color: "text-teal-500",
      bgColor: "bg-teal-100 dark:bg-teal-900/20",
      link: "/dashboard/proposals?status=approved",
    },
    {
      title: "Propuestas Rechazadas",
      value: stats.rejectedProposals.toString(),
      icon: XCircle,
      color: "text-rose-500",
      bgColor: "bg-rose-100 dark:bg-rose-900/20",
      link: "/dashboard/proposals?status=rejected",
    },
    {
      title: "Total Propuestas",
      value: stats.totalProposals.toString(),
      icon: FileText,
      color: "text-violet-500",
      bgColor: "bg-violet-100 dark:bg-violet-900/20",
      link: "/dashboard/proposals",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Resumen de tu actividad en la plataforma
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Link
                key={index}
                to={stat.link}
                className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-sky-300 dark:hover:border-sky-600 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                      {stat.title}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-xs text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      Ver detalles →
                    </p>
                  </div>
                  <div className={`rounded-full p-3 ${stat.bgColor} group-hover:scale-110 transition-transform`}>
                    <Icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Balance Card */}
        <div className="mt-8 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 p-8 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-90">Balance Neto</p>
              <p className="mt-2 text-4xl font-bold">
                ${(stats.totalEarnings - stats.totalSpent).toLocaleString()}
              </p>
              <p className="mt-2 text-sm opacity-80">
                {stats.totalEarnings >= stats.totalSpent ? (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Ganancia positiva
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-4 w-4" />
                    Gastos mayores a ingresos
                  </span>
                )}
              </p>
            </div>
            <DollarSign className="h-16 w-16 opacity-20" />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Link
            to="/contracts"
            className="rounded-xl bg-white dark:bg-slate-800 p-6 text-center border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
          >
            <Briefcase className="mx-auto h-8 w-8 text-sky-500" />
            <p className="mt-2 font-medium text-slate-900 dark:text-white">
              Ver Contratos
            </p>
          </Link>
          <Link
            to="/proposals?type=sent"
            className="rounded-xl bg-white dark:bg-slate-800 p-6 text-center border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
          >
            <FileText className="mx-auto h-8 w-8 text-violet-500" />
            <p className="mt-2 font-medium text-slate-900 dark:text-white">
              Mis Propuestas
            </p>
          </Link>
          <Link
            to="/payments"
            className="rounded-xl bg-white dark:bg-slate-800 p-6 text-center border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
          >
            <DollarSign className="mx-auto h-8 w-8 text-green-500" />
            <p className="mt-2 font-medium text-slate-900 dark:text-white">
              Ver Pagos
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
