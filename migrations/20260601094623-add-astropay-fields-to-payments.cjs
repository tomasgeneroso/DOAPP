'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS astropay_deposit_id  VARCHAR(255),
        ADD COLUMN IF NOT EXISTS astropay_status      VARCHAR(50)
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_astropay_deposit_id
        ON payments (astropay_deposit_id)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_payments_astropay_deposit_id`);
    await queryInterface.sequelize.query(`
      ALTER TABLE payments
        DROP COLUMN IF EXISTS astropay_status,
        DROP COLUMN IF EXISTS astropay_deposit_id
    `);
  },
};
