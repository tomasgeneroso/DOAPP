/**
 * Mezcla de mensajes del chat: lo que ya se ve + lo que llega del servidor (por socket o al recargar).
 *
 * El mensaje que uno escribe se muestra ENSEGUIDA con un id provisorio (`temp-…`) y, cuando el servidor lo confirma, tiene que reemplazarlo. La comparación vieja
 * miraba `sender === sender` (dos objetos distintos: nunca iguales), así que el provisorio no se iba y el mensaje se veía DOS veces (pedido del dueño,
 * 2026-11-12: «envío una cotización, luego envío un mensaje y se envía dos veces»). Acá se compara por id de la persona y texto, y cada mensaje del
 * servidor reemplaza a UN solo provisorio (dos mensajes iguales seguidos siguen siendo dos).
 */
export interface MensajeMezclable {
  id?: string;
  sender?: any;
  senderId?: string;
  message?: string;
}

export const esProvisorio = (m: MensajeMezclable): boolean => String(m.id ?? '').startsWith('temp-');

const remitenteDe = (m: MensajeMezclable): string => {
  const s = m.sender;
  if (s && typeof s === 'object') return String(s.id ?? s._id ?? '');
  return String(s ?? m.senderId ?? '');
};

const textoDe = (m: MensajeMezclable): string => String(m.message ?? '').trim();

export function mezclarMensajes<T extends MensajeMezclable>(actuales: T[], nuevos: T[]): T[] {
  const idsConocidos = new Set(actuales.filter((m) => !esProvisorio(m) && m.id).map((m) => String(m.id)));
  const aAgregar: T[] = [];
  for (const n of nuevos) {
    const id = n.id ? String(n.id) : '';
    if (id && idsConocidos.has(id)) continue; // ya está (o llegó dos veces por distintas vías)
    if (id) idsConocidos.add(id);
    aAgregar.push(n);
  }
  if (aAgregar.length === 0) return actuales;

  // Cada mensaje confirmado reemplaza a UN provisorio del mismo remitente y texto (el más viejo primero).
  const sinConfirmar = [...aAgregar];
  const quedan = actuales.filter((m) => {
    if (!esProvisorio(m)) return true;
    const i = sinConfirmar.findIndex((n) => remitenteDe(n) === remitenteDe(m) && textoDe(n) === textoDe(m));
    if (i === -1) return true;
    sinConfirmar.splice(i, 1);
    return false;
  });
  return [...quedan, ...aAgregar];
}
