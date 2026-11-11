/**
 * Qué se avisa, y a quién, cuando cambia cada tipo de dato. Ver `avisosEnVivo.ts` para el porqué.
 *
 * Eventos que la web y la app ya entendían (`contract:updated`, `contracts:refresh`, `job:updated`, `myjobs:refresh`, `proposal:updated`, `dashboard:refresh`,
 * `notification:new`, `message:new`) conservan su forma: `contract:updated` trae `contractId`, `job:updated` trae `jobId`. Los nuevos:
 * - `balance:updated`      cambió el saldo o un pago de la persona (pantalla de saldo, retiros, panel).
 * - `withdrawal:updated`   cambió un pedido de retiro suyo.
 * - `payment:updated`      cambió un pago en el que participa.
 * - `dispute:updated`      cambió un reclamo de un contrato suyo.
 * - `chat:actualizado`     hay un mensaje o una conversación nueva/cambiada (lista de chats y contador de no leídos).
 * - `notifications:refresh` cambiaron sus notificaciones sin ser nuevas (leídas desde otra pestaña).
 * - `admin:cambio`         a la sala de administración: algo de dinero, contratos, trabajos o reclamos cambió (las pantallas de administración recargan).
 */
import { conSistema } from '../db/contextoRls.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { WithdrawalRequest } from '../models/sql/WithdrawalRequest.model.js';
import { Dispute } from '../models/sql/Dispute.model.js';
import { ContractCancellationRequest } from '../models/sql/ContractCancellationRequest.model.js';
import { ContractChangeRequest } from '../models/sql/ContractChangeRequest.model.js';
import { RefundRequest } from '../models/sql/RefundRequest.model.js';
import { Quote } from '../models/sql/Quote.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { ChatMessage } from '../models/sql/ChatMessage.model.js';
import { Conversation } from '../models/sql/Conversation.model.js';
import { User } from '../models/sql/User.model.js';
import { Ticket } from '../models/sql/Ticket.model.js';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import { BannedIdentity } from '../models/sql/BannedIdentity.model.js';
import { FamilyCode } from '../models/sql/FamilyCode.model.js';
import { EmailTemplate } from '../models/sql/EmailTemplate.model.js';
import { EmailAudience } from '../models/sql/EmailAudience.model.js';
import { EmailCampaign } from '../models/sql/EmailCampaign.model.js';
import { InfluencerInvite } from '../models/sql/InfluencerInvite.model.js';
import { BlogPost } from '../models/sql/BlogPost.model.js';
import { engancharFuente, SALA_DE_ADMINISTRACION, type Aviso, type Fuente } from './avisosEnVivo.js';

type Fila = Record<string, any>;

/** Quiénes participan de un contrato (un reclamo, un pedido de cambio o de cancelación sólo conocen su contrato). */
async function participantesDelContrato(contractId: unknown): Promise<{ clientId?: string; doerId?: string; jobId?: string }> {
  if (!contractId) return {};
  const c = await conSistema(() => Contract.findByPk(String(contractId), { attributes: ['id', 'clientId', 'doerId', 'jobId'], raw: true }));
  return (c as unknown as Fila) ?? {};
}

const delAdministrador = (tipo: string, id: unknown): Aviso => ({ sala: SALA_DE_ADMINISTRACION, evento: 'admin:cambio', datos: { tipo, id: id ? String(id) : undefined } });

/** Lo que cambia para las dos partes cuando se mueve un contrato (o algo que cuelga de él). */
function avisosDeContrato(contractId: string, partes: { clientId?: string; doerId?: string; jobId?: string }, extra: Record<string, unknown> = {}): Aviso[] {
  const usuarios = [partes.clientId, partes.doerId];
  return [
    { usuarios, evento: 'contract:updated', datos: { contractId, jobId: partes.jobId, ...extra }, clave: contractId },
    { usuarios, evento: 'contracts:refresh', datos: { contractId } },
    { usuarios, evento: 'dashboard:refresh' },
    { usuarios: [partes.clientId], evento: 'myjobs:refresh', datos: { jobId: partes.jobId } },
    // El trabajo se muestra con sus contratos: si el contrato cambia, la pantalla del trabajo se entera.
    { usuarios, evento: 'job:updated', datos: { jobId: partes.jobId }, clave: partes.jobId },
  ];
}

