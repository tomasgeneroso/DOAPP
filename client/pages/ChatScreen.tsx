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
  User as UserIcon
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
  createdAt: string;
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
    isConnected
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

  // Job context for contract modals
  const jobContext = location.state?.jobContext as JobContext | undefined;
  const [showContractModal, setShowContractModal] = useState(!!jobContext);
  const [contractModalType, setContractModalType] = useState<ContractModalType | null>(
    jobContext?.allowNegotiation === false ? 'apply_direct' : 'apply_negotiate'
  );
  const [modalLoading, setModalLoading] = useState(false);

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

  // Sync socket messages with local state
  useEffect(() => {
    if (socketMessages.length > 0) {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id || m._id));
        const newMessages = socketMessages.filter(m => !existingIds.has((m as any).id || (m as any)._id));
        if (newMessages.length > 0) {
          return [...prev, ...newMessages as any];
        }
        return prev;
      });
    }
  }, [socketMessages]);

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

    setSending(true);
    try {
      // Use Socket.io for real-time messaging
      socketSendMessage({
        conversationId,
        message: newMessage,
        type: 'text'
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
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
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Conversación
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {jobContext ? `Negociación: ${jobContext.title}` : 'Chat de negociación'}
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

                return (
                  <div
                    key={message.id || message._id}
                    className={`flex my-6 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-2xl w-full bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 border-2 border-sky-200 dark:border-sky-800 rounded-2xl p-6 shadow-lg ${isCurrentUser ? 'mr-4' : 'ml-4'}`}>
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-sky-100 dark:bg-sky-900/50 rounded-full flex-shrink-0">
                          <Briefcase className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Header */}
                          <h4 className="text-lg font-bold text-sky-900 dark:text-sky-100 mb-1">
                            {header}
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
                              {isCurrentUser ? (
                                // Si el usuario aplicó, mostrar botón para ver su propuesta
                                <button
                                  onClick={() => navigate(`/proposals/${message.metadata?.proposalId}`)}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                  <FileText className="h-4 w-4" />
                                  Ver Mi {message.metadata?.isCounterOffer ? 'Contraoferta' : 'Aplicación'}
                                </button>
                              ) : (
                                // Si el usuario es el cliente, mostrar botones de gestión
                                <>
                                  <button
                                    onClick={() => navigate(`/jobs/${message.metadata?.jobId}`)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    <Briefcase className="h-4 w-4" />
                                    Ver Trabajo
                                  </button>
                                </>
                              )}

                              {!isCurrentUser && (
                                <>
                                  <button
                                    onClick={() => navigate(`/jobs/${message.metadata?.jobId}/applications`)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    <FileText className="h-4 w-4" />
                                    Ver Postulaciones
                                  </button>

                                  <button
                                    onClick={async () => {
                                      if (!message.metadata?.proposalId) {
                                        alert('No se encontró la propuesta');
                                        return;
                                      }

                                      if (!confirm('¿Estás seguro de que deseas aceptar esta propuesta?')) {
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
                                          // Redirect to contract summary to review costs and proceed to payment
                                          navigate(`/contracts/${data.contractId}/summary`);
                                        } else {
                                          alert(data.message || 'Error al aceptar la propuesta');
                                        }
                                      } catch (error) {
                                        console.error('Error accepting proposal:', error);
                                        alert('Error al aceptar la propuesta');
                                      }
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    <Check className="h-4 w-4" />
                                    Aceptar Propuesta
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
