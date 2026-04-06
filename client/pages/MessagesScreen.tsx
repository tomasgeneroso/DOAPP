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
  PenSquare,
  X,
  MapPin,
  DollarSign,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface Conversation {
  id?: string;
  _id?: string;
  participants: Array<{
    id?: string;
    _id?: string;
    name: string;
    avatar?: string;
  }>;
  lastMessage?: string;
  lastMessageAt?: string;
  jobId?: {
    id?: string;
    _id?: string;
    title: string;
  };
  job?: {
    title: string;
  };
  contractId?: string;
  contract?: {
    id: string;
    status: string;
    job?: {
      title: string;
    };
  };
  type: string;
  unreadCount: Record<string, number>;
}

interface Message {
  id?: string;
  _id?: string;
  sender: {
    id?: string;
    _id?: string;
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

// Helper to get ID from object (supports both PostgreSQL and MongoDB format)
const getId = (obj: { id?: string; _id?: string } | null | undefined): string => {
  return obj?.id || obj?._id || '';
};

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
    markConversationAsRead,
  } = useSocket();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Inline job attachment in active chat
  const [showInlineJobPicker, setShowInlineJobPicker] = useState(false);
  const [inlineJobs, setInlineJobs] = useState<Array<{ id: string; title: string; price: number; location?: string; category?: string; status: string; clientId: string }>>([]);
  const [loadingInlineJobs, setLoadingInlineJobs] = useState(false);
  const [inlineSelectedJob, setInlineSelectedJob] = useState<any>(null);

