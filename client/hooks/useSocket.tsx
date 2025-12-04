import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./useAuth";

// Configuración de URL para Socket.io
// En desarrollo, usar el mismo host (proxy de Vite lo redirigirá a :5000)
// En producción, usar la URL del API
const SOCKET_URL = import.meta.env.DEV
  ? "" // Empty string = same host (uses Vite proxy)
  : (import.meta.env.VITE_API_URL || "http://localhost:5000");

interface Message {
  _id: string;
  conversationId: string;
  sender: {
    _id: string;
    name: string;
    avatar?: string;
  };
  message: string;
  type: "text" | "image" | "file" | "system";
  fileUrl?: string;
  fileName?: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

interface TypingStatus {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

interface UserStatus {
  userId: string;
  isOnline: boolean;
  timestamp: Date;
}

export function useSocket() {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingStatus>>(new Map());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);

  // Callbacks for real-time events
  const [onContractUpdate, setOnContractUpdate] = useState<((data: any) => void) | null>(null);
  const [onJobUpdate, setOnJobUpdate] = useState<((data: any) => void) | null>(null);
  const [onProposalUpdate, setOnProposalUpdate] = useState<((data: any) => void) | null>(null);
  const [onDashboardRefresh, setOnDashboardRefresh] = useState<(() => void) | null>(null);
  const [onJobsRefresh, setOnJobsRefresh] = useState<((data?: any) => void) | null>(null);
  const [onUnreadUpdate, setOnUnreadUpdate] = useState<((count: number) => void) | null>(null);

  // Admin panel callbacks
  const [onAdminJobCreated, setOnAdminJobCreated] = useState<((data: any) => void) | null>(null);
  const [onAdminJobUpdated, setOnAdminJobUpdated] = useState<((data: any) => void) | null>(null);
  const [onAdminProposalCreated, setOnAdminProposalCreated] = useState<((data: any) => void) | null>(null);
  const [onAdminContractCreated, setOnAdminContractCreated] = useState<((data: any) => void) | null>(null);
  const [onAdminContractUpdated, setOnAdminContractUpdated] = useState<((data: any) => void) | null>(null);
  const [onAdminPaymentCreated, setOnAdminPaymentCreated] = useState<((data: any) => void) | null>(null);
  const [onAdminPaymentUpdated, setOnAdminPaymentUpdated] = useState<((data: any) => void) | null>(null);
  const [onAdminUserCreated, setOnAdminUserCreated] = useState<((data: any) => void) | null>(null);
  const [onNewProposal, setOnNewProposal] = useState<((data: any) => void) | null>(null);
  const [onContractsRefresh, setOnContractsRefresh] = useState<((data?: any) => void) | null>(null);
  const [onMyJobsRefresh, setOnMyJobsRefresh] = useState<((data?: any) => void) | null>(null);

