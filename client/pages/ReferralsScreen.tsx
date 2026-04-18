import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        setReferrals(data.referrals || []);
      } else {
        setError(data.message || t('referrals.errorLoading', 'Error loading statistics'));
      }
    } catch (error) {
      console.error("Error fetching referral stats:", error);
      setError(t('referrals.errorLoading', 'Error loading referral statistics'));
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
        <title>{t('referrals.pageTitle', 'Referrals - DoApp')}</title>
        <meta name="description" content={t('referrals.metaDescription', 'Invite your friends and earn commission-free contracts')} />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {t('referrals.title', 'Referral Program')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {t('referrals.subtitle', 'The first 1000 users get 1 year of free membership! Plus, invite your friends and earn benefits.')}
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
            <h2 className="text-2xl font-bold">{t('referrals.yourCode', 'Your Referral Code')}</h2>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-white/80 mb-2">{t('referrals.shareCode', 'Share this code:')}</p>
                <p className="text-4xl font-bold tracking-wider">{stats?.referralCode || "LOADING..."}</p>
              </div>
              <button
                onClick={copyReferralCode}
                className="px-6 py-3 bg-white text-sky-600 rounded-xl font-semibold hover:bg-sky-50 transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-5 w-5" />
                    {t('referrals.copied', 'Copied!')}
                  </>
                ) : (
                  <>
                    <Copy className="h-5 w-5" />
                    {t('referrals.copyCode', 'Copy code')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-6 w-6 text-sky-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('referrals.totalReferrals', 'Total Referrals')}</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats?.totalReferrals || 0}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="h-6 w-6 text-green-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('referrals.freeContracts', 'Free Contracts')}</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats?.freeContractsRemaining || 0}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-2">
              <Check className="h-6 w-6 text-blue-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('referrals.completed', 'Completed')}</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats?.completedReferrals || 0}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="h-6 w-6 text-orange-600" />
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('referrals.pending', 'Pending')}</p>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {stats?.pendingReferrals || 0}
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-md mb-8">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
            {t('referrals.howItWorks', 'How does it work?')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                1
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                {t('referrals.step1Title', 'Share your code')}
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('referrals.step1Desc', 'Send your unique code to your friends')}
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                2
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                {t('referrals.step2Title', 'They sign up')}
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('referrals.step2Desc', 'Your friends create their account with your code')}
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 text-sky-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                3
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
                {t('referrals.step3Title', 'You earn a free contract')}
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('referrals.step3Desc', 'When they complete their first contract, you get one commission-free!')}
              </p>
            </div>
          </div>
        </div>

        {/* Referrals List */}
        {referrals && referrals.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-md">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              {t('referrals.yourReferrals', 'Your Referrals')} ({referrals.length})
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
                        {t('referrals.registered', 'Registered')}: {new Date(referral.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {referral.status === "pending" && (
                      <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-sm font-medium rounded-full">
                        {t('referrals.statusPending', 'Pending')}
                      </span>
                    )}
                    {referral.status === "completed" && (
                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-medium rounded-full">
                        {t('referrals.statusCompleted', 'Completed')}
                      </span>
                    )}
                    {referral.status === "credited" && (
                      <div>
                        <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium rounded-full">
                          {t('referrals.statusCredited', 'Credited')}
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