  // New message modal state
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<Array<{ id: string; name: string; avatar?: string; username?: string }>>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; avatar?: string; username?: string } | null>(null);
  const [availableJobs, setAvailableJobs] = useState<Array<{ id: string; title: string; price: number; location?: string; category?: string; status: string; clientId: string }>>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [newConversationMessage, setNewConversationMessage] = useState("");
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const userSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Combine socket messages with local messages (socket messages take priority for new ones)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const messages = [...localMessages, ...(socketMessages as unknown as Message[]).filter(
    sm => !localMessages.find(lm => getId(lm) === getId(sm as any))
  )];

  useEffect(() => {
    fetchConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle conversation selection when ID param changes
  useEffect(() => {
    if (conversationIdParam && conversations.length > 0) {
      const conv = conversations.find((c) => getId(c) === conversationIdParam);
      if (conv) {
        setActiveConversation(conv);
      }
    } else if (!conversationIdParam) {
      setActiveConversation(null);
      setLocalMessages([]);
    }
  }, [conversationIdParam, conversations]);

  // Handle fetching messages and socket connection when conversation changes
  useEffect(() => {
    if (!conversationIdParam || conversationIdParam.trim() === '') return;

    // Fetch messages for this conversation
    fetchMessages(conversationIdParam);

    // Join socket room and mark conversation as read
    if (isConnected) {
      joinConversation(conversationIdParam);
      markConversationAsRead(conversationIdParam);
    }

    // Update local unread count (using functional update to avoid dependency)
    const userId = user?.id || user?._id || "";
    if (userId) {
      setConversations(prev => prev.map(c => {
        if (getId(c) === conversationIdParam && c.unreadCount?.[userId] > 0) {
          return {
            ...c,
            unreadCount: { ...c.unreadCount, [userId]: 0 }
          };
        }
        return c;
      }));
    }

    return () => {
      leaveConversation(conversationIdParam);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationIdParam, isConnected]);

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

  const fetchMessages = async (convId: string) => {
    if (!token || !convId || convId.trim() === '') return;

    setLoadingMessages(true);
    try {
      const response = await fetch(`/api/chat/conversations/${convId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setLocalMessages(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Search users for new conversation
  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchedUsers([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        const userId = user?.id || user?._id;
        setSearchedUsers((data.users || []).filter((u: any) => u.id !== userId));
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearchingUsers(false);
    }
  };

  // Debounced user search
  const handleUserSearchChange = (value: string) => {
    setUserSearchQuery(value);
    if (userSearchTimerRef.current) clearTimeout(userSearchTimerRef.current);
    userSearchTimerRef.current = setTimeout(() => searchUsers(value), 400);
  };

  // Fetch open jobs (own + all open)
  const fetchAvailableJobs = async () => {
    setLoadingJobs(true);
    try {
      const response = await fetch(`/api/jobs?status=open&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setAvailableJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoadingJobs(false);
    }
  };

  // Select user and show job picker
  const handleSelectUser = (selectedUser: any) => {
    setSelectedUser(selectedUser);
    setUserSearchQuery("");
    setSearchedUsers([]);
    fetchAvailableJobs();
  };

  // Create new conversation
  const handleCreateConversation = async () => {
    if (!selectedUser) return;
    if (!newConversationMessage.trim() && !selectedJob) return;

    setCreatingConversation(true);
    try {
      const body: any = {
        participantId: selectedUser.id,
      };
      if (selectedJob) body.jobId = selectedJob.id;
      if (newConversationMessage.trim()) body.message = newConversationMessage.trim();

      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.success && data.data) {
        const convId = data.data.id || data.data._id;
        setShowNewMessageModal(false);
        setSelectedUser(null);
        setSelectedJob(null);
        setNewConversationMessage("");
        setShowJobPicker(false);
        await fetchConversations();
        navigate(`/messages/${convId}`);
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
    } finally {
      setCreatingConversation(false);
    }
  };

  // Fetch jobs for inline attachment
  const fetchInlineJobs = async () => {
    setLoadingInlineJobs(true);
    try {
      const response = await fetch(`/api/jobs?status=open&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setInlineJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoadingInlineJobs(false);
    }
  };

  const toggleInlineJobPicker = () => {
    if (!showInlineJobPicker) {
      fetchInlineJobs();
    }
    setShowInlineJobPicker(!showInlineJobPicker);
  };

  // Enhanced send message with job attachment support
  const handleSendMessageWithJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !inlineSelectedJob) || sending || !activeConversation) return;

    setSending(true);
    try {
      if (inlineSelectedJob) {
        // Send via HTTP to support job attachment
        const body: any = {};
        if (newMessage.trim()) body.content = newMessage.trim();
        if (inlineSelectedJob) body.jobId = inlineSelectedJob.id;

        const response = await fetch(`/api/chat/conversations/${getId(activeConversation)}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (data.success) {
          // Add all messages (job attachment + text if both)
          const newMsgs = data.messages || [data.message];
          setLocalMessages(prev => [...prev, ...newMsgs]);
        }
        setInlineSelectedJob(null);
        setShowInlineJobPicker(false);
      } else {
        // Use socket for regular text messages
        socketSendMessage({
          conversationId: getId(activeConversation),
          message: newMessage,
          type: "text",
        });
      }
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const closeNewMessageModal = () => {
    setShowNewMessageModal(false);
    setSelectedUser(null);
    setSelectedJob(null);
    setNewConversationMessage("");
    setUserSearchQuery("");
    setSearchedUsers([]);
    setShowJobPicker(false);
  };

  const handleSelectConversation = (conversation: Conversation) => {
    navigate(`/messages/${getId(conversation)}`);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending || !activeConversation) return;

    setSending(true);
    try {
      socketSendMessage({
        conversationId: getId(activeConversation),
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
    const userId = user?.id || user?._id;
    return participants.find((p) => getId(p) !== userId);
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
    const jobTitle = conv.job?.title || conv.jobId?.title || conv.contract?.job?.title || '';
    return (
      other?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      jobTitle.toLowerCase().includes(searchQuery.toLowerCase())
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
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowNewMessageModal(true)}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                  title="Nuevo mensaje"
                >
                  <PenSquare className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </button>
                <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                  <MoreVertical className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>
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
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {searchQuery ? "Sin resultados" : "¡Empezá a conectar!"}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                  {searchQuery
                    ? "No se encontraron conversaciones con ese criterio"
                    : "Cuando te comuniques con otros usuarios o apliques a trabajos, tus conversaciones aparecerán acá"}
                </p>
                {!searchQuery && (
                  <a
                    href="/"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium transition-colors text-sm"
                  >
                    <Briefcase className="w-4 h-4" />
                    Explorar trabajos
                  </a>
                )}
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const other = getOtherParticipant(conversation.participants);
                const userId = user?.id || user?._id || "";
                const unreadCount = conversation.unreadCount?.[userId] || 0;
                const isActive = getId(activeConversation) === getId(conversation);
                const jobTitle = conversation.job?.title || conversation.jobId?.title || conversation.contract?.job?.title;

                return (
                  <button
                    key={getId(conversation)}
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
                      {isUserOnline(getId(other)) && (
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

                      {jobTitle && (
                        <p className="text-xs text-sky-600 dark:text-sky-400 mb-1 truncate flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {jobTitle}
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
                      {isUserOnline(getId(otherParticipant)) ? "En línea" : "Desconectado"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Ver Perfil */}
                  <button
                    onClick={() => navigate(`/profile/${getId(otherParticipant)}`)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                    title="Ver perfil"
                  >
                    <UserIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </button>

                  {/* Ver Trabajos */}
                  <button
                    onClick={() => navigate(`/jobs?user=${getId(otherParticipant)}`)}
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
                    const userId = user?.id || user?._id;
                    const isCurrentUser = getId(message.sender) === userId;
                    const showDate =
                      index === 0 ||
                      formatMessageDate(messages[index - 1].createdAt) !==
                        formatMessageDate(message.createdAt);

                    // Job attachment system message
                    if (message.type === 'system' && message.metadata?.action === 'job_attachment') {
                      const meta = message.metadata;
                      return (
                        <div key={getId(message) || index}>
                          {showDate && (
                            <div className="flex justify-center my-4">
                              <span className="px-3 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded-lg shadow-sm">
                                {formatMessageDate(message.createdAt)}
                              </span>
                            </div>
                          )}
                          <div className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}>
                            <div className="max-w-[75%] rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <div className="px-4 py-2 bg-sky-50 dark:bg-sky-900/30 border-b border-slate-200 dark:border-slate-700">
                                <p className="text-xs text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1">
                                  <Briefcase className="h-3 w-3" />
                                  {isCurrentUser ? 'Compartiste un trabajo' : `${message.sender?.name || 'Usuario'} compartió un trabajo`}
                                </p>
                              </div>
                              <div className="p-4">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">{meta.jobTitle}</h4>
                                <div className="space-y-1">
                                  <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                    <DollarSign className="h-3 w-3 text-green-500" />
                                    ${Number(meta.jobPrice).toLocaleString('es-AR')}
                                  </p>
                                  {meta.jobLocation && (
                                    <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                      <MapPin className="h-3 w-3 text-red-400" />
                                      {meta.jobLocation}
                                    </p>
                                  )}
                                  {meta.jobCategory && (
                                    <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                      <Briefcase className="h-3 w-3 text-purple-400" />
                                      {meta.jobCategory}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => navigate(`/job/${meta.jobId}`)}
                                  className="mt-3 w-full py-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-lg transition-colors flex items-center justify-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Ver trabajo
                                </button>
                              </div>
                              <div className="px-4 pb-2 text-right">
                                <span className="text-xs text-slate-400">{formatTime(message.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={getId(message) || index}>
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

              {/* Inline Job Picker */}
              {showInlineJobPicker && (
                <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Adjuntar trabajo publicado</p>
                    <button onClick={() => { setShowInlineJobPicker(false); setInlineSelectedJob(null); }} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                      <X className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>
                  {loadingInlineJobs ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      {inlineJobs.length > 0 ? inlineJobs.map((job) => (
                        <button
                          key={job.id}
                          onClick={() => { setInlineSelectedJob(job); setShowInlineJobPicker(false); }}
                          className={`w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-b-0 ${inlineSelectedJob?.id === job.id ? 'bg-sky-50 dark:bg-sky-900/20' : ''}`}
                        >
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{job.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">${Number(job.price).toLocaleString('es-AR')}{job.location && ` · ${job.location}`}</p>
                        </button>
                      )) : (
                        <p className="text-sm text-slate-500 text-center py-3">No hay trabajos disponibles</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Inline Selected Job Preview */}
              {inlineSelectedJob && !showInlineJobPicker && (
                <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2">
                  <div className="flex items-center gap-2 p-2 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                    <Briefcase className="h-4 w-4 text-sky-500 flex-shrink-0" />
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex-1">{inlineSelectedJob.title}</p>
                    <button onClick={() => setInlineSelectedJob(null)} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full">
                      <X className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>
              )}

              {/* Message Input */}
              <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                <form onSubmit={handleSendMessageWithJob} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                  >
                    <Smile className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={toggleInlineJobPicker}
                    className={`p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors ${showInlineJobPicker || inlineSelectedJob ? 'text-sky-500' : ''}`}
                    title="Adjuntar trabajo"
                  >
                    <Briefcase className="h-5 w-5 text-current" />
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
                    disabled={(!newMessage.trim() && !inlineSelectedJob) || sending}
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

      {/* New Message Modal */}
      {showNewMessageModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeNewMessageModal}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Nuevo mensaje</h2>
              <button onClick={closeNewMessageModal} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Step 1: User Search */}
              {!selectedUser ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Buscar usuario
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => handleUserSearchChange(e.target.value)}
                      placeholder="Buscar por nombre o @usuario..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-700 border-none rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      autoFocus
                    />
                  </div>

                  {/* Search Results */}
                  {searchingUsers ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
                    </div>
                  ) : searchedUsers.length > 0 ? (
                    <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      {searchedUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleSelectUser(u)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          {u.avatar ? (
                            <img src={u.avatar} alt={u.name} className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                              <UserIcon className="h-5 w-5 text-sky-600" />
                            </div>
                          )}
                          <div className="text-left">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{u.name}</p>
                            {u.username && <p className="text-xs text-slate-500">@{u.username}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : userSearchQuery.length >= 2 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No se encontraron usuarios</p>
                  ) : null}
                </div>
              ) : (
                <>
                  {/* Selected User */}
                  <div className="flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                    {selectedUser.avatar ? (
                      <img src={selectedUser.avatar} alt={selectedUser.name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                        <UserIcon className="h-5 w-5 text-sky-600" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{selectedUser.name}</p>
                      {selectedUser.username && <p className="text-xs text-slate-500">@{selectedUser.username}</p>}
                    </div>
                    <button onClick={() => { setSelectedUser(null); setSelectedJob(null); }} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full">
                      <X className="h-4 w-4 text-slate-500" />
                    </button>
                  </div>

                  {/* Job Attachment */}
                  {selectedJob ? (
                    <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-sky-600 dark:text-sky-400 font-medium mb-1 flex items-center gap-1">
                            <Briefcase className="h-3 w-3" /> Trabajo adjunto
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{selectedJob.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            ${Number(selectedJob.price).toLocaleString('es-AR')}
                            {selectedJob.location && ` · ${selectedJob.location}`}
                          </p>
                        </div>
                        <button onClick={() => setSelectedJob(null)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full ml-2">
                          <X className="h-4 w-4 text-slate-500" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowJobPicker(!showJobPicker)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors w-full"
                    >
                      <Briefcase className="h-4 w-4" />
                      Adjuntar un trabajo publicado
                    </button>
                  )}

                  {/* Job Picker */}
                  {showJobPicker && !selectedJob && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      {loadingJobs ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                        </div>
                      ) : availableJobs.length > 0 ? (
                        availableJobs.map((job) => (
                          <button
                            key={job.id}
                            onClick={() => { setSelectedJob(job); setShowJobPicker(false); }}
                            className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                          >
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{job.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              ${Number(job.price).toLocaleString('es-AR')}
                              {job.location && ` · ${job.location}`}
                              {job.category && ` · ${job.category}`}
                            </p>
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-4">No hay trabajos disponibles</p>
                      )}
                    </div>
                  )}

                  {/* Message Input */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Mensaje {!selectedJob && <span className="text-slate-400">(requerido)</span>}
                    </label>
                    <textarea
                      value={newConversationMessage}
                      onChange={(e) => setNewConversationMessage(e.target.value)}
                      placeholder="Escribí tu mensaje..."
                      rows={3}
                      className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 border-none rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            {selectedUser && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={handleCreateConversation}
                  disabled={creatingConversation || (!newConversationMessage.trim() && !selectedJob)}
                  className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creatingConversation ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Enviar mensaje
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
