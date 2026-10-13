import { post } from './api';

/**
 * Formulario de contacto (`POST /api/contact`, público). Es el mismo que el de la web: nombre, correo, asunto y mensaje.
 * Los límites son los del servidor; se revisan acá para avisar antes de mandar, pero el que decide es el servidor.
 */

export const ASUNTOS = [
  { id: 'general', etiqueta: 'Consulta general' },
  { id: 'support', etiqueta: 'Soporte técnico' },
  { id: 'complaint', etiqueta: 'Reclamo' },
  { id: 'other', etiqueta: 'Otro' },
] as const;

export type AsuntoDeContacto = (typeof ASUNTOS)[number]['id'];

export const LIMITE_NOMBRE = 100;
export const MINIMO_MENSAJE = 10;
export const LIMITE_MENSAJE = 2000;

export interface DatosDeContacto {
  nombre: string;
  correo: string;
  asunto: string;
  mensaje: string;
}

export const esAsunto = (a: unknown): a is AsuntoDeContacto => ASUNTOS.some((x) => x.id === a);

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Devuelve el primer problema que ve (texto para mostrar) o null si se puede mandar. */
export function validarContacto(d: DatosDeContacto): string | null {
  const nombre = d.nombre.trim();
  if (!nombre) return 'Escribí tu nombre.';
  if (nombre.length > LIMITE_NOMBRE) return `El nombre no puede pasar de ${LIMITE_NOMBRE} caracteres.`;
  if (!CORREO.test(d.correo.trim())) return 'Escribí un correo válido, así podemos responderte.';
  if (!esAsunto(d.asunto)) return 'Elegí un asunto.';
  const mensaje = d.mensaje.trim();
  if (mensaje.length < MINIMO_MENSAJE) return `Contanos un poco más: el mensaje necesita al menos ${MINIMO_MENSAJE} caracteres.`;
  if (mensaje.length > LIMITE_MENSAJE) return `El mensaje no puede pasar de ${LIMITE_MENSAJE} caracteres.`;
  return null;
}

/** Lo que se manda al servidor (con los textos recortados). */
export const armarContacto = (d: DatosDeContacto) => ({
  name: d.nombre.trim(),
  email: d.correo.trim(),
  subject: d.asunto,
  message: d.mensaje.trim(),
});

export interface ResultadoDeContacto {
  ok: boolean;
  mensaje: string;
}

const CAMPOS: Record<string, string> = { name: 'nombre', email: 'correo', subject: 'asunto', message: 'mensaje' };

/**
 * El servidor responde 201 con `success: true`. Cuando la validación falla trae `errors` (lista de campos) y no `message`:
 * se traduce a qué campo revisar. Cualquier otra cosa es un error, nunca un «enviado».
 */
export function interpretarContacto(res: any): ResultadoDeContacto {
  if (res?.success === true) return { ok: true, mensaje: 'Recibimos tu mensaje. Te vamos a responder por correo.' };
  const campos: string[] = Array.isArray(res?.errors)
    ? [...new Set<string>(res.errors.map((e: any) => CAMPOS[String(e?.path ?? e?.param ?? '')]).filter(Boolean))]
    : [];
  if (campos.length) return { ok: false, mensaje: `Revisá estos datos: ${campos.join(', ')}.` };
  return { ok: false, mensaje: String(res?.message || 'No se pudo enviar el mensaje. Probá de nuevo.') };
}

export async function enviarContacto(d: DatosDeContacto): Promise<ResultadoDeContacto> {
  const error = validarContacto(d);
  if (error) return { ok: false, mensaje: error };
  return interpretarContacto(await post<any>('/contact', armarContacto(d), false));
}
