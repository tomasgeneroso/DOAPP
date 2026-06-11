import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  ArrowLeft,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Loader2,
  User,
  Bug,
  HelpCircle,
  FileText,
  DollarSign,
} from "lucide-react";

interface TicketMessage {
  id?: string;
  author: string;
  authorName?: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolution?: string;
  messages: TicketMessage[];
  creator?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

const categoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
  feature: { label: 'Sugerencia', icon: HelpCircle, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  support: { label: 'Soporte', icon: HelpCircle, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
  report_user: { label: 'Reportar usuario', icon: AlertCircle, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
  report_contract: { label: 'Reportar contrato', icon: FileText, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
  payment: { label: 'Pago', icon: DollarSign, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
  other: { label: 'Otro', icon: HelpCircle, color: 'text-gray-600 bg-gray-100 dark:bg-gray-700' },
};

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Abierto', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: AlertCircle },
  in_progress: { label: 'En progreso', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: Clock },
  waiting_response: { label: 'Esperando respuesta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: MessageSquare },
  resolved: { label: 'Resuelto', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  closed: { label: 'Cerrado', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: CheckCircle },
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  low: { label: 'Baja', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tickets/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setTicket(data.ticket);
      } else {
        setError(data.message || 'Error al cargar el ticket');
      }
    } catch (err) {
      console.error("Error loading ticket:", err);
      setError('Error al cargar el ticket');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (id) loadTicket();
  }, [id, loadTicket]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !id) return;

    setSending(true);
    try {
      const response = await fetch(`/api/tickets/${id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (data.success) {
        setMessage("");
        await loadTicket();
      } else {
        alert(data.message || 'Error al enviar mensaje');
      }
    } catch (err) {
      alert("Error al enviar mensaje");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="py-8">
        <div className="max-w-4xl mx-auto px-4">
          <Link
            to="/help"
            className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Centro de Ayuda
          </Link>
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">{error || 'Ticket no encontrado'}</p>
          </div>
        </div>
      </div>
    );
  }

  const category = categoryLabels[ticket.category] || categoryLabels.other;
  const status = statusLabels[ticket.status] || statusLabels.open;
  const priority = priorityLabels[ticket.priority] || priorityLabels.medium;
  const CategoryIcon = category.icon;
  const StatusIcon = status.icon;

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

  return (
    <div className="py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <Link
          to="/help"
          className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al Centro de Ayuda
        </Link>

        {/* Ticket Info */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className={`p-3 rounded-lg ${category.color} self-start`}>
              <CategoryIcon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-slate-500 font-mono">{ticket.ticketNumber}</span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.color}`}>
                  {priority.label}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {ticket.subject}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={`inline-flex items-center gap-1 px-2 py-1 font-medium rounded-full ${status.color}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {status.label}
                </span>
                <span className="text-slate-500">
                  Creado: {new Date(ticket.createdAt).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              {ticket.assignee && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <User className="h-4 w-4" />
                  Asignado a: {ticket.assignee.name}
                </div>
              )}
            </div>
          </div>

          {/* Resolution */}
          {ticket.resolution && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <h3 className="font-medium text-green-800 dark:text-green-200 mb-1">Resolución</h3>
              <p className="text-sm text-green-700 dark:text-green-300">{ticket.resolution}</p>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversación ({ticket.messages?.length || 0} mensajes)
            </h2>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[500px] overflow-y-auto">
            {ticket.messages && ticket.messages.length > 0 ? (
              ticket.messages
                .filter(msg => !msg.isInternal) // Users don't see internal messages
                .map((msg, index) => {
                  const isOwnMessage = msg.author === user?._id;
                  return (
                    <div key={msg.id || index} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isOwnMessage
                            ? 'bg-sky-100 dark:bg-sky-900/30'
                            : 'bg-purple-100 dark:bg-purple-900/30'
                        }`}>
                          <User className={`h-4 w-4 ${
                            isOwnMessage
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-purple-600 dark:text-purple-400'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-900 dark:text-white text-sm">
                              {msg.authorName || (isOwnMessage ? 'Tú' : 'Soporte')}
                            </span>
                            {!isOwnMessage && (
                              <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded">
                                Staff
                              </span>
                            )}
                            <span className="text-xs text-slate-500">
                              {new Date(msg.createdAt).toLocaleDateString('es-AR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 text-sm whitespace-pre-wrap">
                            {msg.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="p-8 text-center text-slate-500">
                No hay mensajes aún
              </div>
            )}
          </div>

          {/* Reply Form */}
          {!isResolved && (
            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-slate-900 dark:text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={sending || !message.trim()}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  {sending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          )}

          {isResolved && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Este ticket está cerrado. Si necesitas más ayuda, crea un nuevo ticket.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
