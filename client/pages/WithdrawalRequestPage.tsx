import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { WithdrawalRequest } from '../types';
import {
  ArrowDownCircle,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  CreditCard,
  Building2,
  User as UserIcon,
  Hash
} from 'lucide-react';
import Button from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';

export default function WithdrawalRequestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<'savings' | 'checking'>('savings');
  const [cbu, setCbu] = useState('');
  const [alias, setAlias] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');

      // Load balance
      const balanceRes = await fetch('/api/balance', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const balanceData = await balanceRes.json();
      if (balanceData.success) {
        setBalance(balanceData.balance);
      }

      // Load withdrawals
      const withdrawalsRes = await fetch('/api/balance/withdrawals', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const withdrawalsData = await withdrawalsRes.json();
      if (withdrawalsData.success) {
        setWithdrawals(withdrawalsData.data);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const amountNum = parseFloat(amount);

    // Validations
    if (isNaN(amountNum) || amountNum < 1000) {
      setError('El monto mínimo de retiro es $1,000 ARS');
      return;
    }

    if (amountNum > balance) {
      setError('No tienes suficiente saldo disponible');
      return;
    }

    if (!accountHolder.trim()) {
      setError('El titular de la cuenta es requerido');
      return;
    }

    if (!bankName.trim()) {
      setError('El nombre del banco es requerido');
      return;
    }

    if (cbu.length !== 22 || !/^\d{22}$/.test(cbu)) {
      setError('El CBU debe tener exactamente 22 dígitos');
      return;
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/balance/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: amountNum,
          bankingInfo: {
            accountHolder,
            bankName,
            accountType,
            cbu,
            alias: alias || undefined,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Solicitud de retiro enviada correctamente. Será procesada en breve.');
        // Reset form
        setAmount('');
        setAccountHolder('');
        setBankName('');
        setCbu('');
        setAlias('');
        // Reload data
        await loadData();
      } else {
        setError(data.message || 'Error al solicitar retiro');
      }
    } catch (err: any) {
      setError(err.message || 'Error al solicitar retiro');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (withdrawalId: string) => {
    if (!confirm('¿Estás seguro de que deseas cancelar esta solicitud de retiro?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/balance/withdrawals/${withdrawalId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Solicitud cancelada correctamente');
        await loadData();
      } else {
        setError(data.message || 'Error al cancelar solicitud');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cancelar solicitud');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: {
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
        icon: <Clock className="w-4 h-4" />,
        text: 'Pendiente',
      },
      approved: {
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
        icon: <CheckCircle className="w-4 h-4" />,
        text: 'Aprobada',
      },
      processing: {
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
        text: 'Procesando',
      },
      completed: {
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
        icon: <CheckCircle className="w-4 h-4" />,
        text: 'Completada',
      },
      rejected: {
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
        icon: <XCircle className="w-4 h-4" />,
        text: 'Rechazada',
      },
      cancelled: {
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        icon: <XCircle className="w-4 h-4" />,
        text: 'Cancelada',
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

  const totalWithdrawn = withdrawals
    .filter(w => w.status === 'completed')
    .reduce((sum, w) => sum + w.amount, 0);

  const pendingAmount = withdrawals
    .filter(w => ['pending', 'approved', 'processing'].includes(w.status))
    .reduce((sum, w) => sum + w.amount, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Retiro de Saldo
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Solicita retiros de tu saldo a tu cuenta bancaria
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Current Balance */}
        <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sky-100 text-sm mb-1">Saldo Disponible</p>
          <p className="text-3xl font-bold">
            ${balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Withdrawn */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <ArrowDownCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Total Retirado</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            ${totalWithdrawn.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Pending Amount */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Monto Pendiente</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            ${pendingAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Request Form */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 sticky top-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              Nueva Solicitud
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Monto a Retirar (ARS)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <DollarSign className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Mínimo $1,000"
                    min="1000"
                    step="0.01"
                    required
                    className="pl-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Monto mínimo: $1,000 ARS
                </p>
              </div>

              {/* Account Holder */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Titular de la Cuenta
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder="Nombre completo"
                    required
                    className="pl-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Bank Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Banco
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Ej: Banco Galicia"
                    required
                    className="pl-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Account Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tipo de Cuenta
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CreditCard className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as 'savings' | 'checking')}
                    className="pl-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="savings">Caja de Ahorro</option>
                    <option value="checking">Cuenta Corriente</option>
                  </select>
                </div>
              </div>

              {/* CBU */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  CBU
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Hash className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={cbu}
                    onChange={(e) => setCbu(e.target.value.replace(/\D/g, '').slice(0, 22))}
                    placeholder="22 dígitos"
                    maxLength={22}
                    required
                    className="pl-10 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {cbu.length}/22 dígitos
                </p>
              </div>

              {/* Alias (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Alias (opcional)
                </label>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="Ej: MIEMPRESA.PAGOS"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="w-full"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Enviando solicitud...
                  </>
                ) : (
                  <>
                    <ArrowDownCircle className="w-5 h-5 mr-2" />
                    Solicitar Retiro
                  </>
                )}
              </Button>
            </form>

            {/* Info Box */}
            <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 text-sm">
                Tiempos de Procesamiento
              </h3>
              <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                <li>• Aprobación: 24-48 horas</li>
                <li>• Transferencia: 1-3 días hábiles</li>
                <li>• Mínimo: $1,000 ARS</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Withdrawals List */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Mis Solicitudes de Retiro
              </h2>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {withdrawals.length === 0 ? (
                <div className="p-12 text-center">
                  <ArrowDownCircle className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No tienes solicitudes de retiro aún
                  </p>
                </div>
              ) : (
                withdrawals.map((withdrawal) => (
                  <div key={withdrawal._id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            ${withdrawal.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </p>
                          {getStatusBadge(withdrawal.status)}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" />
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
                            <span>{new Date(withdrawal.requestedAt).toLocaleDateString('es-AR')}</span>
                          </div>
                        </div>

                        {withdrawal.rejectionReason && (
                          <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                            <p className="text-sm text-red-800 dark:text-red-200">
                              <strong>Motivo de rechazo:</strong> {withdrawal.rejectionReason}
                            </p>
                          </div>
                        )}
                      </div>

                      {withdrawal.status === 'pending' && (
                        <div>
                          <Button
                            variant="secondary"
                            onClick={() => handleCancel(withdrawal._id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
