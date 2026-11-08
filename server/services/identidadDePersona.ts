import { Op } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { DONDE_ES_ADMIN } from '../utils/admins.js';
import { logEvento } from '../utils/auditLog.js';
import { huellaDePersona } from '../utils/encryption.js';
import { claveDePersona, datosDelDocumentoDeDidit } from '../../shared/identidad/clavePersona.js';
import { enmascararCorreo } from '../../shared/seguridad/datosPersonales.js';
import { ACCION_POSIBLE_DUPLICADA } from './identidadAReviser.js';

/**
 * Una persona, una cuenta: la clave de persona y la alerta de cuenta duplicada.
 *
 * Qué motivó esto (2026-11-06): solo el número de DNI argentino se comparaba, así que la misma persona podía abrir cuatro cuentas verificadas con su DNI y su
 * pasaporte argentinos y su DNI y su pasaporte italianos. Ahora, al aprobarse un documento, se guarda la huella de «primer apellido + primer nombre + fecha de
 * nacimiento» (`shared/identidad/clavePersona.ts`) y, si OTRA cuenta (no unificada) ya tiene la misma, se avisa a administración.
 *
 * Regla del dueño: el registro sigue con normalidad. Una coincidencia no es una prueba (dos personas distintas pueden coincidir) ni frena a nadie: deja una
 * alerta para que un administrador mire y, si es la misma persona (doble ciudadanía), una las cuentas (`services/unionDeCuentas.ts`).
 */

/** La huella que se guarda para lo que Didit leyó, o null si el documento no trae los tres datos. */
export function huellaDeLaDecision(decision: unknown): string | null {
  const clave = claveDePersona(datosDelDocumentoDeDidit(decision));
  return clave ? huellaDePersona(clave) : null;
}

/** Las otras cuentas (no unificadas) con la misma huella. */
export async function cuentasConLaMismaHuella(huella: string, exceptoId: string): Promise<Array<{ id: string; name: string }>> {
  const filas = await User.findAll({
    where: { identityKey: huella, id: { [Op.ne]: exceptoId }, mergedIntoId: { [Op.is]: null } } as never,
    attributes: ['id', 'name'],
  });
  return (filas as unknown as Array<{ id: string; name: string }>).map((f) => ({ id: String(f.id), name: f.name }));
}

/** ¿Ya hay un aviso de ESTA pareja de cuentas (en cualquier orden)? El estado de Didit se pregunta seguido: el mismo caso se avisa una sola vez. */
async function yaSeAvisoDeLaPareja(a: string, b: string): Promise<boolean> {
  const previos = await AuditLog.findAll({ where: { action: ACCION_POSIBLE_DUPLICADA, targetId: { [Op.in]: [a, b] } }, limit: 100 });
  return (previos as any[]).some((p) => {
    const otra = p.metadata && typeof p.metadata === 'object' ? String(p.metadata.otraCuenta ?? '') : '';
    return (String(p.targetId) === a && otra === b) || (String(p.targetId) === b && otra === a);
  });
}

/** Aviso a administración (campana de la app). No lanza: un fallo al avisar no puede frenar la verificación que Didit ya resolvió. */
async function avisarPosibleDuplicada(user: { id: unknown; name?: string }, otra: { id: string; name: string }): Promise<void> {
  try {
    const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN }, attributes: ['id'] });
    for (const a of admins) {
      await Notification.create({
        recipientId: a.id,
        type: 'warning',
        category: 'admin',
        title: 'Posible cuenta duplicada',
        message: `${user.name || 'Una cuenta'} verificó un documento cuyo nombre y fecha de nacimiento coinciden con los de ${otra.name || 'otra cuenta'}. El registro siguió normal: revisá si es la misma persona (doble ciudadanía) y, si lo es, unilas.`,
        relatedModel: 'User',
        relatedId: String(user.id),
        actionText: 'Revisar',
        actionUrl: '/admin/identidades',
        sentVia: ['in_app'],
      } as never);
    }
  } catch (e) {
    console.error('No se pudo avisar la posible cuenta duplicada a administración:', (e as Error).message);
  }
}

export interface ResultadoDelBarrido {
  /** Cuentas con datos de una verificación de Didit guardados. */
  cuentasConDatos: number;
  /** De esas, las que no traen los tres datos (apellido, nombre y fecha de nacimiento): no se puede armar una clave. */
  sinClave: number;
  /** Grupos de dos o más cuentas con la misma clave. */
  grupos: number;
  /** Cuentas dentro de esos grupos. */
  cuentasEnGrupos: number;
  aplicado: boolean;
}

