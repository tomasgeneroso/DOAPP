'use strict';

/**
 * Row Level Security en las tablas de dinero (balance_transactions, withdrawal_requests, payments).
 *
 * SEGURA DE APLICAR: habilita RLS y crea las políticas, pero NO cambia nada de lo que hace la app hasta que se enciende RLS_ACTIVO=true:
 * mientras la app conecte con su usuario de siempre (superusuario o dueño de las tablas), las políticas no le aplican. Ver server/db/rls.cjs.
 *
 * Si el usuario de la base no puede crear roles, la migración NO falla (no debe frenar un deploy): avisa y la app sigue como estaba.
 */
const { aplicarRls, quitarRls } = require('../server/db/rls.cjs');

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    const ejecutar = async (sql, escalar) => {
      if (!escalar) return q.query(sql);
      const [filas] = await q.query(sql);
      return !!(filas && filas[0] && filas[0].t);
    };
    try {
      const r = await aplicarRls(ejecutar, { tandas: ['dinero'] });
      console.log(`[rls] protegidas: ${r.protegidas.join(', ') || '(ninguna)'}${r.saltadas.length ? ` | sin tabla: ${r.saltadas.join(', ')}` : ''}`);
    } catch (e) {
      console.warn(`[rls] NO se aplicó (la app sigue como estaba): ${e && e.message}`);
    }
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    const ejecutar = async (sql, escalar) => {
      if (!escalar) return q.query(sql);
      const [filas] = await q.query(sql);
      return !!(filas && filas[0] && filas[0].t);
    };
    await quitarRls(ejecutar, { tandas: ['dinero'] });
  },
};
