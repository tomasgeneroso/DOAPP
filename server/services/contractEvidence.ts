import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { PaymentAction } from '../models/sql/PaymentAction.model.js';
import { Dispute } from '../models/sql/Dispute.model.js';
import { ChatMessage } from '../models/sql/ChatMessage.model.js';
import { Conversation } from '../models/sql/Conversation.model.js';
import { Op } from 'sequelize';
import { buildDailyLog } from './dailyLog.js';

/**
 * El expediente completo de un contrato, en un solo lugar.
 *
 * Existe para dos momentos concretos, y los dos son caros:
 *
 *   Una disputa -- el admin necesita ver todo junto para decidir, no ir
 *   saltando entre cinco pantallas.
 *
 *   Un contracargo -- el emisor de la tarjeta pide evidencia de que el
 *   servicio se presto. Mercado Pago acepta documentacion, y la calidad de
 *   ese paquete decide si el contracargo se gana o se pierde. Armarlo a mano
 *   con la plata ya debitada es tarde.
 *
 * Se arma con lo que la plataforma ya sabe: quienes son las partes, que se
 * acordo, quien confirmo que y cuando, cuanta plata se movio y a donde, y la
 * conversacion entre ambos. Nada se pide aparte.
 */

export interface ContractEvidence {
  generadoEn: string;
  contrato: {
    id: string;
    estado: string;
    precio: number;
    comision: number;
    total: number;
    estadoEscrow: string;
    estadoPago: string;
    inicio: string | null;
    fin: string | null;
    creado: string;
    codigoEmparejamiento: string | null;
    confirmoCliente: boolean;
    confirmoTrabajador: boolean;
    ampliaciones: any[];
    /** Dias que las partes marcaron como trabajados. */
    diasConfirmados: number;
    diasMarcadosPorTrabajador: number;
    diasTotales: number;
  };
  trabajo: {
    id: string;
    titulo: string;
    descripcion: string;
    categoria: string;
    ubicacion: string | null;
    precioPublicado: number;
  } | null;
  cliente: PartyInfo | null;
  trabajador: PartyInfo | null;
  pagos: Array<{
    id: string;
    fecha: string;
    tipo: string;
    metodo: string;
    estado: string;
    monto: number;
    comision: number;
    idExterno: string | null;
  }>;
  movimientos: Array<{
    tipo: string;
    estado: string;
    monto: number;
    proveedor: string;
    referencia: string | null;
    fecha: string;
  }>;
  disputa: {
    id: string;
    estado: string;
    categoria: string;
    iniciadaPor: string;
    abierta: string;
    resolucion: string | null;
    tipoResolucion: string | null;
    mensajes: number;
    adjuntos: number;
  } | null;
  conversacion: Array<{
    fecha: string;
    de: string;
    mensaje: string;
    tipo: string;
  }>;
  /** Lo que no se pudo incluir, dicho explicitamente. */
  faltantes: string[];
}

interface PartyInfo {
  id: string;
  nombre: string;
  email: string;
  documentoVerificado: boolean;
  puntuacion: number;
  trabajosCompletados: number;
  registrado: string;
}

const iso = (d: any) => (d ? new Date(d).toISOString() : null);
const num = (n: any) => Math.round((Number(n) || 0) * 100) / 100;

function party(u: any): PartyInfo | null {
  if (!u) return null;
  return {
    id: u.id,
    nombre: u.name,
    email: u.email,
    documentoVerificado: Boolean(u.isVerified),
    puntuacion: num(u.rating),
    trabajosCompletados: Number(u.completedJobs) || 0,
    registrado: iso(u.createdAt) || '',
  };
}

