import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { ContractModal, ContractModalType } from '../components/chat/ContractModals';
import {
  Send,
  ArrowLeft,
  Briefcase,
  DollarSign,
  FileText,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  UserCheck,
  Users,
  CheckCircle,
  Clock,
  Key,
  Copy
} from 'lucide-react';

interface Message {
  id?: string; // PostgreSQL
  _id?: string; // MongoDB backward compatibility
  sender: {
    id?: string; // PostgreSQL
    _id?: string; // MongoDB backward compatibility
    name: string;
    avatar?: string;
  };
  message: string;
  type?: 'text' | 'image' | 'file' | 'system';
  metadata?: {
    jobId?: string;
    action?: string;
    [key: string]: any;
  };
  read?: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface JobContext {
  jobId: string;
  title: string;
  description: string;
  budget: number;
  category: string;
  accepted?: boolean; // Si ya aceptó el trabajo
  contractId?: string; // ID del contrato si existe
  allowNegotiation?: boolean; // Si permite regatear
  alreadyApplied?: boolean; // Si ya se postuló
  jobStatus?: string; // Estado del trabajo
}

interface Participant {
  id?: string; // PostgreSQL
  _id?: string; // MongoDB backward compatibility
  name: string;
  avatar?: string;
}

interface ConversationData {
  id?: string; // PostgreSQL
  _id?: string; // MongoDB backward compatibility
  participants: Participant[];
  contractId?: string;
  jobId?: string;
  type: string;
}

interface Job {
  id?: string; // PostgreSQL
  _id?: string; // MongoDB backward compatibility
  title: string;
  description: string;
  price: number;
  category: string;
  location: string;
  status: string;
}

export default function ChatScreen() {
  const { id: conversationId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const {
    sendMessage: socketSendMessage,
    joinConversation,
    leaveConversation,
    messages: socketMessages,
    isConnected,
    registerProposalUpdateHandler
  } = useSocket();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Participant info
  const [otherParticipant, setOtherParticipant] = useState<Participant | null>(null);
  const [showJobsList, setShowJobsList] = useState(false);
  const [participantJobs, setParticipantJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Conversation data (includes contractId if exists)
  const [conversationData, setConversationData] = useState<ConversationData | null>(null);

  // Contract data for alerts
  const [contractData, setContractData] = useState<{
    id: string;
    status: string;
    doerId: string;
    clientId: string;
    pairingCode?: string;
    pairingExpiry?: string;
    job?: {
      id: string;
      title: string;
      startDate: string;
      endDate: string;
      status: string;
    };
  } | null>(null);

  // Job context for contract modals
  const jobContext = location.state?.jobContext as JobContext | undefined;

  // Determinar si se debe mostrar el modal:
  // - Debe existir jobContext
  // - No debe estar marcado como accepted (ya aceptó el trabajo)
  // - No debe haber aplicado ya (alreadyApplied)
  // - El trabajo debe estar 'open' (no in_progress, completed, etc)
  const shouldShowModal = () => {
    if (!jobContext) return false;
    if (jobContext.accepted) return false;
    if (jobContext.alreadyApplied) return false;
    if (jobContext.jobStatus && jobContext.jobStatus !== 'open') return false;
    return true;
  };

  const [showContractModal, setShowContractModal] = useState(shouldShowModal());
  const [contractModalType, setContractModalType] = useState<ContractModalType | null>(
    jobContext?.allowNegotiation === false ? 'apply_direct' : 'apply_negotiate'
  );
  const [modalLoading, setModalLoading] = useState(false);

  // Limpiar el location.state después de usarlo para evitar que persista en refresh
  useEffect(() => {
    if (location.state?.jobContext) {
      // Reemplazar el state actual sin el jobContext para evitar que aparezca en refresh
      window.history.replaceState({}, document.title);
    }
  }, []);

  useEffect(() => {
    if (conversationId) {
      fetchConversationData();
      // Join socket conversation
      if (isConnected) {
        joinConversation(conversationId);
      }
    }

    return () => {
      if (conversationId) {
        leaveConversation(conversationId);
      }
    };
  }, [conversationId, isConnected]);

  // Polling como fallback - actualiza cada 5 segundos si socket no está conectado
  // o cada 15 segundos como backup incluso si socket está conectado
  useEffect(() => {
    if (!conversationId) return;

    const pollInterval = isConnected ? 15000 : 5000; // 15s con socket, 5s sin socket

    const interval = setInterval(() => {
      fetchMessagesOnly();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [conversationId, isConnected]);

  // Fetch solo mensajes (más ligero que fetchConversationData)
  const fetchMessagesOnly = async () => {
    if (!conversationId || !token) return;
    try {
      const msgResponse = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const msgData = await msgResponse.json();
      if (msgData.success && msgData.data) {
        setMessages(prev => {
          // Merge new messages avoiding duplicates
          const existingIds = new Set(prev.map(m => m.id || m._id));
          const newMessages = msgData.data.filter((m: Message) => !existingIds.has(m.id || m._id));
          if (newMessages.length > 0) {
            return [...prev, ...newMessages];
          }
          // También actualizar si hay cambios en metadata (ej: proposalStatus)
          const hasMetadataChanges = msgData.data.some((newMsg: Message) => {
            const existing = prev.find(p => (p.id || p._id) === (newMsg.id || newMsg._id));
            if (existing && newMsg.metadata && existing.metadata) {
              return JSON.stringify(newMsg.metadata) !== JSON.stringify(existing.metadata);
            }
            return false;
          });
          if (hasMetadataChanges) {
            return msgData.data;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  // Sync socket messages with local state
  useEffect(() => {
    if (socketMessages.length > 0) {
      setMessages(prev => {
        // Get IDs of existing messages, excluding temporary optimistic messages
        const existingIds = new Set(
          prev
            .filter(m => !String(m.id || m._id).startsWith('temp-'))
            .map(m => m.id || m._id)
        );

        // Filter out messages that already exist
        const newMessages = socketMessages.filter(m => {
          const msgId = (m as any).id || (m as any)._id;
          return !existingIds.has(msgId);
        });

        if (newMessages.length > 0) {
          // Remove any temp messages that match the content of new messages
          // and add the real messages from server
          const filteredPrev = prev.filter(m => {
            if (!String(m.id || m._id).startsWith('temp-')) return true;
            // Check if this temp message is now confirmed by server
            const hasServerVersion = newMessages.some(nm =>
              (nm as any).message === m.message &&
              (nm as any).sender === m.sender
            );
            return !hasServerVersion;
          });
          return [...filteredPrev, ...newMessages as any];
        }
        return prev;
      });
    }
  }, [socketMessages]);

  // Listen for proposal updates to update message metadata in real-time
  useEffect(() => {
    const handleProposalUpdate = (data: any) => {
      console.log('📩 Proposal update received:', data);
      if (data.proposalId && data.proposalStatus) {
        // Update the message with matching proposalId
        setMessages(prev => prev.map(msg => {
          if (msg.metadata?.proposalId === data.proposalId) {
            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                proposalStatus: data.proposalStatus,
                contractId: data.contractId,
              }
            };
          }
          return msg;
        }));
      }
    };

    registerProposalUpdateHandler(handleProposalUpdate);

    return () => {
      registerProposalUpdateHandler(() => {});
    };
  }, [registerProposalUpdateHandler]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversationData = async () => {
    try {
      // Fetch conversation details
      const convResponse = await fetch(`/api/chat/conversations/${conversationId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const convData = await convResponse.json();

      if (convData.success && convData.data) {
        // Store full conversation data
        setConversationData(convData.data);

        // Find the other participant
        const participants = convData.data.participants;
        const other = participants.find((p: any) => (p.id || p._id) !== user?.id);
        if (other) {
          setOtherParticipant(other);
        }
      }

      // Fetch messages
      const msgResponse = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const msgData = await msgResponse.json();
      if (msgData.success) {
        setMessages(msgData.data || []);
      }
    } catch (error) {
      console.error('Error fetching conversation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch contract data when conversationData has contractId
  useEffect(() => {
    const fetchContractData = async () => {
      if (!conversationData?.contractId || !token) return;

      try {
        const response = await fetch(`/api/contracts/${conversationData.contractId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (data.success && data.contract) {
          setContractData({
            id: data.contract.id,
            status: data.contract.status,
            doerId: data.contract.doerId,
            clientId: data.contract.clientId,
            pairingCode: data.contract.pairingCode,
            pairingExpiry: data.contract.pairingExpiry,
            job: data.contract.job ? {
              id: data.contract.job.id,
              title: data.contract.job.title,
              startDate: data.contract.job.startDate,
              endDate: data.contract.job.endDate,
              status: data.contract.job.status,
            } : undefined,
          });
        }
      } catch (error) {
        console.error('Error fetching contract data:', error);
      }
    };

    fetchContractData();
  }, [conversationData?.contractId, token]);

  // Calculate time until job start for alerts
  const getTimeUntilJobStart = () => {
    if (!contractData?.job?.startDate) return null;
    const startDate = new Date(contractData.job.startDate);
    const now = new Date();
    const diffMs = startDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return { diffMs, diffHours, startDate };
  };

  // Check if current user is the selected worker (doer)
  const isSelectedWorker = contractData?.doerId === user?.id;

  // State for copying pairing code
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyPairingCode = () => {
    if (contractData?.pairingCode) {
      navigator.clipboard.writeText(contractData.pairingCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    }
  };

  // Determine which alerts to show
  const getContractAlerts = () => {
    if (!contractData || !isSelectedWorker) return [];

    const alerts: { type: 'selected' | 'soon' | 'in_progress'; message: string; color: string }[] = [];
    const timeInfo = getTimeUntilJobStart();

    // Alert: Selected for the job
    if (contractData.status === 'pending' || contractData.status === 'active') {
      alerts.push({
        type: 'selected',
        message: `¡Fuiste seleccionado para "${contractData.job?.title || 'este trabajo'}"!`,
        color: 'green',
      });
    }

    // Alert: Less than 6 hours until start
    if (timeInfo && timeInfo.diffHours > 0 && timeInfo.diffHours <= 6) {
      const hours = Math.floor(timeInfo.diffHours);
      const minutes = Math.floor((timeInfo.diffHours - hours) * 60);
      alerts.push({
        type: 'soon',
        message: `⏰ El trabajo comienza en ${hours > 0 ? `${hours}h ` : ''}${minutes}min`,
        color: 'amber',
      });
    }

    // Alert: Job in progress
    if (contractData.job?.status === 'in_progress' || contractData.status === 'active') {
      if (timeInfo && timeInfo.diffMs <= 0) {
        alerts.push({
          type: 'in_progress',
          message: '🔧 El trabajo está en progreso',
          color: 'blue',
        });
      }
    }

    return alerts;
  };

  const handleProfileClick = async () => {
    if (!otherParticipant) return;

    if (showJobsList) {
      setShowJobsList(false);
      return;
    }

    setLoadingJobs(true);
    setShowJobsList(true);

    try {
      const response = await fetch(`/api/jobs?client=${otherParticipant.id || otherParticipant._id}&status=open`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        setParticipantJobs(data.jobs || []);
      }
    } catch (error) {
      console.error('Error fetching participant jobs:', error);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending || !conversationId) return;

    const messageText = newMessage.trim();
    setSending(true);

    // Add message optimistically to UI immediately
    const optimisticMessage: Message = {
      _id: `temp-${Date.now()}`,
      id: `temp-${Date.now()}`,
      sender: {
        id: user?.id || user?._id || '',
        _id: user?._id || user?.id || '',
        name: user?.name || '',
        avatar: user?.avatar,
      },
      message: messageText,
      type: 'text',
      read: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage('');

    try {
      // Use Socket.io for real-time messaging
      socketSendMessage({
        conversationId,
        message: messageText,
        type: 'text'
      });
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m._id !== optimisticMessage._id));
    } finally {
      setSending(false);
    }
  };

  const handleModalSubmit = async (data: any) => {
    if (!jobContext || modalLoading) return;

    setModalLoading(true);
    try {
      switch (data.type) {
        case 'apply_direct':
          // Aplicar directamente sin regatear
          const directProposal = await fetch('/api/proposals', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              job: data.jobId,
              coverLetter: `Estoy interesado en realizar este trabajo por el precio propuesto.`,
              proposedPrice: data.amount,
              estimatedDuration: 1,
            }),
          });

          const directData = await directProposal.json();
          if (directData.success) {
            // El backend ya crea el mensaje del sistema automáticamente
            setShowContractModal(false);
            fetchConversationData(); // Reload messages
          } else {
            alert(directData.message || 'Error al enviar aplicación');
          }
          break;

        case 'apply_negotiate':
          // Aplicar con negociación
          const negotiateProposal = await fetch('/api/proposals', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              job: data.jobId,
              coverLetter: data.message || `Estoy interesado en realizar este trabajo. Te ofrezco un precio de $${data.amount}.`,
              proposedPrice: data.amount,
              estimatedDuration: 1,
            }),
          });

          const negotiateData = await negotiateProposal.json();
          if (negotiateData.success) {
            // El backend ya crea el mensaje del sistema automáticamente
            setShowContractModal(false);
            fetchConversationData(); // Reload messages
          } else {
            alert(negotiateData.message || 'Error al enviar contraoferta');
          }
          break;

        case 'accept_application':
          // Aceptar aplicación (crear contrato)
          // Esto normalmente se hace desde la página de propuestas
          // Aquí solo enviamos un mensaje de confirmación
          await fetch(`/api/chat/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: `✅ He aceptado tu aplicación. Se ha creado el contrato.`,
            }),
          });
          setShowContractModal(false);
          navigate(`/jobs/${data.jobId}/applications`);
          break;

        case 'reject_application':
          // Rechazar aplicación
          await fetch(`/api/chat/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: `❌ He decidido no continuar con tu aplicación para este trabajo. Gracias por tu interés.`,
            }),
          });
          setShowContractModal(false);
          break;

        case 'modify':
        case 'cancel':
          // Solicitar cambios o cancelación de contrato
          const changeResponse = await fetch('/api/contract-change-requests', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              contractId: data.contractId,
              type: data.type,
              reason: data.reason,
            }),
          });

          const changeData = await changeResponse.json();
          if (changeData.success) {
            alert('Solicitud enviada exitosamente');
            setShowContractModal(false);
          } else {
            alert(changeData.message || 'Error al enviar solicitud');
          }
          break;
      }
    } catch (error) {
      console.error('Error submitting modal:', error);
      alert('Error al procesar la solicitud');
    } finally {
      setModalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Chat - DOAPP</title>
      </Helmet>

      <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4">
          <div className="container mx-auto max-w-4xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Back button - Only visible on mobile */}
              <Link
                to={
                  // Priority 1: If conversation has contractId, go to contract detail
                  conversationData?.contractId
                    ? `/contracts/${conversationData.contractId}`
                    : // Priority 2: If jobContext exists, go to job detail
                    jobContext?.jobId
                    ? `/jobs/${jobContext.jobId}`
                    : // Priority 3: Default to contracts list
                      "/contracts"
                }
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors md:hidden"
              >
                <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Conversación
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {jobContext ? jobContext.title : otherParticipant?.name || 'Chat'}
                </p>
              </div>
            </div>

            {/* Participant Profile */}
            {otherParticipant && (
              <button
                onClick={handleProfileClick}
                className="flex items-center gap-3 px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  {otherParticipant.avatar ? (
                    <img
                      src={otherParticipant.avatar}
                      alt={otherParticipant.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                      <UserIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {otherParticipant.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Ver trabajos
                    </p>
                  </div>
                </div>
                {showJobsList ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Jobs List */}
        {showJobsList && (
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4">
            <div className="container mx-auto max-w-4xl">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Trabajos disponibles de {otherParticipant?.name}
              </h3>

              {loadingJobs ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                </div>
              ) : participantJobs.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No hay trabajos disponibles en este momento
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {participantJobs.map((job) => (
                    <div
                      key={job.id || job._id}
                      className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                          {job.title}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-1 mt-1">
                          {job.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 dark:text-sky-400">
                            <DollarSign className="h-4 w-4" />
                            {job.price.toLocaleString('es-AR')}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {job.category}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/jobs/${job.id || job._id}/apply`)}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        Aplicar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto max-w-4xl px-4 py-6 space-y-4">
            {/* Contract Alerts for selected worker */}
            {getContractAlerts().length > 0 && (
              <div className="space-y-2">
                {getContractAlerts().map((alert, index) => (
                  <div
                    key={index}
                    className={`rounded-xl p-4 border-2 flex items-center gap-3 ${
                      alert.color === 'green'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-600'
                        : alert.color === 'amber'
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600'
                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
                    }`}
                  >
                    <div className={`p-2 rounded-full ${
                      alert.color === 'green'
                        ? 'bg-green-100 dark:bg-green-800'
                        : alert.color === 'amber'
                        ? 'bg-amber-100 dark:bg-amber-800'
                        : 'bg-blue-100 dark:bg-blue-800'
                    }`}>
                      {alert.type === 'selected' && (
                        <CheckCircle className={`h-5 w-5 ${
                          alert.color === 'green' ? 'text-green-600 dark:text-green-400' : ''
                        }`} />
                      )}
                      {alert.type === 'soon' && (
                        <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      )}
                      {alert.type === 'in_progress' && (
                        <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-semibold ${
                        alert.color === 'green'
                          ? 'text-green-700 dark:text-green-300'
                          : alert.color === 'amber'
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-blue-700 dark:text-blue-300'
                      }`}>
                        {alert.message}
                      </p>
                      {alert.type === 'selected' && contractData && (
                        <Link
                          to={`/contracts/${contractData.id}`}
                          className="text-sm text-green-600 dark:text-green-400 hover:underline mt-1 inline-block"
                        >
                          Ver detalles del contrato →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pairing Code Display for Worker */}
            {isSelectedWorker && contractData?.pairingCode && (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-5 border-2 border-purple-200 dark:border-purple-700 shadow-md">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Key className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-purple-900 dark:text-purple-100 text-lg mb-1">
                      Código de Pareamiento
                    </h4>
                    <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                      Muestra este código al cliente cuando llegues al lugar de trabajo
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg p-3 border-2 border-purple-300 dark:border-purple-600">
                        <p className="text-2xl font-mono font-bold text-purple-700 dark:text-purple-300 text-center tracking-widest">
                          {contractData.pairingCode}
                        </p>
                      </div>
                      <button
                        onClick={handleCopyPairingCode}
                        className="p-3 bg-purple-100 dark:bg-purple-900/50 hover:bg-purple-200 dark:hover:bg-purple-800/50 rounded-lg transition-colors"
                        title="Copiar código"
                      >
                        {copiedCode ? (
                          <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <Copy className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        )}
                      </button>
                    </div>
                    {copiedCode && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                        ¡Código copiado!
                      </p>
                    )}
                    {contractData.pairingExpiry && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                        Expira: {new Date(contractData.pairingExpiry).toLocaleString('es-AR')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Job/Contract reference banner */}
            {jobContext && (
              <div className="bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 border-2 border-sky-200 dark:border-sky-700 rounded-2xl p-6 shadow-lg">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-sky-100 dark:bg-sky-900/50 rounded-lg">
                      <Briefcase className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white text-lg mb-1">
                        {jobContext.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-1 bg-sky-100 dark:bg-sky-900/50 rounded-md">
                          {jobContext.category}
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400">
                          <DollarSign className="h-4 w-4" />
                          {jobContext.budget}
                        </span>
                      </div>
                      {jobContext.description && (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                          {jobContext.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  {jobContext.contractId && (
                    <Link
                      to={`/contracts/${jobContext.contractId}`}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border-2 border-sky-500 text-sky-600 dark:text-sky-400 font-semibold rounded-lg hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <FileText className="h-5 w-5" />
                      Ver Contrato
                    </Link>
                  )}
                  <Link
                    to={`/jobs/${jobContext.jobId}`}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Briefcase className="h-5 w-5" />
                    Ver Trabajo
                  </Link>
                </div>
              </div>
            )}

            {/* Messages list */}
            {messages.map((message) => {
              // System message - special styling
              if (message.type === 'system') {
                // Parse message with || delimiter: "Usuario aplicó||Título||Contenido"
                const parts = message.message.split('||');
                const header = parts[0] || '';
                const title = parts[1] || '';
                const content = parts[2] || message.message;

                // Align based on sender
                const isCurrentUser = (message.sender.id || message.sender._id) === user?.id;
                const isPending = message.metadata?.proposalStatus === 'pending';

                // Different styles for sent vs received applications
                const containerStyles = isCurrentUser
                  ? 'bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 border-2 border-sky-200 dark:border-sky-800'
                  : isPending
                    ? 'bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 dark:from-emerald-900/20 dark:via-green-900/20 dark:to-teal-900/20 border-2 border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-200/50 dark:ring-emerald-800/50'
                    : 'bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/20 dark:to-gray-900/20 border-2 border-slate-200 dark:border-slate-700';

                const iconContainerStyles = isCurrentUser
                  ? 'bg-sky-100 dark:bg-sky-900/50'
                  : isPending
                    ? 'bg-emerald-100 dark:bg-emerald-900/50'
                    : 'bg-slate-100 dark:bg-slate-800';

                const iconStyles = isCurrentUser
                  ? 'text-sky-600 dark:text-sky-400'
                  : isPending
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400';

                const headerStyles = isCurrentUser
                  ? 'text-sky-900 dark:text-sky-100'
                  : isPending
                    ? 'text-emerald-900 dark:text-emerald-100'
                    : 'text-slate-900 dark:text-slate-100';

                return (
                  <div
                    key={message.id || message._id}
                    className={`flex my-6 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-2xl w-full rounded-2xl p-6 shadow-lg ${containerStyles} ${isCurrentUser ? 'mr-4' : 'ml-4'}`}>
                      {/* "Nueva Postulación" badge for received pending applications */}
                      {!isCurrentUser && isPending && (
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-emerald-200 dark:border-emerald-700">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-full animate-pulse">
                            <span className="w-2 h-2 bg-white rounded-full" />
                            Nueva Postulación
                          </span>
                          <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                            Requiere tu atención
                          </span>
                        </div>
                      )}

                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full flex-shrink-0 ${iconContainerStyles}`}>
                          {!isCurrentUser && isPending ? (
                            <UserCheck className={`h-6 w-6 ${iconStyles}`} />
                          ) : (
                            <Briefcase className={`h-6 w-6 ${iconStyles}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Header - modificar según quién es el usuario */}
                          <h4 className={`text-lg font-bold mb-1 ${headerStyles}`}>
                            {isCurrentUser
                              ? header.replace(/se postuló al trabajo|aplicó|envió una contraoferta/gi, (match) =>
                                  match.toLowerCase().includes('contraoferta')
                                    ? 'Enviaste una contraoferta'
                                    : 'Te postulaste al trabajo'
                                )
                              : header.replace(/se postuló al trabajo|aplicó|envió una contraoferta/gi, (match) =>
                                  match.toLowerCase().includes('contraoferta')
                                    ? `${message.sender.name} envió una contraoferta`
                                    : `${message.sender.name} quiere trabajar contigo`
                                )
                            }
                          </h4>

                          {/* Title */}
                          {title && (
                            <h5 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
                              {title}
                            </h5>
                          )}

                          {/* Content */}
                          <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
                            <div
                              className="text-slate-700 dark:text-slate-300 text-sm"
                              dangerouslySetInnerHTML={{
                                __html: content
                                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900 dark:text-white">$1</strong>')
                                  .replace(/•/g, '<span class="text-sky-600 dark:text-sky-400">•</span>')
                                  .replace(/\n/g, '<br />')
                              }}
                            />
                          </div>

                          {/* Action Buttons */}
                          {message.metadata?.action === 'job_application' && (
                            <div className="flex flex-wrap gap-2 mt-4">
                              {/* Botón Ver Trabajo - siempre visible */}
                              <button
                                onClick={() => navigate(`/jobs/${message.metadata?.jobId}`)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
                              >
                                <Briefcase className="h-4 w-4" />
                                Ver Trabajo
                              </button>

                              {isCurrentUser ? (
                                // Si YO envié esta aplicación/contraoferta
                                <>
                                  {message.metadata?.proposalStatus === 'pending' && (
                                    <button
                                      onClick={async () => {
                                        if (!message.metadata?.proposalId) return;
                                        if (!confirm('¿Estás seguro de que deseas cancelar tu propuesta?')) return;

                                        try {
                                          const response = await fetch(
                                            `/api/proposals/${message.metadata.proposalId}/withdraw`,
                                            {
                                              method: 'PUT',
                                              headers: {
                                                'Content-Type': 'application/json',
                                                Authorization: `Bearer ${localStorage.getItem('token')}`,
                                              },
                                            }
                                          );
                                          const data = await response.json();
                                          if (data.success) {
                                            alert('Propuesta cancelada');
                                            fetchConversationData();
                                          } else {
                                            alert(data.message || 'Error al cancelar');
                                          }
                                        } catch (error) {
                                          console.error('Error:', error);
                                          alert('Error al cancelar la propuesta');
                                        }
                                      }}
                                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                      <X className="h-4 w-4" />
                                      Cancelar {message.metadata?.isCounterOffer ? 'Contraoferta' : 'Aplicación'}
                                    </button>
                                  )}
                                  {message.metadata?.proposalStatus === 'pending' && (
                                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-lg">
                                      <Loader2 className="h-4 w-4" />
                                      Esperando respuesta...
                                    </span>
                                  )}
                                </>
                              ) : (
                                // Si YO soy el dueño del trabajo y RECIBÍ esta propuesta
                                <>
                                  {message.metadata?.proposalStatus === 'pending' && (
                                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                      <button
                                        onClick={async () => {
                                          if (!message.metadata?.proposalId) {
                                            alert('No se encontró la propuesta');
                                            return;
                                          }

                                          if (!confirm('¿Estás seguro de que deseas seleccionar a este trabajador?')) {
                                            return;
                                          }

                                          try {
                                            const response = await fetch(
                                              `/api/proposals/${message.metadata.proposalId}/approve`,
                                              {
                                                method: 'PUT',
                                                headers: {
                                                  'Content-Type': 'application/json',
                                                  Authorization: `Bearer ${localStorage.getItem('token')}`,
                                                },
                                              }
                                            );

                                            const data = await response.json();

                                            if (data.success && data.contractId) {
                                              navigate(`/contracts/${data.contractId}/summary`);
                                            } else {
                                              alert(data.message || 'Error al seleccionar trabajador');
                                            }
                                          } catch (error) {
                                            console.error('Error accepting proposal:', error);
                                            alert('Error al seleccionar trabajador');
                                          }
                                        }}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                                      >
                                        <CheckCircle className="h-5 w-5" />
                                        Seleccionar Trabajador
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (!message.metadata?.proposalId) return;
                                          if (!confirm('¿Estás seguro de que deseas rechazar esta postulación?')) return;

                                          try {
                                            const response = await fetch(
                                              `/api/proposals/${message.metadata.proposalId}/reject`,
                                              {
                                                method: 'PUT',
                                                headers: {
                                                  'Content-Type': 'application/json',
                                                  Authorization: `Bearer ${localStorage.getItem('token')}`,
                                                },
                                              }
                                            );
                                            const data = await response.json();
                                            if (data.success) {
                                              fetchConversationData();
                                            } else {
                                              alert(data.message || 'Error al rechazar');
                                            }
                                          } catch (error) {
                                            console.error('Error:', error);
                                            alert('Error al rechazar la postulación');
                                          }
                                        }}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl transition-colors border-2 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700"
                                      >
                                        <X className="h-4 w-4" />
                                        Rechazar
                                      </button>
                                    </div>
                                  )}

                                  <button
                                    onClick={() => navigate(`/jobs/${message.metadata?.jobId}/applications`)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-xl transition-colors border-2 border-slate-200 dark:border-slate-600"
                                  >
                                    <Users className="h-4 w-4" />
                                    Ver Todos los Postulados
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Timestamp */}
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                            {new Date(message.createdAt).toLocaleDateString('es-AR', {
                              day: 'numeric',
                              month: 'long',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Regular message
              return (
                <div
                  key={message.id || message._id}
                  className={`flex ${
                    (message.sender.id || message.sender._id) === user?.id ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      (message.sender.id || message.sender._id) === user?.id
                        ? 'bg-sky-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <p className="text-sm font-medium mb-1 opacity-75">
                      {message.sender.name}
                    </p>
                    <p className="whitespace-pre-wrap">{message.message}</p>
                    <p
                      className={`text-xs mt-2 ${
                        (message.sender.id || message.sender._id) === user?.id
                          ? 'text-sky-100'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {new Date(message.createdAt).toLocaleTimeString('es-AR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-4">
          <div className="container mx-auto max-w-4xl">
            <form onSubmit={handleSendMessage} className="flex gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="h-5 w-5" />
                Enviar
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Contract Modal */}
      {showContractModal && contractModalType && jobContext && (
        <ContractModal
          isOpen={showContractModal}
          onClose={() => setShowContractModal(false)}
          modalType={contractModalType}
          jobData={{
            title: jobContext.title,
            description: jobContext.description,
            budget: jobContext.budget,
            jobId: jobContext.jobId,
            contractId: jobContext.contractId,
            allowNegotiation: jobContext.allowNegotiation,
          }}
          applicantName={otherParticipant?.name}
          onSubmit={handleModalSubmit}
          isLoading={modalLoading}
        />
      )}
    </>
  );
}
