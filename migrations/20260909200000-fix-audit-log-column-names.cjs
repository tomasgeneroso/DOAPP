'use strict';

/**
 * Corrige los nombres de columna que use la migracion anterior.
 *
 * El modelo AuditLog NO declara `underscored: true`, a diferencia de casi todos
 * los demas del proyecto. Sus columnas son camelCase: "performedBy",
 * "adminRole", "metadataGz". Yo escribi la migracion anterior asumiendo
 * snake_case, asi que:
 *
 *   - el DROP NOT NULL sobre performed_by / admin_role no hizo nada, porque
 *     esas columnas no existen. En produccion "performedBy" sigue siendo NOT
 *     NULL, y logMoneyEvent -- que escribe eventos del sistema sin usuario --
 *     falla contra esa restriccion. Su try/catch se traga el error, asi que
 *     todos los movimientos automaticos de dinero se estuvieron perdiendo sin
 *     que nadie se enterara.
 *
 *   - se creo una columna metadata_gz que nadie usa, mientras el modelo escribe
 *     en "metadataGz", que no existia en produccion.
 *
 * En Postgres un identificador con mayusculas necesita comillas dobles: sin
 * ellas, ALTER TABLE ... "performedBy" se lee como performedby y no encuentra
 * nada. Ese es el detalle que hace que este error sea silencioso en vez de
 * ruidoso.
 */
module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    // Los tres van sueltos y tolerando fallo: si alguno ya esta bien, no puede
    // impedir que los otros dos se arreglen.
    const intentar = async (etiqueta, consulta) => {
      try {
        await sql.query(consulta);
        console.log(`  ✅ ${etiqueta}`);
      } catch (e) {
        console.log(`  ⚠️  ${etiqueta}: ${e.message}`);
      }
    };

    await intentar(
      'performedBy acepta nulos',
      `ALTER TABLE audit_logs ALTER COLUMN "performedBy" DROP NOT NULL`,
    );
    await intentar(
      'adminRole acepta nulos',
      `ALTER TABLE audit_logs ALTER COLUMN "adminRole" DROP NOT NULL`,
    );
    await intentar(
      'metadataGz existe',
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "metadataGz" BYTEA`,
    );

    // La columna huerfana se borra solo si esta vacia. Nunca deberia tener
    // datos -- el modelo jamas escribio en ella -- pero comprobarlo cuesta una
    // consulta y evita borrar algo que alguien mas pudo haber usado.
    try {
      const [filas] = await sql.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE metadata_gz IS NOT NULL`,
      );
      if (Number(filas?.[0]?.n || 0) === 0) {
        await sql.query(`ALTER TABLE audit_logs DROP COLUMN IF EXISTS metadata_gz`);
        console.log('  ✅ metadata_gz huerfana eliminada');
      } else {
        console.log(`  ⚠️  metadata_gz tiene ${filas[0].n} filas con datos: se deja como esta`);
      }
    } catch (e) {
      console.log(`  ⚠️  metadata_gz: ${e.message}`);
    }
  },

  async down() {
    // No se revierte. Volver performedBy a NOT NULL fallaria si ya hay eventos
    // del sistema registrados, que es justamente lo que esta migracion vino a
    // habilitar.
  },
};
