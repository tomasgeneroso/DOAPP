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
    /** Fotos, videos y archivos que las partes subieron por dia. */
    adjuntosPorDia: Array<{
      fecha: string;
      archivos: Array<{
        nombre: string;
        tipo: string;
        subidoPor: 'client' | 'worker';
        subidoEl: string;
        url: string;
      }>;
    }>;
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
      // Los adjuntos por dia, con quien los subio y cuando. Es la evidencia mas
      // fuerte del expediente: una foto del avance con fecha no se discute. Se
      // listan con nombre y fecha; el archivo en si se entrega aparte porque el
      // PDF tiene un limite de 10 MB y un video lo supera solo.
      adjuntosPorDia: ((contrato as any).dailyLog || [])
        .filter((d: any) => Array.isArray(d.adjuntos) && d.adjuntos.length > 0)
        .map((d: any) => ({
          fecha: d.date,
          archivos: d.adjuntos.map((a: any) => ({
            nombre: a.nombre,
            tipo: a.tipo,
            subidoPor: a.subidoPor,
            subidoEl: a.subidoEl,
            url: a.url,
          })),
        })),
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

/**
 * El expediente como PDF, que es el unico formato que sirve para presentarlo.
 *
 * MercadoPago acepta .jpg, .png o .pdf, hasta 10 MB. El HTML que genera esta
 * misma clase sirve para leerlo en pantalla, pero no se puede subir: si llega
 * un contracargo y lo unico que hay es un HTML, no hay descargo.
 *
 * Se arma con pdfkit y no imprimiendo el HTML con un navegador headless a
 * proposito. Puppeteer trae un Chromium entero -- unos 300 MB -- y un proceso
 * que hay que mantener vivo, todo para producir un documento de texto con
 * tablas. Ademas fallaria justo cuando mas importa: en un servidor chico, sin
 * las bibliotecas del sistema que Chromium necesita.
 *
 * La conversacion se recorta si es larguisima. Un expediente de 10 MB no lo lee
 * nadie y no entra en el limite; lo que decide un contracargo son los primeros
 * y los ultimos intercambios, no los doscientos del medio.
 */
export interface OpcionesPdf {
  /**
   * Mensajes a incluir ademas de los primeros y ultimos.
   *
   * Se aceptan numeros sueltos y rangos: [3, '40-52', 118]. La numeracion es la
   * que muestra el propio PDF, empezando en 1, para que quien lo lee pueda
   * pedir "incluime del 40 al 52" sin tener que traducir nada.
   */
  mensajesAdicionales?: Array<number | string>;
}

/**
 * Resuelve que indices de mensajes incluir.
 *
 * El recorte por los extremos sirve para el caso comun, pero se come justo lo
 * que a veces decide un contracargo: el mensaje del medio donde el cliente dijo
 * "listo, quedamos asi" o donde aceptó un cambio. Por eso se puede pedir que se
 * agreguen indices o rangos concretos.
 *
 * Devuelve indices base 0 aunque la entrada sea base 1, porque asi los numera
 * el PDF y asi los va a pedir quien lo lea.
 */
export function indicesAIncluir(
  total: number,
  extremos: number,
  adicionales: Array<number | string> = [],
): number[] {
  const set = new Set<number>();

  if (total <= extremos * 2) {
    for (let i = 0; i < total; i++) set.add(i);
  } else {
    for (let i = 0; i < extremos; i++) set.add(i);
    for (let i = total - extremos; i < total; i++) set.add(i);
  }

  for (const pedido of adicionales) {
    const txt = String(pedido).trim();
    const rango = txt.match(/^(\d+)\s*-\s*(\d+)$/);

    if (rango) {
      const desde = Math.max(1, Number(rango[1]));
      const hasta = Math.min(total, Number(rango[2]));
      // Un rango al reves se lee igual en vez de descartarse: quien escribio
      // "52-40" queria los mismos mensajes.
      const a = Math.min(desde, hasta);
      const b = Math.max(desde, hasta);
      for (let i = a; i <= b; i++) set.add(i - 1);
      continue;
    }

    const n = Number(txt);
    if (Number.isInteger(n) && n >= 1 && n <= total) set.add(n - 1);
  }

  return [...set].sort((a, b) => a - b);
}

