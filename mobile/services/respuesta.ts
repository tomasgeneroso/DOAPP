/**
 * Leer lo que manda el servidor.
 *
 * El servidor no tiene una sola forma de responder: unas rutas mandan `{ success, contract }` (la clave al lado de
 * `success`) y otras `{ success, data: { ... } }`. Varias pantallas leían siempre `response.data.<clave>`: con las rutas
 * del primer tipo (contratos, propuestas, mensajes…) `response.data` no existe y la pantalla quedaba vacía sin avisar.
 * Estas funciones aceptan las dos formas. Sin éxito, o con algo que no es lo esperado, devuelven `undefined`: lo que falte
 * o venga raro es «no hay dato», nunca un valor inventado.
 */

export function leerClave<T = any>(res: any, clave: string): T | undefined {
  if (!res || res.success !== true) return undefined;
  const directo = res[clave];
  if (directo !== undefined && directo !== null) return directo as T;
  const envuelto = res.data?.[clave];
  return envuelto !== undefined && envuelto !== null ? (envuelto as T) : undefined;
}

/** Una lista bajo `clave` (en cualquiera de las dos formas). Si no es una lista, `undefined`. */
export function leerLista<T = any>(res: any, clave: string): T[] | undefined {
  const valor = leerClave<unknown>(res, clave);
  return Array.isArray(valor) ? (valor as T[]) : undefined;
}

/** El cuerpo `data` cuando es un objeto (no una lista). */
export function leerCuerpo<T = any>(res: any): T | undefined {
  if (!res || res.success !== true) return undefined;
  const d = res.data;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as T) : undefined;
}

/**
 * Los contratos de un trabajo. `GET /contracts/by-job/:id` devuelve UN contrato (`contract`: el del usuario, o el primero
 * que espera su confirmación); la pantalla trabaja con una lista.
 */
export function contratosDelTrabajo<T = any>(res: any): T[] {
  const lista = leerLista<T>(res, 'contracts');
  if (lista) return lista;
  const uno = leerClave<T>(res, 'contract');
  return uno ? [uno] : [];
}

/** La conversación de `GET /chat/conversations/:id`, que la manda como `data` (no como `data.conversation`). */
export function leerConversacion<T = any>(res: any): T | undefined {
  return leerClave<T>(res, 'conversation') ?? leerCuerpo<T>(res);
}
