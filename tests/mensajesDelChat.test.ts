import { describe, it, expect } from '@jest/globals';
import { mezclarMensajes } from '../client/utils/mensajesDelChat';

/**
 * Chat web: el mensaje que uno escribe se ve enseguida (provisorio) y el del servidor lo reemplaza. Antes el provisorio se comparaba por objeto (nunca igual) y el
 * mensaje se veía dos veces (2026-11-12: «envío una cotización, luego envío un mensaje y se envía dos veces»).
 */
const yo = { id: 'u1', name: 'Yo' };
const otro = { id: 'u2', name: 'Otro' };

describe('mezclarMensajes', () => {
  it('el mensaje confirmado reemplaza a su provisorio (mismo remitente y texto, aunque el objeto «sender» sea otro)', () => {
    const actuales = [{ id: 'm1', sender: otro, message: 'Hola' }, { id: 'temp-1', sender: { ...yo }, message: 'Todo bien' }];
    const r = mezclarMensajes(actuales, [{ id: 'm2', sender: { ...yo }, message: 'Todo bien' }]);
    expect(r.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('un mensaje que ya se ve no se agrega de nuevo, ni cuando llega dos veces en el mismo lote', () => {
    const actuales = [{ id: 'm1', sender: otro, message: 'Hola' }];
    expect(mezclarMensajes(actuales, [{ id: 'm1', sender: otro, message: 'Hola' }])).toBe(actuales);
    const r = mezclarMensajes(actuales, [{ id: 'm2', sender: yo, message: 'a' }, { id: 'm2', sender: yo, message: 'a' }]);
    expect(r.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('dos mensajes iguales seguidos siguen siendo dos: cada confirmación reemplaza UN solo provisorio', () => {
    const actuales = [{ id: 'temp-1', sender: yo, message: 'ok' }, { id: 'temp-2', sender: yo, message: 'ok' }];
    const r1 = mezclarMensajes(actuales, [{ id: 'm1', sender: yo, message: 'ok' }]);
    expect(r1.map((m) => m.id)).toEqual(['temp-2', 'm1']);
    const r2 = mezclarMensajes(r1, [{ id: 'm2', sender: yo, message: 'ok' }]);
    expect(r2.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('el provisorio de otro remitente o de otro texto no se toca; el mensaje del sistema (cotización) tampoco', () => {
    const actuales = [{ id: 'temp-1', sender: yo, message: 'uno' }];
    const r = mezclarMensajes(actuales, [{ id: 'q1', sender: otro, message: 'uno' }, { id: 'q2', sender: yo, message: 'Cotización||detalle' }]);
    expect(r.map((m) => m.id)).toEqual(['temp-1', 'q1', 'q2']);
  });
});
