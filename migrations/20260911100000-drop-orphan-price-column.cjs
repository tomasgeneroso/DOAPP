'use strict';

/**
 * Elimina memberships.price_e_u_r, que nunca debio existir.
 *
 * El modelo Membership tiene `underscored: true`, y Sequelize convierte cada
 * mayuscula en su propio tramo: priceEUR se mapeaba a "price_e_u_r". Sus
 * hermanas priceUSD y priceARS ya tenian el `field` fijado; a priceEUR se le
 * habia pasado.
 *
 * El resultado eran dos columnas: el modelo escribia en price_e_u_r mientras
 * ensureSchema mantenia price_eur vacia. Nada fallaba de forma visible --
 * simplemente el precio en euros no iba a estar donde los informes lo buscan
 * cuando las membresias se activen.
 *
 * Se copia antes de borrar. Hoy las dos estan vacias porque las membresias no
 * arrancaron, pero escribir un DROP sin rescatar los datos primero es la clase
 * de atajo que funciona hasta el dia que no.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;
    const tabla = await queryInterface.describeTable('memberships');

    if (!tabla.price_e_u_r) {
      console.log('  ✅ price_e_u_r no existe: nada que hacer');
      return;
    }

    // La columna buena tiene que existir antes de mover nada.
    if (!tabla.price_eur) {
      await sql.query(`ALTER TABLE memberships ADD COLUMN price_eur NUMERIC(10,2)`);
    }

    const [movidas] = await sql.query(`
      UPDATE memberships SET price_eur = price_e_u_r
      WHERE price_e_u_r IS NOT NULL AND price_eur IS NULL
      RETURNING id
    `);
    console.log(`  ✅ filas rescatadas de price_e_u_r: ${movidas?.length ?? 0}`);

    // Sólo se borra si no quedo nada sin copiar.
    const [pendientes] = await sql.query(
      `SELECT count(*)::int AS n FROM memberships WHERE price_e_u_r IS NOT NULL AND price_eur IS NULL`,
    );
    if (Number(pendientes?.[0]?.n || 0) === 0) {
      await sql.query(`ALTER TABLE memberships DROP COLUMN price_e_u_r`);
      console.log('  ✅ price_e_u_r eliminada');
    } else {
      console.log(`  ⚠️  quedan ${pendientes[0].n} filas sin copiar: no se borra`);
    }
  },

  async down(queryInterface) {
    const tabla = await queryInterface.describeTable('memberships');
    if (!tabla.price_e_u_r) {
      await queryInterface.sequelize.query(
        `ALTER TABLE memberships ADD COLUMN price_e_u_r NUMERIC(10,2)`,
      );
    }
  },
};
