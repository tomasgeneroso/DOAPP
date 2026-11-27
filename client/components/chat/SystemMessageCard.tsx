import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getImageUrl } from '@/utils/imageUrl';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { lugaresDelTrabajo, precioDeUnLugar } from '../../../shared/jobs/precioDelLugar';
import {
  Briefcase,
  UserCheck,
  CheckCircle,
  X,
  Loader2,
  Users,
  Calendar,
  MapPin,
  DollarSign,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Paperclip,
  FileText,
  Image,
  ExternalLink,
} from 'lucide-react';
import AvisoDelSistema from './AvisoDelSistema';
import { esTarjetaDePostulacion, motivoParaNoAceptar } from '../../../shared/chat/tarjetas';
import { textoDeAceptacion } from '../../../shared/contratos/aceptacion';

interface SystemMessageCardProps {
  message: {
    id?: string;
    message: string;
    sender?: {
      id?: string;
      name?: string;
      avatar?: string;
    } | null;
    metadata?: {
      jobId?: string;
      proposalId?: string;
      proposalStatus?: 'pending' | 'approved' | 'rejected' | 'withdrawn';
      action?: string;
      autoSelected?: boolean;
      isCounterOffer?: boolean;
      contractId?: string;
      jobStatus?: string;
      aceptadaPor?: string;
      aceptadaEl?: string | null;
      directProposal?: {
        title?: string;
        description?: string;
        location?: string;
        category?: string;
        proposedPrice?: number;
        estimatedDuration?: number;
        startDate?: string;
        endDate?: string;
        attachments?: string[];
      };
    };
    createdAt: string;
  };
  currentUserId?: string;
  onRefresh: () => void;
  token?: string | null;
}

// Parse the system message content into structured data
const parseSystemMessage = (messageText: string) => {
  const parts = messageText.split('||');
  const header = parts[0] || '';
  const title = parts[1] || '';
  const content = parts[2] || messageText;

  // Parse content for structured data
  const lines = content.split('\n').filter(line => line.trim());
  const data: Record<string, string> = {};

  lines.forEach(line => {
    // Remove markdown bold markers for cleaner parsing
    const cleanLine = line.replace(/\*\*/g, '');

    if (cleanLine.includes('Inicio:')) data.startDate = cleanLine.replace('Inicio:', '').trim();
    if (cleanLine.includes('Finalización')) data.endDate = cleanLine.split(':').slice(1).join(':').trim();
    if (cleanLine.includes('Precio Acordado:')) data.price = cleanLine.replace('Precio Acordado:', '').trim();
    if (cleanLine.includes('Precio propuesto:')) data.price = cleanLine.replace('Precio propuesto:', '').trim();
    // Handle counter-offer format: "Contraoferta: $8.000 ARS (Precio original: $7.000 ARS)"
    if (cleanLine.includes('Contraoferta:')) {
      const match = cleanLine.match(/Contraoferta:\s*(\$[\d.,]+\s*ARS)/);
      if (match) {
        data.price = match[1];
      }
      // Also extract original price
      const originalMatch = cleanLine.match(/Precio original:\s*(\$[\d.,]+\s*ARS)/);
      if (originalMatch) {
        data.originalPrice = originalMatch[1];
      }
    }
    if (cleanLine.includes('Ubicación:')) data.location = cleanLine.replace('Ubicación:', '').trim();
    if (cleanLine.includes('Duración estimada:')) data.duration = cleanLine.replace('Duración estimada:', '').trim();
  });

  return { header, title, content, data, lines };
};

// Get status configuration
const getStatusConfig = (status?: string, t?: (key: string, fallback: string) => string) => {
  const translate = t || ((key: string, fallback: string) => fallback);
  switch (status) {
    case 'pending':
      return {
        label: translate('common.status.pending', 'Pending'),
        color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        icon: Clock,
        borderColor: 'border-amber-300 dark:border-amber-700',
      };
    case 'approved':
      return {
        label: translate('common.status.accepted', 'Accepted'),
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        icon: CheckCircle2,
        borderColor: 'border-green-300 dark:border-green-700',
      };
    case 'rejected':
      return {
        label: translate('common.status.rejected', 'Rejected'),
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        icon: XCircle,
        borderColor: 'border-red-300 dark:border-red-700',
      };
    case 'withdrawn':
      return {
        label: translate('common.status.cancelled', 'Cancelled'),
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
        icon: XCircle,
        borderColor: 'border-gray-300 dark:border-gray-700',
      };
    default:
      return {
        label: translate('common.status.pending', 'Pending'),
        color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        icon: Clock,
        borderColor: 'border-amber-300 dark:border-amber-700',
      };
  }
};