const CONTRATOS: Fuente = {
  modelo: Contract as never,
  columnas: ['id', 'clientId', 'doerId', 'jobId', 'status'],
  avisos: (c: Fila) => [
    ...avisosDeContrato(String(c.id), c, { status: c.status }),
    delAdministrador('contract', c.id),
  ],
};

const TRABAJOS: Fuente = {
  modelo: Job as never,
  columnas: ['id', 'clientId', 'selectedWorkers', 'status'],
  avisos: (j: Fila) => {
    const usuarios = [j.clientId, ...(Array.isArray(j.selectedWorkers) ? j.selectedWorkers : [])];
    return [
      { usuarios, evento: 'job:updated', datos: { jobId: String(j.id), status: j.status }, clave: String(j.id) },
      { usuarios: [j.clientId], evento: 'myjobs:refresh', datos: { jobId: String(j.id) } },
      { usuarios, evento: 'dashboard:refresh' },
      delAdministrador('job', j.id),
    ];
  },
};

const PROPUESTAS: Fuente = {
  modelo: Proposal as never,
  columnas: ['id', 'jobId', 'freelancerId', 'clientId', 'status'],
  avisos: (p: Fila) => [
    { usuarios: [p.freelancerId, p.clientId], evento: 'proposal:updated', datos: { proposalId: String(p.id), jobId: p.jobId, status: p.status }, clave: String(p.id) },
    { usuarios: [p.clientId], evento: 'myjobs:refresh', datos: { jobId: p.jobId } },
    { usuarios: [p.freelancerId, p.clientId], evento: 'dashboard:refresh' },
  ],
};

const COTIZACIONES: Fuente = {
  modelo: Quote as never,
  columnas: ['id', 'senderId', 'recipientId', 'jobId'],
  avisos: (q: Fila) => [
    { usuarios: [q.senderId, q.recipientId], evento: 'proposal:updated', datos: { quoteId: String(q.id), jobId: q.jobId }, clave: `q${q.id}` },
    { usuarios: [q.senderId, q.recipientId], evento: 'myjobs:refresh', datos: { jobId: q.jobId } },
  ],
};

const PAGOS: Fuente = {
  modelo: Payment as never,
  columnas: ['id', 'payerId', 'recipientId', 'contractId', 'status'],
  avisos: async (p: Fila) => {
    const usuarios = [p.payerId, p.recipientId];
    const avisos: Aviso[] = [
      { usuarios, evento: 'payment:updated', datos: { paymentId: String(p.id), contractId: p.contractId, status: p.status }, clave: String(p.id) },
      { usuarios, evento: 'balance:updated' },
      { usuarios, evento: 'dashboard:refresh' },
      delAdministrador('payment', p.id),
    ];
    // La pantalla del contrato muestra sus pagos (garantía, liberación): se entera del cambio.
    if (p.contractId) avisos.push(...avisosDeContrato(String(p.contractId), await participantesDelContrato(p.contractId)));
    return avisos;
  },
};

const ASIENTOS_DE_SALDO: Fuente = {
  modelo: BalanceTransaction as never,
  columnas: ['id', 'userId'],
  avisos: (b: Fila) => [
    { usuarios: [b.userId], evento: 'balance:updated', datos: { transactionId: String(b.id) } },
    { usuarios: [b.userId], evento: 'dashboard:refresh' },
  ],
};

const RETIROS: Fuente = {
  modelo: WithdrawalRequest as never,
  columnas: ['id', 'userId', 'status'],
  avisos: (r: Fila) => [
    { usuarios: [r.userId], evento: 'withdrawal:updated', datos: { withdrawalId: String(r.id), status: r.status }, clave: String(r.id) },
    { usuarios: [r.userId], evento: 'balance:updated' },
    { usuarios: [r.userId], evento: 'dashboard:refresh' },
    delAdministrador('withdrawal', r.id),
  ],
};

