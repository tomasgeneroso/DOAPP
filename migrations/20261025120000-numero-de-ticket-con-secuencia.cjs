'use strict';

/**
 * El número de ticket (TK-000123) sale de una secuencia, no de contar los tickets (ver server/services/numeroDeTicket.ts).
 * Con Row Level Security cada persona ve solo sus tickets y el conteo daba el mismo número a personas distintas.
 * La secuencia parte desde el número más alto que ya exista. Idempotente; espejo en server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(`CREATE SEQUENCE IF NOT EXISTS tickets_numero_seq`);
    const [[existe]] = await q.query(`SELECT to_regclass('public.tickets') AS t`);
    if (existe && existe.t) await q.query(`SELECT setval('tickets_numero_seq', GREATEST((SELECT COALESCE(MAX(SUBSTRING(ticket_number FROM 4)::bigint), 0) FROM tickets WHERE ticket_number ~ '^TK-[0-9]+$'), (SELECT last_value FROM tickets_numero_seq)), true)`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP SEQUENCE IF EXISTS tickets_numero_seq');
  },
};
