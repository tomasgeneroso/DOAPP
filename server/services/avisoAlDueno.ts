import { Op } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import emailService from './email.js';
import { config } from '../config/env.js';
import { entorno } from './deployInfo.js';
import { limpiarTextoLibre } from '../../shared/seguridad/datosPersonales.js';
import { CATALOGO_DE_PROBLEMAS } from '../../shared/errores/catalogoDeProblemas.js';

/**
 * Aviso al dueño por correo (regla del dueño, 2026-11-11: «cuando salten errores así que me avisen al mail»).
 *
 * Pasó que «al registrarse da error 502» se supo porque una persona lo contó: Didit sin créditos, una tabla que faltaba y el RLS apagado quedaron en el registro del servidor
 * y NADIE los leyó. Esto manda un correo a quienes tienen el rol `owner` cuando algo del servidor falla de verdad (respuestas 5xx, tabla o columna que falta, RLS apagado al
 * arrancar, un servicio de afuera sin crédito).
 *
 * Reglas para que no se convierta en ruido (un correo que se manda todo el tiempo se deja de leer):
 *  - UN correo por problema cada `ENTRE_AVISOS_MS` (6 h): el mismo error de la misma ruta no repite, aunque lo disparen cien personas.
 *  - Tope de `MAXIMO_POR_HORA` correos por hora entre todos los problemas (si cae la base, cada ruta fallaría distinto y llegarían decenas). Lo que no salió se cuenta y se
 *    dice en el próximo correo.
 *  - Nunca tira abajo lo que lo origina: no lanza, no espera (se llama con `void`).
 *  - Los datos personales no salen (CLAUDE.md, regla 6): el texto técnico pasa por `limpiarTextoLibre` (correos y números largos fuera) y no se manda la dirección con su
 *    consulta ni el id de la persona.
 *  - Solo en producción (y staging, que corre como producción y se marca «[STAGING]» en el asunto). En desarrollo y pruebas no manda nada.
 */

export const ENTRE_AVISOS_MS = 6 * 3_600_000;
export const MAXIMO_POR_HORA = 6;

/** Códigos que ya mandan SU PROPIO aviso, más claro: no se duplican con el genérico de «error 5xx». */
export const CODIGOS_CON_AVISO_PROPIO: ReadonlySet<string> = new Set(['VERIFICACION_NO_DISPONIBLE']);

export interface AvisoAlDueno {
  /** Identifica el problema para no repetirlo. Sin datos de personas. */
  clave: string;
  asunto: string;
  /** Qué pasó, en una o dos frases, con palabras simples. */
  quePaso: string;
  /** Qué tiene que hacer quien lo lee. */
  queHacer?: string;
  /** Texto técnico (el mensaje del error). Se limpia de correos y números largos. */
  detalle?: string;
  /** Un código de `shared/errores/catalogoDeProblemas.ts`: el correo enlaza a su guía. */
  codigo?: string;
}

let activo = process.env.NODE_ENV === 'production';
const ultimoPorClave = new Map<string, number>();
let enviadosEnLaHora: number[] = [];
let omitidosDesdeElUltimo = 0;

/** Para las pruebas: enciende o apaga los avisos (por defecto solo están encendidos en producción). */
export function __activarAvisos(valor: boolean): void {
  activo = valor;
}

/** Para las pruebas. */
export function __reiniciarAvisos(): void {
  ultimoPorClave.clear();
  enviadosEnLaHora = [];
  omitidosDesdeElUltimo = 0;
}

const escapar = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `/api/jobs/9ff0c7ff-…/pay` y `/api/jobs/1a2b…/pay` son LA MISMA ruta: los ids se reemplazan para que cuenten como un solo problema. Sin la consulta (puede traer tokens). */
export function rutaSinIds(ruta: string): string {
  return String(ruta ?? '')
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:token');
}

const fechaLegible = (ms: number): string => new Date(ms).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'medium' });

/** Los correos de quienes son dueños. Sin duplicados y sin vacíos. */
async function correosDeLosDuenos(): Promise<string[]> {
  const duenos: Array<{ email?: string | null }> = await User.findAll({ where: { adminRole: { [Op.eq]: 'owner' } } as never, attributes: ['email'] });
  return [...new Set(duenos.map((d) => String(d.email ?? '').trim()).filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)))];
}