/** Pedido de reembolso de un pago por transferencia: el cliente ve cómo va en su lista de pagos y el equipo ve aparecer el pedido en «Pedidos de reembolso». */
const PEDIDOS_DE_REEMBOLSO: Fuente = {
  modelo: RefundRequest as never,
  columnas: ['id', 'paymentId', 'requestedBy', 'status'],
  avisos: (r: Fila) => [
    { usuarios: [r.requestedBy], evento: 'payment:updated', datos: { paymentId: String(r.paymentId), status: r.status }, clave: String(r.paymentId) },
    { usuarios: [r.requestedBy], evento: 'dashboard:refresh' },
    delAdministrador('refund', r.id),
  ],
};

/** Reclamos, pedidos de cancelación y pedidos de cambio de un contrato: las dos partes los ven aparecer y resolverse al instante. */
const cuelgaDelContrato = (modelo: unknown, tipo: string, evento: string): Fuente => ({
  modelo: modelo as never,
  columnas: ['id', 'contractId', 'status'],
  avisos: async (f: Fila) => {
    const partes = await participantesDelContrato(f.contractId);
    return [
      { usuarios: [partes.clientId, partes.doerId], evento, datos: { [`${tipo}Id`]: String(f.id), contractId: f.contractId, status: f.status }, clave: String(f.id) },
      ...(f.contractId ? avisosDeContrato(String(f.contractId), partes, { motivo: tipo }) : []),
      delAdministrador(tipo, f.id),
    ];
  },
});

/**
 * Todo el panel de administración se actualiza en vivo (regla del dueño, 2026-11-09). Estas son las fuentes que SOLO le avisan a administración (sala `admins`,
 * evento `admin:cambio`): lo que una persona del equipo mira en una pantalla y que no pasa por ningún contrato (tickets, auditoría, identidades baneadas, códigos,
 * artículos). Cada pantalla escucha con `useCambiosDeAdministracion` y los tipos de abajo (tests/administracionEnVivo.test.ts verifica que ninguna se olvide).
 */
const soloParaAdministracion = (modelo: unknown, tipo: string, columnas: string[] = ['id']): Fuente => ({
  modelo: modelo as never,
  columnas,
  avisos: (f: Fila) => [delAdministrador(tipo, f.id)],
});

/**
 * Las personas: SOLO cuando cambia algo que mira administración (verificación de identidad, baneo, rol, plan, registro, unión de cuentas). Un usuario se guarda por cada
 * ingreso, cada vista de perfil y cada notificación: avisar siempre haría recargar las pantallas del equipo sin que nada hubiera cambiado. Para saber si cambió se recuerda
 * la «huella» de lo que importa (en memoria; si el proceso se reinicia, el primer guardado de cada persona avisa una vez).
 */
const huellaDeUsuarios = new Map<string, string>();
const TOPE_DE_HUELLAS = 5000;
const USUARIOS: Fuente = {
  modelo: User as never,
  columnas: ['id', 'kycStatus', 'dniVerified', 'isBanned', 'adminRole', 'membershipTier', 'registrationPending', 'mergedIntoId', 'identityKey'],
  avisos: (u: Fila, esNueva: boolean) => {
    const huella = JSON.stringify([u.kycStatus, u.dniVerified, u.isBanned, u.adminRole, u.membershipTier, u.registrationPending, u.mergedIntoId, u.identityKey]);
    const previa = huellaDeUsuarios.get(String(u.id));
    if (huellaDeUsuarios.size >= TOPE_DE_HUELLAS) huellaDeUsuarios.clear();
    huellaDeUsuarios.set(String(u.id), huella);
    return esNueva || previa !== huella ? [delAdministrador('user', u.id)] : [];
  },
};

const NOTIFICACIONES: Fuente = {
  modelo: Notification as never,
  columnas: ['id', 'recipientId', 'read'],
  avisos: (n: Fila, esNueva: boolean) =>
    esNueva
      ? // Una notificación nueva viaja entera y cada una por separado: la campanita la suma y la lista la muestra sin recargar.
        [{ usuarios: [n.recipientId], evento: 'notification:new', datos: n, alInstante: true }]
      : // Si se leyó (en otra pestaña o en el celular) o se borró, los contadores se corrigen solos.
        [{ usuarios: [n.recipientId], evento: 'notifications:refresh' }],
};

