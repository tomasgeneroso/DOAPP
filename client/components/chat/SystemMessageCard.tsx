import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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

interface SystemMessageCardProps {
  message: {
    id?: string;
    _id?: string;
    message: string;
    sender: {
      id?: string;
      _id?: string;
      name: string;
      avatar?: string;
    };
    metadata?: {
      jobId?: string;
      proposalId?: string;
      proposalStatus?: 'pending' | 'approved' | 'rejected' | 'withdrawn';
      action?: string;
      autoSelected?: boolean;
      isCounterOffer?: boolean;
      contractId?: string;
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

  const isCurrentUser = (message.sender.id || message.sender._id) === currentUserId;
  const isPending = message.metadata?.proposalStatus === 'pending';
  const isApproved = message.metadata?.proposalStatus === 'approved';
  const isRejected = message.metadata?.proposalStatus === 'rejected';
  const isDirectProposal = message.metadata?.action === 'direct_contract_proposal' || header === 'direct_proposal';

  const statusConfig = getStatusConfig(message.metadata?.proposalStatus, t);
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
        : t('chat.userProposesContract', '{{name}} proposes a contract to you', { name: message.sender.name });
    }
    // Check for counter-offer
    const isCounterOffer = message.metadata?.isCounterOffer;
    if (isCounterOffer) {
      if (isCurrentUser) {
        return t('chat.youSentCounterOffer', 'You sent a counter-offer');
      }
      return t('chat.userSentCounterOffer', '{{name}} sent a counter-offer', { name: message.sender.name });
    }
    if (isCurrentUser) {
      return t('chat.youAppliedToJob', 'You applied to this job');
    }
    return t('chat.userWantsToWork', '{{name}} wants to work with you', { name: message.sender.name });
  };

  // Handle accept proposal
  const handleAccept = async () => {
    if (!message.metadata?.proposalId) {
      alert(t('chat.proposalNotFound', 'Proposal not found'));
      return;
    }

    const confirmMsg = isDirectProposal
      ? t('chat.confirmAcceptDirect', 'Accept this proposal? The job and contract will be created automatically.')
      : t('chat.confirmSelectWorker', 'Select this worker for the job?');

    if (!confirm(confirmMsg)) return;

    try {
      const endpoint = isDirectProposal
        ? `/api/proposals/${message.metadata.proposalId}/accept-direct`
        : `/api/proposals/${message.metadata.proposalId}/approve`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.success && result.contractId) {
        navigate(`/contracts/${result.contractId}/summary`);
      } else {
        alert(result.message || t('chat.errorAccepting', 'Error accepting'));
      }
    } catch (error) {
      console.error('Error:', error);
      alert(t('chat.errorProcessing', 'Error processing request'));
    }
  };

  // Handle reject proposal
  const handleReject = async () => {
    if (!message.metadata?.proposalId) return;

    if (!confirm(t('chat.confirmReject', 'Reject this application?'))) return;

    try {
      const endpoint = isDirectProposal
        ? `/api/proposals/${message.metadata.proposalId}/reject-direct`
        : `/api/proposals/${message.metadata.proposalId}/reject`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        onRefresh();
      } else {
        alert(result.message || t('chat.errorRejecting', 'Error rejecting'));
      }
    } catch (error) {
      console.error('Error:', error);
      alert(t('chat.errorRejecting', 'Error rejecting'));
    }
  };

  // Handle withdraw proposal
  const handleWithdraw = async () => {
    if (!message.metadata?.proposalId) return;

    if (!confirm(t('chat.confirmWithdraw', 'Withdraw your application?'))) return;

    try {
      const response = await fetch(`/api/proposals/${message.metadata.proposalId}/withdraw`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        onRefresh();
      } else {
        alert(result.message || t('chat.errorCancelling', 'Error cancelling'));
      }
    } catch (error) {
      console.error('Error:', error);
      alert(t('chat.errorCancelling', 'Error cancelling'));
    }
  };

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

        {/* Autoselected banner */}
        {message.metadata?.autoSelected && (
          <div className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
              {t('chat.autoSelected', 'Automatically selected')}
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
        {!isCurrentUser && isPending && !message.metadata?.autoSelected && !message.metadata?.isCounterOffer && (
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
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span className="font-semibold text-green-700 dark:text-green-400">{data.price}</span>
              {data.originalPrice && (
                <span className="text-slate-500 dark:text-slate-400 line-through text-xs">
                  ({t('common.original', 'Original')}: {data.originalPrice})
                </span>
              )}
            </div>
          )}
          {data.location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span className="text-slate-700 dark:text-slate-300 truncate">{data.location}</span>
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
                      href={url}
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
                          src={url}
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
                ) : (
                  // Receiver actions
                  <>
                    <button
                      onClick={handleAccept}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg shadow-sm hover:shadow transition-all active:scale-[0.98]"
                    >
                      <CheckCircle className="h-4 w-4" />
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
            {!isCurrentUser && message.metadata?.jobId && !isDirectProposal && (
              <button
                onClick={() => navigate(`/jobs/${message.metadata?.jobId}/applications`)}
                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <Users className="h-4 w-4" />
                {t('chat.viewAllApplicants', 'View all applicants')}
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
    </div>
  );
};

export default SystemMessageCard;
