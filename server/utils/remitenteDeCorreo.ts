/**
 * Desde qué dirección sale cada correo (pedido del dueño, 2026-11-27). Una sola regla:
 *  - Automático (no hay nada que contestar): sale con el remitente de siempre del servidor (`SMTP_FROM_EMAIL`, hoy noreply@).
 *  - Con respuesta (se le pide a la persona que conteste, o es una conversación con soporte): sale de la casilla de soporte, y la respuesta llega ahí.
 *  - Al equipo (contacto, sugerencias, avisos de tickets): va a la casilla de soporte y sale de ella; «Responder» le escribe a quien mandó el mensaje.
 */
import { CORREOS } from '../../shared/constants/contacto.js';

export const casillaDeSoporte = (): string => process.env.SUPPORT_EMAIL || CORREOS.soporte;
export const remitenteDeSoporte = (): string => `"DOAPP Soporte" <${casillaDeSoporte()}>`;

export function conRemitente<T extends { from?: string; replyTo?: string; conRespuesta?: boolean }>(opciones: T): T {
  if (!opciones.conRespuesta) return opciones;
  return { ...opciones, from: opciones.from || remitenteDeSoporte(), replyTo: opciones.replyTo || casillaDeSoporte() };
}

/** Un correo para el equipo. `responderA`: la dirección de quien escribió, para contestarle con «Responder» (sin ella, la respuesta queda en soporte). */
export function correoAlEquipo(datos: { asunto: string; html: string; responderA?: string | null }) {
  return { to: casillaDeSoporte(), from: remitenteDeSoporte(), replyTo: datos.responderA || casillaDeSoporte(), subject: datos.asunto, html: datos.html };
}
