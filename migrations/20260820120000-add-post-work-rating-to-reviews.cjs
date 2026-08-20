'use strict';

/**
 * Puntuación post-trabajo (encuesta corta de 2 preguntas):
 *   1) ¿Querés puntuar el trabajo del doer?  → reviews.rating
 *   2) ¿Recomendarías la app?                → reviews.recommends_app
 *   + nota opcional                          → reviews.comment
 *
 * Como la encuesta corta permite responder sólo una de las dos preguntas,
 * `rating` y `comment` pasan a ser opcionales. La reseña completa sigue
 * exigiendo ambos a nivel de ruta.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('reviews');

    if (!cols.recommends_app) {
      await queryInterface.addColumn('reviews', 'recommends_app', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        comment: '¿Recomendaría la app? (encuesta post-trabajo)',
      });
    }

    if (!cols.source) {
      await queryInterface.addColumn('reviews', 'source', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'full',
        comment: 'full = reseña completa, post_work = encuesta post-trabajo',
      });
    }

    // rating y comment pasan a ser opcionales (la encuesta corta puede omitirlos)
    if (cols.rating && cols.rating.allowNull === false) {
      await queryInterface.changeColumn('reviews', 'rating', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (cols.comment && cols.comment.allowNull === false) {
      await queryInterface.changeColumn('reviews', 'comment', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('reviews');

    if (cols.recommends_app) {
      await queryInterface.removeColumn('reviews', 'recommends_app');
    }
    if (cols.source) {
      await queryInterface.removeColumn('reviews', 'source');
    }

    // Sólo se puede volver a NOT NULL si no quedaron filas sin rating/comment
    await queryInterface.sequelize.query(
      `UPDATE reviews SET comment = '' WHERE comment IS NULL`
    );
    await queryInterface.sequelize.query(
      `DELETE FROM reviews WHERE rating IS NULL`
    );

    await queryInterface.changeColumn('reviews', 'rating', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.changeColumn('reviews', 'comment', {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },
};
