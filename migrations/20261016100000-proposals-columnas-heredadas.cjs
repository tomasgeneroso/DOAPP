'use strict';

/**
 * Postularse a un trabajo fallaba con «null value in column "doer_id" of relation "proposals" violates not-null constraint»: la tabla
 * conservaba una columna de un esquema viejo que el modelo actual no escribe. Espejo de la sentencia de server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE col record;
      BEGIN
        -- Columnas heredadas de un esquema viejo (por ejemplo doer_id) que el modelo ya no escribe: si siguen NOT NULL sin valor por
        -- defecto, cada propuesta nueva revienta con «null value in column "doer_id" … violates not-null constraint».
        FOR col IN
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'proposals'
            AND is_nullable = 'NO' AND column_default IS NULL
            AND column_name NOT IN ('id', 'freelancer_id', 'client_id', 'cover_letter', 'proposed_price', 'estimated_duration', 'status', 'created_at', 'updated_at')
        LOOP
          EXECUTE format('ALTER TABLE proposals ALTER COLUMN %I DROP NOT NULL', col.column_name);
        END LOOP;

        -- Lo que el esquema viejo llamaba doer_id es hoy freelancer_id: las filas que quedaron sin valor lo toman de ahí.
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'doer_id') THEN
          EXECUTE 'UPDATE proposals SET doer_id = freelancer_id WHERE doer_id IS NULL';
        END IF;
      END $$;
    `);
  },

  async down() {
    // No se vuelve a poner NOT NULL: no hay forma de saber qué columnas lo tenían.
  },
};
