'use strict';

/**
 * Metadata comprimida en el registro de auditoria.
 *
 * Los asientos que sirven para defenderse llevan adjunto todo el contexto: los
 * datos crudos del webhook, la lista de discrepancias de una conciliacion, el
 * detalle de un contracargo. Son los que mas pesan y los que menos se leen --
 * se consultan una vez cada mucho, cuando hay un problema.
 *
 * metadata_gz guarda esos adjuntos comprimidos con gzip. Solo se usa por encima
 * de un umbral: gzip agrega unos veinte bytes de encabezado, asi que comprimir
 * un objeto chico lo deja MAS grande. Debajo del umbral se sigue usando la
 * columna JSONB de siempre, que ademas se puede consultar con operadores de
 * Postgres.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabla = await queryInterface.describeTable('audit_logs');

    if (!tabla.metadata_gz) {
      await queryInterface.addColumn('audit_logs', 'metadata_gz', {
        type: Sequelize.BLOB,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tabla = await queryInterface.describeTable('audit_logs');
    if (tabla.metadata_gz) await queryInterface.removeColumn('audit_logs', 'metadata_gz');
  },
};
