import { Op } from 'sequelize';

/**
 * A quién se le avisa cuando algo necesita a una persona de administración.
 *
 * El rol de administración vive en `User.adminRole` (owner, super_admin, admin, support, ...). `User.role`
 * es otra cosa: user | client | doer | both. Más de quince avisos buscaban administradores con
 * `role IN ('admin', 'super_admin', 'owner')`, que no devuelve a nadie: la alerta de plata sin mover, el
 * pago con monto inesperado, la disputa lista para resolver por silencio, la conciliación con diferencias
 * y hasta el botón de emergencia se "enviaban" a una lista vacía, sin error ni registro.
 *
 * Se aceptan los dos campos para no perder filas viejas que todavía tengan el rol en `role`.
 *
 * Uso: `User.findAll({ where: { ...DONDE_ES_ADMIN } })`.
 */
const ROLES_DE_ADMIN = ['owner', 'super_admin', 'admin'];
const ROLES_DE_ADMIN_Y_SOPORTE = [...ROLES_DE_ADMIN, 'support'];

export const DONDE_ES_ADMIN = {
  [Op.or]: [{ adminRole: { [Op.in]: ROLES_DE_ADMIN } }, { role: { [Op.in]: ROLES_DE_ADMIN } }],
};

export const DONDE_ES_ADMIN_O_SOPORTE = {
  [Op.or]: [{ adminRole: { [Op.in]: ROLES_DE_ADMIN_Y_SOPORTE } }, { role: { [Op.in]: ROLES_DE_ADMIN_Y_SOPORTE } }],
};