function armarCorreo(aviso: AvisoAlDueno, ahora: number, omitidos: number): { html: string; text: string } {
  const detalle = aviso.detalle ? limpiarTextoLibre(aviso.detalle, 400) : '';
  const guia = aviso.codigo && aviso.codigo in CATALOGO_DE_PROBLEMAS ? `${config.clientUrl || 'https://doapparg.com'}/admin/guia-de-errores#${aviso.codigo}` : '';
  const masAvisos = omitidos > 0 ? `Además hubo ${omitidos} aviso${omitidos === 1 ? '' : 's'} de otros problemas que no se mandaron para no llenarte la casilla: mirá el registro del servidor.` : '';

  const text = [
    aviso.quePaso,
    aviso.queHacer ? `\nQué tenés que hacer: ${aviso.queHacer}` : '',
    detalle ? `\nDetalle técnico: ${detalle}` : '',
    guia ? `\nGuía: ${guia}` : '',
    masAvisos ? `\n${masAvisos}` : '',
    `\n${fechaLegible(ahora)} (hora de Argentina). Este aviso no se repite por el mismo problema hasta dentro de ${ENTRE_AVISOS_MS / 3_600_000} horas.`,
  ]
    .filter(Boolean)
    .join('\n');

  const parrafo = (t: string, estilo = '') => `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;${estilo}">${t}</p>`;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border-top:4px solid #dc2626;"><tr><td style="padding:24px 28px;">
${parrafo(`<strong>${escapar(aviso.asunto)}</strong>`, 'font-size:18px;')}
${parrafo(escapar(aviso.quePaso))}
${aviso.queHacer ? parrafo(`<strong>Qué tenés que hacer:</strong> ${escapar(aviso.queHacer)}`) : ''}
${detalle ? `<p style="margin:0 0 14px;padding:10px 12px;background:#f8fafc;border-radius:8px;font-family:Consolas,Menlo,monospace;font-size:12.5px;color:#475569;word-break:break-word;">${escapar(detalle)}</p>` : ''}
${guia ? parrafo(`<a href="${escapar(guia)}" style="color:#0284c7;">Abrir la guía de este problema</a>`) : ''}
${masAvisos ? parrafo(escapar(masAvisos), 'color:#92400e;') : ''}
${parrafo(`${escapar(fechaLegible(ahora))} (hora de Argentina). No se repite por el mismo problema hasta dentro de ${ENTRE_AVISOS_MS / 3_600_000} horas.`, 'font-size:12px;color:#94a3b8;margin:0;')}
</td></tr></table></body></html>`;
  return { html, text };
}

/**
 * Manda el aviso a los dueños si corresponde (encendido, no repetido, bajo el tope por hora). Devuelve si se mandó. No lanza nunca.
 * Se reserva el lugar ANTES de esperar nada: cien errores iguales a la vez mandan un solo correo.
 */
export async function avisarAlDuenoPorCorreo(aviso: AvisoAlDueno, ahora: number = Date.now()): Promise<boolean> {
  try {
    if (!activo) return false;

    const previo = ultimoPorClave.get(aviso.clave);
    if (previo !== undefined && ahora - previo < ENTRE_AVISOS_MS) return false;

    enviadosEnLaHora = enviadosEnLaHora.filter((t) => ahora - t < 3_600_000);
    if (enviadosEnLaHora.length >= MAXIMO_POR_HORA) {
      omitidosDesdeElUltimo++;
      return false;
    }

    ultimoPorClave.set(aviso.clave, ahora);
    enviadosEnLaHora.push(ahora);
    if (ultimoPorClave.size > 300) {
      for (const [k, t] of ultimoPorClave) if (ahora - t >= ENTRE_AVISOS_MS) ultimoPorClave.delete(k);
    }
    const omitidos = omitidosDesdeElUltimo;
    omitidosDesdeElUltimo = 0;

    const destinatarios = await correosDeLosDuenos();
    if (destinatarios.length === 0) {
      console.warn('[aviso al dueño] no hay ningún usuario con rol owner con correo: el aviso no salió.');
      return false;
    }
    const { html, text } = armarCorreo(aviso, ahora, omitidos);
    const prefijo = entorno() === 'staging' ? '[STAGING] ' : '';
    let salio = false;
    for (const to of destinatarios) {
      if (await emailService.sendEmail({ to, subject: `${prefijo}DOAPP: ${aviso.asunto}`.slice(0, 150), html, text })) salio = true;
    }
    if (!salio) {
      // Si no salió, la próxima vez se vuelve a intentar (no se la cuenta como avisada).
      ultimoPorClave.delete(aviso.clave);
      enviadosEnLaHora.pop();
    }
    return salio;
  } catch (e) {
    console.error('[aviso al dueño] no se pudo mandar:', (e as Error).message);
    return false;
  }
}

/** Una respuesta 5xx del servidor: el correo dice qué ruta falló y con qué estado, sin ids ni consulta. No espera ni lanza. */
export function avisarDeUnErrorDelServidor(datos: { metodo: string; ruta: string; estado: number; codigo?: string; mensaje?: string; tecnico?: string }): void {
  if (!activo || datos.estado < 500) return;
  if (datos.codigo && CODIGOS_CON_AVISO_PROPIO.has(datos.codigo)) return;
  const ruta = rutaSinIds(datos.ruta);
  const tiempoAgotado = datos.codigo === 'TIEMPO_AGOTADO';
  void avisarAlDuenoPorCorreo({
    clave: `http:${datos.estado}:${datos.metodo}:${ruta}:${datos.codigo ?? ''}`,
    asunto: tiempoAgotado ? `Un pedido a ${ruta} tardó demasiado` : `Error ${datos.estado} en ${datos.metodo} ${ruta}`,
    quePaso: tiempoAgotado
      ? `Un pedido ${datos.metodo} a ${ruta} no respondió a tiempo y la persona vio un mensaje de «tardó demasiado». Puede ser una consulta lenta o un servicio de afuera que no contesta.`
      : `El servidor respondió ${datos.estado} a un pedido ${datos.metodo} a ${ruta}: la persona que lo hizo vio un error.`,
    queHacer: `Mirá el registro en el servidor: pm2 logs doapp --lines 100 --nostream | grep "HTTP ${datos.estado}". Si el detalle nombra un servicio de afuera (Mercado Pago, Didit, el correo), revisá que tenga crédito y claves vigentes.`,
    detalle: [datos.codigo ? `código ${datos.codigo}` : '', datos.mensaje, datos.tecnico].filter(Boolean).join(' — '),
    codigo: datos.codigo,
  });
}
