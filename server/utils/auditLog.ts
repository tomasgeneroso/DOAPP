import { gzipSync, gunzipSync } from "node:zlib";
import { AuditLog } from "../models/sql/AuditLog.model.js";
import type { AuthRequest } from "../types/index.js";

/**
 * QUÉ VA ACÁ Y QUÉ VA AL LOGGER
 * =============================
 *
 * Son dos cosas distintas y mezclarlas arruina las dos:
 *
 *   AuditLog (esta tabla)   es el registro histórico. Se consulta, se reporta,
 *                           y sirve para defenderse. Dura para siempre.
 *   logger (a archivo)      es para diagnosticar. Se rota, se borra, y nadie lo
 *                           lee salvo cuando algo falla.
 *
 * A la base va lo que:
 *   - mueve plata (pagos, retiros, reembolsos, contracargos, saldos),
 *   - cambia permisos o roles,
 *   - toca datos personales (verificación de identidad, exportaciones, bajas),
 *   - decide sobre una persona (baneos, resoluciones de disputa, retenciones).
 *
 * Todo lo demás va al logger: peticiones, tiempos, errores de red, caché.
 *
 * La razón no es de estilo. Si todo va a la base, en seis meses la tabla tiene
 * millones de filas de ruido y encontrar el asiento que te defiende se vuelve
 * lento -- justo el día que lo necesitás rápido.
 */

/**
 * Desde qué tamaño conviene comprimir la metadata.
 *
 * Dos kilobytes. Debajo de eso gzip no gana: su encabezado son ~20 bytes y los
 * objetos chicos comprimen poco, así que comprimir un asiento común lo dejaría
 * más grande. Encima de eso -- los datos crudos de un webhook, la lista de
 * discrepancias de una conciliación -- la ganancia es de entre 5 y 10 veces,
 * porque el JSON repite las mismas claves una y otra vez.
 */
const UMBRAL_COMPRESION_BYTES = 2048;

/**
 * Prepara la metadata para guardar, comprimiéndola si conviene.
 *
 * Cuando comprime, deja en `metadata` un resumen con las claves y el tamaño
 * original. Sin eso, una fila comprimida sería opaca en una consulta SQL y
 * habría que descomprimir cada una sólo para saber si es la que se busca.
 */
function prepararMetadata(metadata?: Record<string, any>): {
  metadata?: Record<string, any>;
  metadataGz?: Buffer;
} {
  if (!metadata) return {};

  let json: string;
  try {
    json = JSON.stringify(metadata);
  } catch {
    // Un objeto con referencias circulares no puede guardarse. Perder el
    // asiento entero por eso sería peor que perder su contexto.
    return { metadata: { error: 'metadata no serializable' } };
  }

  if (Buffer.byteLength(json, 'utf8') <= UMBRAL_COMPRESION_BYTES) {
    return { metadata };
  }

  try {
    return {
      metadata: {
        _comprimida: true,
        _bytesOriginales: Buffer.byteLength(json, 'utf8'),
        _claves: Object.keys(metadata),
      },
      metadataGz: gzipSync(Buffer.from(json, 'utf8')),
    };
  } catch {
    return { metadata };
  }
}

/**
 * Devuelve la metadata de un asiento, venga comprimida o no.
 *
 * Usar siempre esto para leer, nunca `fila.metadata` directo: de lo contrario
 * un asiento grande devuelve el resumen en vez del contenido, y el que lo lea
 * va a creer que ahí no había nada.
 */
export function leerMetadata(fila: {
  metadata?: Record<string, any> | null;
  metadataGz?: Buffer | null;
}): Record<string, any> | null {
  if (fila.metadataGz) {
    try {
      return JSON.parse(gunzipSync(fila.metadataGz).toString('utf8'));
    } catch (e: any) {
      // Devolver el resumen es mejor que devolver nada: al menos dice qué
      // claves había y cuánto pesaba.
      return { ...(fila.metadata || {}), _errorAlDescomprimir: e.message };
    }
  }
  return fila.metadata || null;
}

interface LogAuditParams {
  req: AuthRequest;
  action: string;
  category: "user" | "contract" | "ticket" | "role" | "permission" | "payment" | "system";
  severity?: "low" | "medium" | "high" | "critical";
  description: string;
  targetModel?: string;
  targetId?: string;
  targetIdentifier?: string;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  metadata?: Record<string, any>;
}

/**
 * Helper para registrar acciones de admin en el audit log
 */
export const logAudit = async (params: LogAuditParams): Promise<void> => {
  try {
    const {
      req,
      action,
      category,
      severity = "low",
      description,
      targetModel,
      targetId,
      targetIdentifier,
      changes,
      metadata,
    } = params;

    if (!req.user || !req.user.adminRole) {
      console.warn("Attempted to log audit without admin user");
      return;
    }

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
                req.socket.remoteAddress ||
                "unknown";

    const userAgent = req.headers["user-agent"] || "unknown";

    await AuditLog.create({
      performedBy: req.user.id || req.user.id,
      adminRole: req.user.adminRole,
      action,
      category,
      severity,
      description,
      targetModel,
      targetId,
      targetIdentifier,
      changes,
      ...prepararMetadata(metadata),
      ip,
      userAgent,
      passwordVerified: req.passwordVerified || false,
      twoFactorVerified: req.twoFactorVerified || false,
    });
  } catch (error) {
    console.error("Error al registrar audit log:", error);
    // No lanzar error para no interrumpir el flujo
  }
};