async function participantesDeLaConversacion(conversationId: unknown): Promise<string[]> {
  if (!conversationId) return [];
  const c = await conSistema(() => Conversation.findByPk(String(conversationId), { attributes: ['id', 'participants'], raw: true }));
  const lista = (c as unknown as Fila)?.participants;
  return Array.isArray(lista) ? lista.map(String) : [];
}

const MENSAJES: Fuente = {
  modelo: ChatMessage as never,
  columnas: ['id', 'conversationId', 'senderId', 'type'],
  avisos: async (m: Fila, esNueva: boolean) => {
    const participantes = await participantesDeLaConversacion(m.conversationId);
    const avisos: Aviso[] = [{ usuarios: participantes, evento: 'chat:actualizado', datos: { conversationId: String(m.conversationId) }, clave: String(m.conversationId) }];
    // Un mensaje de sistema (el contrato empezó, se aprobó un pago, se postuló alguien…) llega a la conversación abierta aunque quien lo creó no haya avisado a la sala.
    // Viaja con el remitente (la persona que disparó la acción) igual que el que emiten las rutas, y el cliente descarta los repetidos por id.
    // Los mensajes de personas ya los emite el socket con el nombre y el avatar de quien los escribió.
    if (esNueva && m.type === 'system') {
      const remitente = m.senderId ? await conSistema(() => User.findByPk(String(m.senderId), { attributes: ['id', 'name', 'avatar'], raw: true })) : null;
      avisos.push({ sala: `conversation:${m.conversationId}`, evento: 'message:new', datos: { ...m, ...(remitente ? { sender: remitente } : {}) } });
    }
    return avisos;
  },
};

const CONVERSACIONES: Fuente = {
  modelo: Conversation as never,
  columnas: ['id', 'participants'],
  avisos: (c: Fila) => [
    { usuarios: Array.isArray(c.participants) ? c.participants.map(String) : [], evento: 'chat:actualizado', datos: { conversationId: String(c.id) }, clave: String(c.id) },
  ],
};

let instalado = false;

/** Se llama una sola vez al arrancar el servidor (después de registrar los emisores en `avisosEnVivo.ts`). */
export function instalarAvisosPorCambios(): void {
  if (instalado) return;
  instalado = true;
  for (const fuente of [
    CONTRATOS,
    TRABAJOS,
    PROPUESTAS,
    COTIZACIONES,
    PAGOS,
    ASIENTOS_DE_SALDO,
    RETIROS,
    PEDIDOS_DE_REEMBOLSO,
    cuelgaDelContrato(Dispute, 'dispute', 'dispute:updated'),
    cuelgaDelContrato(ContractCancellationRequest, 'cancellation', 'contract:updated'),
    cuelgaDelContrato(ContractChangeRequest, 'changeRequest', 'contract:updated'),
    NOTIFICACIONES,
    MENSAJES,
    CONVERSACIONES,
    // Solo administración
    soloParaAdministracion(Ticket, 'ticket', ['id', 'status']),
    soloParaAdministracion(AuditLog, 'audit'),
    soloParaAdministracion(BannedIdentity, 'user'),
    soloParaAdministracion(FamilyCode, 'code'),
    // Módulo de correos: las plantillas, los grupos y el avance de cada campaña (estado y contadores) se ven al instante.
    soloParaAdministracion(EmailTemplate, 'campaign'),
    soloParaAdministracion(EmailAudience, 'campaign'),
    soloParaAdministracion(EmailCampaign, 'campaign', ['id', 'status', 'sentCount', 'failedCount', 'skippedCount']),
    soloParaAdministracion(InfluencerInvite, 'code'),
    soloParaAdministracion(BlogPost, 'blog'),
    USUARIOS,
  ]) {
    engancharFuente(fuente);
  }
}
