import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { getToken } from './api';

// Socket URL configuration
const getSocketUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    // Remove /api suffix to get base URL
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/api\/?$/, '');
  }
  if (Platform.OS === 'web' && __DEV__) {
    return 'http://localhost:3001';
  }
  return 'https://doapparg.com';
};

const SOCKET_URL = getSocketUrl();

// Reconnection configuration
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

// Singleton socket instance
let socketInstance: Socket | null = null;
let connectionAttempts = 0;
let isConnecting = false;
let yaSeConecto = false;

/** Avisos que se vuelven a pedir cuando el socket se reconecta: lo que cambió mientras no había conexión no llegó, y las pantallas recargan. */
const AL_RECONECTAR = [
  'dashboard:refresh',
  'contracts:refresh',
  'myjobs:refresh',
  'jobs:refresh',
  'notifications:refresh',
  'chat:actualizado',
  'balance:updated',
  'socket:reconectado',
];

// Event handler registry
type EventCallback = (data: any) => void;
const eventHandlers: Map<string, Set<EventCallback>> = new Map();

/**
 * Initialize socket connection
 */
export async function initSocket(): Promise<Socket | null> {
  if (socketInstance?.connected) {
    return socketInstance;
  }

  if (isConnecting) {
    return null;
  }

  const token = await getToken();
  if (!token) {
    console.log('No token available for socket connection');
    return null;
  }

  isConnecting = true;

  try {
    socketInstance = io(SOCKET_URL, {
      auth: { token },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: INITIAL_RECONNECT_DELAY,
      reconnectionDelayMax: MAX_RECONNECT_DELAY,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      timeout: 10000,
    });

    setupSocketListeners(socketInstance);
    isConnecting = false;
    return socketInstance;
  } catch (error) {
    console.error('Socket initialization error:', error);
    isConnecting = false;
    return null;
  }
}

/**
 * Setup socket event listeners
 */
function setupSocketListeners(socket: Socket) {
  socket.on('connect', () => {
    console.log('Socket connected');
    connectionAttempts = 0;
    notifyHandlers('connection:status', { connected: true });
    if (yaSeConecto) AL_RECONECTAR.forEach((evento) => notifyHandlers(evento, { reconexion: true }));
    yaSeConecto = true;
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    notifyHandlers('connection:status', { connected: false, reason });
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
    connectionAttempts++;
    notifyHandlers('connection:status', { connected: false, error: error.message });
  });

  // Todo aviso del servidor llega a quienes se anotaron con `on(...)`, sea de chat, contratos, trabajos, dinero o notificaciones.
  // Antes se reenviaba una lista fija y los avisos nuevos (saldo, retiros, chats, notificaciones de cualquier origen) se perdían.
  socket.offAny();
  socket.onAny((evento: string, datos: unknown) => notifyHandlers(evento, datos));
}

/**
 * Notify all handlers for an event
 */
function notifyHandlers(event: string, data: any) {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in socket handler for ${event}:`, error);
      }
    });
  }
}

/**
 * Register an event handler
 */
export function on(event: string, callback: EventCallback): () => void {
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set());
  }
  eventHandlers.get(event)!.add(callback);

  // Return unsubscribe function
  return () => {
    eventHandlers.get(event)?.delete(callback);
  };
}

/**
 * Remove an event handler
 */
export function off(event: string, callback: EventCallback) {
  eventHandlers.get(event)?.delete(callback);
}

/**
 * Emit an event to the server
 */
export function emit(event: string, data?: any) {
  if (socketInstance?.connected) {
    socketInstance.emit(event, data);
  } else {
    console.warn('Socket not connected, cannot emit:', event);
  }
}

/**
 * Join a conversation room
 */
export function joinConversation(conversationId: string) {
  emit('join:conversation', conversationId);
}

/**
 * Leave a conversation room
 */
export function leaveConversation(conversationId: string) {
  emit('leave:conversation', conversationId);
}

/**
 * Send a chat message
 */
export function sendMessage(data: {
  conversationId: string;
  message: string;
  type?: 'text' | 'image' | 'file';
  fileUrl?: string;
  fileName?: string;
}) {
  emit('message:send', data);
}

/**
 * Send typing indicator
 */
export function sendTyping(conversationId: string, isTyping: boolean) {
  emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId, isTyping });
}

/**
 * Mark message as read
 */
export function markMessageRead(conversationId: string, messageId: string) {
  emit('message:read', { conversationId, messageId });
}

/**
 * Mark conversation as read
 */
export function markConversationRead(conversationId: string) {
  emit('conversation:mark-read', conversationId);
}

/**
 * Disconnect socket
 */
export function disconnect(limpiarOyentes = true) {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  // Al cerrar sesión se sueltan todos los oyentes; al reconectar NO: las pantallas abiertas siguen anotadas.
  if (limpiarOyentes) {
    eventHandlers.clear();
    yaSeConecto = false;
  }
}

/**
 * Reconnect socket
 */
export async function reconnect() {
  disconnect(false);
  connectionAttempts = 0;
  return initSocket();
}

/**
 * Check if socket is connected
 */
export function isConnected(): boolean {
  return socketInstance?.connected ?? false;
}

/**
 * Get socket instance
 */
export function getSocket(): Socket | null {
  return socketInstance;
}

export default {
  initSocket,
  on,
  off,
  emit,
  joinConversation,
  leaveConversation,
  sendMessage,
  sendTyping,
  markMessageRead,
  markConversationRead,
  disconnect,
  reconnect,
  isConnected,
  getSocket,
};