export async function evidenceToPdf(
  e: ContractEvidence,
  opciones: OpcionesPdf = {},
): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 46, bufferPages: true });
    const trozos: Buffer[] = [];

    doc.on('data', (c: Buffer) => trozos.push(c));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    const TINTA = '#1a1a1a';
    const SUAVE = '#666666';
    const LINEA = '#cccccc';
    const ANCHO = doc.page.width - 92;

    const pesos = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR');
    const fecha = (s: string | null) => (s ? new Date(s).toLocaleString('es-AR') : '—');

    const titulo = (t: string) => {
      if (doc.y > doc.page.height - 130) doc.addPage();
      doc.moveDown(0.9);
      doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(12)
        .text(t.toUpperCase(), { characterSpacing: 0.6 });
      doc.moveTo(46, doc.y + 3).lineTo(46 + ANCHO, doc.y + 3)
        .strokeColor(LINEA).lineWidth(0.7).stroke();
      doc.moveDown(0.55);
    };

    const fila = (etiqueta: string, valor: string) => {
      if (doc.y > doc.page.height - 70) doc.addPage();
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(SUAVE).text(etiqueta, 46, y, { width: 155 });
      doc.font('Helvetica').fontSize(9).fillColor(TINTA)
        .text(valor || '—', 205, y, { width: ANCHO - 159 });
      doc.moveDown(0.28);
    };

    // ---------- Carátula ----------
    doc.font('Helvetica-Bold').fontSize(19).fillColor(TINTA).text('Expediente de contrato');
    doc.font('Helvetica').fontSize(9.5).fillColor(SUAVE)
      .text('DOAPP · Documento generado automáticamente para su presentación ante entidades de pago');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE)
      .text('Contrato ' + e.contrato.id)
      .text('Generado el ' + fecha(e.generadoEn));

    titulo('Contrato');
    fila('Estado', e.contrato.estado);
    fila('Precio acordado', pesos(e.contrato.precio));
    fila('Comisión de la plataforma', pesos(e.contrato.comision));
    fila('Total abonado por el cliente', pesos(e.contrato.total));
    fila('Estado de la custodia', e.contrato.estadoEscrow);
    fila('Inicio', fecha(e.contrato.inicio));
    fila('Fin', fecha(e.contrato.fin));
    fila('Confirmado por el cliente', e.contrato.confirmoCliente ? 'Sí' : 'No');
    fila('Confirmado por el trabajador', e.contrato.confirmoTrabajador ? 'Sí' : 'No');
    // Las marcas diarias son la prueba mas fuerte de que el trabajo ocurrio:
    // son muchos registros fechados, no una sola declaracion al final.
    fila(
      'Días registrados como trabajados',
      e.contrato.diasConfirmados + ' confirmados por el cliente y ' +
        e.contrato.diasMarcadosPorTrabajador + ' marcados por el trabajador, sobre ' +
        e.contrato.diasTotales + ' días',
    );

    if (e.contrato.adjuntosPorDia?.length) {
      // Va antes que la conversacion a proposito: es lo primero que un mediador
      // quiere ver. Una lista de fotos fechadas, con autor, pesa mas que cien
      // mensajes.
      titulo('Evidencia del avance, por día');
      const quien = { client: 'el cliente', worker: 'el trabajador' } as const;
      for (const dia of e.contrato.adjuntosPorDia) {
        for (const a of dia.archivos) {
          fila(
            fecha(dia.fecha).slice(0, 10) + ' · ' + (quien[a.subidoPor] || a.subidoPor),
            a.nombre + ' (' + a.tipo + ') · subido el ' + fecha(a.subidoEl),
          );
        }
      }
      doc.moveDown(0.2);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(SUAVE).text(
        'Los archivos se adjuntan por separado a este expediente. Este listado acredita su existencia, autor y fecha de carga.',
        { width: ANCHO },
      );
    }

    if (e.trabajo) {
      titulo('Trabajo contratado');
      fila('Título', e.trabajo.titulo);
      fila('Categoría', e.trabajo.categoria);
      fila('Ubicación', e.trabajo.ubicacion || '—');
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9).fillColor(TINTA)
        .text(String(e.trabajo.descripcion || '').slice(0, 1200), 46, doc.y, {
          width: ANCHO,
          align: 'justify',
        });
    }

    const parte = (rotulo: string, p: PartyInfo | null) => {
      if (!p) return;
      titulo(rotulo);
      fila('Nombre', p.nombre);
      fila('Correo', p.email);
      fila('Identidad verificada', p.documentoVerificado ? 'Sí' : 'No');
      fila('Trabajos completados', String(p.trabajosCompletados));
      fila('Registrado desde', fecha(p.registrado));
    };
    parte('Cliente', e.cliente);
    parte('Trabajador', e.trabajador);

    if (e.pagos.length) {
      titulo('Pagos');
      for (const p of e.pagos) {
        fila(
          fecha(p.fecha),
          pesos(p.monto) + ' · ' + p.tipo + ' · ' + p.estado +
            (p.idExterno ? ' · ref ' + p.idExterno : ''),
        );
      }
    }

    if (e.movimientos.length) {
      titulo('Movimientos de dinero');
      for (const m of e.movimientos) {
        fila(
          fecha(m.fecha),
          m.tipo + ' · ' + pesos(m.monto) + ' · ' + m.estado +
            (m.referencia ? ' · ' + m.referencia : ''),
        );
      }
    }

    if (e.disputa) {
      titulo('Disputa');
      fila('Estado', e.disputa.estado);
      fila('Categoría', e.disputa.categoria);
      fila('Iniciada por', e.disputa.iniciadaPor);
      fila('Abierta el', fecha(e.disputa.abierta));
      fila('Resolución', e.disputa.resolucion || 'Sin resolver');
    }

    if (e.conversacion.length) {
      // Se conservan los primeros y los ultimos, mas los que se hayan pedido
      // expresamente: el principio muestra que se acordo, el final como
      // termino, y en el medio puede estar el mensaje que decide el caso.
      const EXTREMOS = 60;
      const total = e.conversacion.length;
      const indices = indicesAIncluir(total, EXTREMOS, opciones.mensajesAdicionales);
      const omitidos = total - indices.length;

      titulo('Conversación (' + total + ' mensajes)');

      if (omitidos > 0) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(SUAVE).text(
          'Se incluyen ' + indices.length + ' de ' + total + ' mensajes: los primeros y ' +
            'últimos ' + EXTREMOS +
            (opciones.mensajesAdicionales?.length ? ', más los seleccionados expresamente' : '') +
            '. Los ' + omitidos + ' restantes están disponibles a pedido.',
          { width: ANCHO },
        );
        doc.moveDown(0.4);
      }

      let anterior = -1;
      for (const i of indices) {
        const m = e.conversacion[i];
        if (doc.y > doc.page.height - 82) doc.addPage();

        // Se marca donde hay un salto. Una conversacion que pasa del mensaje 60
        // al 118 sin decirlo parece manipulada; decirlo la vuelve creible.
        if (anterior >= 0 && i > anterior + 1) {
          doc.font('Helvetica-Oblique').fontSize(8).fillColor(SUAVE)
            .text('· · · ' + (i - anterior - 1) + ' mensajes no incluidos · · ·', 46, doc.y, {
              width: ANCHO,
              align: 'center',
            });
          doc.moveDown(0.35);
        }
        anterior = i;

        doc.font('Helvetica-Bold').fontSize(8).fillColor(SUAVE)
          .text('#' + (i + 1) + ' · ' + fecha(m.fecha) + ' · ' + m.de, 46, doc.y, { width: ANCHO });
        doc.font('Helvetica').fontSize(9).fillColor(TINTA)
          .text(String(m.mensaje || '').slice(0, 700), 46, doc.y, { width: ANCHO });
        doc.moveDown(0.42);
      }
    }

    if (e.faltantes.length) {
      // Se dice lo que falta en vez de callarlo. Un expediente que omite en
      // silencio pierde credibilidad entera si el otro lado lo nota.
      titulo('Información no incluida');
      for (const f of e.faltantes) {
        doc.font('Helvetica').fontSize(9).fillColor(SUAVE).text('· ' + f, { width: ANCHO });
      }
    }

    // Numeracion en todas las paginas: un expediente sin numerar es imposible
    // de citar cuando alguien discute un punto concreto.
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
      doc.switchToPage(rango.start + i);
      doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE).text(
        'DOAPP · Contrato ' + e.contrato.id + ' · Página ' + (i + 1) + ' de ' + rango.count,
        46,
        doc.page.height - 34,
        { width: ANCHO, align: 'center' },
      );
    }

    doc.end();
  });
}