export interface MoneyEventParams {
  /** Que paso: 'PAYOUT_BLOCKED', 'CHARGEBACK_RECEIVED', 'BALANCE_CREDITED'... */
  action: string;
  /** Quien lo disparo: 'webhook:mercadopago', 'cron:autoConfirm', 'admin:<id>'. */
  actor: string;
  description: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  contractId?: string;
  disputeId?: string;
  paymentId?: string;
  userId?: string;
  monto?: number;
  moneda?: string;
  /** CBU, alias, cuenta de la pasarela: lo que haga falta para rastrear la plata. */
  cuentas?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Asienta un movimiento de dinero en el registro de auditoria.
 *
 * Existe aparte de logAudit porque logAudit exige un administrador y se sale en
 * silencio si no lo hay. Los movimientos que corren solos -- el escrow que se
 * libera a las dos horas, un contracargo que llega de madrugada, un pago que se
 * rechaza por estar el contrato en disputa -- no tienen administrador, y son
 * exactamente los que despues hay que poder reconstruir.
 *
 * Que se guarda y por que:
 *
 *   fecha       la pone la base al insertar. Reconstruir una discusion de plata
 *               sin poder ordenar los hechos es imposible.
 *   actor       quien lo disparo. "El sistema" no alcanza: hay que saber si fue
 *               un webhook, un cron o una persona.
 *   cuentas     de donde salio y a donde fue. Cuando alguien reclama seis meses
 *               despues, el CBU es lo unico que cierra la discusion.
 *   monto       con su moneda. Un numero sin moneda no significa nada.
 *
 * Nunca lanza: un fallo al registrar no puede tumbar el movimiento que estaba
 * registrando. Pero se loguea a consola, porque un registro que falla en
 * silencio es peor que no tenerlo -- da la impresion de que esta.
 */
export const logMoneyEvent = async (params: MoneyEventParams): Promise<void> => {
  try {
    const {
      action, actor, description, severity = 'high',
      contractId, disputeId, paymentId, userId, monto, moneda = 'ARS', cuentas, metadata,
    } = params;

    // El objetivo principal es el contrato si lo hay: es la unidad sobre la que
    // se discute. La disputa y el pago quedan en metadata, que se puede
    // consultar igual.
    const targetModel = contractId ? 'Contract' : disputeId ? 'Dispute' : paymentId ? 'Payment' : 'System';
    const targetId = contractId || disputeId || paymentId || undefined;

    await AuditLog.create({
      performedBy: undefined,
      adminRole: undefined,
      actor,
      action,
      category: 'payment',
      severity,
      description,
      targetModel,
      targetId,
      changes: undefined,
      ...prepararMetadata({
        ...metadata,
        contractId, disputeId, paymentId, userId,
        monto, moneda,
        cuentas,
        registradoEl: new Date().toISOString(),
      }),
      ip: 'system',
      userAgent: actor,
      passwordVerified: false,
      twoFactorVerified: false,
    } as any);
  } catch (error) {
    console.error('No se pudo registrar el movimiento de dinero:', error, params);
  }
};

/**
 * Helper para crear objeto de cambio para el audit log
 */
export const createChange = (
  field: string,
  oldValue: any,
  newValue: any
): { field: string; oldValue: any; newValue: any } => {
  return { field, oldValue, newValue };
};

/**
 * Helper para comparar objetos y generar array de cambios
 */
export const detectChanges = (
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  fields: string[]
): Array<{ field: string; oldValue: any; newValue: any }> => {
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

  for (const field of fields) {
    if (oldObj[field] !== newObj[field]) {
      changes.push({
        field,
        oldValue: oldObj[field],
        newValue: newObj[field],
      });
    }
  }

  return changes;
};

/**
 * Severidades predefinidas por tipo de acción
 */
export const ACTION_SEVERITIES: Record<string, "low" | "medium" | "high" | "critical"> = {
  // User actions
  "ban_user": "high",
  "unban_user": "high",
  "delete_user": "critical",
  "update_user_role": "high",
  "assign_permission": "high",
  // Reading a user's identity documents / biometrics. A read, but a sensitive
  // one: the presigned URLs expire, so this log is the only lasting trace.
  "view_kyc_media": "high",
  // Platform phase: switching out of beta turns commission on for everyone.
  "platform_phase_changed": "critical",
  "platform_phase_change_denied": "high",
  "platform_phase_password_created": "high",
  "platform_phase_password_reset": "high",
  "platform_phase_password_reset_requested": "medium",
  // Publishing carries the platform's name; both decisions are on the record.
  "blog_agent_draft_approved": "medium",
  "blog_agent_draft_rejected": "low",
  "content_agent_enabled": "medium",
  "content_agent_disabled": "low",

  // Descargar el expediente de un contrato expone datos personales de las dos
  // partes y la conversación entera.
  //
  // Ojo: logAudit sale sin registrar nada cuando quien actúa no tiene rol
  // administrativo, así que esto sólo deja rastro cuando lo descarga
  // administración. Las descargas de las propias partes no quedan auditadas.
  "contract_evidence_exported": "medium",

  // Verificación fiscal contra ARCA. Encenderla expone datos de terceros a la
  // app, así que queda registrado quién lo hizo.
  "arca_enabled": "medium",
  "arca_disabled": "low",

  // Contract actions
  "ban_contract": "medium",
  "unban_contract": "medium",
  "delete_contract": "high",
  "update_contract": "medium",

  // Ticket actions
  "create_ticket": "low",
  "assign_ticket": "low",
  "close_ticket": "low",

  // Role & Permission actions
  "create_role": "high",
  "update_role": "high",
  "delete_role": "critical",
  "update_permissions": "high",

  // System actions
  "export_data": "medium",
  "import_data": "high",
  "change_system_config": "critical",
};

/**
 * Helper para obtener severidad basada en la acción
 */
export const getSeverityForAction = (action: string): "low" | "medium" | "high" | "critical" => {
  return ACTION_SEVERITIES[action] || "low";
};
