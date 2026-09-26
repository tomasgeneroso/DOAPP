'use strict';

/**
 * Modo de pago del trabajo: con proteccion (escrow) o al terminar.
 *
 * El modo normal y por defecto sigue siendo 'escrow': el cliente paga al
 * publicar, DOAPP retiene, y el dinero se libera cuando el trabajo esta hecho.
 *
 * 'on_completion' es el modo sin retencion: no hay plata guardada, el cliente
 * paga cuando el trabajo termino. Existe porque hay rubros donde nadie paga por
 * adelantado, pero cambia quien asume el riesgo, asi que el modulo entero
 * arranca apagado y se enciende desde el panel con contrasena.
 *
 * Por que la columna vive en jobs Y en contracts, aunque parezca duplicada: el
 * contrato copia el modo del trabajo al crearse y despues no lo mira mas. Si el
 * contrato leyera el del trabajo, cambiar el modo de una publicacion con
 * contratos vivos les cambiaria las reglas a mitad de camino a las dos partes.
 *
 * payments.payment_type suma 'on_completion': la orden de pago que se crea
 * cuando el trabajo termina. Es una fila de payments como cualquier otra
 * -asi hereda comprobantes, comision, cargo de procesamiento y webhook- pero
 * con is_escrow en false, porque nunca hubo nada retenido.
 *
 * Idempotente: IF NOT EXISTS y el ADD VALUE del enum con IF NOT EXISTS.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE jobs      ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'escrow';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'escrow';
    `);

    /**
     * El enum de payment_type puede ser un tipo ENUM de Postgres o un VARCHAR,
     * segun como haya quedado la tabla en cada entorno. Se consulta antes de
     * tocarlo: un ALTER TYPE sobre una columna VARCHAR falla y frena la
     * migracion entera por una columna que no hacia falta cambiar.
     */
    const [filas] = await queryInterface.sequelize.query(`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_attribute a ON a.atttypid = t.oid
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'payments' AND a.attname = 'payment_type' AND t.typtype = 'e'
    `);

    if (filas.length > 0) {
      const tipo = filas[0].typname;
      // ADD VALUE no corre dentro de una transaccion en Postgres viejos, pero
      // sequelize-cli no envuelve las migraciones por defecto.
      await queryInterface.sequelize.query(
        `ALTER TYPE "${tipo}" ADD VALUE IF NOT EXISTS 'on_completion';`,
      );
    }

    // La orden de pago tiene vencimiento: una orden abierta para siempre es
    // plata que nadie reclama y un contrato que nunca cierra.
    await queryInterface.sequelize.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
    `);
  },

  async down(queryInterface) {
    // El valor del enum no se saca: Postgres no soporta DROP VALUE, y dejarlo
    // no rompe nada. Las columnas si.
    await queryInterface.sequelize.query(`
      ALTER TABLE jobs      DROP COLUMN IF EXISTS payment_mode;
      ALTER TABLE contracts DROP COLUMN IF EXISTS payment_mode;
      ALTER TABLE payments  DROP COLUMN IF EXISTS expires_at;
    `);
  },
};
