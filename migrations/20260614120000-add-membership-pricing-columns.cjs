'use strict';

/**
 * Fixes runtime error: `column "price_a_r_s" does not exist`.
 *
 * The Membership model declares `priceARS` / `priceUSD`. With `underscored: true`
 * Sequelize derives the column names as `price_a_r_s` / `price_u_s_d` (one `_` per
 * capital), but the real columns are `price_ars` / `price_usd`. The model now pins
 * `field: 'price_ars' | 'price_usd'` explicitly; this migration guarantees the
 * columns actually exist on the `memberships` table (they were never created on
 * environments where the table predates the PRICING block, because production
 * sync runs with `alter: false`).
 *
 * Idempotent: `ADD COLUMN IF NOT EXISTS` is a no-op when the column is already
 * present, so this is safe whether the column was missing or already named
 * `price_ars` / `price_usd`.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE memberships
        ADD COLUMN IF NOT EXISTS price_usd                 DECIMAL(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS price_ars                 DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS exchange_rate_at_purchase DECIMAL(10,2) NOT NULL DEFAULT 0
    `);
  },

  async down() {
    // No-op: this migration only ensures columns exist. Dropping them on rollback
    // would destroy pricing data that may predate the migration. Leave intact.
  },
};
