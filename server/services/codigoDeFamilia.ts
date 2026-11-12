import type { Transaction } from 'sequelize';
import { FamilyCode } from '../models/sql/FamilyCode.model.js';
import { User } from '../models/sql/User.model.js';

/**
 * Código de familia (Plan Familia: 0% de comisión). Regla del dueño, 2026-11-12: se puede poner al registrarse con correo, con Google o X, y también
 * con la cuenta ya creada; y se acepta con o sin el prefijo `FAM-`, en mayúsculas o minúsculas, con espacios o guiones de más (antes el registro lo
 * trataba como código de REFERIDO y respondía «Código de referido inválido» aunque el código fuera bueno).
 */

const ALFABETO = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

/** `fam-yg83 bjjv` → `FAM-YG83BJJV`. Devuelve null si lo escrito no puede ser un código de familia. */
export function normalizarCodigoDeFamilia(crudo: unknown): string | null {
  if (typeof crudo !== 'string') return null;
  let limpio = crudo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpio.startsWith('FAM')) limpio = limpio.slice(3);
  return ALFABETO.test(limpio) ? `FAM-${limpio}` : null;
}

export interface ResultadoDeActivar { ok: boolean; status: number; message: string }

/** Activa el código para esa persona, con el código bloqueado en la base (dos a la vez: sale uno solo). */
export async function activarCodigoDeFamilia(userId: string, crudo: unknown, transaccionPadre?: Transaction): Promise<ResultadoDeActivar> {
  const code = normalizarCodigoDeFamilia(crudo);
  if (!code) return { ok: false, status: 400, message: 'Ese código no es válido. Revisalo: son 8 letras y números, con o sin «FAM-» adelante.' };

  const { sequelize } = await import('../config/database.js');
  const hacer = async (t: Transaction): Promise<ResultadoDeActivar> => {
    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) return { ok: false, status: 404, message: 'Usuario no encontrado' };
    if (user.hasFamilyPlan) return { ok: false, status: 400, message: 'Ya tenés un plan familia activo' };

    const familyCode = await FamilyCode.findOne({ where: { code }, lock: t.LOCK.UPDATE, transaction: t });
    if (!familyCode) return { ok: false, status: 404, message: 'Ese código no es válido' };
    if (!familyCode.isActive) return { ok: false, status: 400, message: 'Este código ya no está activo' };
    if (familyCode.usedById) return { ok: false, status: 400, message: 'Este código ya fue utilizado' };
    if (familyCode.expiresAt && new Date() > new Date(familyCode.expiresAt)) return { ok: false, status: 400, message: 'Este código ha expirado' };

    await familyCode.update({ usedById: user.id, usedAt: new Date() }, { transaction: t });
    await user.update({ familyCodeId: familyCode.id, hasFamilyPlan: true, currentCommissionRate: 0 }, { transaction: t });
    return { ok: true, status: 200, message: '' };
  };

  return transaccionPadre ? hacer(transaccionPadre) : sequelize.transaction(hacer);
}

/** ¿Ese texto es un código de familia que todavía se puede usar? (para decidir, en el registro, si es de familia o de referido). Solo lee. */
export async function esCodigoDeFamiliaDisponible(crudo: unknown): Promise<boolean> {
  const code = normalizarCodigoDeFamilia(crudo);
  if (!code) return false;
  const fila = await FamilyCode.findOne({ where: { code }, attributes: ['id', 'isActive', 'usedById', 'expiresAt'] });
  return !!fila && fila.isActive && !fila.usedById && !(fila.expiresAt && new Date() > new Date(fila.expiresAt));
}
