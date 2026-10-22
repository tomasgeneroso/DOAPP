/**
 * Escribirle a soporte sobre un contrato o un usuario: reportar un problema o dejar una sugerencia.
 *
 * Regla del dueño: SIEMPRE se puede, sin importar el estado. Un contrato pendiente, cancelado, rechazado, en disputa o terminado se reporta igual; un
 * usuario suspendido, sin verificar o dado de baja también. El reclamo con intervención de DOAPP (la disputa) es otra cosa y sí depende del estado y del
 * pago (ver pagos/modoDePago.ts): acá no hay ninguna condición.
 *
 * Servidor, web y app leen de este archivo para que lo que se manda y lo que se acepta no diverjan. Divergió: el modal de reporte de perfiles mandaba
 * `description` y la categoría `abuse`, que el servidor no conoce, y ningún reporte de usuario llegó nunca; y el formulario del ticket mandaba
 * `relatedContractId`, que el servidor ignoraba, así que soporte no sabía de qué contrato hablaban.
 */

export const CATEGORIAS_DE_TICKET = ['bug', 'feature', 'support', 'report_user', 'report_contract', 'dispute', 'payment', 'other'] as const;

export type CategoriaDeTicket = (typeof CATEGORIAS_DE_TICKET)[number];

export const esCategoriaDeTicket = (v: unknown): v is CategoriaDeTicket => typeof v === 'string' && (CATEGORIAS_DE_TICKET as readonly string[]).includes(v);

export type TipoDeReporte = 'problema' | 'sugerencia';
export type SobreQue = 'contrato' | 'usuario';

export const esTipoDeReporte = (v: unknown): v is TipoDeReporte => v === 'problema' || v === 'sugerencia';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Un problema usa la categoría del contrato o del usuario; una sugerencia, la de sugerencias (`feature`) y lleva la etiqueta «sugerencia». */
export function categoriaDelReporte(sobre: SobreQue, tipo: TipoDeReporte): CategoriaDeTicket {
  if (tipo === 'sugerencia') return 'feature';
  return sobre === 'contrato' ? 'report_contract' : 'report_user';
}

export function asuntoDelReporte(sobre: SobreQue, tipo: TipoDeReporte, nombre?: string | null): string {
  const cosa = sobre === 'contrato' ? 'el contrato' : 'el usuario';
  const base = tipo === 'sugerencia' ? `Sugerencia sobre ${cosa}` : sobre === 'contrato' ? 'Problema con el contrato' : 'Reporte de usuario';
  return (nombre ? `${base}: ${nombre}` : base).slice(0, 200);
}

/** El arranque del mensaje: a qué se refiere el reporte, para que soporte lo encuentre aunque el texto no lo diga. */
export function mensajeInicialDelReporte(p: { sobre: SobreQue; tipo: TipoDeReporte; contratoId?: string | null; usuarioId?: string | null; nombre?: string | null }): string {
  const lineas: string[] = [];
  if (p.contratoId) lineas.push(`Referencia: Contrato ID ${p.contratoId}`);
  if (p.usuarioId) lineas.push(`Referencia: Usuario ID ${p.usuarioId}`);
  if (p.nombre) lineas.push(`${p.sobre === 'contrato' ? 'Trabajo' : 'Nombre'}: ${p.nombre}`);
  lineas.push('', p.tipo === 'sugerencia' ? 'Contanos tu sugerencia:' : 'Contanos qué pasó:', '');
  return lineas.join('\n');
}

export interface ReporteDeSoporte {
  subject: string;
  category: CategoriaDeTicket;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  message: string;
  relatedContract?: string;
  relatedUser?: string;
  tags: string[];
}

/**
 * El cuerpo completo de `POST /api/tickets` para un reporte sobre un contrato y/o un usuario. `detalle` es lo que escribió la persona; si no hay,
 * queda el arranque con la referencia para que lo complete.
 */
export function armarReporte(p: {
  sobre: SobreQue;
  tipo?: TipoDeReporte;
  contratoId?: string | null;
  usuarioId?: string | null;
  nombre?: string | null;
  detalle?: string | null;
  prioridad?: ReporteDeSoporte['priority'];
}): ReporteDeSoporte {
  const tipo = p.tipo ?? 'problema';
  const inicio = mensajeInicialDelReporte({ sobre: p.sobre, tipo, contratoId: p.contratoId, usuarioId: p.usuarioId, nombre: p.nombre });
  return {
    subject: asuntoDelReporte(p.sobre, tipo, p.nombre),
    category: categoriaDelReporte(p.sobre, tipo),
    priority: p.prioridad ?? 'medium',
    message: p.detalle?.trim() ? `${inicio.trimEnd()}\n${p.detalle.trim()}` : inicio,
    ...(esUuid(p.contratoId) ? { relatedContract: p.contratoId } : {}),
    ...(esUuid(p.usuarioId) ? { relatedUser: p.usuarioId } : {}),
    tags: tipo === 'sugerencia' ? ['sugerencia'] : [],
  };
}

/** Adónde mandar a la persona para escribirle a soporte sobre un contrato o un usuario (formulario del ticket, con todo precargado). */
export function rutaParaReportar(p: { sobre: SobreQue; tipo?: TipoDeReporte; contratoId?: string | null; usuarioId?: string | null; trabajoId?: string | null; nombre?: string | null }): string {
  const q = new URLSearchParams();
  q.set('type', categoriaDelReporte(p.sobre, 'problema'));
  if (p.tipo === 'sugerencia') q.set('tipo', 'sugerencia');
  if (p.contratoId) q.set('contractId', p.contratoId);
  if (p.usuarioId) q.set('userId', p.usuarioId);
  if (p.trabajoId) q.set('jobId', p.trabajoId);
  if (p.nombre) q.set('nombre', p.nombre);
  return `/tickets/new?${q.toString()}`;
}
