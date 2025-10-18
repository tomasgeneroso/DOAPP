import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../utils/fetchWithAuth";
import { Gift, Users, Copy, Check, Trophy, Clock } from "lucide-react";

interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  freeContractsRemaining: number;
  referralEarnings: number;
  pendingReferrals: number;
  completedReferrals: number;
}

interface Referral {
  id: string;
  user: {
    name: string;
    email: string;
    avatar?: string;
    createdAt: string;
  };
  status: "pending" | "completed" | "credited";
  createdAt: string;
  firstContractCompletedAt?: string;
  creditedAt?: string;
}

export default function ReferralsScreen() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReferralStats();
  }, []);

  const fetchReferralStats = async () => {
    try {
      const response = await fetchWithAuth("/api/referrals/stats");
      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
        setReferrals(data.referrals);
      } else {
        setError(data.message || "Error al cargar estadísticas");
      }
    } catch (error) {
      console.error("Error fetching referral stats:", error);
      setError("Error al cargar estadísticas de referidos");
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = () => {
    if (stats?.referralCode) {
      navigator.clipboard.writeText(stats.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareUrl = stats?.referralCode
    ? `${window.location.origin}/register?ref=${stats.referralCode}`
    : "";

  const copyShareLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Referidos - Doers</title>
        <meta name="description" content="Invita a tus amigos y gana contratos sin comisión" />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Programa de Referidos
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Invita a tus amigos y gana contratos sin comisión
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Referral Code Card */}
        <div className="mb-8 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl p-8 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <Gift className="h-8 w-8" />
            <h2 className="text-2xl font-bold">Tu Código de Referido</h2>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-white/80 mb-2">Comparte este código:</p>
                <p className="text-4xl font-bold tracking-wider">{stats?.referralCode || "LOADING..."}</p>
              </div>
              <button
                onClick={copyReferralCode}
                className="px-6 py-3 bg-white text-sky-600 rounded-xl font-semibold hover:bg-sky-50 transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-5 w-5" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-5 w-5" />
                    Copiar código
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <p className="text-sm text-white/80 mb-2">O comparte este enlace:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50"
              />
              <button
                onClick={copyShareLink}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-6 w-6 text-sky-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Referidos</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats?.totalReferrals || 0}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="h-6 w-6 text-green-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Contratos Gratis</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats?.freeContractsRemaining || 0}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-2">
              <Check className="h-6 w-6 text-blue-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Completados</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats?.completedReferrals || 0}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="h-6 w-6 text-orange-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Pendientes</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats?.pendingReferrals || 0}
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-md mb-8">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
            ¿Cómo funciona?
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                1
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                Comparte tu código
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Envía tu código único a tus amigos
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                2
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                Ellos se registran
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Tus amigos crean su cuenta con tu código
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                3
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                Ganas un contrato gratis
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Cuando completen su primer contrato, recibes uno sin comisión (5%)
              </p>
            </div>
          </div>
        </div>

        {/* Referrals List */}
        {referrals.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-md">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              Tus Referidos ({referrals.length})
            </h3>
            <div className="space-y-4">
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center">
                      <Users className="h-6 w-6 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {referral.user.name}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Registrado: {new Date(referral.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {referral.status === "pending" && (
                      <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-sm font-medium rounded-full">
                        Pendiente
                      </span>
                    )}
                    {referral.status === "completed" && (
                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-medium rounded-full">
                        Completado
                      </span>
                    )}
                    {referral.status === "credited" && (
                      <div>
                        <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium rounded-full">
                          Acreditado
                        </span>
                        {referral.creditedAt && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {new Date(referral.creditedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
