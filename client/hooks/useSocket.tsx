import { useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./useAuth";

// Configuración de URL para Socket.io
// En desarrollo, usar el mismo host (proxy de Vite lo redirigirá a :5000)
// En producción, usar la URL base del sitio (sin /api)
const getSocketUrl = () => {
  if (import.meta.env.DEV) {
    return ""; // Empty string = same host (uses Vite proxy)
  }
  // Sin VITE_API_URL (el build del servidor no la define) se usa el mismo sitio: nginx reenvía /socket.io al backend. El respaldo
  // anterior, http://localhost:5000, hacía que en producción el tiempo real nunca conectara (todo figuraba «sin conexión»).
  const apiUrl = import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "");
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
  id?: string;
  conversationId: string;
  sender: {
    id?: string;
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

/**
 * El estado del socket (conexión, mensajes, quién escribe, quién está en línea) es UNO para toda la aplicación.
 *
 * Antes cada componente que llamaba a `useSocket()` tenía su PROPIA copia en `useState`, pero los oyentes del socket se registran una
 * sola vez, con los `setState` del primer componente que lo usó (el menú, al entrar). Resultado: la pantalla del chat, abierta desde
 * otra parte, nunca recibía los mensajes en vivo ni se enteraba de que el socket se había conectado (quedaba «sin conexión», no se
 * unía a la sala), y los mensajes enviados aparecían recién al recargar la página; después de recargar funcionaba porque ahí la pantalla
 * del chat pasaba a ser la primera en usar el socket. Con un único almacén, todos ven lo mismo.
 */
interface EstadoDelSocket {
  socket: Socket | null;
  isConnected: boolean;
  messages: Message[];
  typingUsers: Map<string, TypingStatus>;
  onlineUsers: Set<string>;
}
let estadoDelSocket: EstadoDelSocket = {
  socket: globalSocket,
  isConnected: (globalSocket as Socket | null)?.connected ?? false,
  messages: [],
  typingUsers: new Map(),
  onlineUsers: new Set(),
};
const suscriptoresDelSocket = new Set<() => void>();
const suscribirseAlSocket = (aviso: () => void) => {
  suscriptoresDelSocket.add(aviso);
  return () => {
    suscriptoresDelSocket.delete(aviso);
  };
};
const leerEstadoDelSocket = () => estadoDelSocket;
function cambiarEstadoDelSocket(parcial: Partial<EstadoDelSocket>): void {
  estadoDelSocket = { ...estadoDelSocket, ...parcial };
  suscriptoresDelSocket.forEach((aviso) => aviso());
}
const setIsConnected = (valor: boolean) => cambiarEstadoDelSocket({ isConnected: valor });
const setSocket = (valor: Socket | null) => cambiarEstadoDelSocket({ socket: valor });
const setMessages = (valor: Message[] | ((previos: Message[]) => Message[])) =>
  cambiarEstadoDelSocket({ messages: typeof valor === "function" ? valor(estadoDelSocket.messages) : valor });
const setTypingUsers = (cambio: (previos: Map<string, TypingStatus>) => Map<string, TypingStatus>) =>
  cambiarEstadoDelSocket({ typingUsers: cambio(estadoDelSocket.typingUsers) });
const setOnlineUsers = (cambio: (previos: Set<string>) => Set<string>) =>
  cambiarEstadoDelSocket({ onlineUsers: cambio(estadoDelSocket.onlineUsers) });

/**
 * Quién escucha cada aviso del servidor. Son VARIOS por aviso: antes había un solo lugar (`eventHandlers.onX = handler`) y la última pantalla en anotarse
 * pisaba a las demás, así que el trabajo y sus tareas se quitaban el aviso entre sí, y la lista de notificaciones dejaba sin aviso a la campanita. Cada
 * pantalla se anota con `suscribirseAEvento` (o con `useEventoEnVivo`) y recibe de vuelta cómo darse de baja al desmontarse.
 */
type Oyente = (datos?: any) => void;
const oyentes = new Map<string, Set<Oyente>>();

export function suscribirseAEvento(evento: string, oyente: Oyente): () => void {
  let grupo = oyentes.get(evento);
  if (!grupo) {
    grupo = new Set();
    oyentes.set(evento, grupo);
  }
  grupo.add(oyente);
  return () => {
    oyentes.get(evento)?.delete(oyente);
  };
}

function avisarAOyentes(evento: string, datos?: unknown): void {
  oyentes.get(evento)?.forEach((oyente) => {
    // Un oyente que falla no puede dejar sin aviso a los demás.
    try {
      oyente(datos);
    } catch (error) {
      console.error(`Error en un oyente de ${evento}:`, error);
    }
  });
}

/** Avisos que se vuelven a pedir cuando el socket se reconecta: lo que pasó mientras no había conexión no llegó, y las pantallas lo recargan. */
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
let yaSeConecto = false;

/**
 * Junta varios avisos seguidos en UNA sola recarga. Guardar un contrato toca contrato, trabajo, pago y saldo en el mismo instante, y cada uno avisa:
 * la pantalla pide los datos una vez, no cuatro.
 */
export function useRecargaJuntada(recargar: () => void, esperaMs = 250): () => void {
  const ultima = useRef(recargar);
  useEffect(() => {
    ultima.current = recargar;
  });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );
  return useCallback(() => {
    if (temporizador.current) return;
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      ultima.current();
    }, esperaMs);
  }, [esperaMs]);
}

