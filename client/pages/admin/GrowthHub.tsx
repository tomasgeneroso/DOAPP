import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, BarChart3, Zap, FileText, Loader2 } from 'lucide-react';
import Button from '../../components/ui/Button.js';

interface GrowthData {
  totalUsers: number;
  completedContracts: number;
  openJobs: number;
  thisMonthSignups: number;
  conversionRate: string;
}

export default function GrowthHub() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/admin/hubs/growth/overview', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const result = await res.json();
      if (result.success) setData(result.growth);
    } catch (err) {
      console.error('Error loading growth hub:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-3">
            <TrendingUp className="w-8 h-8" /> Growth Hub
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2">
            Analytics, marketing, and content management
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
            <p className="text-sm text-slate-500">Total Users</p>
            <p className="text-3xl font-bold text-blue-600">{data?.totalUsers || 0}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 border-green-500">
            <p className="text-sm text-slate-500">Completed Contracts</p>
            <p className="text-3xl font-bold text-green-600">{data?.completedContracts || 0}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-slate-500">Open Jobs</p>
            <p className="text-3xl font-bold text-yellow-600">{data?.openJobs || 0}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 border-purple-500">
            <p className="text-sm text-slate-500">Conversion Rate</p>
            <p className="text-3xl font-bold text-purple-600">{data?.conversionRate}%</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" /> Analytics
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              User metrics, job stats, and platform trends
            </p>
            <Button onClick={() => navigate('/admin/analytics')} variant="primary" className="w-full">
              View Analytics
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" /> Marketing
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Campaigns, ads, and referral programs
            </p>
            <Button onClick={() => navigate('/admin/analytics')} variant="primary" className="w-full">
              Manage Marketing
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Content
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Blog posts, articles, and community content
            </p>
            <Button onClick={() => navigate('/blog')} variant="primary" className="w-full">
              Manage Content
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Performance
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              System health and performance metrics
            </p>
            <Button onClick={() => navigate('/admin/performance')} variant="secondary" className="w-full">
              View Performance
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