/**
 * Busca, entre las cuentas que YA existen, las que comparten la clave de persona (la misma persona con varios documentos), a partir de los datos de Didit que cada
 * una guardó. Es lo que hace falta para las cuentas verificadas antes de que existiera la clave.
 *
 * Por defecto solo muestra qué encontraría (vista previa): no escribe nada. Con `aplicar` guarda la clave de cada cuenta y deja las alertas (que se ven en
 * Administración → Identidades); no une ni bloquea nada. Correrlo de nuevo no repite alertas. No imprime nombres ni fechas de nacimiento: solo ids y el correo enmascarado.
 */
export async function detectarDuplicadosExistentes(opciones: { aplicar: boolean }, escribir: (t: string) => void = console.log): Promise<ResultadoDelBarrido> {
  const cuentas = (await User.findAll({
    where: { kycData: { [Op.ne]: null }, mergedIntoId: { [Op.is]: null } } as never,
    attributes: ['id', 'email', 'identityKey', 'kycData', 'createdAt'],
  })) as any[];

  const porHuella = new Map<string, any[]>();
  let sinClave = 0;
  for (const c of cuentas) {
    const huella = huellaDeLaDecision(c.kycData);
    if (!huella) {
      sinClave += 1;
      continue;
    }
    porHuella.set(huella, [...(porHuella.get(huella) ?? []), c]);
  }

  const grupos = [...porHuella.values()].filter((g) => g.length > 1);
  escribir(`Cuentas con datos de una verificación: ${cuentas.length}. Sin los tres datos para armar la clave: ${sinClave}.`);
  escribir(`Grupos con la misma clave de persona: ${grupos.length}.`);
  grupos.forEach((g, i) => {
    escribir(`\nGrupo ${i + 1} (${g.length} cuentas):`);
    for (const c of g.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
      escribir(`   ${c.id} · ${enmascararCorreo(c.email)} · alta ${new Date(c.createdAt).toLocaleDateString('es-AR')}`);
    }
  });

  if (opciones.aplicar) {
    for (const c of cuentas) await registrarClaveDePersona(c, c.kycData);
    escribir('\nHecho: claves guardadas y alertas dejadas (Administración → Identidades).');
  } else {
    escribir('\n(solo vista previa: falta --aplicar)');
  }

  return { cuentasConDatos: cuentas.length, sinClave, grupos: grupos.length, cuentasEnGrupos: grupos.reduce((s, g) => s + g.length, 0), aplicado: opciones.aplicar };
}

export interface ResultadoDeLaClave {
  /** Se pudo armar una clave con lo que Didit leyó. */
  clave: boolean;
  /** Cuentas con la misma clave (las que dispararon una alerta nueva o ya existente). */
  coincidencias: string[];
  /** Alertas nuevas que se dejaron en este llamado. */
  alertasNuevas: number;
}

/**
 * Guarda la clave de persona de la cuenta y, si coincide con otra, deja la alerta. Idempotente (llamarlo de nuevo con el mismo documento no repite la alerta) y
 * NUNCA lanza ni cambia el estado de la verificación: lo que falle queda en el log y la cuenta sigue como estaba.
 */
export async function registrarClaveDePersona(user: any, decision: unknown): Promise<ResultadoDeLaClave> {
  const vacio: ResultadoDeLaClave = { clave: false, coincidencias: [], alertasNuevas: 0 };
  try {
    const huella = huellaDeLaDecision(decision);
    if (!huella) return vacio;

    if (user.identityKey !== huella) {
      await User.update({ identityKey: huella } as never, { where: { id: user.id } });
      user.set?.('identityKey', huella, { raw: true });
      if (!user.set) user.identityKey = huella;
    }

    const otras = await cuentasConLaMismaHuella(huella, String(user.id));
    let alertasNuevas = 0;
    for (const otra of otras) {
      if (await yaSeAvisoDeLaPareja(String(user.id), otra.id)) continue;
      await logEvento({
        action: ACCION_POSIBLE_DUPLICADA,
        actor: 'system:didit',
        category: 'user',
        severity: 'high',
        description: `El nombre y la fecha de nacimiento del documento verificado de la cuenta ${user.id} coinciden con los de la cuenta ${otra.id}: posible misma persona con otro documento. El registro siguió normal; hay que revisarlo en Administración → Identidades.`,
        targetModel: 'User',
        targetId: String(user.id),
        // Solo ids: ni el nombre ni la fecha de nacimiento van al registro.
        metadata: { otraCuenta: otra.id, motivo: 'misma_clave_de_persona' },
      });
      await avisarPosibleDuplicada(user, otra);
      alertasNuevas += 1;
    }
    return { clave: true, coincidencias: otras.map((o) => o.id), alertasNuevas };
  } catch (e) {
    console.error('[identidad de la persona] no se pudo registrar la clave de la cuenta', String(user?.id), (e as Error).message);
    return vacio;
  }
}
