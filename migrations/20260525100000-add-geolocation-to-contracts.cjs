'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS client_pairing_latitude      DECIMAL(10,7),
        ADD COLUMN IF NOT EXISTS client_pairing_longitude     DECIMAL(10,7),
        ADD COLUMN IF NOT EXISTS doer_pairing_latitude        DECIMAL(10,7),
        ADD COLUMN IF NOT EXISTS doer_pairing_longitude       DECIMAL(10,7),
        ADD COLUMN IF NOT EXISTS pairing_distance_meters      INTEGER,
        ADD COLUMN IF NOT EXISTS location_verification_status VARCHAR(20) DEFAULT 'pending'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE contracts
        DROP COLUMN IF EXISTS client_pairing_latitude,
        DROP COLUMN IF EXISTS client_pairing_longitude,
        DROP COLUMN IF EXISTS doer_pairing_latitude,
        DROP COLUMN IF EXISTS doer_pairing_longitude,
        DROP COLUMN IF EXISTS pairing_distance_meters,
        DROP COLUMN IF EXISTS location_verification_status
    `);
  },
};
