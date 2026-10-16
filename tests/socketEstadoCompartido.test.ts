import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El estado del socket de la web (conexión, mensajes, quién escribe) es UNO para toda la aplicación.
 *
 * Los oyentes del socket se registran una sola vez, con los `setState` del primer componente que usó `useSocket()`. Si cada componente
 * tuviera su propio `useState`, la pantalla del chat (abierta desde otra parte) nunca recibiría los mensajes en vivo ni se enteraría de
 * que el socket se conectó: había que recargar la página para ver lo que uno mismo había enviado.
 */
describe('useSocket: un solo estado compartido', () => {
  const fuente = readFileSync(join(process.cwd(), 'client/hooks/useSocket.tsx'), 'utf8');

  it('lee el estado de un almacén común (useSyncExternalStore), no de useState por componente', () => {
    expect(fuente).toMatch(/useSyncExternalStore\(suscribirseAlSocket, leerEstadoDelSocket\)/);
    for (const campo of ['isConnected', 'messages', 'typingUsers', 'onlineUsers']) {
      expect(fuente).not.toMatch(new RegExp(`const \\[${campo}, set\\w+\\] = useState`));
    }
  });

  it('los oyentes escriben en el almacén común, no en los setState de un componente', () => {
    expect(fuente).toMatch(/const setMessages = \(valor/);
    expect(fuente).toMatch(/const setIsConnected = \(valor/);
    // Los oyentes no se apagan cuando el componente que los creó se desmonta (otros componentes siguen usando el socket).
    const oyentes = fuente.slice(fuente.indexOf('const setupSocketListeners'), fuente.indexOf('// Main connection effect'));
    expect(oyentes).not.toMatch(/mountedRef\.current/);
  });
});
