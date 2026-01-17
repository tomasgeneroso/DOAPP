import { useEffect, useState, useCallback, useRef } from 'react';
import socketService from '../services/socket';
import { useAuth } from '../context/AuthContext';

/**
 * Hook for managing socket connection and events
 */
export function useSocket() {
  const { user, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const mountedRef = useRef(true);

  // Initialize socket when user is authenticated
  useEffect(() => {
    mountedRef.current = true;

    if (user && token) {
      socketService.initSocket().then((socket) => {
        if (socket && mountedRef.current) {
          setIsConnected(socket.connected);
        }
      });

      // Listen for connection status changes
      const unsubscribe = socketService.on('connection:status', (data) => {
        if (mountedRef.current) {
          setIsConnected(data.connected);
        }
      });

      return () => {
        mountedRef.current = false;
        unsubscribe();
      };
    } else {
      // Disconnect if user logs out
      socketService.disconnect();
      setIsConnected(false);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [user, token]);

  // Reconnect function
  const reconnect = useCallback(async () => {
    const socket = await socketService.reconnect();
    if (socket && mountedRef.current) {
      setIsConnected(socket.connected);
    }
  }, []);

  // Event subscription helper
  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    return socketService.on(event, callback);
  }, []);

  return {
    isConnected,
    reconnect,
    subscribe,
    // Chat functions
    joinConversation: socketService.joinConversation,
    leaveConversation: socketService.leaveConversation,
    sendMessage: socketService.sendMessage,
    sendTyping: socketService.sendTyping,
    markMessageRead: socketService.markMessageRead,
    markConversationRead: socketService.markConversationRead,
    // Generic emit
    emit: socketService.emit,
  };
}

/**
 * Hook for subscribing to real-time job updates
 */
export function useJobUpdates(onUpdate: (data: any) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    const unsubJob = subscribe('job:updated', onUpdate);
    const unsubRefresh = subscribe('jobs:refresh', onUpdate);

    return () => {
      unsubJob();
      unsubRefresh();
    };
  }, [subscribe, onUpdate]);
}

/**
 * Hook for subscribing to real-time contract updates
 */
export function useContractUpdates(onUpdate: (data: any) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    const unsubContract = subscribe('contract:updated', onUpdate);
    const unsubRefresh = subscribe('contracts:refresh', onUpdate);

    return () => {
      unsubContract();
      unsubRefresh();
    };
  }, [subscribe, onUpdate]);
}

/**
 * Hook for subscribing to real-time proposal updates
 */
export function useProposalUpdates(onUpdate: (data: any) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    const unsubNew = subscribe('proposal:new', onUpdate);
    const unsubUpdated = subscribe('proposal:updated', onUpdate);

    return () => {
      unsubNew();
      unsubUpdated();
    };
  }, [subscribe, onUpdate]);
}

/**
 * Hook for subscribing to real-time notifications
 */
export function useNotifications(onNotification: (data: any) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    return subscribe('notification:new', onNotification);
  }, [subscribe, onNotification]);
}

/**
 * Hook for subscribing to unread message count updates
 */
export function useUnreadCount(onUpdate: (count: number) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    return subscribe('unread:updated', (data) => {
      onUpdate(data.unreadConversations ?? data.unreadCount ?? 0);
    });
  }, [subscribe, onUpdate]);
}

/**
 * Hook for real-time chat functionality
 */
export function useChat(conversationId: string | null) {
  const { subscribe, joinConversation, leaveConversation, sendMessage, sendTyping, markConversationRead } = useSocket();
  const [messages, setMessages] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!conversationId) return;

    // Join conversation room
    joinConversation(conversationId);

    // Subscribe to events
    const unsubHistory = subscribe('conversation:history', (data) => {
      if (data.conversationId === conversationId) {
        setMessages(data.messages || []);
      }
    });

    const unsubNew = subscribe('message:new', (message) => {
      if (message.conversationId === conversationId) {
        setMessages(prev => [...prev, message]);
      }
    });

    const unsubUpdated = subscribe('message:updated', (message) => {
      setMessages(prev =>
        prev.map(m => (m.id === message.id || m._id === message._id) ? { ...m, ...message } : m)
      );
    });

    const unsubTyping = subscribe('typing:update', (data) => {
      if (data.conversationId === conversationId) {
        setTypingUsers(prev => {
          if (data.isTyping) {
            return [...prev.filter(u => u.userId !== data.userId), data];
          }
          return prev.filter(u => u.userId !== data.userId);
        });
      }
    });

    return () => {
      leaveConversation(conversationId);
      unsubHistory();
      unsubNew();
      unsubUpdated();
      unsubTyping();
    };
  }, [conversationId, subscribe, joinConversation, leaveConversation]);

  const send = useCallback((content: string, type: 'text' | 'image' | 'file' = 'text', fileUrl?: string, fileName?: string) => {
    if (!conversationId) return;
    sendMessage({
      conversationId,
      message: content,
      type,
      fileUrl,
      fileName,
    });
  }, [conversationId, sendMessage]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!conversationId) return;
    sendTyping(conversationId, isTyping);
  }, [conversationId, sendTyping]);

  const markRead = useCallback(() => {
    if (!conversationId) return;
    markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  return {
    messages,
    typingUsers,
    send,
    setTyping,
    markRead,
  };
}

export default useSocket;
