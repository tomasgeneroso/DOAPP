'use strict';

/**
 * La reputación se calculaba mezclando las reseñas recibidas como doer y
 * como cliente, aunque no se puntúan las mismas dimensiones: al doer se lo
 * puntúa en las seis y al cliente sólo en puntualidad, como persona y
 * precio justo. Un usuario que trabaja y contrata terminaba con promedios
 * que mezclaban ambos papeles.
 *
 * - reviews.reviewed_role  → a quién se puntuó en esa reseña
 * - users.doer_rating / client_rating → reputación separada por rol
 * - users.rating_breakdown → promedio y cantidad por rol y por dimensión,
 *                            para distinguir "sin datos" de "puntuación baja"
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const reviewCols = await queryInterface.describeTable('reviews');

    if (!reviewCols.reviewed_role) {
      await queryInterface.addColumn('reviews', 'reviewed_role', {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: "doer = se puntuó al trabajador, client = se puntuó al cliente",
      });

      // Backfill desde el contrato: el reseñado es el doer o el cliente
      await queryInterface.sequelize.query(`
        UPDATE reviews r
        SET reviewed_role = CASE
          WHEN r.reviewed_id = c.doer_id THEN 'doer'
          ELSE 'client'
        END
        FROM contracts c
        WHERE c.id = r.contract_id AND r.reviewed_role IS NULL
      `);

      await queryInterface.addIndex('reviews', ['reviewed_id', 'reviewed_role'], {
        name: 'idx_reviews_reviewed_role',
      });
    }

    const userCols = await queryInterface.describeTable('users');

    const ratingCols = {
      doer_rating: { type: Sequelize.DECIMAL(3, 2), allowNull: false, defaultValue: 0.0 },
      client_rating: { type: Sequelize.DECIMAL(3, 2), allowNull: false, defaultValue: 0.0 },
      doer_reviews_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      client_reviews_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    };

    for (const [col, def] of Object.entries(ratingCols)) {
      if (!userCols[col]) {
        await queryInterface.addColumn('users', col, def);
      }
    }

    if (!userCols.rating_breakdown) {
      await queryInterface.addColumn('users', 'rating_breakdown', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Promedio y cantidad de opiniones por rol y por dimensión',
      });
    }

    // Recalcular la reputación por rol con lo que ya hay en reviews
    await queryInterface.sequelize.query(`
      UPDATE users u
      SET doer_rating = COALESCE(agg.avg_rating, 0),
          doer_reviews_count = COALESCE(agg.count_rating, 0)
      FROM (
        SELECT reviewed_id, AVG(rating) AS avg_rating, COUNT(rating) AS count_rating
        FROM reviews
        WHERE reviewed_role = 'doer'
          AND rating IS NOT NULL
          AND COALESCE(source, 'full') <> 'post_work_draft'
          AND COALESCE(is_visible, true) = true
        GROUP BY reviewed_id
      ) agg
      WHERE u.id = agg.reviewed_id
    `);

    await queryInterface.sequelize.query(`
      UPDATE users u
      SET client_rating = COALESCE(agg.avg_rating, 0),
          client_reviews_count = COALESCE(agg.count_rating, 0)
      FROM (
        SELECT reviewed_id, AVG(rating) AS avg_rating, COUNT(rating) AS count_rating
        FROM reviews
        WHERE reviewed_role = 'client'
          AND rating IS NOT NULL
          AND COALESCE(source, 'full') <> 'post_work_draft'
          AND COALESCE(is_visible, true) = true
        GROUP BY reviewed_id
      ) agg
      WHERE u.id = agg.reviewed_id
    `);
  },

  async down(queryInterface) {
    const userCols = await queryInterface.describeTable('users');
    for (const col of [
      'doer_rating',
      'client_rating',
      'doer_reviews_count',
      'client_reviews_count',
      'rating_breakdown',
    ]) {
      if (userCols[col]) await queryInterface.removeColumn('users', col);
    }

    const reviewCols = await queryInterface.describeTable('reviews');
    if (reviewCols.reviewed_role) {
      try {
        await queryInterface.removeIndex('reviews', 'idx_reviews_reviewed_role');
      } catch (e) {
        console.log('Index idx_reviews_reviewed_role may not exist');
      }
      await queryInterface.removeColumn('reviews', 'reviewed_role');
    }
  },
};
