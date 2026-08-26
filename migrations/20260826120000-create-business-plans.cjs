'use strict';

/**
 * Proyección de gastos y plan de constitución del panel de owner.
 * Se guarda en la base (no en el navegador) para que el plan sea el mismo
 * en cualquier dispositivo y quede registro de quién lo editó por última vez.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const exists = tables
      .map((t) => (typeof t === 'string' ? t : t.tableName))
      .includes('business_plans');

    if (exists) return;

    await queryInterface.createTable('business_plans', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      slug: {
        type: Sequelize.STRING(60),
        allowNull: false,
        unique: true,
        comment: 'Identificador del plan; hoy sólo existe "constitucion"',
      },
      data: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Estado completo del plan: tablas, supuestos, checklist e hitos',
      },
      updated_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('business_plans');
  },
};