export async function buildContractEvidence(contractId: string): Promise<ContractEvidence | null> {
  const contrato = await Contract.findByPk(contractId, {
    include: [
      { model: Job, as: 'job', required: false },
      { model: User, as: 'client', required: false },
      { model: User, as: 'doer', required: false },
    ],
  });

  if (!contrato) return null;

  const faltantes: string[] = [];

  // Cada consulta va por separado y tolera fallar: un expediente incompleto
  // sirve, uno que no se genera porque falto una tabla no sirve para nada.
  const [pagos, movimientos, disputa] = await Promise.all([
    Payment.findAll({ where: { contractId }, order: [['createdAt', 'ASC']] }).catch(() => {
      faltantes.push('No se pudieron leer los pagos.');
      return [];
    }),
    PaymentAction.findAll({ where: { contractId }, order: [['createdAt', 'ASC']] }).catch(() => {
      faltantes.push('No se pudieron leer los movimientos de dinero.');
      return [];
    }),
    Dispute.findOne({ where: { contractId }, order: [['createdAt', 'DESC']] }).catch(() => {
      faltantes.push('No se pudo leer la disputa.');
      return null;
    }),
  ]);

  // El chat cuelga del trabajo, no del contrato.
  let conversacion: ContractEvidence['conversacion'] = [];
  try {
    const conv = await Conversation.findOne({ where: { jobId: (contrato as any).jobId } });
    if (conv) {
      const msgs = await ChatMessage.findAll({
        where: { conversationId: conv.id },
        order: [['createdAt', 'ASC']],
        limit: 500,
      });
      const nombres = new Map<string, string>([
        [(contrato as any).clientId, (contrato as any).client?.name || 'Cliente'],
        [(contrato as any).doerId, (contrato as any).doer?.name || 'Trabajador'],
      ]);
      conversacion = msgs.map((m: any) => ({
        fecha: iso(m.createdAt) || '',
        de: nombres.get(String(m.senderId)) || 'Sistema',
        // Los mensajes de sistema usan || como separador de titulo y cuerpo.
        mensaje: String(m.message || '').replace(/\|\|/g, ' — '),
        tipo: m.type || 'text',
      }));
      if (msgs.length >= 500) faltantes.push('La conversación tiene más de 500 mensajes; se incluyen los primeros 500.');
    } else {
      faltantes.push('No hay conversación asociada a este trabajo.');
    }
  } catch {
    faltantes.push('No se pudo leer la conversación.');
  }

  const control = buildDailyLog(contrato, 'client');
  const job = (contrato as any).job;

  return {
    generadoEn: new Date().toISOString(),
    contrato: {
      id: contrato.id,
      estado: contrato.status,
      precio: num(contrato.price),
      comision: num(contrato.commission),
      total: num((contrato as any).totalPrice),
      estadoEscrow: (contrato as any).escrowStatus || '',
      estadoPago: (contrato as any).paymentStatus || '',
      inicio: iso((contrato as any).startDate),
      fin: iso((contrato as any).endDate),
      creado: iso((contrato as any).createdAt) || '',
      codigoEmparejamiento: (contrato as any).pairingCode || null,
      confirmoCliente: Boolean((contrato as any).clientConfirmed),
      confirmoTrabajador: Boolean((contrato as any).doerConfirmed),
      ampliaciones: (contrato as any).extensionHistory || [],
      // El control diario. En un contracargo pesa: un contrato donde el
      // cliente marco doce dias como trabajados es dificil de desconocer.
      diasConfirmados: control.confirmados,
      diasMarcadosPorTrabajador: control.dias.filter((d) => d.marcoTrabajador).length,
      diasTotales: control.total,
    },
    trabajo: job
      ? {
          id: job.id,
          titulo: job.title,
          descripcion: job.description,
          categoria: job.category,
          ubicacion: job.location || null,
          precioPublicado: num(job.price),
        }
      : null,
    cliente: party((contrato as any).client),
    trabajador: party((contrato as any).doer),
    pagos: (pagos as any[]).map((p) => ({
      id: p.id,
      fecha: iso(p.createdAt) || '',
      tipo: p.paymentType,
      metodo: p.paymentMethod,
      estado: p.status,
      monto: num(p.amount),
      comision: num(p.platformFee),
      idExterno: p.mercadopagoPaymentId || p.paypalOrderId || null,
    })),
    movimientos: (movimientos as any[]).map((a) => ({
      tipo: a.actionType,
      estado: a.status,
      monto: num(a.amount),
      proveedor: a.provider,
      referencia: a.providerResourceId || null,
      fecha: iso(a.createdAt) || '',
    })),
    disputa: disputa
      ? {
          id: (disputa as any).id,
          estado: (disputa as any).status,
          categoria: (disputa as any).category,
          iniciadaPor:
            String((disputa as any).initiatedBy) === String((contrato as any).clientId)
              ? 'Cliente'
              : 'Trabajador',
          abierta: iso((disputa as any).createdAt) || '',
          resolucion: (disputa as any).resolution || null,
          tipoResolucion: (disputa as any).resolutionType || null,
          mensajes: ((disputa as any).messages || []).length,
          adjuntos: ((disputa as any).evidence || []).length,
        }
      : null,
    conversacion,
    faltantes,
  };
}

/**
 * El mismo expediente como HTML imprimible.
 *
 * En HTML y no en PDF armado a mano porque el navegador ya sabe paginar e
 * imprimir a PDF, y porque asi se puede leer en pantalla antes de mandarlo.
 * El destinatario de esto suele ser una persona en un banco leyendo rapido:
 * lo que importa es que se entienda, no que sea bonito.
 */
