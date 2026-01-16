import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./useAuth";

// Configuración de URL para Socket.io
// En desarrollo, usar el mismo host (proxy de Vite lo redirigirá a :5000)
// En producción, usar la URL base del sitio (sin /api)
const getSocketUrl = () => {
  if (import.meta.env.DEV) {
    return ""; // Empty string = same host (uses Vite proxy)
  }
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
  // Remove /api suffix if present to get base URL
  return apiUrl.replace(/\/api\/?$/, "");
};
const SOCKET_URL = getSocketUrl();

// Reconnection configuration
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;

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

// Singleton para el socket - evita múltiples conexiones
let globalSocket: Socket | null = null;
let connectionAttempts = 0;
let isGlobalConnecting = false;
let lastConnectionAttempt = 0;
let connectionGaveUp = false;

// Event handlers stored globally to survive re-renders
const eventHandlers = {
  onContractUpdate: null as ((data: any) => void) | null,
  onJobUpdate: null as ((data: any) => void) | null,
  onProposalUpdate: null as ((data: any) => void) | null,
  onDashboardRefresh: null as (() => void) | null,
  onJobsRefresh: null as ((data?: any) => void) | null,
  onUnreadUpdate: null as ((count: number) => void) | null,
  onAdminJobCreated: null as ((data: any) => void) | null,
  onAdminJobUpdated: null as ((data: any) => void) | null,
  onAdminProposalCreated: null as ((data: any) => void) | null,
  onAdminContractCreated: null as ((data: any) => void) | null,
  onAdminContractUpdated: null as ((data: any) => void) | null,
  onAdminPaymentCreated: null as ((data: any) => void) | null,
  onAdminPaymentUpdated: null as ((data: any) => void) | null,
  onAdminUserCreated: null as ((data: any) => void) | null,
  onNewProposal: null as ((data: any) => void) | null,
  onContractsRefresh: null as ((data?: any) => void) | null,
  onMyJobsRefresh: null as ((data?: any) => void) | null,
  onNotification: null as ((data: any) => void) | null,
};

