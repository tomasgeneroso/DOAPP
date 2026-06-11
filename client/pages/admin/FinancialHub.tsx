import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DollarSign, CreditCard, Send, TrendingUp, Loader2 } from 'lucide-react';
import Button from '../../components/ui/Button.js';

interface FinancialData {
  pendingPayments: number;
  pendingWithdrawals: number;
  totalRevenueARS: number;
  todayRevenue: number;
}

export default function FinancialHub() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
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

  if (loading) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-green-600 dark:text-green-400 flex items-center gap-3">
            <DollarSign className="w-8 h-8" /> Financial Hub
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2">
            Payments, withdrawals, and revenue tracking
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending Payments</p>
                <p className="text-2xl font-bold text-blue-600">{data?.pendingPayments || 0}</p>
              </div>
              <CreditCard className="w-6 h-6 text-blue-500" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending Withdrawals</p>
                <p className="text-2xl font-bold text-purple-600">{data?.pendingWithdrawals || 0}</p>
              </div>
              <Send className="w-6 h-6 text-purple-500" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  ${(data?.totalRevenueARS || 0).toLocaleString('es-AR')}
                </p>
              </div>
              <TrendingUp className="w-6 h-6 text-green-500" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Today Revenue</p>
                <p className="text-2xl font-bold text-orange-600">
                  ${(data?.todayRevenue || 0).toLocaleString('es-AR')}
                </p>
              </div>
              <DollarSign className="w-6 h-6 text-orange-500" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <Button onClick={() => navigate('/admin/payments')} variant="primary" className="py-4">
            Manage Payments
          </Button>
          <Button onClick={() => navigate('/admin/withdrawals')} variant="secondary" className="py-4">
            Manage Withdrawals
          </Button>
          <Button onClick={() => navigate('/admin/company-balance')} variant="primary" className="py-4">
            Company Balance
          </Button>
          <Button onClick={() => navigate('/admin/financial-transactions')} variant="secondary" className="py-4">
            Transactions
          </Button>
        </div>
      </div>
    </div>
  );
}
