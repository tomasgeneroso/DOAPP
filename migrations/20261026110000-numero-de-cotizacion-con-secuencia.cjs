'use strict';

/**
 * El número de cotización (COT-000123) sale de una secuencia, no de contar las cotizaciones (ver server/services/numeroDeTicket.ts).
 * Con Row Level Security cada persona ve solo sus cotizaciones y el conteo daba el mismo número a personas distintas (la unicidad devolvía un 500).
 * La secuencia parte desde el número más alto que ya exista. Idempotente; espejo en server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(`CREATE SEQUENCE IF NOT EXISTS quotes_numero_seq`);
    const [[existe]] = await q.query(`SELECT to_regclass('public.quotes') AS t`);
    if (existe && existe.t) await q.query(`SELECT setval('quotes_numero_seq', GREATEST((SELECT COALESCE(MAX(SUBSTRING(quote_number FROM 5)::bigint), 0) FROM quotes WHERE quote_number ~ '^COT-[0-9]+$'), (SELECT last_value FROM quotes_numero_seq)), true)`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP SEQUENCE IF EXISTS quotes_numero_seq');
  },
};
