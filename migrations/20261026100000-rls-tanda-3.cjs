'use strict';

/**
 * Row Level Security en la tanda 3 (dos partes con mucho cruce): contracts, contract_cancellation_requests, contract_change_requests, quotes, proposals y
 * notifications. Misma garantía que las anteriores: no cambia nada de lo que hace la app hasta que se enciende RLS_ACTIVO=true (mientras conecte como
 * superusuario o dueño de las tablas, las políticas no le aplican). Si el usuario de la base no puede, la migración NO falla.
 * Ver server/db/rls.cjs y server/db/LEEME-RLS-Y-NGINX.md.
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
      const r = await aplicarRls(ejecutar, { tandas: [3] });
      console.log(`[rls] protegidas: ${r.protegidas.join(', ') || '(ninguna)'}${r.saltadas.length ? ` | saltadas: ${r.saltadas.join(', ')}` : ''}`);
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
    await quitarRls(ejecutar, { tandas: [3] });
  },
};
