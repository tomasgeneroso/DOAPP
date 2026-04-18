import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { WithdrawalRequest } from '../../types';
import { useSocket } from '@/hooks/useSocket';
import {
  ArrowDownCircle,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Upload,
  Eye,
  User,
  Building2,
  Hash,
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
  Wifi,
  WifiOff,
  Bell
} from 'lucide-react';
import Button from '../../components/ui/Button';

export default function AdminWithdrawalManager() {
  const { t } = useTranslation();
  const { isConnected, registerAdminWithdrawalCreatedHandler, registerAdminWithdrawalUpdatedHandler } = useSocket();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [proofOfTransfer, setProofOfTransfer] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);

  // Real-time handlers
  const handleNewWithdrawal = useCallback((data: any) => {
    console.log('🔔 New withdrawal request:', data);
    const amount = data.withdrawal?.amount?.toLocaleString('es-AR') || '0';
    setRealtimeAlert(`${t('admin.withdrawals.newRequest', 'New withdrawal request')}: $${amount}`);
    setWithdrawals(prev => [data.withdrawal, ...prev]);
    // Refresh stats
    loadData();
    setTimeout(() => setRealtimeAlert(null), 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWithdrawalUpdated = useCallback((data: any) => {
    console.log('🔔 Withdrawal updated:', data);
    const amount = data.withdrawal?.amount?.toLocaleString('es-AR') || '0';
    setRealtimeAlert(`${t('admin.withdrawals.updated', 'Withdrawal updated')}: $${amount} - ${data.previousStatus} → ${data.withdrawal?.status}`);
    setWithdrawals(prev =>
      prev.map(w => (w.id === data.withdrawal?.id) ? { ...w, ...data.withdrawal } : w)
    );
    // Refresh stats
    loadData();
    setTimeout(() => setRealtimeAlert(null), 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    registerAdminWithdrawalCreatedHandler(handleNewWithdrawal);
    registerAdminWithdrawalUpdatedHandler(handleWithdrawalUpdated);
  }, [registerAdminWithdrawalCreatedHandler, registerAdminWithdrawalUpdatedHandler, handleNewWithdrawal, handleWithdrawalUpdated]);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');

      // Load withdrawals
      const params = new URLSearchParams();
      if (filterStatus !== 'all') {
        params.append('status', filterStatus);
      }

      const withdrawalsRes = await fetch(`/api/admin/withdrawals?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const withdrawalsData = await withdrawalsRes.json();

      if (withdrawalsData.success) {
        setWithdrawals(withdrawalsData.withdrawals || []);
        setStats(withdrawalsData.stats || null);
      }
    } catch (err: any) {
      setError(err.message || t('admin.withdrawals.errorLoadingData', 'Error loading data'));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm(t('admin.withdrawals.confirmApprove', 'Approve this withdrawal request?'))) return;

    setProcessing(id);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/withdrawals/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminNotes }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(t('admin.withdrawals.approvedSuccess', 'Request approved successfully'));
        await loadData();
        setAdminNotes('');
      } else {
        setError(data.message || t('admin.withdrawals.errorApproving', 'Error approving'));
      }
    } catch (err: any) {
      setError(err.message || t('admin.withdrawals.errorApproving', 'Error approving'));
    } finally {
      setProcessing(null);
    }
  };

  const handleProcessing = async (id: string) => {
    if (!confirm(t('admin.withdrawals.confirmProcessing', 'Mark as processing transfer?'))) return;

    setProcessing(id);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/withdrawals/${id}/processing`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(t('admin.withdrawals.processingSuccess', 'Marked as processing'));
        await loadData();
      } else {
        setError(data.message || t('admin.withdrawals.errorProcessing', 'Error processing'));
      }
    } catch (err: any) {
      setError(err.message || t('admin.withdrawals.errorProcessing', 'Error processing'));
    } finally {
      setProcessing(null);
    }
  };

  const handleComplete = async (id: string) => {
    if (!confirm(t('admin.withdrawals.confirmComplete', 'Mark as completed? This will deduct the user balance.'))) return;

    if (!proofOfTransfer.trim()) {
      setError(t('admin.withdrawals.proofRequired', 'You must enter the transfer proof'));
      return;
    }

    setProcessing(id);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/withdrawals/${id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofOfTransfer }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(t('admin.withdrawals.completedSuccess', 'Withdrawal completed successfully'));
        await loadData();
        setProofOfTransfer('');
        setShowDetailsModal(false);
      } else {
        setError(data.message || t('admin.withdrawals.errorCompleting', 'Error completing'));
      }
    } catch (err: any) {
      setError(err.message || t('admin.withdrawals.errorCompleting', 'Error completing'));
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm(t('admin.withdrawals.confirmReject', 'Reject this withdrawal request?'))) return;

    if (!rejectionReason.trim()) {
      setError(t('admin.withdrawals.rejectionRequired', 'You must enter a rejection reason'));
      return;
    }

    setProcessing(id);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/withdrawals/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rejectionReason }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(t('admin.withdrawals.rejectedSuccess', 'Request rejected successfully'));
        await loadData();
        setRejectionReason('');
        setShowDetailsModal(false);
      } else {
        setError(data.message || t('admin.withdrawals.errorRejecting', 'Error rejecting'));
      }
    } catch (err: any) {
      setError(err.message || t('admin.withdrawals.errorRejecting', 'Error rejecting'));
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: {
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
        icon: <Clock className="w-4 h-4" />,
        text: t('common.status.pending', 'Pending'),
      },
      approved: {
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
        icon: <CheckCircle className="w-4 h-4" />,
        text: t('common.status.approved', 'Approved'),
      },
      processing: {
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
        text: t('common.status.processing', 'Processing'),
      },
      completed: {
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
        icon: <CheckCircle className="w-4 h-4" />,
        text: t('common.status.completed', 'Completed'),
      },
      rejected: {
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
        icon: <XCircle className="w-4 h-4" />,
        text: t('common.status.rejected', 'Rejected'),
      },
      cancelled: {
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        icon: <XCircle className="w-4 h-4" />,
        text: t('common.status.cancelled', 'Cancelled'),
      },
    };

    const badge = badges[status as keyof typeof badges] || badges.pending;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Real-time Alert */}
      {realtimeAlert && (
        <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-3 animate-pulse">
          <Bell className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          <span className="text-yellow-800 dark:text-yellow-200 font-medium">{realtimeAlert}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('admin.withdrawals.title', 'Withdrawal Management')}
          </h1>
          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isConnected
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
          }`}>
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          {t('admin.withdrawals.subtitle', 'Manage user withdrawal requests')}
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-green-800 dark:text-green-200">{success}</p>
        </div>
      )}

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.pending}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('common.status.pending', 'Pending')}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.approved}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('common.status.approved', 'Approved')}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.completed}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('common.status.completed', 'Completed')}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              ${stats.totalAmount?.toLocaleString('es-AR') || 0}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('admin.withdrawals.totalAmount', 'Total Amount')}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {['all', 'pending', 'approved', 'processing', 'completed', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-sky-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {status === 'all' ? t('common.all', 'All') : status === 'pending' ? t('common.status.pending', 'Pending') : status === 'approved' ? t('common.status.approved', 'Approved') : status === 'processing' ? t('common.status.processing', 'Processing') : status === 'completed' ? t('common.status.completed', 'Completed') : t('common.status.rejected', 'Rejected')}
            </button>
          ))}
        </div>
      </div>

      {/* Withdrawals List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('admin.withdrawals.requests', 'Withdrawal Requests')} ({withdrawals.length})
          </h2>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {withdrawals.length === 0 ? (
            <div className="p-12 text-center">
              <ArrowDownCircle className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                {t('admin.withdrawals.noRequests', 'No requests match this filter')}
              </p>
            </div>
          ) : (
            withdrawals.map((withdrawal) => {
              const user = typeof withdrawal.user === 'object' ? withdrawal.user : null;

              return (
                <div key={withdrawal._id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          ${withdrawal.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </p>
                        {getStatusBadge(withdrawal.status)}
                      </div>

                      {user && (
                        <div className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium">{t('common.user', 'User')}:</span> {user.name} ({user.email})
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>{withdrawal.bankingInfo.accountHolder}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          <span>{withdrawal.bankingInfo.bankName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Hash className="w-4 h-4" />
                          <span className="font-mono">{withdrawal.bankingInfo.cbu}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(withdrawal.requestedAt).toLocaleDateString('es-AR')} {new Date(withdrawal.requestedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      {withdrawal.adminNotes && (
                        <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>{t('admin.withdrawals.adminNotes', 'Admin notes')}:</strong> {withdrawal.adminNotes}
                          </p>
                        </div>
                      )}

                      {withdrawal.rejectionReason && (
                        <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                          <p className="text-sm text-red-800 dark:text-red-200">
                            <strong>{t('admin.withdrawals.rejectionReason', 'Rejection reason')}:</strong> {withdrawal.rejectionReason}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedWithdrawal(withdrawal);
                          setShowDetailsModal(true);
                        }}
                        className="w-full lg:w-auto"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        {t('common.viewDetails', 'View Details')}
                      </Button>

                      {withdrawal.status === 'pending' && (
                        <>
                          <Button
                            variant="primary"
                            onClick={() => handleApprove(withdrawal._id)}
                            disabled={processing === withdrawal._id}
                            className="w-full lg:w-auto"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {t('common.approve', 'Approve')}
                          </Button>
                        </>
                      )}

                      {withdrawal.status === 'approved' && (
                        <Button
                          variant="primary"
                          onClick={() => handleProcessing(withdrawal._id)}
                          disabled={processing === withdrawal._id}
                          className="w-full lg:w-auto"
                        >
                          <Loader2 className="w-4 h-4 mr-2" />
                          {t('common.process', 'Process')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedWithdrawal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('admin.withdrawals.details', 'Withdrawal Details')}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('common.amount', 'Amount')}
                </label>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${selectedWithdrawal.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('common.status.label', 'Status')}
                </label>
                {getStatusBadge(selectedWithdrawal.status)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('admin.withdrawals.balanceBefore', 'Balance Before')}
                  </label>
                  <p className="text-gray-900 dark:text-white">
                    ${selectedWithdrawal.balanceBeforeWithdrawal.toLocaleString('es-AR')}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('admin.withdrawals.balanceAfter', 'Balance After')}
                  </label>
                  <p className="text-gray-900 dark:text-white">
                    ${selectedWithdrawal.balanceAfterWithdrawal.toLocaleString('es-AR')}
                  </p>
                </div>
              </div>

              {selectedWithdrawal.status === 'processing' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('admin.withdrawals.transferProof', 'Transfer Proof')}
                  </label>
                  <input
                    type="text"
                    value={proofOfTransfer}
                    onChange={(e) => setProofOfTransfer(e.target.value)}
                    placeholder={t('admin.withdrawals.proofPlaceholder', 'Receipt number or reference')}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Button
                    variant="primary"
                    onClick={() => handleComplete(selectedWithdrawal._id)}
                    disabled={processing === selectedWithdrawal._id}
                    className="mt-2 w-full"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {t('admin.withdrawals.markCompleted', 'Mark as Completed')}
                  </Button>
                </div>
              )}

              {(selectedWithdrawal.status === 'pending' || selectedWithdrawal.status === 'approved') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('admin.withdrawals.rejectionReason', 'Rejection Reason')}
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder={t('admin.withdrawals.rejectionPlaceholder', 'Explain why this request is being rejected')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => handleReject(selectedWithdrawal._id)}
                    disabled={processing === selectedWithdrawal._id}
                    className="mt-2 w-full text-red-600 hover:text-red-700"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {t('admin.withdrawals.rejectRequest', 'Reject Request')}
                  </Button>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedWithdrawal(null);
                  setProofOfTransfer('');
                  setRejectionReason('');
                }}
                className="w-full"
              >
                {t('common.close', 'Close')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
