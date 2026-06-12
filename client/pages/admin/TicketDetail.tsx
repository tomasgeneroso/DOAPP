import { useEffect, useState, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from "react-router-dom";
import { adminApi } from "@/lib/adminApi";
import type { Ticket } from "@/types/admin";
import {
  ArrowLeft,
  Send,
  Lock,
  CheckCircle,
  Clock,
  AlertTriangle,
  User,
  Tag,
  Calendar,
  MessageSquare,
  FileText,
  ChevronDown,
  X,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  assigned: "Asignado",
  in_progress: "En progreso",
  waiting_user: "Esperando usuario",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  assigned:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  in_progress:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  waiting_user:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  resolved:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  feature: "Feature",
  support: "Soporte",
  report_user: "Denuncia usuario",
  report_contract: "Denuncia contrato",
  dispute: "Disputa",
  payment: "Pago",
  other: "Otro",
};

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversation" | "notes">(
    "conversation",
  );
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [resolution, setResolution] = useState("");
  const [closingTicket, setClosingTicket] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  useEffect(() => {
    if (id) loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (activeTab === "conversation") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [ticket?.messages, activeTab]);

  const loadTicket = async () => {
    try {
      const res = await adminApi.tickets.get(id!);
      if (res.success && res.data) setTicket(res.data);
    } catch (error) {
      console.error("Error loading ticket:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !id) return;
    setSending(true);
    try {
      await adminApi.tickets.addMessage(id, message, isInternal);
      setMessage("");
      await loadTicket();
    } catch {
      alert("Error al enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    setUpdatingStatus(true);
    setShowStatusDropdown(false);
    try {
      if (newStatus === "closed") {
        setShowCloseModal(true);
        setUpdatingStatus(false);
        return;
      }
      await adminApi.tickets.updateStatus(id, newStatus);
      await loadTicket();
    } catch {
      alert("Error al actualizar el estado");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!id || !ticket) return;
    setShowPriorityDropdown(false);
    try {
      await adminApi.tickets.updatePriority(id, newPriority);
      setTicket((prev) =>
        prev ? { ...prev, priority: newPriority as any } : prev,
      );
    } catch {
      alert("Error al actualizar la prioridad");
    }
  };

  const handleClose = async () => {
    if (!id || !resolution.trim()) return;
    setClosingTicket(true);
    try {
      await adminApi.tickets.close(id, resolution);
      setShowCloseModal(false);
      setResolution("");
      await loadTicket();
    } catch {
      alert("Error al cerrar el ticket");
    } finally {
      setClosingTicket(false);
    }
  };

  const publicMessages = ticket?.messages?.filter((m) => !m.isInternal) || [];
  const internalNotes = ticket?.messages?.filter((m) => m.isInternal) || [];
  const isClosed = ticket?.status === "closed" || ticket?.status === "resolved";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-16 text-slate-500 dark:text-slate-400">
        Ticket no encontrado
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/admin/tickets")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white mb-4 transition-colors text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a tickets
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {ticket.ticketNumber}
              </h1>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[ticket.status] || STATUS_COLORS.open}`}
              >
                {STATUS_LABELS[ticket.status] || ticket.status}
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.low}`}
              >
                {ticket.priority}
              </span>
            </div>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              {ticket.subject}
            </p>
          </div>

          {/* Quick actions */}
          {!isClosed && (
            <div className="flex items-center gap-2 shrink-0">
              {/* Status dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowStatusDropdown((v) => !v);
                    setShowPriorityDropdown(false);
                  }}
                  disabled={updatingStatus}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Clock className="h-4 w-4 text-slate-500" />
                  Cambiar estado
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                {showStatusDropdown && (
                  <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 animate-dropdownIn">
                    {Object.entries(STATUS_LABELS).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => handleStatusChange(val)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${ticket.status === val ? "font-semibold text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-slate-300"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowPriorityDropdown((v) => !v);
                    setShowStatusDropdown(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <AlertTriangle className="h-4 w-4 text-slate-500" />
                  Prioridad
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                {showPriorityDropdown && (
                  <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 animate-dropdownIn">
                    {["urgent", "high", "medium", "low"].map((p) => (
                      <button
                        key={p}
                        onClick={() => handlePriorityChange(p)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${ticket.priority === p ? "font-semibold text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-slate-300"}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowCloseModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Cerrar ticket
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab("conversation")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "conversation"
                  ? "border-sky-500 text-sky-600 dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Conversación
              {publicMessages.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs">
                  {publicMessages.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "notes"
                  ? "border-sky-500 text-sky-600 dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              <Lock className="h-4 w-4" />
              Notas internas
              {internalNotes.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs">
                  {internalNotes.length}
                </span>
              )}
            </button>
          </div>

          {/* Messages */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="p-4 max-h-[520px] overflow-y-auto space-y-4">
              {activeTab === "conversation" && (
                <>
                  {publicMessages.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                      <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Sin mensajes aún</p>
                    </div>
                  ) : (
                    publicMessages.map((msg, i) => {
                      const isAdmin = !!msg.author?.adminRole;
                      return (
                        <div
                          key={i}
                          className={`flex gap-3 ${isAdmin ? "flex-row-reverse" : ""}`}
                        >
                          <div
                            className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
                              isAdmin
                                ? "bg-sky-500 text-white"
                                : "bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {(msg.author?.name || "?")[0].toUpperCase()}
                          </div>
                          <div
                            className={`max-w-[75%] ${isAdmin ? "items-end" : "items-start"} flex flex-col gap-1`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {msg.author?.name || "Usuario"}
                              </span>
                              {isAdmin && (
                                <span className="text-xs px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded">
                                  {msg.author.adminRole}
                                </span>
                              )}
                            </div>
                            <div
                              className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                                isAdmin
                                  ? "bg-sky-500 text-white rounded-tr-sm"
                                  : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm"
                              }`}
                            >
                              {msg.message}
                            </div>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {new Date(msg.createdAt).toLocaleString("es-AR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}

              {activeTab === "notes" && (
                <>
                  {internalNotes.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                      <Lock className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Sin notas internas</p>
                      <p className="text-xs mt-1">
                        Solo visibles para el equipo de soporte
                      </p>
                    </div>
                  ) : (
                    internalNotes.map((note, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          {(note.author?.name || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {note.author?.name || "Admin"}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded flex items-center gap-1">
                              <Lock className="h-2.5 w-2.5" />
                              Interna
                            </span>
                          </div>
                          <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                            {note.message}
                          </div>
                          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">
                            {new Date(note.createdAt).toLocaleString("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {/* Reply form */}
            {!isClosed && (
              <div className="border-t border-slate-200 dark:border-slate-700 p-4">
                <form onSubmit={handleSendMessage}>
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      type="button"
                      onClick={() => setIsInternal(false)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${
                        !isInternal
                          ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 font-semibold"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                      }`}
                    >
                      <MessageSquare className="h-3 w-3" />
                      Respuesta pública
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInternal(true)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${
                        isInternal
                          ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                      }`}
                    >
                      <Lock className="h-3 w-3" />
                      Nota interna
                    </button>
                  </div>
                  <div
                    className={`rounded-xl border transition-colors ${
                      isInternal
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        isInternal
                          ? "Nota interna (solo visible para soporte)..."
                          : "Escribe tu respuesta..."
                      }
                      rows={3}
                      className="w-full px-4 py-3 bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 resize-none focus:outline-none"
                    />
                    <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-700/50">
                      <span
                        className={`text-xs ${message.length > 500 ? "text-red-500" : "text-slate-400"}`}
                      >
                        {message.length}/500
                      </span>
                      <button
                        type="submit"
                        disabled={
                          sending || !message.trim() || message.length > 500
                        }
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                          isInternal
                            ? "bg-amber-500 hover:bg-amber-600 text-white"
                            : "bg-sky-600 hover:bg-sky-700 text-white"
                        }`}
                      >
                        <Send className="h-4 w-4" />
                        {sending
                          ? "Enviando..."
                          : isInternal
                            ? "Guardar nota"
                            : "Enviar"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {isClosed && (
              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl">
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                  Este ticket está{" "}
                  {ticket.status === "closed" ? "cerrado" : "resuelto"} — no se
                  pueden agregar mensajes
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status & Info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Información
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Estado
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[ticket.status] || STATUS_COLORS.open}`}
                >
                  {STATUS_LABELS[ticket.status] || ticket.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Prioridad
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.low}`}
                >
                  {ticket.priority}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" /> Categoría
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {CATEGORY_LABELS[ticket.category] || ticket.category}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> Mensajes
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {publicMessages.length}
                </span>
              </div>
            </div>
          </div>

          {/* User info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Usuario
            </h3>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                {(ticket.creator?.name ||
                  ticket.user?.name ||
                  "?")[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {ticket.creator?.name || ticket.user?.name || "N/A"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {ticket.creator?.email || ticket.user?.email || ""}
                </p>
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Fechas
            </h3>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                  <Calendar className="h-3.5 w-3.5" /> Creado
                </span>
                <span className="text-xs text-slate-700 dark:text-slate-300 text-right">
                  {new Date(ticket.createdAt).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {ticket.updatedAt && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                    <Clock className="h-3.5 w-3.5" /> Actualizado
                  </span>
                  <span className="text-xs text-slate-700 dark:text-slate-300 text-right">
                    {new Date(ticket.updatedAt).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              {ticket.closedAt && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                    <CheckCircle className="h-3.5 w-3.5" /> Cerrado
                  </span>
                  <span className="text-xs text-slate-700 dark:text-slate-300 text-right">
                    {new Date(ticket.closedAt).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Resolution */}
          {ticket.resolution && (
            <div className="bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-200 dark:border-green-800/40 p-4">
              <h3 className="text-sm font-semibold text-green-800 dark:text-green-400 flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4" />
                Resolución
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                {ticket.resolution}
              </p>
            </div>
          )}

          {/* Contract link */}
          {ticket.contractId && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                Contrato relacionado
              </h3>
              <a
                href={`/admin/contracts/${ticket.contractId}`}
                className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 transition-colors"
              >
                <FileText className="h-4 w-4" />
                Ver contrato
              </a>
            </div>
          )}

          {/* Status history */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
              Historial de estados
            </h3>
            <div className="relative">
              <div className="absolute left-2.5 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-3">
                {[
                  {
                    status: "open",
                    label: "Ticket abierto",
                    date: ticket.createdAt,
                  },
                  ...(ticket.status !== "open"
                    ? [
                        {
                          status: ticket.status,
                          label: STATUS_LABELS[ticket.status] || ticket.status,
                          date: ticket.updatedAt,
                        },
                      ]
                    : []),
                  ...(ticket.closedAt
                    ? [
                        {
                          status: "closed",
                          label: "Cerrado",
                          date: ticket.closedAt,
                        },
                      ]
                    : []),
                ].map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 pl-6 relative">
                    <div
                      className={`absolute left-0.5 top-1 h-4 w-4 rounded-full border-2 border-white dark:border-slate-800 ${
                        entry.status === "open"
                          ? "bg-blue-400"
                          : entry.status === "closed"
                            ? "bg-slate-400"
                            : entry.status === "resolved"
                              ? "bg-green-400"
                              : "bg-sky-400"
                      }`}
                    />
                    <div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {entry.label}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {entry.date
                          ? new Date(entry.date).toLocaleString("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Close modal */}
      {showCloseModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCloseModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Cerrar ticket
              </h2>
              <button
                onClick={() => setShowCloseModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Describí la resolución del ticket antes de cerrarlo.
            </p>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Descripción de la resolución..."
              rows={4}
              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleClose}
                disabled={closingTicket || !resolution.trim()}
                className="flex-1 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              >
                {closingTicket ? "Cerrando..." : "Confirmar cierre"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close dropdowns on outside click */}
      {(showStatusDropdown || showPriorityDropdown) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setShowStatusDropdown(false);
            setShowPriorityDropdown(false);
          }}
        />
      )}
    </div>
  );
}