/**
 * Pantallas de administración: algo de dinero, contratos, trabajos o reclamos cambió (lo hizo un usuario, un cron o Mercado Pago) y la lista se recarga.
 * Los tipos son los de `admin:cambio` (`services/avisosPorCambios.ts`): 'payment', 'contract', 'job', 'withdrawal', 'dispute'.
 */
export function useCambiosDeAdministracion(tipos: string[], recargar: () => void, esperaMs?: number): void {
  // `esperaMs`: cuánto juntar los avisos antes de recargar. Lo normal es 250 ms; una pantalla de analítica (agregados pesados) junta varios segundos.
  const juntada = useRecargaJuntada(recargar, esperaMs);
  useEventoEnVivo('admin:cambio', (datos?: { tipo?: string }) => {
    if (!datos?.tipo || tipos.includes(datos.tipo)) juntada();
  });
  useEventoEnVivo('socket:reconectado', juntada);
}

/**
 * Se anota a un aviso del servidor mientras la pantalla está montada. El oyente puede cambiar en cada render sin volver a anotarse.
 *
 *   useEventoEnVivo(['balance:updated', 'withdrawal:updated'], recargar);
 */
export function useEventoEnVivo(eventos: string | string[], oyente: Oyente): void {
  const ultimo = useRef(oyente);
  useEffect(() => {
    ultimo.current = oyente;
  });
  const clave = Array.isArray(eventos) ? eventos.join('|') : eventos;
  useEffect(() => {
    const bajas = clave.split('|').map((evento) => suscribirseAEvento(evento, (datos) => ultimo.current(datos)));
    return () => bajas.forEach((baja) => baja());
  }, [clave]);
}

