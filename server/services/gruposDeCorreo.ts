import { Op, literal, type WhereOptions } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { conSistema } from '../db/contextoRls.js';
import { enmascararCorreo } from '../../shared/seguridad/datosPersonales.js';
import { primerNombre } from '../../shared/correos/plantillas.js';
import { type FiltrosDeGrupo } from '../../shared/correos/grupos.js';

/**
 * Grupos de destinatarios (módulo de correos, 2026-11-11): convierte los filtros de un grupo en la consulta a la base y cuenta o muestra a quiénes alcanza.
 *
 * Las personas que NUNCA reciben una campaña salen siempre, sin importar los filtros: cuentas suspendidas, unidas a otra, sin correo, las del equipo (administración)
 * y las que se dieron de baja con el enlace del pie. Según la categoría de la plantilla:
 *  - `servicio` (recordatorios sobre la propia cuenta): le llega a quien no tiene apagados los correos en sus preferencias;
 *  - `promocional` (novedades, ofertas): solo a quien aceptó recibirlas (`notificationPreferences.marketing`, que arranca apagado).
 */

export type CategoriaDeCorreo = 'servicio' | 'promocional';

export function dondeDelGrupo(filtros: FiltrosDeGrupo, categoria: CategoriaDeCorreo, ahora: Date = new Date()): WhereOptions {
  const y: WhereOptions[] = [
    { email: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
    { isBanned: false },
    { mergedIntoId: null },
    { marketingEmailsUnsubscribedAt: null },
    { adminRole: null },
  ];
  y.push(
    categoria === 'promocional'
      ? literal(`("User"."notification_preferences"->>'marketing') = 'true'`)
      : literal(`COALESCE("User"."notification_preferences"->>'email', 'true') <> 'false'`),
  );

  if (filtros.registro === 'incompleto') y.push({ registrationPending: true });
  if (filtros.registro === 'completo') y.push({ registrationPending: false });
  if (filtros.identidad === 'verificada') y.push({ dniVerified: true });
  if (filtros.identidad === 'sin_verificar') y.push({ dniVerified: false });
  if (filtros.dni === 'con') y.push({ dni: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } });
  if (filtros.dni === 'sin') y.push({ [Op.or]: [{ dni: null }, { dni: '' }] });
  if (filtros.correoVerificado !== undefined) y.push({ isVerified: filtros.correoVerificado });
  if (filtros.rol?.length) y.push({ role: { [Op.in]: filtros.rol } });
  if (filtros.membresia === 'pro') y.push({ membershipTier: { [Op.in]: ['pro', 'super_pro'] }, hasMembership: true });
  if (filtros.membresia === 'gratis') y.push({ [Op.or]: [{ membershipTier: null }, { membershipTier: 'free' }, { hasMembership: false }] });
  if (filtros.beneficioDeLanzamiento === true) y.push({ launchBenefitGrantedAt: { [Op.ne]: null } });
  if (filtros.beneficioDeLanzamiento === false) y.push({ launchBenefitGrantedAt: null });
  if (filtros.creadosHaceMasDeHoras !== undefined) y.push({ createdAt: { [Op.lte]: new Date(ahora.getTime() - filtros.creadosHaceMasDeHoras * 3_600_000) } });
  if (filtros.creadosHaceMenosDeDias !== undefined) y.push({ createdAt: { [Op.gte]: new Date(ahora.getTime() - filtros.creadosHaceMenosDeDias * 86_400_000) } });
  if (filtros.sinIngresarHaceDias !== undefined) {
    y.push({ [Op.or]: [{ lastLogin: null }, { lastLogin: { [Op.lte]: new Date(ahora.getTime() - filtros.sinIngresarHaceDias * 86_400_000) } }] });
  }
  return { [Op.and]: y };
}

export async function contarGrupo(filtros: FiltrosDeGrupo, categoria: CategoriaDeCorreo, ahora: Date = new Date()): Promise<number> {
  return conSistema(() => User.count({ where: dondeDelGrupo(filtros, categoria, ahora) }));
}

export interface MuestraDelGrupo {
  total: number;
  /** Algunas personas para ver que el grupo es el que se espera: primer nombre y correo tapado (nunca el correo entero). */
  muestra: Array<{ nombre: string; correo: string }>;
}

export async function muestraDelGrupo(filtros: FiltrosDeGrupo, categoria: CategoriaDeCorreo, cuantas = 8, ahora: Date = new Date()): Promise<MuestraDelGrupo> {
  return conSistema(async () => {
    const where = dondeDelGrupo(filtros, categoria, ahora);
    const [total, filas] = await Promise.all([User.count({ where }), User.findAll({ where, attributes: ['id', 'name', 'email'], order: [['createdAt', 'DESC']], limit: cuantas })]);
    return { total, muestra: filas.map((u) => ({ nombre: primerNombre(u.name) || '(sin nombre todavía)', correo: enmascararCorreo(u.email) })) };
  });
}

/** Los ids de todas las personas del grupo (para armar los destinatarios de una campaña). */
export async function idsDelGrupo(filtros: FiltrosDeGrupo, categoria: CategoriaDeCorreo, ahora: Date = new Date()): Promise<string[]> {
  return conSistema(async () => {
    const filas = await User.findAll({ where: dondeDelGrupo(filtros, categoria, ahora), attributes: ['id'], order: [['createdAt', 'ASC'], ['id', 'ASC']] });
    return filas.map((u) => String(u.id));
  });
}