export function evidenceToHtml(e: ContractEvidence): string {
  const esc = (v: any) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const ars = (n: number) => 'ARS $' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });
  const fecha = (s: string | null) => (s ? new Date(s).toLocaleString('es-AR') : '—');
  const si = (b: boolean) => (b ? 'Sí' : 'No');

  const fila = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;

  const partes = (p: PartyInfo | null, rol: string) =>
    p
      ? `<h3>${rol}</h3><table>
        ${fila('Nombre', esc(p.nombre))}
        ${fila('Email', esc(p.email))}
        ${fila('Identidad verificada', si(p.documentoVerificado))}
        ${fila('Puntuación', String(p.puntuacion))}
        ${fila('Registrado', fecha(p.registrado))}
      </table>`
      : `<h3>${rol}</h3><p class="falta">Sin datos.</p>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Expediente del contrato ${esc(e.contrato.id.slice(0, 8))}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #14181d; max-width: 46rem; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.5; }
  h1 { font-size: 1.5rem; margin-bottom: .2rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 2px solid #14181d; padding-bottom: .3rem; }
  h3 { font-size: .95rem; margin: 1.2rem 0 .4rem; }
  table { width: 100%; border-collapse: collapse; font-size: .88rem; margin-bottom: .8rem; }
  th, td { text-align: left; padding: .35rem .6rem; border-bottom: 1px solid #e2e6e5; vertical-align: top; }
  th { width: 38%; font-weight: 600; color: #5c6670; }
  .meta { color: #5c6670; font-size: .82rem; margin-top: 0; }
  .falta { color: #a03a44; font-size: .85rem; }
  .chat { font-size: .82rem; }
  .chat div { padding: .3rem 0; border-bottom: 1px solid #f0f2f1; }
  .chat b { color: #1f6f63; }
  @media print { body { margin: 0; max-width: none; } h2 { break-after: avoid; } }
</style></head><body>

<h1>Expediente del contrato</h1>
<p class="meta">${esc(e.contrato.id)} · generado el ${fecha(e.generadoEn)}</p>

<h2>El trabajo acordado</h2>
${
  e.trabajo
    ? `<table>
    ${fila('Título', esc(e.trabajo.titulo))}
    ${fila('Categoría', esc(e.trabajo.categoria))}
    ${fila('Ubicación', esc(e.trabajo.ubicacion || '—'))}
    ${fila('Descripción', esc(e.trabajo.descripcion))}
  </table>`
    : '<p class="falta">El trabajo asociado ya no existe.</p>'
}

<h2>Las partes</h2>
${partes(e.cliente, 'Cliente')}
${partes(e.trabajador, 'Trabajador')}

<h2>El contrato</h2>
<table>
  ${fila('Estado', esc(e.contrato.estado))}
  ${fila('Precio del trabajo', ars(e.contrato.precio))}
  ${fila('Comisión de la plataforma', ars(e.contrato.comision))}
  ${fila('Total', ars(e.contrato.total))}
  ${fila('Inicio', fecha(e.contrato.inicio))}
  ${fila('Fin', fecha(e.contrato.fin))}
  ${fila('Código de emparejamiento', esc(e.contrato.codigoEmparejamiento || '—'))}
  ${fila('El cliente confirmó', si(e.contrato.confirmoCliente))}
  ${fila('El trabajador confirmó', si(e.contrato.confirmoTrabajador))}
  ${fila('Ampliaciones', String(e.contrato.ampliaciones.length))}
  ${fila(
    'Días marcados como trabajados',
    `${e.contrato.diasConfirmados} confirmados por el cliente, de ${e.contrato.diasTotales} · ${e.contrato.diasMarcadosPorTrabajador} marcados por el trabajador`,
  )}
</table>

<h2>Movimientos de dinero</h2>
${
  e.pagos.length
    ? `<table><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Estado</th></tr>${e.pagos
        .map(
          (p) =>
            `<tr><td>${fecha(p.fecha)}</td><td>${esc(p.tipo)} (${esc(p.metodo)})${
              p.idExterno ? `<br><small>${esc(p.idExterno)}</small>` : ''
            }</td><td>${ars(p.monto)}</td><td>${esc(p.estado)}</td></tr>`,
        )
        .join('')}</table>`
    : '<p class="falta">Sin pagos registrados.</p>'
}
${
  e.movimientos.length
    ? `<h3>Pagos y devoluciones ejecutados</h3><table><tr><th>Fecha</th><th>Operación</th><th>Monto</th><th>Estado</th></tr>${e.movimientos
        .map(
          (m) =>
            `<tr><td>${fecha(m.fecha)}</td><td>${esc(m.tipo)}${
              m.referencia ? `<br><small>${esc(m.referencia)}</small>` : ''
            }</td><td>${ars(m.monto)}</td><td>${esc(m.estado)}</td></tr>`,
        )
        .join('')}</table>`
    : ''
}

${
  e.disputa
    ? `<h2>Disputa</h2><table>
    ${fila('Estado', esc(e.disputa.estado))}
    ${fila('Categoría', esc(e.disputa.categoria))}
    ${fila('Iniciada por', esc(e.disputa.iniciadaPor))}
    ${fila('Abierta el', fecha(e.disputa.abierta))}
    ${fila('Resolución', esc(e.disputa.resolucion || 'Sin resolver'))}
    ${fila('Mensajes / adjuntos', `${e.disputa.mensajes} / ${e.disputa.adjuntos}`)}
  </table>`
    : ''
}

<h2>Conversación entre las partes</h2>
${
  e.conversacion.length
    ? `<div class="chat">${e.conversacion
        .map(
          (m) =>
            `<div><b>${esc(m.de)}</b> · ${fecha(m.fecha)}<br>${esc(m.mensaje)}</div>`,
        )
        .join('')}</div>`
    : '<p class="falta">Sin mensajes.</p>'
}

${
  e.faltantes.length
    ? `<h2>Qué no se pudo incluir</h2><ul class="falta">${e.faltantes
        .map((f) => `<li>${esc(f)}</li>`)
        .join('')}</ul>`
    : ''
}

</body></html>`;
}