export function useSocket() {
  const { user } = useAuth();
  const { socket, isConnected, messages, typingUsers, onlineUsers } = useSyncExternalStore(suscribirseAlSocket, leerEstadoDelSocket);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      {
        setIsConnected(true);
      }
      // Reconexión (se cortó la red, la computadora durmió): lo que cambió mientras tanto no llegó, así que las pantallas recargan.
      if (yaSeConecto) AL_RECONECTAR.forEach((evento) => avisarAOyentes(evento, { reconexion: true }));
      yaSeConecto = true;
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
      {
        setIsConnected(false);
      }

      // Don't reconnect if server intentionally closed or we gave up
      if (reason === "io server disconnect" || connectionGaveUp) {
        return;
      }
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      {
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
      // Debug logging for socket messages - TEMPORARY
      {
        setMessages((prev) => (message.id && prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      }
    });

    socketInstance.on("conversation:history", ({ messages: historyMessages }) => {
      {
        setMessages(historyMessages);
      }
    });

    socketInstance.on("message:read", ({ messageId, readAt }) => {
      {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, read: true, readAt: new Date(readAt) }
              : msg
          )
        );
      }
    });

    // Message updated handler (for status changes like auto-selection)
    socketInstance.on("message:updated", (updatedMessage: Message) => {
      {
        setMessages((prev) =>
          prev.map((msg) =>
            (msg.id === updatedMessage.id || msg.id === (updatedMessage as any).messageId)
              ? { ...msg, ...updatedMessage }
              : msg
          )
        );
      }
    });

    // Typing handlers
    socketInstance.on("typing:update", (status: TypingStatus) => {
      {
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
      {
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
    socketInstance.on("socket_error", (error) => {
      console.error("Socket error:", error);
    });

    // Todo aviso del servidor se reparte a quienes se anotaron (`suscribirseAEvento`), sea de contratos, trabajos, dinero, mensajes o notificaciones.
    socketInstance.offAny();
    socketInstance.onAny((evento: string, datos: unknown) => avisarAOyentes(evento, datos));
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
        yaSeConecto = false;
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

  // Al volver a la pestaña o recuperar la red, si el tiempo real quedó caído se reconecta solo.
  useEffect(() => {
    if (!user) return;
    const reintentar = () => {
      if (document.visibilityState === "hidden" || !globalSocket || globalSocket.connected) return;
      connectionAttempts = 0;
      connectionGaveUp = false;
      globalSocket.connect();
    };
    window.addEventListener("online", reintentar);
    document.addEventListener("visibilitychange", reintentar);
    return () => {
      window.removeEventListener("online", reintentar);
      document.removeEventListener("visibilitychange", reintentar);
    };
  }, [user]);

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

  // Cada una devuelve cómo darse de baja: `useEffect(() => registerXHandler(manejador), [...])`.
  const registerContractUpdateHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('contract:updated', handler), []);

  const registerJobUpdateHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('job:updated', handler), []);

  const registerProposalUpdateHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('proposal:updated', handler), []);

  const registerDashboardRefreshHandler = useCallback((handler: () => void) => suscribirseAEvento('dashboard:refresh', handler), []);

  const registerJobsRefreshHandler = useCallback((handler: (data?: any) => void) => suscribirseAEvento('jobs:refresh', handler), []);

  const registerAdminJobCreatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:job:created', handler), []);

  const registerAdminJobUpdatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:job:updated', handler), []);

  const registerAdminProposalCreatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:proposal:created', handler), []);

  const registerAdminContractCreatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:contract:created', handler), []);

  const registerAdminContractUpdatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:contract:updated', handler), []);

  const registerAdminPaymentCreatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:payment:created', handler), []);

  const registerAdminPaymentUpdatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:payment:updated', handler), []);

  const registerAdminUserCreatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:user:created', handler), []);

  const registerAdminUserUpdatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:user:updated', handler), []);

  const registerAdminDisputeCreatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:dispute:created', handler), []);

  const registerAdminDisputeUpdatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:dispute:updated', handler), []);

  const registerAdminTicketCreatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:ticket:created', handler), []);

  const registerAdminTicketUpdatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:ticket:updated', handler), []);

  const registerAdminWithdrawalCreatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:withdrawal:created', handler), []);

  const registerAdminWithdrawalUpdatedHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('admin:withdrawal:updated', handler), []);

  const registerNewProposalHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('proposal:new', handler), []);

  const registerContractsRefreshHandler = useCallback((handler: (data?: any) => void) => suscribirseAEvento('contracts:refresh', handler), []);

  const registerMyJobsRefreshHandler = useCallback((handler: (data?: any) => void) => suscribirseAEvento('myjobs:refresh', handler), []);

  const registerNotificationHandler = useCallback((handler: (data: any) => void) => suscribirseAEvento('notification:new', handler), []);

  const registerQuoteStatusHandler = useCallback((handler: (data: any) => void) => {
    const bajas = [
      suscribirseAEvento('quote:payment_started', (data) => handler({ ...data, fase: 'pagando' })),
      suscribirseAEvento('quote:accepted', (data) => handler({ ...data, fase: 'aceptada' })),
    ];
    return () => bajas.forEach((baja) => baja());
  }, []);

  const registerUnreadUpdateHandler = useCallback(
    (handler: (count: number) => void) =>
      suscribirseAEvento('unread:updated', (data: { unreadCount: number; unreadConversations?: number }) => handler(data.unreadConversations ?? data.unreadCount)),
    [],
  );

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
    registerQuoteStatusHandler,
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
    registerAdminUserUpdatedHandler,
    registerAdminDisputeCreatedHandler,
    registerAdminDisputeUpdatedHandler,
    registerAdminTicketCreatedHandler,
    registerAdminTicketUpdatedHandler,
    registerAdminWithdrawalCreatedHandler,
    registerAdminWithdrawalUpdatedHandler,
    registerNewProposalHandler,
    registerContractsRefreshHandler,
    registerMyJobsRefreshHandler,
    registerNotificationHandler,
  };
}
