import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import { SkeletonDashboardCard } from "../components/ui/Skeleton";
import MultipleRatings from "../components/user/MultipleRatings";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Crown,
  Lock,
  Sparkles,
  Gift,
  Users,
  ArrowDownCircle,
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
  postedJobs: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { registerDashboardRefreshHandler, registerContractUpdateHandler, registerProposalUpdateHandler, registerJobUpdateHandler } = useSocket();
  const [stats, setStats] = useState<DashboardStats>({
    totalEarnings: 0,
    totalSpent: 0,
    activeContracts: 0,
    completedContracts: 0,
    rejectedProposals: 0,
    pendingProposals: 0,
    approvedProposals: 0,
    totalProposals: 0,
    postedJobs: 0,
  });
  const [loading, setLoading] = useState(true);

  // Determinar si el usuario es FREE
  const isFreeUser = !user?.membershipTier || user?.membershipTier === 'free';

  useEffect(() => {
    // Only fetch when user is loaded
    if (!user) {
      console.log('⏳ Waiting for user to load...');
      return;
    }

    console.log('✅ User loaded, fetching dashboard stats for:', user.id);
    fetchDashboardStats();

    // Register real-time event handlers
    registerDashboardRefreshHandler(() => {
      console.log("📊 Dashboard refreshing due to real-time event...");
      fetchDashboardStats();
    });

    registerContractUpdateHandler(() => {
      console.log("📝 Contract update detected, refreshing dashboard...");
      fetchDashboardStats();
    });

    registerProposalUpdateHandler(() => {
      console.log("📄 Proposal update detected, refreshing dashboard...");
      fetchDashboardStats();
    });

    registerJobUpdateHandler(() => {
      console.log("💼 Job update detected, refreshing dashboard...");
      fetchDashboardStats();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchDashboardStats = async () => {
    if (!user?.id) {
      console.log('❌ Cannot fetch dashboard stats without user ID');
      return;
    }

    try {
      setLoading(true);
      console.log('📊 Fetching dashboard stats for user:', user.id);

      // Fetch contracts
      const contractsRes = await fetch("/api/contracts", {
        credentials: 'include',
      });
      const contractsData = await contractsRes.json();

      // Fetch proposals
      const proposalsRes = await fetch("/api/proposals", {
        credentials: 'include',
      });
      const proposalsData = await proposalsRes.json();

      // Fetch jobs - need to get ALL jobs to filter client's published jobs
      const jobsRes = await fetch("/api/jobs?limit=100", {
        credentials: 'include',
      });
      const jobsData = await jobsRes.json();
      console.log('📥 Jobs data received:', jobsData.jobs?.length, 'jobs');
      console.log('📥 Current user ID:', user?.id);
      if (jobsData.jobs && jobsData.jobs.length > 0) {
        console.log('📥 Sample job structure:', jobsData.jobs[0]);
      }

      if (contractsData.success && proposalsData.success) {
        const contracts = contractsData.contracts || [];
        const proposals = proposalsData.proposals || [];
        const jobs = jobsData.jobs || [];

        // Calcular estadísticas usando PostgreSQL (id) solo
        const earnings = contracts
          .filter((c: any) => {
            const isDoer = c.doer?.id === user?.id;
            const isCompleted = c.status === "completed";
            return isDoer && isCompleted;
          })
          .reduce((sum: number, c: any) => sum + (c.price || 0), 0);

        const spent = contracts
          .filter((c: any) => {
            const isClient = c.client?.id === user?.id;
            const isCompleted = c.status === "completed";
            return isClient && isCompleted;
          })
          .reduce((sum: number, c: any) => sum + (c.totalPrice || 0), 0);

        const active = contracts.filter(
          (c: any) => {
            const isClient = c.client?.id === user?.id;
            const isDoer = c.doer?.id === user?.id;
            const isActive = ["pending", "accepted", "in_progress", "awaiting_confirmation"].includes(c.status);
            return (isClient || isDoer) && isActive;
          }
        ).length;

        const completed = contracts.filter(
          (c: any) => {
            const isClient = c.client?.id === user?.id;
            const isDoer = c.doer?.id === user?.id;
            return (isClient || isDoer) && c.status === "completed";
          }
        ).length;

        // Propuestas enviadas por el usuario (como freelancer)
        const sentProposals = proposals.filter((p: any) => p.freelancer?.id === user?.id);
        const pending = sentProposals.filter((p: any) => p.status === "pending").length;
        const approved = sentProposals.filter((p: any) => p.status === "approved").length;
        const rejected = sentProposals.filter(
          (p: any) => p.status === "rejected" || p.status === "withdrawn"
        ).length;

        // Jobs publicados por el usuario (como cliente) - TODOS los estados
        const postedJobs = jobs.filter((j: any) => {
          const isPostedByUser = j.clientId === user?.id || (typeof j.client === 'object' && j.client?.id === user?.id);
          console.log('🔍 Job:', j.id, 'title:', j.title, 'clientId:', j.clientId, 'userId:', user?.id, 'status:', j.status, 'match:', isPostedByUser);
          return isPostedByUser;
        }).length;
        console.log('📊 Total jobs publicados por usuario:', postedJobs, 'de', jobs.length, 'jobs totales');

        setStats({
          totalEarnings: earnings,
          totalSpent: spent,
          activeContracts: active,
          completedContracts: completed,
          rejectedProposals: rejected,
          pendingProposals: pending,
          approvedProposals: approved,
          totalProposals: sentProposals.length,
          postedJobs: postedJobs,
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header Skeleton */}
          <div className="space-y-2">
            <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
            <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
          </div>

          {/* Stats Grid Skeleton */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <SkeletonDashboardCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Calculate free contracts info
  const freeContractsRemaining = user?.freeContractsRemaining || 0;
  const proContractsUsed = user?.monthlyContractsUsed || 0;
  let monthlyFreeLimit = 0;
  if (user?.membershipTier === 'super_pro') monthlyFreeLimit = 2;
  else if (user?.membershipTier === 'pro') monthlyFreeLimit = 1;
  const monthlyFreeRemaining = Math.max(0, monthlyFreeLimit - proContractsUsed);

  // Grupo 1: Finanzas
  const financeCards = [
    {
      title: t('balance.earnings'),
      value: `$${stats.totalEarnings.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-green-500",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      link: "/dashboard/earnings",
      description: t('dashboard.earningsDescription', 'Money received (without commissions)'),
    },
    {
      title: t('balance.expenses'),
      value: `$${stats.totalSpent.toLocaleString()}`,
      icon: TrendingDown,
      color: "text-red-500",
      bgColor: "bg-red-100 dark:bg-red-900/20",
      link: "/dashboard/expenses",
      description: t('dashboard.expensesDescription', 'Includes platform commission'),
    },
  ];

  // Grupo 2: Trabajos y Contratos
  const jobsAndContractsCards = [
    {
      title: t('dashboard.postedJobs', 'Posted jobs'),
      value: stats.postedJobs.toString(),
      icon: Briefcase,
      color: "text-indigo-500",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/20",
      link: "/",
      description: (() => {
        const initialUsed = 3 - freeContractsRemaining;
        const monthlyUsed = proContractsUsed;
        const parts = [];

        if (initialUsed > 0) {
          parts.push(`${initialUsed} ${t('dashboard.initial', 'initial')}`);
        }
        if (monthlyUsed > 0 && monthlyFreeLimit > 0) {
          const tierName = user?.membershipTier === 'super_pro' ? 'SUPER PRO' : 'PRO';
          parts.push(`${monthlyUsed} ${tierName}`);
        }

        if (parts.length > 0) {
          return `${t('dashboard.used', 'Used')}: ${parts.join(', ')}`;
        }
        return t('dashboard.postedJobsDescription', 'Jobs you posted as a client');
      })(),
    },
    {
      title: t('dashboard.activeContracts', 'Active contracts'),
      value: stats.activeContracts.toString(),
      icon: Briefcase,
      color: "text-sky-500",
      bgColor: "bg-sky-100 dark:bg-sky-900/20",
      link: "/dashboard/active-contracts",
    },
    {
      title: t('jobs.status.completed'),
      value: stats.completedContracts.toString(),
      icon: CheckCircle,
      color: "text-emerald-500",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/20",
      link: "/contracts?status=completed",
    },
  ];

  // Grupo 3: Propuestas
  const proposalsCards = [
    {
      title: t('dashboard.totalProposals', 'Total proposals'),
      value: stats.totalProposals.toString(),
      icon: FileText,
      color: "text-violet-500",
      bgColor: "bg-violet-100 dark:bg-violet-900/20",
      link: "/dashboard/proposals",
    },
    {
      title: t('dashboard.pendingProposals', 'Pending proposals'),
      value: stats.pendingProposals.toString(),
      icon: Clock,
      color: "text-amber-500",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      link: "/dashboard/proposals?status=pending",
    },
    {
      title: t('dashboard.approvedProposals', 'Approved proposals'),
      value: stats.approvedProposals.toString(),
      icon: CheckCircle,
      color: "text-teal-500",
      bgColor: "bg-teal-100 dark:bg-teal-900/20",
      link: "/dashboard/proposals?status=approved",
    },
    {
      title: t('dashboard.rejectedProposals', 'Rejected proposals'),
      value: stats.rejectedProposals.toString(),
      icon: XCircle,
      color: "text-rose-500",
      bgColor: "bg-rose-100 dark:bg-rose-900/20",
      link: "/dashboard/proposals?status=rejected",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 relative">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            {t('dashboard.subtitle', 'Summary of your activity on the platform')}
          </p>
        </div>

        {/* Balance Card - SIEMPRE VISIBLE (sin blur) para todos los usuarios */}
        <div className={`mb-8 rounded-xl p-8 text-white shadow-lg transition-all ${
          (user?.balance || 0) >= 0
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600"
            : "bg-gradient-to-br from-red-500 to-red-600"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-90">
                {(user?.balance || 0) >= 0 ? t('dashboard.availableBalance', 'Available balance') : t('dashboard.debtBalance', 'Debt balance')}
              </p>
              <p className="mt-2 text-4xl font-bold">
                {(user?.balance || 0) >= 0
                  ? `$${(user?.balance || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                  : `-$${Math.abs(user?.balance || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                } ARS
              </p>
              <p className="mt-1 text-xs opacity-70">
                {(user?.balance || 0) >= 0
                  ? t('dashboard.availableBalanceDesc', 'Your available balance on the platform')
                  : t('dashboard.debtBalanceDesc', 'You have pending payments to complete')
                }
              </p>
              <p className="mt-2 text-sm opacity-80">
                {(user?.balance || 0) >= 0 ? (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    {t('dashboard.positiveBalance', 'Positive balance')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-4 w-4" />
                    {t('dashboard.jobsPausedUntilPayment', 'Jobs paused until payment is completed')}
                  </span>
                )}
              </p>
              {(user?.balance || 0) < 0 && (
                <Link
                  to="/payments"
                  className="mt-4 inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <DollarSign className="h-4 w-4" />
                  {t('dashboard.completePayment', 'Complete payment')}
                </Link>
              )}
            </div>
            <DollarSign className="h-16 w-16 opacity-20" />
          </div>
        </div>

        {/* Retiro de Saldo - debajo del balance */}
        {(user?.balance || 0) >= 0 && (
          <div className="mb-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <ArrowDownCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{t('dashboard.withdrawalTitle')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('dashboard.withdrawalAvailable')}: <span className="font-medium text-emerald-600 dark:text-emerald-400">${(user?.balance || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS</span>
                </p>
              </div>
            </div>
            <Link
              to="/withdrawals"
              className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium text-sm transition-colors"
            >
              <ArrowDownCircle className="w-4 h-4" />
              {t('dashboard.withdrawalRequest')}
            </Link>
          </div>
        )}

        {/* Selector de Planes para usuarios FREE - Justo debajo del balance */}
        {isFreeUser && (
          <div className="mb-8 relative z-10">
            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-2xl border-2 sm:border-4 border-purple-500 dark:border-purple-600 p-4 sm:p-8 relative overflow-hidden">
              {/* Decorative background */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-purple-900/20 dark:via-blue-900/20 dark:to-pink-900/20 opacity-50"></div>

              {/* Content */}
              <div className="relative z-10">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full mb-4">
                    <Lock className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">
                      {t('dashboard.choosePlan', 'Choose your plan')}
                    </span>
                  </h2>
                  <p className="text-slate-600 dark:text-slate-300">
                    {t('dashboard.unlockPotential', 'Unlock the full potential of DOAPP')}
                  </p>
                </div>

                {/* Plans Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* PRO Mensual */}
                  <div
                    onClick={() => navigate("/membership/checkout?plan=monthly")}
                    className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-5 border-2 border-purple-300 dark:border-purple-700 hover:border-purple-500 dark:hover:border-purple-500 transition-all cursor-pointer hover:shadow-lg hover:scale-105"
                  >
                    <div className="text-center mb-4">
                      <Crown className="w-10 h-10 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">PRO Mensual</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.mostPopular', 'Most popular')}</p>
                    </div>
                    <div className="text-center mb-4">
                      <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">$4.999</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">ARS/mes</p>
                    </div>
                    <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 mb-4">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>3 contratos/mes al 3%</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{t('dashboard.fullDashboard', 'Full dashboard')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{t('dashboard.verifiedBadge', 'Verified badge')}</span>
                      </li>
                    </ul>
                  </div>

                  {/* PRO Trimestral */}
                  <div
                    onClick={() => navigate("/membership/checkout?plan=quarterly")}
                    className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-5 border-2 border-green-300 dark:border-green-700 hover:border-green-500 dark:hover:border-green-500 transition-all cursor-pointer hover:shadow-lg hover:scale-105 relative"
                  >
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                        {t('dashboard.save11', 'SAVE 11%')}
                      </span>
                    </div>
                    <div className="text-center mb-4">
                      <Crown className="w-10 h-10 text-green-600 dark:text-green-400 mx-auto mb-2" />
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">PRO Trimestral</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.bestValue', 'Best value')}</p>
                    </div>
                    <div className="text-center mb-4">
                      <div className="text-3xl font-bold text-green-600 dark:text-green-400">$13.347</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.arsEvery3Months', 'ARS every 3 months')}</p>
                      <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">$4.449/mes</p>
                    </div>
                    <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 mb-4">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>3 contratos/mes al 3%</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{t('dashboard.fullDashboard', 'Full dashboard')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{t('dashboard.verifiedBadge', 'Verified badge')}</span>
                      </li>
                    </ul>
                  </div>

                  {/* SUPER PRO */}
                  <div
                    onClick={() => navigate("/membership/checkout?plan=super_pro")}
                    className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-5 border-2 border-pink-400 dark:border-pink-600 hover:border-pink-500 dark:hover:border-pink-500 transition-all cursor-pointer hover:shadow-lg hover:scale-105 relative"
                  >
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> PREMIUM
                      </span>
                    </div>
                    <div className="text-center mb-4">
                      <Sparkles className="w-10 h-10 text-pink-600 dark:text-pink-400 mx-auto mb-2" />
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">SUPER PRO</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.maximumSavings', 'Maximum savings')}</p>
                    </div>
                    <div className="text-center mb-4">
                      <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-600 to-purple-600">$8.999</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">ARS/mes</p>
                    </div>
                    <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 mb-4">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-pink-500 flex-shrink-0 mt-0.5" />
                        <span><strong>{t('dashboard.onePercentCommission', '1% commission')}</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-pink-500 flex-shrink-0 mt-0.5" />
                        <span>{t('dashboard.advancedAnalytics', 'Advanced analytics')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-pink-500 flex-shrink-0 mt-0.5" />
                        <span>{t('dashboard.exclusiveDashboard', 'Exclusive dashboard')}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Footer Note */}
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('dashboard.allPlansIncludeCancellation', 'All plans include cancellation anytime')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Content Wrapper - Aplicar blur si es FREE, mostrar parcialmente */}
        <div className={isFreeUser ? "filter blur-sm pointer-events-none select-none opacity-40 max-h-[400px] overflow-hidden" : ""}>

          {/* Sección: Finanzas */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {t('dashboard.finances', 'Finances')}
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {financeCards.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <Link
                    key={index}
                    to={stat.link}
                    className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-sky-300 dark:hover:border-sky-600 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {stat.title}
                        </p>
                        <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                          {stat.value}
                        </p>
                        {stat.description && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {stat.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          {t('common.viewDetails', 'View details')} →
                        </p>
                      </div>
                      <div className={`rounded-full p-3 ${stat.bgColor} group-hover:scale-110 transition-transform flex-shrink-0`}>
                        <Icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sección: Trabajos y Contratos */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {t('dashboard.jobsAndContracts', 'Jobs & Contracts')}
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {jobsAndContractsCards.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <Link
                    key={index}
                    to={stat.link}
                    className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-sky-300 dark:hover:border-sky-600 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {stat.title}
                        </p>
                        <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                          {stat.value}
                        </p>
                        {stat.description && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {stat.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          {t('common.viewDetails', 'View details')} →
                        </p>
                      </div>
                      <div className={`rounded-full p-3 ${stat.bgColor} group-hover:scale-110 transition-transform flex-shrink-0`}>
                        <Icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sección: Propuestas */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {t('dashboard.proposals', 'Proposals')}
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {proposalsCards.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <Link
                    key={index}
                    to={stat.link}
                    className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-sky-300 dark:hover:border-sky-600 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {stat.title}
                        </p>
                        <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                          {stat.value}
                        </p>
                        <p className="mt-1 text-xs text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          {t('common.viewDetails', 'View details')} →
                        </p>
                      </div>
                      <div className={`rounded-full p-3 ${stat.bgColor} group-hover:scale-110 transition-transform flex-shrink-0`}>
                        <Icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-8">
            <Link
              to="/balance"
              className="block rounded-xl bg-white dark:bg-slate-800 p-6 text-center border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow max-w-md mx-auto"
            >
              <DollarSign className="mx-auto h-8 w-8 text-green-500" />
              <p className="mt-2 font-medium text-slate-900 dark:text-white">
                {t('dashboard.viewPayments', 'View payments')}
              </p>
            </Link>
          </div>

          {/* My Ratings Section */}
          {user && (
            <div className="mt-8">
              <div className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  {t('dashboard.myRatings', 'My ratings')}
                </h2>
                <MultipleRatings user={user} showAll={true} />
              </div>
            </div>
          )}

          {/* Referral Program Card */}
          <Link to="/referrals" className="mt-8 block">
            <div className="rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 p-8 text-white shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Gift className="h-8 w-8" />
                    <p className="text-sm font-medium opacity-90">{t('dashboard.referralProgram', 'Referral program')}</p>
                  </div>
                  <p className="text-3xl font-bold mb-2">
                    {t('dashboard.inviteAndEarn', 'Invite & Earn')}
                  </p>
                  <p className="text-sm opacity-80 mb-4">
                    {t('dashboard.shareCodeDescription', 'Share your code with friends and get amazing benefits')}
                  </p>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      <div>
                        <p className="text-xs opacity-70">{t('dashboard.referrals', 'Referrals')}</p>
                        <p className="text-lg font-bold">{user?.totalReferrals || 0}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5" />
                      <div>
                        <p className="text-xs opacity-70">{t('dashboard.freeContracts', 'Free contracts')}</p>
                        <p className="text-lg font-bold">{user?.freeContractsRemaining || 0}</p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm opacity-90 flex items-center gap-1">
                    {t('dashboard.viewMyCodeAndDetails', 'View my code and details')} →
                  </p>
                </div>
                <Gift className="h-20 w-20 opacity-20" />
              </div>
            </div>
          </Link>

          {/* Uso Membresía PRO - Cards en 2 columnas (para usuarios PRO) */}
          {user?.membershipTier === 'pro' && (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card PRO Dashboard */}
              <Link to="/pro/usage">
                <div className="rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 p-8 text-white shadow-lg hover:shadow-xl transition-shadow cursor-pointer h-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Crown className="h-8 w-8 text-yellow-300" />
                        <p className="text-sm font-medium opacity-90">{t('dashboard.proMembership', 'PRO Membership')}</p>
                      </div>
                      <p className="text-3xl font-bold">
                        {t('dashboard.viewDashboard', 'View Dashboard')}
                      </p>
                      <p className="mt-1 text-sm opacity-70">
                        {t('dashboard.freeContractsAndBonus', 'Free contracts and monthly bonuses')}
                      </p>
                      <p className="mt-2 text-sm opacity-80 flex items-center gap-1">
                        <Sparkles className="h-4 w-4" />
                        {t('dashboard.accessProStats', 'Access your PRO stats')}
                      </p>
                    </div>
                    <Crown className="h-16 w-16 opacity-20" />
                  </div>
                </div>
              </Link>

              {/* Card SUPER PRO Upgrade */}
              <Link to="/membership/checkout?plan=super_pro">
                <div className="rounded-xl bg-gradient-to-br from-pink-600 via-purple-600 to-indigo-600 p-8 text-white shadow-lg hover:shadow-xl transition-shadow cursor-pointer h-full border-2 border-yellow-400">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Sparkles className="h-8 w-8 text-yellow-300" />
                        <p className="text-sm font-medium opacity-90">{t('dashboard.upgradeAvailable', 'Upgrade available')}</p>
                      </div>
                      <p className="text-3xl font-bold">
                        SUPER PRO
                      </p>
                      <p className="mt-1 text-sm opacity-70">
                        Solo 1% de comisión + Analytics
                      </p>
                      <p className="mt-2 text-sm opacity-80 flex items-center gap-1">
                        <Crown className="h-4 w-4 text-yellow-300" />
                        {t('dashboard.upgradeYourPlan', '$8.999/mo - Upgrade your plan')}
                      </p>
                    </div>
                    <Sparkles className="h-16 w-16 opacity-20" />
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Uso Membresía SUPER PRO - Card único ancho completo (para usuarios SUPER PRO) */}
          {user?.membershipTier === 'super_pro' && (
            <Link to="/pro/usage" className="mt-8 block">
              <div className="rounded-xl bg-gradient-to-br from-pink-600 via-purple-600 to-indigo-600 p-8 text-white shadow-lg hover:shadow-xl transition-shadow cursor-pointer border-2 border-yellow-400">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Sparkles className="h-8 w-8 text-yellow-300 animate-pulse" />
                      <p className="text-sm font-medium opacity-90">{t('dashboard.superProMembership', 'SUPER PRO Membership')}</p>
                      <span className="text-xs bg-yellow-400 text-purple-900 px-3 py-1 rounded-full font-bold">
                        PREMIUM
                      </span>
                    </div>
                    <p className="text-3xl font-bold">
                      {t('dashboard.viewPremiumDashboard', 'View Premium Dashboard')}
                    </p>
                    <p className="mt-1 text-sm opacity-70">
                      {t('dashboard.onePercentPlusAnalytics', '1% commission + Advanced analytics')}
                    </p>
                    <p className="mt-2 text-sm opacity-80 flex items-center gap-1">
                      <Crown className="h-4 w-4 text-yellow-300" />
                      {t('dashboard.accessSuperProDashboard', 'Access your exclusive SUPER PRO dashboard')}
                    </p>
                  </div>
                  <Sparkles className="h-16 w-16 opacity-20" />
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
