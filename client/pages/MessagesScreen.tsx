import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import { SkeletonConversationItem, SkeletonMessage } from "../components/ui/Skeleton";
import {
  MessageCircle,
  User as UserIcon,
  Search,
  MoreVertical,
  Briefcase,
  Send,
  Smile,
  Paperclip,
  ArrowLeft,
  Phone,
  Video,
} from "lucide-react";

interface Conversation {
  _id: string;
  participants: Array<{
    _id: string;
    name: string;
    avatar: string;
  }>;
  lastMessage?: string;
  lastMessageAt?: string;
  jobId?: {
    _id: string;
    title: string;
  };
  contractId?: {
    _id: string;
  };
  type: string;
  unreadCount: Record<string, number>;
}

interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    avatar?: string;
  };
  message: string;
  type?: "text" | "image" | "file" | "system";
  metadata?: {
    jobId?: string;
    action?: string;
    [key: string]: any;
  };
  createdAt: string;
}

export default function MessagesScreen() {
  const { id: conversationIdParam } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const {
    sendMessage: socketSendMessage,
    joinConversation,
    leaveConversation,
    messages: socketMessages,
    isConnected,
    getTypingUsers,
    isUserOnline,
  } = useSocket();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use socket messages directly instead of maintaining separate state
  const messages = socketMessages as Message[];

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (conversationIdParam) {
      const conv = conversations.find((c) => c._id === conversationIdParam);
      if (conv) {
        setActiveConversation(conv);
        if (isConnected) {
          joinConversation(conversationIdParam);
        }
      }
    } else {
      setActiveConversation(null);
    }

    return () => {
      if (conversationIdParam) {
        leaveConversation(conversationIdParam);
      }
    };
  }, [conversationIdParam, conversations, isConnected]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const response = await fetch("/api/chat/conversations", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setConversations(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    navigate(`/messages/${conversation._id}`);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending || !activeConversation) return;

    setSending(true);
    try {
      socketSendMessage({
        conversationId: activeConversation._id,
        message: newMessage,
        type: "text",
      });
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getOtherParticipant = (participants: Conversation["participants"]) => {
    return participants.find((p) => p._id !== user?._id);
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return "Hoy";
    } else if (days === 1) {
      return "Ayer";
    } else if (days < 7) {
      return date.toLocaleDateString("es-AR", { weekday: "long" });
    } else {
      return date.toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    const other = getOtherParticipant(conv.participants);
    return (
      other?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.jobId?.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const otherParticipant = activeConversation
    ? getOtherParticipant(activeConversation.participants)
    : null;

  if (loading) {
    return (
      <div className="h-screen bg-slate-100 dark:bg-slate-900 flex">
        {/* Conversations List Skeleton */}
        <div className="w-full md:w-[380px] bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="h-7 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4"></div>
            <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"></div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {[...Array(8)].map((_, i) => (
              <SkeletonConversationItem key={i} />
            ))}
          </div>
        </div>

        {/* Messages Panel Skeleton (desktop only) */}
        <div className="hidden md:flex flex-1 flex-col bg-white dark:bg-slate-800">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {[...Array(5)].map((_, i) => (
              <SkeletonMessage key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Mensajes - Do</title>
      </Helmet>

      <div className="h-screen bg-slate-100 dark:bg-slate-900 flex">
        {/* Left Panel - Conversations List */}
        <div className={`${activeConversation ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex-col`}>
          {/* Header */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                Mensajes
              </h1>
              <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                <MoreVertical className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar conversación..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-700 border-none rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                <MessageCircle className="h-16 w-16 text-slate-300 dark:text-slate-600 mb-4" />
                <p className="text-slate-600 dark:text-slate-400">
                  {searchQuery ? "No se encontraron conversaciones" : "No tienes conversaciones"}
                </p>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const other = getOtherParticipant(conversation.participants);
                const unreadCount = conversation.unreadCount?.[user?._id || ""] || 0;
                const isActive = activeConversation?._id === conversation._id;

                return (
                  <button
                    key={conversation._id}
                    onClick={() => handleSelectConversation(conversation)}
                    className={`w-full p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                      isActive ? "bg-slate-100 dark:bg-slate-700" : ""
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {other?.avatar ? (
                        <img
                          src={other.avatar}
                          alt={other.name}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                          <UserIcon className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                        </div>
                      )}
                      {isUserOnline(other?._id || "") && (
                        <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full"></span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                          {other?.name || "Usuario desconocido"}
                        </h3>
                        {conversation.lastMessageAt && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 ml-2">
                            {formatTime(conversation.lastMessageAt)}
                          </span>
                        )}
                      </div>

                      {conversation.jobId && (
                        <p className="text-xs text-sky-600 dark:text-sky-400 mb-1 truncate flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {conversation.jobId.title}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                          {conversation.lastMessage || "Sin mensajes"}
                        </p>
                        {unreadCount > 0 && (
                          <span className="flex-shrink-0 ml-2 bg-sky-600 text-white text-xs font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel - Chat */}
        <div className={`${activeConversation ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-slate-50 dark:bg-slate-900`}>
          {activeConversation && otherParticipant ? (
            <>
              {/* Chat Header */}
              <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate("/messages")}
                    className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>

                  {otherParticipant?.avatar ? (
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

                  <div>
                    <h2 className="font-semibold text-slate-900 dark:text-white">
                      {otherParticipant.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isUserOnline(otherParticipant._id) ? "En línea" : "Desconectado"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Ver Perfil */}
                  <button
                    onClick={() => navigate(`/profile/${otherParticipant._id}`)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                    title="Ver perfil"
                  >
                    <UserIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </button>

                  {/* Ver Trabajos */}
                  <button
                    onClick={() => navigate(`/jobs?user=${otherParticipant._id}`)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                    title="Ver trabajos publicados"
                  >
                    <Briefcase className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </button>

                  <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <MoreVertical className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Messages Area */}
              <div
                className="flex-1 overflow-y-auto p-4 bg-[url('/chat-bg.png')] bg-repeat"
                style={{ backgroundImage: "none" }}
              >
                <div className="max-w-4xl mx-auto space-y-4">
                  {messages.map((message, index) => {
                    const isCurrentUser = message.sender._id === user?._id;
                    const showDate =
                      index === 0 ||
                      formatMessageDate(messages[index - 1].createdAt) !==
                        formatMessageDate(message.createdAt);

                    return (
                      <div key={message._id}>
                        {showDate && (
                          <div className="flex justify-center my-4">
                            <span className="px-3 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded-lg shadow-sm">
                              {formatMessageDate(message.createdAt)}
                            </span>
                          </div>
                        )}

                        <div
                          className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[70%] px-4 py-2 rounded-lg ${
                              isCurrentUser
                                ? "bg-sky-500 text-white"
                                : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            } shadow-sm`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {message.message}
                            </p>
                            <span
                              className={`text-xs mt-1 block text-right ${
                                isCurrentUser
                                  ? "text-sky-100"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {formatTime(message.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Message Input */}
              <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                  >
                    <Smile className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </button>

                  <button
                    type="button"
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                  >
                    <Paperclip className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </button>

                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 border-none rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />

                  <button
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    className="p-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-full transition-colors disabled:cursor-not-allowed"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            // Empty State
            <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
              <MessageCircle className="h-24 w-24 text-slate-300 dark:text-slate-600 mb-4" />
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
                Selecciona una conversación
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-md">
                Elige una conversación de la lista para empezar a chatear
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
