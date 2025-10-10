import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./useAuth";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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
      transports: ["websocket", "polling"],
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

    // Cleanup
    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // Join conversation
  const joinConversation = (conversationId: string) => {
    if (socket) {
      socket.emit("join:conversation", conversationId);
    }
  };

  // Leave conversation
  const leaveConversation = (conversationId: string) => {
    if (socket) {
      socket.emit("leave:conversation", conversationId);
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
  };
}
