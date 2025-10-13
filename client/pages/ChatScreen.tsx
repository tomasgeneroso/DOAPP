import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import {
  ArrowLeft,
  Send,
  Loader2,
  User,
  DollarSign,
  TrendingUp,
  X,
  Star,
  Briefcase,
  FileText,
  MessageSquare,
} from "lucide-react";

interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    avatar?: string;
  };
  message: string;
  type: "text" | "proposal" | "system";
  proposalAmount?: number;
  createdAt: string;
}

interface Conversation {
  _id: string;
  participants: Array<{
    _id: string;
    name: string;
    avatar?: string;
  }>;
  jobId?: {
    _id: string;
    title: string;
    price: number;
  };
}

export default function ChatScreen() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { socket, isConnected, joinConversation } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [proposalAmount, setProposalAmount] = useState("");
  const [showProposalInput, setShowProposalInput] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherParticipant = conversation?.participants.find(
    (p) => p._id !== user?._id
  );

  useEffect(() => {
    if (!conversationId) return;

    const fetchConversation = async () => {
      try {
        const response = await fetch(
          `/api/chat/conversations/${conversationId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();
        if (data.success) {
          setConversation(data.data);
        } else {
          setError(data.message || "No se pudo cargar la conversación");
        }
      } catch (err) {
        setError("Error al cargar la conversación");
        console.error("Error fetching conversation:", err);
      }
    };

    const fetchMessages = async () => {
      try {
        const response = await fetch(
          `/api/chat/conversations/${conversationId}/messages`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();
        if (data.success) {
          setMessages(data.data);
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConversation();
    fetchMessages();
  }, [conversationId, token]);

  useEffect(() => {
    if (!socket || !conversationId || !isConnected) return;

    // Join conversation using the hook function
    joinConversation(conversationId);

    // Listen for new messages
    socket.on("message:new", (message: Message) => {
      console.log("📩 New message received via Socket.io:", message);
      setMessages((prev) => [...prev, message]);
    });

    // Listen for conversation updates
    socket.on("conversation:updated", (data: any) => {
      console.log("🔄 Conversation updated:", data);
    });

    return () => {
      socket.off("message:new");
      socket.off("conversation:updated");
    };
  }, [socket, conversationId, isConnected, joinConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar que haya mensaje o monto de propuesta
    if (!newMessage.trim() && !proposalAmount) return;

    setSending(true);
    setError(null);

    try {
      const messageData: any = {
        message: newMessage.trim(),
        type: "text",
      };

      if (showProposalInput && proposalAmount) {
        messageData.type = "proposal";
        messageData.proposalAmount = Number(proposalAmount);
        messageData.message = newMessage.trim() || "Contraoferta enviada";
      }

      const response = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(messageData),
        }
      );

      const data = await response.json();

      if (data.success) {
        setNewMessage("");
        setProposalAmount("");
        setShowProposalInput(false);
        // El mensaje se agregará automáticamente vía Socket.io evento "message:new"
        console.log("✅ Mensaje enviado correctamente");
      } else {
        setError(data.message || "No se pudo enviar el mensaje");
      }
    } catch (err: any) {
      setError(err.message || "Error al enviar mensaje");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error && !conversation) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link to="/" className="text-sky-600 hover:text-sky-700 font-medium">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Chat con {otherParticipant?.name} - Doers</title>
      </Helmet>
      <div className="flex h-screen flex-col bg-slate-50 overflow-hidden">
        {/* Header - Fijo */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="container mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowInfoPanel(true)}
              className="flex items-center gap-3 flex-1 hover:bg-slate-50 rounded-lg p-2 -ml-2 transition-colors"
            >
              <div className="h-10 w-10 overflow-hidden rounded-full bg-sky-100">
                <img
                  src={
                    otherParticipant?.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.name}`
                  }
                  alt={otherParticipant?.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="text-left">
                <h1 className="font-semibold text-slate-900">
                  {otherParticipant?.name}
                </h1>
                {conversation?.jobId && (
                  <p className="text-xs text-slate-500">
                    {conversation.jobId.title}
                  </p>
                )}
              </div>
            </button>
            {conversation?.jobId && (
              <Link
                to={`/jobs/${conversation.jobId._id}`}
                className="text-sm text-sky-600 hover:text-sky-700 font-medium"
              >
                Ver trabajo
              </Link>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="container mx-auto max-w-4xl space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="bg-sky-100 rounded-full p-6 mb-4">
                  <User className="h-12 w-12 text-sky-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Inicia la conversación
                </h2>
                <p className="text-slate-600 mb-4">
                  Preséntate y envía tu propuesta de trabajo
                </p>
                {conversation?.jobId && (
                  <div className="bg-white rounded-xl p-4 border border-slate-200 max-w-sm">
                    <p className="text-sm text-slate-600 mb-2">
                      Trabajo: {conversation.jobId.title}
                    </p>
                    <p className="text-lg font-bold text-sky-600">
                      ${conversation.jobId.price.toLocaleString("es-AR")}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender._id === user?._id;

                // Mensaje especial para contraoferta
                if (msg.type === "proposal") {
                  return (
                    <div key={msg._id} className="flex justify-center my-4">
                      <div className="max-w-sm w-full">
                        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-300 rounded-2xl p-4 shadow-md">
                          {/* Header de contraoferta */}
                          <div className="flex items-center justify-center gap-2 mb-3">
                            <TrendingUp className="h-5 w-5 text-emerald-600" />
                            <p className="text-sm font-bold text-emerald-900 uppercase tracking-wide">
                              {isMine ? "Enviaste" : msg.sender.name + " envió"} una contraoferta
                            </p>
                          </div>

                          {/* Monto destacado */}
                          <div className="bg-white rounded-xl p-4 mb-3 text-center border border-emerald-200">
                            <div className="flex items-center justify-center gap-2">
                              <DollarSign className="h-6 w-6 text-emerald-600" />
                              <span className="text-3xl font-bold text-emerald-600">
                                {msg.proposalAmount?.toLocaleString("es-AR")}
                              </span>
                            </div>
                          </div>

                          {/* Mensaje/descripción */}
                          {msg.message && (
                            <div className="bg-white/50 rounded-lg p-3 mb-2">
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                {msg.message}
                              </p>
                            </div>
                          )}

                          {/* Timestamp */}
                          <p className="text-xs text-emerald-700 text-center">
                            {new Date(msg.createdAt).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Mensajes normales
                return (
                  <div
                    key={msg._id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-md rounded-2xl px-4 py-2 ${
                        msg.type === "system"
                          ? "bg-slate-200 text-slate-700 text-sm italic"
                          : isMine
                            ? "bg-sky-500 text-white"
                            : "bg-white text-slate-900 border border-slate-200"
                      }`}
                    >
                      {!isMine && msg.type !== "system" && (
                        <p className="text-xs font-medium mb-1 opacity-80">
                          {msg.sender.name}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <p
                        className={`text-xs mt-1 ${
                          msg.type === "system" || !isMine
                            ? "text-slate-500"
                            : "text-white opacity-70"
                        }`}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input - Fijo */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-white p-4">
          <div className="container mx-auto max-w-4xl">
            {error && (
              <div className="mb-2 text-sm text-red-600 text-center">
                {error}
              </div>
            )}
            <form onSubmit={handleSendMessage} className="space-y-2">
              {showProposalInput && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                  <input
                    type="number"
                    value={proposalAmount}
                    onChange={(e) => setProposalAmount(e.target.value)}
                    placeholder="Monto de tu propuesta"
                    className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-emerald-600/50"
                    min="0"
                    step="0.01"
                  />
                  <button
                    type="button"
                    onClick={() => setShowProposalInput(false)}
                    className="text-xs text-emerald-700 hover:text-emerald-800"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                {!showProposalInput && (
                  <button
                    type="button"
                    onClick={() => setShowProposalInput(true)}
                    className="flex items-center gap-1 rounded-full px-3 py-2 text-emerald-600 hover:bg-emerald-50 transition-colors border border-emerald-200"
                    title="Enviar contraoferta"
                  >
                    <TrendingUp className="h-4 w-4" />
                    <DollarSign className="h-4 w-4" />
                  </button>
                )}
                {/* Adjuntar archivos: funcionalidad pendiente
                <button
                  type="button"
                  className="rounded-full p-2 text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Adjuntar archivo"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                */}
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={
                    showProposalInput
                      ? "Describe tu propuesta..."
                      : "Escribe un mensaje..."
                  }
                  className="flex-1 rounded-full border border-slate-300 px-4 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={
                    sending || (!newMessage.trim() && !proposalAmount)
                  }
                  className="rounded-full bg-gradient-to-r from-sky-500 to-sky-600 p-2 text-white shadow-lg shadow-sky-500/30 transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Panel de información estilo WhatsApp */}
        {showInfoPanel && (
          <div className="fixed inset-0 z-50 bg-white">
            {/* Header del panel */}
            <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowInfoPanel(false)}
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
                <h2 className="font-semibold text-slate-900">
                  Información del contacto
                </h2>
              </div>
            </div>

            {/* Contenido del panel con scroll */}
            <div className="h-full overflow-y-auto pb-20">
              {/* Avatar y nombre */}
              <div className="bg-slate-50 py-8 text-center">
                <div className="mx-auto h-32 w-32 overflow-hidden rounded-full bg-sky-100 mb-4">
                  <img
                    src={
                      otherParticipant?.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipant?.name}`
                    }
                    alt={otherParticipant?.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-1">
                  {otherParticipant?.name}
                </h3>
                <div className="flex items-center justify-center gap-1 text-amber-500">
                  <Star className="h-4 w-4 fill-amber-500" />
                  <span className="text-sm font-medium">4.8</span>
                </div>
              </div>

              {/* Información del trabajo */}
              {conversation?.jobId && (
                <div className="bg-white border-y border-slate-200 px-4 py-3 mb-2">
                  <div className="flex items-start gap-3">
                    <div className="bg-sky-100 rounded-lg p-2">
                      <Briefcase className="h-5 w-5 text-sky-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-500 mb-1">
                        Trabajo relacionado
                      </p>
                      <p className="font-semibold text-slate-900 mb-1">
                        {conversation.jobId.title}
                      </p>
                      <p className="text-lg font-bold text-sky-600">
                        ${conversation.jobId.price.toLocaleString("es-AR")}
                      </p>
                      <Link
                        to={`/jobs/${conversation.jobId._id}`}
                        onClick={() => setShowInfoPanel(false)}
                        className="text-sm text-sky-600 hover:text-sky-700 font-medium mt-2 inline-block"
                      >
                        Ver detalles del trabajo →
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Información del usuario */}
              <div className="bg-white border-y border-slate-200 px-4 py-3 mb-2">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">
                  Información
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Rol</p>
                      <p className="text-sm text-slate-900">
                        {otherParticipant?._id ? "Profesional" : "Cliente"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Star className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Calificación</p>
                      <p className="text-sm text-slate-900">4.8 / 5.0</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">
                        Trabajos completados
                      </p>
                      <p className="text-sm text-slate-900">15 trabajos</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contraofertas en esta conversación */}
              <div className="bg-white border-y border-slate-200 px-4 py-3 mb-2">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">
                  Contraofertas
                </h4>
                <div className="space-y-2">
                  {messages.filter((m) => m.type === "proposal").length > 0 ? (
                    messages
                      .filter((m) => m.type === "proposal")
                      .map((proposal) => (
                        <div
                          key={proposal._id}
                          className="bg-emerald-50 border border-emerald-200 rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-emerald-700 font-medium">
                              {proposal.sender._id === user?._id
                                ? "Tu contraoferta"
                                : `Contraoferta de ${proposal.sender.name}`}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(
                                proposal.createdAt
                              ).toLocaleDateString("es-AR")}
                            </p>
                          </div>
                          <p className="text-xl font-bold text-emerald-600">
                            ${proposal.proposalAmount?.toLocaleString("es-AR")}
                          </p>
                          {proposal.message && (
                            <p className="text-xs text-slate-600 mt-1">
                              {proposal.message}
                            </p>
                          )}
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      No hay contraofertas todavía
                    </p>
                  )}
                </div>
              </div>

              {/* Mensajes compartidos */}
              <div className="bg-white border-y border-slate-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">
                      Mensajes compartidos
                    </p>
                    <p className="text-sm font-medium text-slate-900">
                      {messages.length} mensajes
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
