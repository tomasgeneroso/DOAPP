'use strict';

/**
 * Row Level Security en las tandas 1 y 2 (datos personales y privados) y rastro de solo agregar (audit_logs, data_access_logs).
 *
 *  - Tanda 1: refresh_tokens, password_reset_tokens, payment_proofs, invoices, login_devices, consent_logs, memberships, action_passwords.
 *  - Tanda 2: conversations, chat_messages, tickets, disputes.
 *  - Rastro: al rol de la app se le quita UPDATE y DELETE sobre audit_logs y data_access_logs (la depuración pasa por funciones de la base).
 *
 * SEGURA DE APLICAR, igual que la de las tablas de dinero: las políticas no le aplican a la app mientras conecte como superusuario o dueño de las
 * tablas; recién rigen con RLS_ACTIVO=true (ver server/db/LEEME-RLS-Y-NGINX.md). Si el usuario de la base no puede, la migración NO falla.
 * La tanda 3 (contratos, propuestas, cotizaciones, notificaciones) todavía no: tiene muchos cruces entre personas y se hace aparte.
 */
const { aplicarRls, quitarRls, conBorradoDelRastro } = require('../server/db/rls.cjs');

const TANDAS = [1, 2, 'rastro'];

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    const ejecutar = async (sql, escalar) => {
      if (!escalar) return q.query(sql);
      const [filas] = await q.query(sql);
      return !!(filas && filas[0] && filas[0].t);
    };
    try {
      const r = await aplicarRls(ejecutar, { tandas: TANDAS });
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
    await quitarRls(ejecutar, { tandas: [1, 2] });
    await conBorradoDelRastro(ejecutar);
  },
};