export function useSocket() {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(globalSocket);
  const [isConnected, setIsConnected] = useState(globalSocket?.connected ?? false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingStatus>>(new Map());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = useCallback(() => {
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, connectionAttempts),
      MAX_RECONNECT_DELAY
    );
    return delay;
  }, []);

  // Setup socket event listeners
  const setupSocketListeners = useCallback((socketInstance: Socket) => {
    // Remove existing listeners to avoid duplicates
    socketInstance.removeAllListeners();

    // Connection handlers
    socketInstance.on("connect", () => {
      console.log("✅ Socket connected");
      connectionAttempts = 0;
      connectionGaveUp = false;
      if (mountedRef.current) {
        setIsConnected(true);
      }
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
      if (mountedRef.current) {
        setIsConnected(false);
      }

      // Don't reconnect if server intentionally closed or we gave up
      if (reason === "io server disconnect" || connectionGaveUp) {
        return;
      }
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      if (mountedRef.current) {
        setIsConnected(false);
      }

      connectionAttempts++;

      if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`⚠️ Socket: Gave up after ${MAX_RECONNECT_ATTEMPTS} failed attempts. Will retry on user action.`);
        connectionGaveUp = true;
        socketInstance.disconnect();
        return;
      }

      const delay = getReconnectDelay();
      console.log(`🔄 Socket: Reconnecting in ${delay}ms (attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    });

    // Message handlers
    socketInstance.on("message:new", (message: Message) => {
      if (mountedRef.current) {
        setMessages((prev) => [...prev, message]);
      }
    });

    socketInstance.on("conversation:history", ({ messages: historyMessages }) => {
      if (mountedRef.current) {
        setMessages(historyMessages);
      }
    });

    socketInstance.on("message:read", ({ messageId, readAt }) => {
      if (mountedRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === messageId
              ? { ...msg, read: true, readAt: new Date(readAt) }
              : msg
          )
        );
      }
    });

    // Message updated handler (for status changes like auto-selection)
    socketInstance.on("message:updated", (updatedMessage: Message) => {
      if (mountedRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            (msg.id === updatedMessage.id || msg._id === updatedMessage.id || msg._id === (updatedMessage as any)._id)
              ? { ...msg, ...updatedMessage }
              : msg
          )
        );
      }
    });

    // Typing handlers
    socketInstance.on("typing:update", (status: TypingStatus) => {
      if (mountedRef.current) {
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
      }
    });

    // Online status handlers
    socketInstance.on("user:status", ({ userId, isOnline }: UserStatus) => {
      if (mountedRef.current) {
        setOnlineUsers((prev) => {
          const newSet = new Set(prev);
          if (isOnline) {
            newSet.add(userId);
          } else {
            newSet.delete(userId);
          }
          return newSet;
        });
      }
    });

    // Error handler
    socketInstance.on("error", (error) => {
      console.error("Socket error:", error);
    });

    // Global real-time event handlers - use stored handlers
    socketInstance.on("contract:updated", (data: any) => {
      if (eventHandlers.onContractUpdate) {
        eventHandlers.onContractUpdate(data);
      }
    });

    socketInstance.on("job:updated", (data: any) => {
      if (eventHandlers.onJobUpdate) {
        eventHandlers.onJobUpdate(data);
      }
    });

    socketInstance.on("jobs:refresh", (data: any) => {
      if (eventHandlers.onJobsRefresh) {
        eventHandlers.onJobsRefresh(data);
      }
    });

    socketInstance.on("proposal:updated", (data: any) => {
      if (eventHandlers.onProposalUpdate) {
        eventHandlers.onProposalUpdate(data);
      }
    });

    socketInstance.on("dashboard:refresh", () => {
      if (eventHandlers.onDashboardRefresh) {
        eventHandlers.onDashboardRefresh();
      }
    });

    socketInstance.on("unread:updated", (data: { unreadCount: number; unreadConversations?: number }) => {
      if (eventHandlers.onUnreadUpdate) {
        eventHandlers.onUnreadUpdate(data.unreadConversations ?? data.unreadCount);
      }
    });

    // Admin panel event handlers
    socketInstance.on("admin:job:created", (data: any) => {
      if (eventHandlers.onAdminJobCreated) {
        eventHandlers.onAdminJobCreated(data);
      }
    });

    socketInstance.on("admin:job:updated", (data: any) => {
      if (eventHandlers.onAdminJobUpdated) {
        eventHandlers.onAdminJobUpdated(data);
      }
    });

    socketInstance.on("admin:proposal:created", (data: any) => {
      if (eventHandlers.onAdminProposalCreated) {
        eventHandlers.onAdminProposalCreated(data);
      }
    });

    socketInstance.on("admin:contract:created", (data: any) => {
      if (eventHandlers.onAdminContractCreated) {
        eventHandlers.onAdminContractCreated(data);
      }
    });

    socketInstance.on("admin:contract:updated", (data: any) => {
      if (eventHandlers.onAdminContractUpdated) {
        eventHandlers.onAdminContractUpdated(data);
      }
    });

    socketInstance.on("admin:payment:created", (data: any) => {
      if (eventHandlers.onAdminPaymentCreated) {
        eventHandlers.onAdminPaymentCreated(data);
      }
    });

    socketInstance.on("admin:payment:updated", (data: any) => {
      if (eventHandlers.onAdminPaymentUpdated) {
        eventHandlers.onAdminPaymentUpdated(data);
      }
    });

    socketInstance.on("admin:user:created", (data: any) => {
      if (eventHandlers.onAdminUserCreated) {
        eventHandlers.onAdminUserCreated(data);
      }
    });

    socketInstance.on("proposal:new", (data: any) => {
      if (eventHandlers.onNewProposal) {
        eventHandlers.onNewProposal(data);
      }
    });

    socketInstance.on("contracts:refresh", (data: any) => {
      if (eventHandlers.onContractsRefresh) {
        eventHandlers.onContractsRefresh(data);
      }
    });

    socketInstance.on("myjobs:refresh", (data: any) => {
      if (eventHandlers.onMyJobsRefresh) {
        eventHandlers.onMyJobsRefresh(data);
      }
    });

    // Notification handler
    socketInstance.on("notification:new", (data: any) => {
      if (eventHandlers.onNotification) {
        eventHandlers.onNotification(data);
      }
    });
  }, [getReconnectDelay]);

  // Main connection effect - only depends on user
  useEffect(() => {
    if (!user) {
      // Disconnect socket if user logs out
      if (globalSocket) {
        globalSocket.disconnect();
        globalSocket = null;
        setSocket(null);
        setIsConnected(false);
        connectionAttempts = 0;
        connectionGaveUp = false;
        isGlobalConnecting = false;
      }
      return;
    }

    // Get token from localStorage
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    // Prevent multiple simultaneous connection attempts
    const now = Date.now();
    if (isGlobalConnecting && now - lastConnectionAttempt < 5000) {
      return;
    }

    // If already connected, just update state
    if (globalSocket?.connected) {
      setSocket(globalSocket);
      setIsConnected(true);
      return;
    }

    // If we gave up, don't auto-reconnect (wait for manual retry)
    if (connectionGaveUp && globalSocket) {
      setSocket(globalSocket);
      setIsConnected(false);
      return;
    }

    isGlobalConnecting = true;
    lastConnectionAttempt = now;

    // Create socket connection with conservative settings
    const newSocket = io(SOCKET_URL, {
      auth: {
        token,
      },
      path: "/socket.io",
      transports: ["websocket", "polling"], // Try websocket first
      reconnection: true,
      reconnectionDelay: INITIAL_RECONNECT_DELAY,
      reconnectionDelayMax: MAX_RECONNECT_DELAY,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      timeout: 10000, // 10 second connection timeout
      forceNew: false, // Reuse connection if possible
    });

    globalSocket = newSocket;
    setSocket(newSocket);
    setupSocketListeners(newSocket);

    isGlobalConnecting = false;

    // Cleanup only on user logout, not on re-renders
    return () => {
      // Don't disconnect on re-render, only when user is null
    };
  }, [user, setupSocketListeners]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    if (!user) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    // Reset state
    connectionAttempts = 0;
    connectionGaveUp = false;

    if (globalSocket) {
      globalSocket.connect();
    } else {
      // Force new connection
      isGlobalConnecting = false;
      lastConnectionAttempt = 0;
    }
  }, [user]);

  // Join conversation
  const joinConversation = useCallback((conversationId: string) => {
    if (globalSocket?.connected) {
      setMessages([]);
      globalSocket.emit("join:conversation", conversationId);
    }
  }, []);

  // Leave conversation
  const leaveConversation = useCallback((conversationId: string) => {
    if (globalSocket?.connected) {
      globalSocket.emit("leave:conversation", conversationId);
      setMessages([]);
    }
  }, []);

  // Send message
  const sendMessage = useCallback((data: {
    conversationId: string;
    message: string;
    type?: "text" | "image" | "file";
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
  }) => {
    if (globalSocket?.connected) {
      globalSocket.emit("message:send", data);
    }
  }, []);

  // Start typing
  const startTyping = useCallback((conversationId: string) => {
    if (globalSocket?.connected) {
      globalSocket.emit("typing:start", { conversationId, isTyping: true });
    }
  }, []);

  // Stop typing
  const stopTyping = useCallback((conversationId: string) => {
    if (globalSocket?.connected) {
      globalSocket.emit("typing:stop", { conversationId, isTyping: false });
    }
  }, []);

  // Mark message as read
  const markAsRead = useCallback((conversationId: string, messageId: string) => {
    if (globalSocket?.connected) {
      globalSocket.emit("message:read", { conversationId, messageId });
    }
  }, []);

  // Mark conversation as read
  const markConversationAsRead = useCallback((conversationId: string) => {
    if (globalSocket?.connected) {
      globalSocket.emit("conversation:mark-read", conversationId);
    }
  }, []);

  // Check if user is online
  const isUserOnline = useCallback((userId: string) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  // Get typing users for a conversation
  const getTypingUsers = useCallback((conversationId: string) => {
    const typing: TypingStatus[] = [];
    typingUsers.forEach((status) => {
      if (status.conversationId === conversationId && status.isTyping) {
        typing.push(status);
      }
    });
    return typing;
  }, [typingUsers]);

  // Register callbacks - these update the global handlers without causing re-renders
  const registerContractUpdateHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onContractUpdate = handler;
  }, []);

  const registerJobUpdateHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onJobUpdate = handler;
  }, []);

  const registerProposalUpdateHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onProposalUpdate = handler;
  }, []);

  const registerDashboardRefreshHandler = useCallback((handler: () => void) => {
    eventHandlers.onDashboardRefresh = handler;
  }, []);

  const registerJobsRefreshHandler = useCallback((handler: (data?: any) => void) => {
    eventHandlers.onJobsRefresh = handler;
  }, []);

  const registerUnreadUpdateHandler = useCallback((handler: (count: number) => void) => {
    eventHandlers.onUnreadUpdate = handler;
  }, []);

  // Admin panel register handlers
  const registerAdminJobCreatedHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onAdminJobCreated = handler;
  }, []);

  const registerAdminJobUpdatedHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onAdminJobUpdated = handler;
  }, []);

  const registerAdminProposalCreatedHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onAdminProposalCreated = handler;
  }, []);

  const registerAdminContractCreatedHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onAdminContractCreated = handler;
  }, []);

  const registerAdminContractUpdatedHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onAdminContractUpdated = handler;
  }, []);

  const registerAdminPaymentCreatedHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onAdminPaymentCreated = handler;
  }, []);

  const registerAdminPaymentUpdatedHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onAdminPaymentUpdated = handler;
  }, []);

  const registerAdminUserCreatedHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onAdminUserCreated = handler;
  }, []);

  const registerNewProposalHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onNewProposal = handler;
  }, []);

  const registerContractsRefreshHandler = useCallback((handler: (data?: any) => void) => {
    eventHandlers.onContractsRefresh = handler;
  }, []);

  const registerMyJobsRefreshHandler = useCallback((handler: (data?: any) => void) => {
    eventHandlers.onMyJobsRefresh = handler;
  }, []);

  const registerNotificationHandler = useCallback((handler: (data: any) => void) => {
    eventHandlers.onNotification = handler;
  }, []);

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
    reconnect, // Manual reconnect function
    connectionGaveUp, // Expose if connection gave up
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
    registerNotificationHandler,
  };
}