export const SystemMessageCard: React.FC<SystemMessageCardProps> = ({
  message,
  currentUserId,
  onRefresh,
  token,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { header, title, data } = parseSystemMessage(message.message);

  // Optimistic status: the card must reflect the new state immediately after acting,
  // without waiting for the refetch/socket to deliver the updated metadata.
  const [localStatus, setLocalStatus] = useState<string | undefined>(undefined);

  // Single dialog slot replacing the native confirm()/alert() calls.
  // `acknowledge: true` renders it as a plain OK notice.
  const [dialog, setDialog] = useState<{
    tone: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm?: () => void;
    acknowledge?: boolean;
  } | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const proposalStatus = localStatus ?? message.metadata?.proposalStatus;

  const isCurrentUser = (message.sender?.id) === currentUserId;
  const isPending = proposalStatus === 'pending';
  const isApproved = proposalStatus === 'approved';
  const isRejected = proposalStatus === 'rejected';
  const isDirectProposal = message.metadata?.action === 'direct_contract_proposal' || header === 'direct_proposal';

  const statusConfig = getStatusConfig(proposalStatus, t);
  const StatusIcon = statusConfig.icon;

  // Determine card style based on status and sender
  const getCardStyle = () => {
    if (isApproved) {
      return 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800';
    }
    if (isRejected) {
      return 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-200 dark:border-red-800';
    }
    // Counter-offer styling
    if (message.metadata?.isCounterOffer && isPending) {
      if (isCurrentUser) {
        return 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-300 dark:border-orange-700';
      }
      return 'bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 border-orange-300 dark:border-orange-700 ring-2 ring-orange-200/50 dark:ring-orange-800/50';
    }
    if (!isCurrentUser && isPending) {
      return 'bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-900/20 dark:via-yellow-900/20 dark:to-orange-900/20 border-amber-300 dark:border-amber-700 ring-2 ring-amber-200/50 dark:ring-amber-800/50';
    }
    if (isCurrentUser) {
      return 'bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 border-sky-200 dark:border-sky-800';
    }
    return 'bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-gray-800/50 border-slate-200 dark:border-slate-700';
  };

  // Get the title to display
  const getDisplayTitle = () => {
    if (isDirectProposal) {
      return isCurrentUser
        ? t('chat.contractProposalSent', 'Contract proposal sent')
        : t('chat.userProposesContract', '{{name}} proposes a contract to you', { name: message.sender?.name || '' });
    }
    // Check for counter-offer
    const isCounterOffer = message.metadata?.isCounterOffer;
    if (isCounterOffer) {
      if (isCurrentUser) {
        return t('chat.youSentCounterOffer', 'You sent a counter-offer');
      }
      return t('chat.userSentCounterOffer', '{{name}} sent a counter-offer', { name: message.sender?.name || '' });
    }
    if (isCurrentUser) {
      return t('chat.youAppliedToJob', 'Te postulaste a este trabajo');
    }
    return t('chat.userWantsToWork', '{{name}} wants to work with you', { name: message.sender?.name || '' });
  };

  /** Show a non-blocking acknowledge dialog (replaces alert()). */
  const notify = (msg: string) =>
    setDialog({ tone: 'danger', title: t('common.attention', 'Atención'), message: msg, acknowledge: true });

  /** La aceptación no se hizo: se dice por qué y, si lo que falta es pagar, se lleva a pagar. Después se vuelve a pedir el estado real. */
  const explicarPorQueNo = (result: { message?: string; requierePago?: boolean }) => {
    const mensaje = result.message || t('chat.errorAccepting', 'Error accepting');
    if (result.requierePago && message.metadata?.jobId) {
      setDialog({ tone: 'warning', title: 'Falta un pago para aceptar', message: `${mensaje} La aceptación queda hecha cuando se complete el pago.`, confirmLabel: 'Ir a pagar', onConfirm: () => navigate(`/jobs/${message.metadata?.jobId}`, { state: { scrollTo: 'proposals' } }) });
    } else {
      notify(mensaje);
    }
    onRefresh();
  };

  // Handle accept proposal
  const handleAccept = () => {
    if (!message.metadata?.proposalId) {
      notify(t('chat.proposalNotFound', 'Proposal not found'));
      return;
    }

    setDialog({
      tone: 'success',
      title: t('chat.acceptWorker', 'Aceptar trabajador'),
      message: isDirectProposal
        ? t('chat.confirmAcceptDirect', 'Accept this proposal? The job and contract will be created automatically.')
        : t('chat.confirmSelectWorker', 'Select this worker for the job?'),
      confirmLabel: t('common.accept', 'Aceptar'),
      onConfirm: doAccept,
    });
  };

  /**
   * Trabajo de varios lugares (pedido del dueño, 2026-11-20): al elegir desde el mensaje se ven las opciones «elegir» y «elegir y empezar con los elegidos»,
   * con cuántos van de cuántos y cuánto cobra cada uno. El resto de los casos (un solo lugar, propuesta directa) sigue con la confirmación de siempre.
   */
  const [variosLugares, setVariosLugares] = useState<{ lugares: number; elegidos: number; precioPorLugar: number; puedeEmpezarConMenos: boolean } | null>(null);
  const [comprobandoLugares, setComprobandoLugares] = useState(false);

  const handleAcceptDelMensaje = async () => {
    if (!message.metadata?.proposalId) {
      notify(t('chat.proposalNotFound', 'Proposal not found'));
      return;
    }
    if (isDirectProposal || !message.metadata?.jobId) return handleAccept();
    setComprobandoLugares(true);
    try {
      const r = await fetch(`/api/jobs/${message.metadata.jobId}`);
      const d = await r.json();
      const job = d?.success ? d.job : null;
      const lugares = lugaresDelTrabajo(job);
      if (job && lugares > 1) {
        setVariosLugares({
          lugares,
          elegidos: Array.isArray(job.selectedWorkers) ? job.selectedWorkers.length : 0,
          precioPorLugar: precioDeUnLugar(job),
          puedeEmpezarConMenos: job.partialStartAllowed !== false,
        });
        return;
      }
    } catch {
      /* si no se pudo leer el trabajo, sigue la confirmación común: el servidor igual valida los lugares */
    } finally {
      setComprobandoLugares(false);
    }
    handleAccept();
  };

  const doAcceptVarios = async (empezar: boolean) => {
    if (!variosLugares) return;
    const { lugares, elegidos } = variosLugares;
    setDialogLoading(true);
    try {
      const response = await fetch(`/api/proposals/${message.metadata?.proposalId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!result.success) {
        setVariosLugares(null);
        explicarPorQueNo(result);
        return;
      }
      setLocalStatus('approved');
      setVariosLugares(null);
      onRefresh();
      let aviso = `Elegiste ${elegidos + 1} de ${lugares} trabajadores.`;
      if (empezar && elegidos + 1 < lugares) {
        const e = await fetch(`/api/jobs/${message.metadata?.jobId}/start-with-current`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const ed = await e.json();
        aviso = ed.success
          ? `${ed.message || 'El trabajo empieza con los trabajadores elegidos.'}`
          : `Elegiste ${elegidos + 1} de ${lugares}. Todavía no se puede empezar: ${ed.message || 'falta que el elegido acepte su contrato'} Cuando se pueda, vas a ver el botón «Empezar con ${elegidos + 1} de ${lugares}» en el trabajo.`;
      } else if (elegidos + 1 < lugares) {
        aviso += ` Faltan ${lugares - elegidos - 1}: el trabajo sigue abierto para recibir postulaciones.`;
      } else {
        aviso += ' El equipo está completo.';
      }
      setDialog({ tone: 'success', title: 'Trabajador elegido', message: aviso, acknowledge: true });
    } catch (error) {
      console.error('Error:', error);
      setVariosLugares(null);
      notify(t('chat.errorProcessing', 'Error processing request'));
    } finally {
      setDialogLoading(false);
    }
  };

  const doAccept = async () => {
    setDialogLoading(true);
    try {
      const endpoint = isDirectProposal
        ? `/api/proposals/${message.metadata?.proposalId}/accept-direct`
        : `/api/proposals/${message.metadata?.proposalId}/approve`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        // Reflect the new state right away, then refetch so the card picks up the
        // canonical metadata. Navigating is optional: not every accept path returns
        // a contractId (worker selection creates it later), and a missing one must
        // NOT be treated as a failure.
        setLocalStatus('approved');
        setDialog(null);
        onRefresh();
        if (result.contractId) {
          navigate(`/contracts/${result.contractId}/summary`);
        }
      } else {
        explicarPorQueNo(result);
      }
    } catch (error) {
      console.error('Error:', error);
      notify(t('chat.errorProcessing', 'Error processing request'));
    } finally {
      setDialogLoading(false);
    }
  };

  // Handle reject proposal
  const handleReject = () => {
    if (!message.metadata?.proposalId) return;
    setDialog({
      tone: 'danger',
      title: t('chat.denyWorker', 'Rechazar trabajador'),
      message: t('chat.confirmReject', 'Reject this application?'),
      confirmLabel: t('common.reject', 'Rechazar'),
      onConfirm: doReject,
    });
  };

  const doReject = async () => {
    setDialogLoading(true);
    try {
      const endpoint = isDirectProposal
        ? `/api/proposals/${message.metadata?.proposalId}/reject-direct`
        : `/api/proposals/${message.metadata?.proposalId}/reject`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setLocalStatus('rejected');
        setDialog(null);
        onRefresh();
      } else {
        notify(result.message || t('chat.errorRejecting', 'Error rejecting'));
      }
    } catch (error) {
      console.error('Error:', error);
      notify(t('chat.errorRejecting', 'Error rejecting'));
    } finally {
      setDialogLoading(false);
    }
  };

  // Handle withdraw proposal
  const handleWithdraw = () => {
    if (!message.metadata?.proposalId) return;
    setDialog({
      tone: 'warning',
      title: t('chat.confirmWithdrawTitle', 'Retirar postulación'),
      message: t('chat.confirmWithdraw', 'Withdraw your application?'),
      confirmLabel: t('common.yesCancel', 'Sí, cancelar'),
      onConfirm: doWithdraw,
    });
  };

  const doWithdraw = async () => {
    setDialogLoading(true);
    try {
      const response = await fetch(`/api/proposals/${message.metadata?.proposalId}/withdraw`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setLocalStatus('withdrawn');
        setDialog(null);
        onRefresh();
      } else {
        notify(result.message || t('chat.errorCancelling', 'Error cancelling'));
      }
    } catch (error) {
      console.error('Error:', error);
      notify(t('chat.errorCancelling', 'Error cancelling'));
    } finally {
      setDialogLoading(false);
    }
  };

  // Un aviso (novedad del equipo, un pago, un trabajo compartido) no es una postulación: no lleva estado ni botones.
  if (!esTarjetaDePostulacion(message.message, message.metadata)) {
    return <AvisoDelSistema texto={message.message} jobId={message.metadata?.jobId} fecha={message.createdAt} />;
  }
  const yaNoSePuedeElegir = motivoParaNoAceptar(message.metadata);

  return (
    <div className={`flex my-4 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-lg w-full rounded-2xl border-2 shadow-md overflow-hidden ${getCardStyle()} ${
          isCurrentUser ? 'mr-2' : 'ml-2'
        }`}
      >
        {/* Header with status badge */}
        <div className="px-4 py-3 border-b border-inherit flex items-center justify-between gap-3 bg-white/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${isCurrentUser ? 'bg-sky-100 dark:bg-sky-900/50' : isPending ? 'bg-amber-100 dark:bg-amber-900/50' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {!isCurrentUser && isPending ? (
                <UserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <Briefcase className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">
                {getDisplayTitle()}
              </p>
              {title && (
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
                  {title}
                </p>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${statusConfig.color}`}>
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </span>
        </div>

        {/* Quién la aceptó y cuándo. Quien mandó la postulación es quien va a trabajar. */}
        {isApproved && (message.metadata?.aceptadaPor || message.metadata?.autoSelected) && (
          <div className="animate-fadeIn px-4 py-2 bg-green-100 dark:bg-green-900/30 flex items-start gap-2" data-testid="quien-acepto">
            <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-700 dark:text-green-400" />
            <span className="text-xs font-medium text-green-800 dark:text-green-200">
              {textoDeAceptacion({ como: message.metadata?.aceptadaPor ?? 'automatica', cuando: message.metadata?.aceptadaEl }, isCurrentUser ? 'quien_trabaja' : 'quien_publico')}
            </span>
          </div>
        )}

        {/* Counter-offer banner */}
        {message.metadata?.isCounterOffer && (
          <div className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
              {t('chat.counterOfferDifferentPrice', 'Counter-offer - Different price than posted')}
            </span>
          </div>
        )}

        {/* New application banner for receiver */}
        {!isCurrentUser && isPending && !yaNoSePuedeElegir && !message.metadata?.autoSelected && !message.metadata?.isCounterOffer && (
          <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-pulse" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {t('chat.requiresYourResponse', 'Requires your response')}
            </span>
          </div>
        )}

        {/* Content - Structured data */}
        <div className="px-4 py-3 space-y-2">
          {data.startDate && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span className="text-slate-700 dark:text-slate-300">{data.startDate}</span>
            </div>
          )}
          {data.endDate && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span className="text-slate-700 dark:text-slate-300">{data.endDate}</span>
            </div>
          )}
          {data.price && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-lg font-bold text-green-700 dark:text-green-300">{data.price}</span>
              </div>
              {data.originalPrice && (
                <span className="text-slate-500 dark:text-slate-400 line-through text-sm">
                  {t('common.original', 'Original')}: {data.originalPrice}
                </span>
              )}
            </div>
          )}
          {(data.location || message.metadata?.directProposal?.location) && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="text-slate-700 dark:text-slate-300 truncate">
                {data.location || message.metadata?.directProposal?.location}
              </span>
            </div>
          )}

          {/* Attachments */}
          {message.metadata?.directProposal?.attachments && message.metadata.directProposal.attachments.length > 0 && (
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                <Paperclip className="h-3.5 w-3.5" />
                <span>{t('chat.attachedFiles', '{{count}} attached file(s)', { count: message.metadata.directProposal.attachments.length })}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {message.metadata.directProposal.attachments.map((url, index) => {
                  const isPdf = url.toLowerCase().endsWith('.pdf');
                  const fileName = url.split('/').pop() || `Archivo ${index + 1}`;

                  return (
                    <a
                      key={index}
                      href={getImageUrl(url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg hover:border-sky-400 dark:hover:border-sky-500 transition-colors group"
                    >
                      {isPdf ? (
                        <div className="w-10 h-10 flex items-center justify-center bg-red-100 dark:bg-red-900/30 rounded">
                          <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                      ) : (
                        <img
                          src={getImageUrl(url)}
                          alt={fileName}
                          className="w-10 h-10 object-cover rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                          {isPdf ? t('common.pdfDocument', 'PDF Document') : t('common.image', 'Image')}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {fileName.substring(0, 20)}...
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-sky-500 flex-shrink-0" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {(message.metadata?.proposalId || message.metadata?.jobId) && (
          <div className="px-4 py-3 border-t border-inherit bg-white/30 dark:bg-slate-900/30">
            {isPending && (
              <div className="flex flex-wrap gap-2">
                {isCurrentUser ? (
                  // Sender actions
                  <>
                    <button
                      onClick={handleWithdraw}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                    >
                      <X className="h-4 w-4" />
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <div className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('common.waiting', 'Waiting...')}
                    </div>
                  </>
                ) : yaNoSePuedeElegir ? (
                  <p className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" data-testid="ya-no-se-puede-elegir">{yaNoSePuedeElegir}</p>
                ) : (
                  // Receiver actions
                  <>
                    <button
                      onClick={handleAcceptDelMensaje}
                      disabled={comprobandoLugares}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg shadow-sm hover:shadow transition-all active:scale-[0.98] disabled:opacity-60"
                    >
                      {comprobandoLugares ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {t('common.accept', 'Accept')}
                    </button>
                    <button
                      onClick={handleReject}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
                    >
                      <X className="h-4 w-4" />
                      {t('common.reject', 'Reject')}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* View job button */}
            {message.metadata?.jobId && (
              <button
                onClick={() => navigate(`/jobs/${message.metadata?.jobId}`)}
                className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-lg transition-colors ${isPending ? 'mt-2' : ''}`}
              >
                <Briefcase className="h-4 w-4" />
                {t('chat.viewJob', 'View job')}
              </button>
            )}

            {/* View all applicants button */}
            {!isCurrentUser && message.metadata?.jobId && (
              <button
                onClick={() => {
                  const jobUrl = `/jobs/${message.metadata?.jobId}`;
                  navigate(jobUrl, { state: { scrollTo: 'proposals' } });
                }}
                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <Users className="h-4 w-4" />
                {t('chat.viewAllApplicants', 'Ver todos los aplicantes')}
              </button>
            )}

            {/* Contract link if approved */}
            {isApproved && message.metadata?.contractId && (
              <button
                onClick={() => navigate(`/contracts/${message.metadata?.contractId}`)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg shadow-sm"
              >
                <CheckCircle className="h-4 w-4" />
                {t('chat.viewContract', 'View contract')}
              </button>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
          {new Date(message.createdAt).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {variosLugares && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={() => !dialogLoading && setVariosLugares(null)} data-testid="elegir-trabajador-varios-lugares">
          <div className="w-full max-w-md rounded-2xl border border-green-600 bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">Elegir trabajador ({variosLugares.elegidos + 1} de {variosLugares.lugares})</h3>
            <div className="mb-5 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>Este trabajo es de <strong>{variosLugares.lugares} trabajadores</strong> y el total se divide entre ellos: cada uno cobra <strong>${variosLugares.precioPorLugar.toLocaleString('es-AR')}</strong>.</p>
              <p>Ya tenés {variosLugares.elegidos} elegido{variosLugares.elegidos === 1 ? '' : 's'}; con este van a ser {variosLugares.elegidos + 1} de {variosLugares.lugares}.</p>
              {variosLugares.elegidos + 1 < variosLugares.lugares && (
                <p>
                  {variosLugares.puedeEmpezarConMenos
                    ? 'Podés esperar a completar el equipo o empezar con los elegidos (se cierran los lugares que faltan y lo no usado vuelve a tu saldo).'
                    : 'Esta publicación necesita el equipo completo: no empieza hasta cubrir todos los lugares.'}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => doAcceptVarios(false)} disabled={dialogLoading} className="rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-4 py-3 font-semibold text-white shadow-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50" data-testid="elegir-y-esperar">
                {dialogLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : variosLugares.elegidos + 1 < variosLugares.lugares ? 'Elegir y esperar al resto' : 'Elegir'}
              </button>
              {variosLugares.puedeEmpezarConMenos && variosLugares.elegidos + 1 < variosLugares.lugares && (
                <button onClick={() => doAcceptVarios(true)} disabled={dialogLoading} className="rounded-xl border border-green-600 px-4 py-3 font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50 dark:text-green-300 dark:hover:bg-green-900/20" data-testid="elegir-y-empezar">
                  Elegir y empezar con los elegidos
                </button>
              )}
              <button onClick={() => setVariosLugares(null)} disabled={dialogLoading} className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!dialog}
        tone={dialog?.tone || 'warning'}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        loading={dialogLoading}
        confirmLabel={dialog?.acknowledge ? t('common.accept', 'Aceptar') : dialog?.confirmLabel}
        hideCancel={dialog?.acknowledge}
        onConfirm={() => (dialog?.onConfirm ? dialog.onConfirm() : setDialog(null))}
        onClose={() => setDialog(null)}
      />
    </div>
  );
};

export default SystemMessageCard;
