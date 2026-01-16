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
  Clock,
  MapPin,
  Calendar,
  Tag
} from 'lucide-react';

// Tipos de modales para diferentes flujos
export type ContractModalType =
  | 'apply_direct'        // Usuario aplica directamente sin regatear
  | 'apply_negotiate'     // Usuario quiere aplicar y negociar precio
  | 'receive_application' // Dueño recibe solicitud de aplicación
  | 'contract_accepted'   // Contrato aceptado - mostrar info
  | 'request_changes'     // Solicitar cambios/cancelación del contrato
  | 'direct_proposal';    // Proponer contrato directamente sin trabajo previo

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalType: ContractModalType;
  jobData?: {
    title: string;
    description: string;
    budget: number;
    jobId: string;
    contractId?: string;
    allowNegotiation?: boolean; // Si el trabajo permite regatear
  };
  directProposalData?: {
    recipientId: string;
    recipientName: string;
    conversationId: string;
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
  directProposalData,
  applicantName,
  onSubmit,
  isLoading = false,
}: ContractModalProps) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [changeType, setChangeType] = useState<'cancel' | 'modify'>('modify');

  // Direct proposal specific state
  const [directTitle, setDirectTitle] = useState('');
  const [directDescription, setDirectDescription] = useState('');
  const [directPrice, setDirectPrice] = useState('');
  const [directCategory, setDirectCategory] = useState('');
  const [directLocation, setDirectLocation] = useState('');
  const [directStartDate, setDirectStartDate] = useState('');
  const [directStartTime, setDirectStartTime] = useState('09:00');
  const [directEndDate, setDirectEndDate] = useState('');
  const [directEndTime, setDirectEndTime] = useState('18:00');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Job categories from the system
  const categories = [
    'Limpieza', 'Jardinería', 'Plomería', 'Electricidad', 'Pintura',
    'Mudanzas', 'Carpintería', 'Albañilería', 'Cerrajería', 'Gasista',
    'Refrigeración', 'Reparaciones', 'Fletes', 'Cuidado de Mascotas',
    'Asistencia Personal', 'Clases Particulares', 'Diseño', 'Programación',
    'Marketing', 'Fotografía', 'Otro'
  ];

  if (!isOpen) return null;

  const handleSubmit = async () => {
    switch (modalType) {
      case 'apply_direct':
        await onSubmit({
          type: 'apply_direct',
          jobId: jobData?.jobId,
          amount: jobData?.budget
        });
        break;

      case 'apply_negotiate':
        if (!amount) {
          alert('Por favor ingresa un monto');
          return;
        }
        await onSubmit({
          type: 'apply_negotiate',
          jobId: jobData?.jobId,
          amount: parseFloat(amount),
          message
        });
        break;

      case 'receive_application':
        await onSubmit({
          type: 'accept_application',
          jobId: jobData?.jobId
        });
        break;

      case 'request_changes':
        if (!reason.trim()) {
          alert('Por favor proporciona una razón');
          return;
        }
        await onSubmit({
          type: changeType,
          contractId: jobData?.contractId,
          reason
        });
        break;

      case 'direct_proposal':
        // Validate all fields
        const errors: Record<string, string> = {};

        if (!directTitle.trim()) {
          errors.title = 'El título es requerido';
        } else if (directTitle.trim().length < 5) {
          errors.title = 'El título debe tener al menos 5 caracteres';
        }

        if (!directDescription.trim()) {
          errors.description = 'La descripción es requerida';
        } else if (directDescription.trim().length < 10) {
          errors.description = 'La descripción debe tener al menos 10 caracteres';
        }

        if (!directPrice || parseFloat(directPrice) <= 0) {
          errors.price = 'Ingresa un precio válido';
        } else if (parseFloat(directPrice) < 1000) {
          errors.price = 'El precio mínimo es $1.000 ARS';
        }

        if (!directCategory) {
          errors.category = 'Selecciona una categoría';
        }

        if (!directStartDate) {
          errors.startDate = 'La fecha de inicio es requerida';
        }

        if (!directEndDate) {
          errors.endDate = 'La fecha de fin es requerida';
        }

        // Validate dates are in the future and end > start
        if (directStartDate && directEndDate) {
          const startDateTime = new Date(`${directStartDate}T${directStartTime}`);
          const endDateTime = new Date(`${directEndDate}T${directEndTime}`);
          const now = new Date();

          if (startDateTime < now) {
            errors.startDate = 'La fecha de inicio debe ser en el futuro';
          }

          if (endDateTime <= startDateTime) {
            errors.endDate = 'La fecha de fin debe ser posterior a la de inicio';
          }
        }

        if (Object.keys(errors).length > 0) {
          setFormErrors(errors);
          return;
        }

        setFormErrors({});

        // Combine date and time
        const startDateTime = directStartDate ? `${directStartDate}T${directStartTime}:00` : undefined;
        const endDateTime = directEndDate ? `${directEndDate}T${directEndTime}:00` : undefined;

        await onSubmit({
          type: 'direct_proposal',
          recipientId: directProposalData?.recipientId,
          conversationId: directProposalData?.conversationId,
          title: directTitle.trim(),
          description: directDescription.trim(),
          price: parseFloat(directPrice),
          category: directCategory,
          location: directLocation.trim() || undefined,
          startDate: startDateTime,
          endDate: endDateTime,
          estimatedDuration: 1, // Default to 1 day, backend will calculate from dates
        });
        break;
    }
  };

  const handleReject = async () => {
    await onSubmit({
      type: 'reject_application',
      jobId: jobData?.jobId
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
                {jobData?.title}
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

  // Modal: Propuesta directa sin trabajo previo
  if (modalType === 'direct_proposal' && directProposalData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-slate-200 dark:border-slate-700">
          <div className="sticky top-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-6 border-b border-slate-200 dark:border-slate-700 z-10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                  <Briefcase className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Proponer Contrato
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    a {directProposalData.recipientName}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Info box */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border-2 border-emerald-200 dark:border-emerald-800 flex gap-3">
              <AlertCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-900 dark:text-emerald-200">
                Estás proponiendo un contrato directo a <strong>{directProposalData.recipientName}</strong>.
                Si acepta, se creará el trabajo y contrato automáticamente.
              </p>
            </div>

            {/* Title */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                <Briefcase className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Título del trabajo *
              </label>
              <input
                type="text"
                value={directTitle}
                onChange={(e) => {
                  setDirectTitle(e.target.value);
                  if (formErrors.title) setFormErrors(prev => ({ ...prev, title: '' }));
                }}
                placeholder="Ej: Reparación de cañería en baño"
                maxLength={200}
                className={`w-full px-4 py-3 bg-white dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white ${
                  formErrors.title ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                }`}
              />
              {formErrors.title && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {formErrors.title}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Descripción del trabajo *
              </label>
              <textarea
                value={directDescription}
                onChange={(e) => {
                  setDirectDescription(e.target.value);
                  if (formErrors.description) setFormErrors(prev => ({ ...prev, description: '' }));
                }}
                placeholder="Describe el trabajo a realizar, incluye todos los detalles relevantes..."
                rows={4}
                className={`w-full px-4 py-3 bg-white dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white resize-none ${
                  formErrors.description ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                }`}
              />
              {formErrors.description && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {formErrors.description}
                </p>
              )}
            </div>

            {/* Price and Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Precio propuesto (ARS) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                    $
                  </span>
                  <input
                    type="number"
                    value={directPrice}
                    onChange={(e) => {
                      setDirectPrice(e.target.value);
                      if (formErrors.price) setFormErrors(prev => ({ ...prev, price: '' }));
                    }}
                    placeholder="10000"
                    min="1000"
                    className={`w-full pl-8 pr-4 py-3 bg-white dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white text-lg font-semibold ${
                      formErrors.price ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                </div>
                {formErrors.price && (
                  <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {formErrors.price}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  <Tag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Categoría *
                </label>
                <select
                  value={directCategory}
                  onChange={(e) => {
                    setDirectCategory(e.target.value);
                    if (formErrors.category) setFormErrors(prev => ({ ...prev, category: '' }));
                  }}
                  className={`w-full px-4 py-3 bg-white dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white ${
                    formErrors.category ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  <option value="">Seleccionar...</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {formErrors.category && (
                  <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {formErrors.category}
                  </p>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Ubicación (opcional)
              </label>
              <input
                type="text"
                value={directLocation}
                onChange={(e) => setDirectLocation(e.target.value)}
                placeholder="Ej: Buenos Aires, Argentina"
                className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white"
              />
            </div>

            {/* Dates with Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Fecha de inicio *
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={directStartDate}
                    onChange={(e) => {
                      setDirectStartDate(e.target.value);
                      if (formErrors.startDate) setFormErrors(prev => ({ ...prev, startDate: '' }));
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    className={`flex-1 px-3 py-3 bg-white dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white ${
                      formErrors.startDate ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                  <input
                    type="time"
                    value={directStartTime}
                    onChange={(e) => setDirectStartTime(e.target.value)}
                    className="w-28 px-3 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white"
                  />
                </div>
                {formErrors.startDate && (
                  <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {formErrors.startDate}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Fecha de fin *
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={directEndDate}
                    onChange={(e) => {
                      setDirectEndDate(e.target.value);
                      if (formErrors.endDate) setFormErrors(prev => ({ ...prev, endDate: '' }));
                    }}
                    min={directStartDate || new Date().toISOString().split('T')[0]}
                    className={`flex-1 px-3 py-3 bg-white dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white ${
                      formErrors.endDate ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                  <input
                    type="time"
                    value={directEndTime}
                    onChange={(e) => setDirectEndTime(e.target.value)}
                    className="w-28 px-3 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-900 dark:text-white"
                  />
                </div>
                {formErrors.endDate && (
                  <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {formErrors.endDate}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl border-2 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading || !directTitle.trim() || !directDescription.trim() || !directPrice || !directCategory || !directStartDate || !directEndDate}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? (
                  <>
                    <Clock className="h-5 w-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Enviar Propuesta
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
