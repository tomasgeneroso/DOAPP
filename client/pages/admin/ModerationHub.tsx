import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import Button from '../../components/ui/Button.js';

interface ModerationData {
  disputeCount: number;
  ticketCount: number;
  disputes: Array<{ id: string; status: string; createdAt: string; category: string }>;
  tickets: Array<{ id: string; status: string; createdAt: string; category: string }>;
}

export default function ModerationHub() {
  const navigate = useNavigate();
  const [data, setData] = useState<ModerationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/admin/hubs/moderation/overview', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const result = await res.json();
      if (result.success) setData(result.moderation);
    } catch (err) {
      console.error('Error loading moderation hub:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-red-600 dark:text-red-400 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8" /> Moderation Hub
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2">
            Manage disputes, tickets, and user reports
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Disputes Card */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Disputes</h2>
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-red-600">{data?.disputeCount || 0}</p>
            <p className="text-sm text-slate-500 mt-2">Open disputes awaiting action</p>
            <Button onClick={() => navigate('/admin/disputes')} variant="primary" className="mt-4 w-full">
              View All Disputes
            </Button>
          </div>

          {/* Tickets Card */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Support Tickets</h2>
              <MessageSquare className="w-6 h-6 text-yellow-500" />
            </div>
            <p className="text-3xl font-bold text-yellow-600">{data?.ticketCount || 0}</p>
            <p className="text-sm text-slate-500 mt-2">Open or pending tickets</p>
            <Button onClick={() => navigate('/admin/tickets')} variant="secondary" className="mt-4 w-full">
              View All Tickets
            </Button>
          </div>
        </div>

        {/* Quick List */}
        <div className="grid grid-cols-2 gap-6">
          {data?.disputes && data.disputes.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="font-bold text-red-600 mb-4">Recent Disputes</h3>
              <ul className="space-y-2">
                {data.disputes.slice(0, 5).map((d) => (
                  <li key={d.id} className="text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded cursor-pointer hover:bg-red-100"
                    onClick={() => navigate(`/admin/disputes/${d.id}`)}>
                    <span className="font-medium">{d.category}</span> • {d.status}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data?.tickets && data.tickets.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="font-bold text-yellow-600 mb-4">Recent Tickets</h3>
              <ul className="space-y-2">
                {data.tickets.slice(0, 5).map((t) => (
                  <li key={t.id} className="text-sm p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded cursor-pointer hover:bg-yellow-100"
                    onClick={() => navigate(`/admin/tickets/${t.id}`)}>
                    <span className="font-medium">{t.category}</span> • {t.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