  useEffect(() => {
    if (!user) {
      // Disconnect socket if user logs out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Get token from localStorage
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    // Create socket connection
    const newSocket = io(SOCKET_URL, {
      auth: {
        token,
      },
      path: "/socket.io",
      transports: ["polling", "websocket"], // Try polling first, then upgrade to websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    // Connection handlers
    newSocket.on("connect", () => {
      console.log("✅ Socket connected");
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setIsConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setIsConnected(false);
    });

    // Message handlers
    newSocket.on("message:new", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    newSocket.on("conversation:history", ({ messages: historyMessages }) => {
      setMessages(historyMessages);
    });

    newSocket.on("message:read", ({ messageId, readBy, readAt }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId
            ? { ...msg, read: true, readAt: new Date(readAt) }
            : msg
        )
      );
    });

    // Typing handlers
    newSocket.on("typing:update", (status: TypingStatus) => {
      setTypingUsers((prev) => {
        const newMap = new Map(prev);
        const key = `${status.conversationId}-${status.userId}`;

        if (status.isTyping) {
          newMap.set(key, status);
        } else {
          newMap.delete(key);
        }

        return newMap;
      });
    });

    // Online status handlers
    newSocket.on("user:status", ({ userId, isOnline }: UserStatus) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        if (isOnline) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    });

    // Error handler
    newSocket.on("error", (error) => {
      console.error("Socket error:", error);
    });

    // Global real-time event handlers
    newSocket.on("contract:updated", (data: any) => {
      console.log("📝 Contract updated:", data);
      if (onContractUpdate) {
        onContractUpdate(data);
      }
    });

    newSocket.on("job:updated", (data: any) => {
      console.log("💼 Job updated:", data);
      if (onJobUpdate) {
        onJobUpdate(data);
      }
    });

    newSocket.on("jobs:refresh", (data: any) => {
      console.log("🔄 Jobs refresh:", data);
      if (onJobsRefresh) {
        onJobsRefresh(data);
      }
    });

    newSocket.on("proposal:updated", (data: any) => {
      console.log("📄 Proposal updated:", data);
      if (onProposalUpdate) {
        onProposalUpdate(data);
      }
    });

    newSocket.on("dashboard:refresh", () => {
      console.log("📊 Dashboard refresh");
      if (onDashboardRefresh) {
        onDashboardRefresh();
      }
    });

    newSocket.on("unread:updated", (data: { unreadCount: number; unreadConversations?: number }) => {
      console.log("💬 Unread updated - messages:", data.unreadCount, "conversations:", data.unreadConversations);
      if (onUnreadUpdate) {
        // Pass unreadConversations (number of chats with unread messages)
        onUnreadUpdate(data.unreadConversations ?? data.unreadCount);
      }
    });

    // Admin panel event handlers
    newSocket.on("admin:job:created", (data: any) => {
      console.log("🆕 [Admin] New job created:", data);
      if (onAdminJobCreated) {
        onAdminJobCreated(data);
      }
    });

    newSocket.on("admin:job:updated", (data: any) => {
      console.log("📝 [Admin] Job updated:", data);
      if (onAdminJobUpdated) {
        onAdminJobUpdated(data);
      }
    });

    newSocket.on("admin:proposal:created", (data: any) => {
      console.log("🆕 [Admin] New proposal:", data);
      if (onAdminProposalCreated) {
        onAdminProposalCreated(data);
      }
    });

    newSocket.on("admin:contract:created", (data: any) => {
      console.log("🆕 [Admin] New contract:", data);
      if (onAdminContractCreated) {
        onAdminContractCreated(data);
      }
    });

    newSocket.on("admin:contract:updated", (data: any) => {
      console.log("📝 [Admin] Contract updated:", data);
      if (onAdminContractUpdated) {
        onAdminContractUpdated(data);
      }
    });

    newSocket.on("admin:payment:created", (data: any) => {
      console.log("💰 [Admin] New payment:", data);
      if (onAdminPaymentCreated) {
        onAdminPaymentCreated(data);
      }
    });

    newSocket.on("admin:payment:updated", (data: any) => {
      console.log("💰 [Admin] Payment updated:", data);
      if (onAdminPaymentUpdated) {
        onAdminPaymentUpdated(data);
      }
    });

    newSocket.on("admin:user:created", (data: any) => {
      console.log("👤 [Admin] New user:", data);
      if (onAdminUserCreated) {
        onAdminUserCreated(data);
      }
    });

    newSocket.on("proposal:new", (data: any) => {
      console.log("📬 New proposal for your job:", data);
      if (onNewProposal) {
        onNewProposal(data);
      }
    });

    newSocket.on("contracts:refresh", (data: any) => {
      console.log("🔄 Contracts refresh:", data);
      if (onContractsRefresh) {
        onContractsRefresh(data);
      }
    });

    newSocket.on("myjobs:refresh", (data: any) => {
      console.log("🔄 My jobs refresh:", data);
      if (onMyJobsRefresh) {
        onMyJobsRefresh(data);
      }
    });

    // Cleanup
    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [user, onContractUpdate, onJobUpdate, onProposalUpdate, onDashboardRefresh, onJobsRefresh, onUnreadUpdate, onAdminJobCreated, onAdminJobUpdated, onAdminProposalCreated, onAdminContractCreated, onAdminContractUpdated, onAdminPaymentCreated, onAdminPaymentUpdated, onAdminUserCreated, onNewProposal, onContractsRefresh, onMyJobsRefresh]);

  // Join conversation
  const joinConversation = (conversationId: string) => {
    if (socket) {
      // Reset messages when joining new conversation
      setMessages([]);
      socket.emit("join:conversation", conversationId);
    }
  };

  // Leave conversation
  const leaveConversation = (conversationId: string) => {
    if (socket) {
      socket.emit("leave:conversation", conversationId);
      // Clear messages when leaving
      setMessages([]);
    }
  };

  // Send message
  const sendMessage = (data: {
    conversationId: string;
    message: string;
    type?: "text" | "image" | "file";
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
  }) => {
    if (socket) {
      socket.emit("message:send", data);
    }
  };

  // Start typing
  const startTyping = (conversationId: string) => {
    if (socket) {
      socket.emit("typing:start", { conversationId, isTyping: true });
    }
  };

  // Stop typing
  const stopTyping = (conversationId: string) => {
    if (socket) {
      socket.emit("typing:stop", { conversationId, isTyping: false });
    }
  };

  // Mark message as read
  const markAsRead = (conversationId: string, messageId: string) => {
    if (socket) {
      socket.emit("message:read", { conversationId, messageId });
    }
  };

  // Mark conversation as read
  const markConversationAsRead = (conversationId: string) => {
    if (socket) {
      socket.emit("conversation:mark-read", conversationId);
    }
  };

  // Check if user is online
  const isUserOnline = (userId: string) => {
    return onlineUsers.has(userId);
  };

  // Get typing users for a conversation
  const getTypingUsers = (conversationId: string) => {
    const typing: TypingStatus[] = [];
    typingUsers.forEach((status, key) => {
      if (status.conversationId === conversationId && status.isTyping) {
        typing.push(status);
      }
    });
    return typing;
  };

  // Register callbacks
  const registerContractUpdateHandler = (handler: (data: any) => void) => {
    setOnContractUpdate(() => handler);
  };

  const registerJobUpdateHandler = (handler: (data: any) => void) => {
    setOnJobUpdate(() => handler);
  };

  const registerProposalUpdateHandler = (handler: (data: any) => void) => {
    setOnProposalUpdate(() => handler);
  };

  const registerDashboardRefreshHandler = (handler: () => void) => {
    setOnDashboardRefresh(() => handler);
  };

  const registerJobsRefreshHandler = (handler: (data?: any) => void) => {
    setOnJobsRefresh(() => handler);
  };

  const registerUnreadUpdateHandler = (handler: (count: number) => void) => {
    setOnUnreadUpdate(() => handler);
  };

  // Admin panel register handlers
  const registerAdminJobCreatedHandler = (handler: (data: any) => void) => {
    setOnAdminJobCreated(() => handler);
  };

  const registerAdminJobUpdatedHandler = (handler: (data: any) => void) => {
    setOnAdminJobUpdated(() => handler);
  };

  const registerAdminProposalCreatedHandler = (handler: (data: any) => void) => {
    setOnAdminProposalCreated(() => handler);
  };

  const registerAdminContractCreatedHandler = (handler: (data: any) => void) => {
    setOnAdminContractCreated(() => handler);
  };

  const registerAdminContractUpdatedHandler = (handler: (data: any) => void) => {
    setOnAdminContractUpdated(() => handler);
  };

  const registerAdminPaymentCreatedHandler = (handler: (data: any) => void) => {
    setOnAdminPaymentCreated(() => handler);
  };

  const registerAdminPaymentUpdatedHandler = (handler: (data: any) => void) => {
    setOnAdminPaymentUpdated(() => handler);
  };

  const registerAdminUserCreatedHandler = (handler: (data: any) => void) => {
    setOnAdminUserCreated(() => handler);
  };

  const registerNewProposalHandler = (handler: (data: any) => void) => {
    setOnNewProposal(() => handler);
  };

  const registerContractsRefreshHandler = (handler: (data?: any) => void) => {
    setOnContractsRefresh(() => handler);
  };

  const registerMyJobsRefreshHandler = (handler: (data?: any) => void) => {
    setOnMyJobsRefresh(() => handler);
  };

  return {
    socket,
    isConnected,
    messages,
    joinConversation,
    leaveConversation,
    sendMessage,
    startTyping,
    stopTyping,
    markAsRead,
    markConversationAsRead,
    isUserOnline,
    getTypingUsers,
    registerContractUpdateHandler,
    registerJobUpdateHandler,
    registerProposalUpdateHandler,
    registerDashboardRefreshHandler,
    registerJobsRefreshHandler,
    registerUnreadUpdateHandler,
    // Admin handlers
    registerAdminJobCreatedHandler,
    registerAdminJobUpdatedHandler,
    registerAdminProposalCreatedHandler,
    registerAdminContractCreatedHandler,
    registerAdminContractUpdatedHandler,
    registerAdminPaymentCreatedHandler,
    registerAdminPaymentUpdatedHandler,
    registerAdminUserCreatedHandler,
    registerNewProposalHandler,
    registerContractsRefreshHandler,
    registerMyJobsRefreshHandler,
  };
}
