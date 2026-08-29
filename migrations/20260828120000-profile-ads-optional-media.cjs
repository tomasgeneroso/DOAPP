'use strict';

/**
 * Un aviso de perfil no trae imagen ni link propios.
 *
 * Los avisos de anunciantes externos (model1..3) suben una imagen y apuntan a
 * su sitio, por eso image_url y target_url eran obligatorias. Un trabajador que
 * promociona su propio perfil no sube nada: la tarjeta se arma con su avatar,
 * su nombre, sus oficios y su puntuación, que ya están y se mantienen solos, y
 * el link es su propio perfil dentro de la app.
 *
 * Se relajan las dos columnas en lugar de rellenarlas con un valor de mentira,
 * que es lo que obliga a hacer un NOT NULL que ya no corresponde.
 */
module.exports = {
  async up(queryInterface) {
    const cols = await queryInterface.describeTable('advertisements');

    if (cols.image_url && cols.image_url.allowNull === false) {
      await queryInterface.sequelize.query(
        'ALTER TABLE advertisements ALTER COLUMN image_url DROP NOT NULL',
      );
    }
    if (cols.target_url && cols.target_url.allowNull === false) {
      await queryInterface.sequelize.query(
        'ALTER TABLE advertisements ALTER COLUMN target_url DROP NOT NULL',
      );
    }
  },

  async down(queryInterface) {
    // Volver a NOT NULL sólo es posible si no quedó ningún aviso de perfil,
    // que son justamente los que tienen estas columnas vacías.
    await queryInterface.sequelize.query(
      "DELETE FROM advertisements WHERE ad_type = 'profile'",
    );
    await queryInterface.sequelize.query(
      "UPDATE advertisements SET image_url = '' WHERE image_url IS NULL",
    );
    await queryInterface.sequelize.query(
      "UPDATE advertisements SET target_url = '' WHERE target_url IS NULL",
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE advertisements ALTER COLUMN image_url SET NOT NULL',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE advertisements ALTER COLUMN target_url SET NOT NULL',
    );
  },
};
