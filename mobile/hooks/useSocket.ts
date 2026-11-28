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
 * Avance de la aceptación de una cotización, en vivo del lado del trabajador.
 *
 * Son dos eventos y no uno porque hacen falta los dos momentos: que el cliente
 * arrancó el pago, y que se acreditó. Saber que alguien está pagando tu
 * cotización cambia lo que hacés mientras tanto -- dejás de buscar otro trabajo
 * para esa fecha -- y enterarte recién con el contrato firmado llega tarde.
 *
 * La fase se agrega acá y no en el servidor para que la pantalla reciba un solo
 * tipo de dato en vez de tener que distinguir de qué evento vino.
 */
export function useQuoteStatus(onChange: (data: any) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    const unsubPagando = subscribe('quote:payment_started', (d: any) =>
      onChange({ ...d, fase: 'pagando' }),
    );
    const unsubAceptada = subscribe('quote:accepted', (d: any) =>
      onChange({ ...d, fase: 'aceptada' }),
    );

    return () => {
      unsubPagando();
      unsubAceptada();
    };
  }, [subscribe, onChange]);
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

export default useSocket;

/**
 * Se anota a avisos del servidor mientras la pantalla está montada. El oyente puede cambiar en cada render sin volver a anotarse.
 *
 *   useEventoEnVivo(['balance:updated', 'withdrawal:updated'], recargar);
 */
export function useEventoEnVivo(eventos: string | string[], oyente: (datos?: any) => void) {
  const ultimo = useRef(oyente);
  useEffect(() => {
    ultimo.current = oyente;
  });
  const clave = Array.isArray(eventos) ? eventos.join('|') : eventos;
  useEffect(() => {
    const bajas = clave.split('|').map((evento) => socketService.on(evento, (datos) => ultimo.current(datos)));
    return () => bajas.forEach((baja) => baja());
  }, [clave]);
}

/** Junta varios avisos seguidos en UNA sola recarga (un contrato que cambia toca contrato, trabajo, pago y saldo a la vez). */
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
