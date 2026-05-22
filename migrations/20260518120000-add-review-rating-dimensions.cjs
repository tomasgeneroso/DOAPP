'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ── reviews table: add 2 new dimension columns ─────────────────────────
    const reviewCols = await queryInterface.describeTable('reviews');

    if (!reviewCols.attendance) {
      await queryInterface.addColumn('reviews', 'attendance', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Presencialidad: se presentó al trabajo',
      });
    }

    if (!reviewCols.fair_price) {
      await queryInterface.addColumn('reviews', 'fair_price', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Precio justo: cobró lo acordado',
      });
    }

    // ── users table: add 6 per-dimension rating averages ───────────────────
    const userCols = await queryInterface.describeTable('users');

    const newUserCols = [
      'puntualidad_rating',
      'presencialidad_rating',
      'como_persona_rating',
      'precio_justo_rating',
      'calidad_trabajo_rating',
      'profesionalidad_rating',
    ];

    for (const col of newUserCols) {
      if (!userCols[col]) {
        await queryInterface.addColumn('users', col, {
          type: Sequelize.DECIMAL(3, 2),
          allowNull: false,
          defaultValue: 0.0,
        });
      }
    }
  },

  async down(queryInterface) {
    const reviewCols = await queryInterface.describeTable('reviews');
    if (reviewCols.attendance)  await queryInterface.removeColumn('reviews', 'attendance');
    if (reviewCols.fair_price)  await queryInterface.removeColumn('reviews', 'fair_price');

    const userCols = await queryInterface.describeTable('users');
    const cols = [
      'puntualidad_rating', 'presencialidad_rating', 'como_persona_rating',
      'precio_justo_rating', 'calidad_trabajo_rating', 'profesionalidad_rating',
    ];
    for (const col of cols) {
      if (userCols[col]) await queryInterface.removeColumn('users', col);
    }
  },
};
