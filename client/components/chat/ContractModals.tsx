import { useState } from 'react';
import {
  X,
  Send,
  Check,
  AlertCircle,
  DollarSign,
  Briefcase,
  FileText,
  XCircle,
  Clock
} from 'lucide-react';

// Tipos de modales para diferentes flujos
export type ContractModalType =
  | 'apply_direct'        // Usuario aplica directamente sin regatear
  | 'apply_negotiate'     // Usuario quiere aplicar y negociar precio
  | 'receive_application' // Dueño recibe solicitud de aplicación
  | 'contract_accepted'   // Contrato aceptado - mostrar info
  | 'request_changes';    // Solicitar cambios/cancelación del contrato

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalType: ContractModalType;
  jobData: {
    title: string;
    description: string;
    budget: number;
    jobId: string;
    contractId?: string;
    allowNegotiation?: boolean; // Si el trabajo permite regatear
  };
  applicantName?: string; // Para receive_application
  onSubmit: (data: any) => Promise<void>;
  isLoading?: boolean;
}

export function ContractModal({
  isOpen,
  onClose,
  modalType,
  jobData,
  applicantName,
  onSubmit,
  isLoading = false,
}: ContractModalProps) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [changeType, setChangeType] = useState<'cancel' | 'modify'>('modify');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    switch (modalType) {
      case 'apply_direct':
        await onSubmit({
          type: 'apply_direct',
          jobId: jobData.jobId,
          amount: jobData.budget
        });
        break;

      case 'apply_negotiate':
        if (!amount) {
          alert('Por favor ingresa un monto');
          return;
        }
        await onSubmit({
          type: 'apply_negotiate',
          jobId: jobData.jobId,
          amount: parseFloat(amount),
          message
        });
        break;

      case 'receive_application':
        await onSubmit({
          type: 'accept_application',
          jobId: jobData.jobId
        });
        break;

      case 'request_changes':
        if (!reason.trim()) {
          alert('Por favor proporciona una razón');
          return;
        }
        await onSubmit({
          type: changeType,
          contractId: jobData.contractId,
          reason
        });
        break;
    }
  };

  const handleReject = async () => {
    await onSubmit({
      type: 'reject_application',
      jobId: jobData.jobId
    });
  };

  // Modal: Aplicar directamente (sin regatear)
  if (modalType === 'apply_direct') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 border-2 border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-sky-100 dark:bg-sky-900/50 rounded-lg">
                <Briefcase className="h-6 w-6 text-sky-600 dark:text-sky-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Aplicaste a contrato!
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">
                {jobData.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                {jobData.description}
              </p>
              <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold">
                <DollarSign className="h-5 w-5" />
                <span className="text-xl">{jobData.budget.toLocaleString('es-AR')}</span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {isLoading ? (
                <>
                  <Clock className="h-5 w-5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5" />
                  Cancelar contrato
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Modal: Aplicar con negociación (regateo)
  if (modalType === 'apply_negotiate') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 border-2 border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                Solicitud de aplicación
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Regatear trabajo
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">
                {jobData.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                {jobData.description}
              </p>
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <DollarSign className="h-5 w-5" />
                <span className="text-lg">{jobData.budget.toLocaleString('es-AR')}</span>
              </div>
            </div>

            <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-4 border-2 border-cyan-200 dark:border-cyan-800">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                <DollarSign className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                Ingresar monto a regatear
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={jobData.budget.toString()}
                  className="w-full pl-8 pr-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-slate-900 dark:text-white text-lg font-semibold"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl border-2 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading || !amount}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? (
                  <>
                    <Clock className="h-5 w-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Enviar solicitud
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Modal: Recibir solicitud de aplicación (para dueño del trabajo)
  if (modalType === 'receive_application') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 border-2 border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                {applicantName || 'Usuario'} quiere aplicar a tu trabajo!
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Usuario quiere aplicar
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">
                {jobData.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                {jobData.description}
              </p>
              <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold">
                <DollarSign className="h-5 w-5" />
                <span className="text-xl">{jobData.budget.toLocaleString('es-AR')}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? (
                  <Clock className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <XCircle className="h-5 w-5" />
                    Denegar trabajador
                  </>
                )}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? (
                  <Clock className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    Aceptar trabajador
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Modal: Contrato aceptado - solicitar cambios
  if (modalType === 'contract_accepted') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 border-2 border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                Aceptaste a {applicantName || 'usuario'} para realizar tu trabajo!
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aceptaste al {applicantName || 'usuario'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">
                {jobData.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                {jobData.description}
              </p>
              <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold">
                <DollarSign className="h-5 w-5" />
                <span className="text-xl">{jobData.budget.toLocaleString('es-AR')}</span>
              </div>
            </div>

            {jobData.contractId && (
              <button
                onClick={() => window.location.href = `/contracts/${jobData.contractId}/request-changes`}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold rounded-xl transition-all shadow-lg"
              >
                <FileText className="h-5 w-5" />
                Solicitar cambios de contrato
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl border-2 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Modal: Solicitar cambios/cancelación de contrato
  if (modalType === 'request_changes') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 border-2 border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                Solicitar cambios de contrato
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {jobData.title}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border-2 border-amber-200 dark:border-amber-800 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 dark:text-amber-200">
                La otra parte deberá aceptar tus cambios. Si no responde en 2 días, se enviará automáticamente a soporte.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Tipo de solicitud
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setChangeType('modify')}
                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                    changeType === 'modify'
                      ? 'bg-sky-600 text-white shadow-lg'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-2 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  Modificar términos
                </button>
                <button
                  onClick={() => setChangeType('cancel')}
                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                    changeType === 'cancel'
                      ? 'bg-red-600 text-white shadow-lg'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-2 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  Cancelar contrato
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Razón de {changeType === 'cancel' ? 'cancelación' : 'cambio'}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`Explica por qué deseas ${changeType === 'cancel' ? 'cancelar' : 'modificar'} el contrato...`}
                rows={4}
                className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl border-2 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading || !reason.trim()}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${
                  changeType === 'cancel'
                    ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'
                    : 'bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800'
                } text-white`}
              >
                {isLoading ? (
                  <>
                    <Clock className="h-5 w-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Enviar solicitud
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
