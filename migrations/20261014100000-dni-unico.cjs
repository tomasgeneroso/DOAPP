'use strict';

/**
 * El DNI es la clave de la cuenta: no se repite.
 *
 * Hasta ahora `users.dni` solo tenía un índice común: el registro no revisaba si el DNI ya estaba en uso (solo lo hacía
 * «completar registro» al entrar con Google) y la configuración dejaba cambiarlo. Ahora lo revisan el registro y la configuración
 * y, además, lo garantiza este índice único parcial (las cuentas sin DNI cargado no cuentan).
 *
 * El índice se crea sin poder frenar el despliegue: si hoy hubiera dos cuentas con el mismo DNI, no se crea (queda el aviso con
 * los DNI repetidos para resolverlos a mano) y las rutas siguen impidiendo repetir uno nuevo. No se borra ni se toca ninguna fila.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE repetidos TEXT;
      BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS users_dni_unique ON users (dni) WHERE dni IS NOT NULL AND dni <> '';
      EXCEPTION WHEN unique_violation THEN
        SELECT string_agg(dni || ' (' || n || ' cuentas)', ', ') INTO repetidos
          FROM (SELECT dni, count(*) AS n FROM users WHERE dni IS NOT NULL AND dni <> '' GROUP BY dni HAVING count(*) > 1) t;
        RAISE NOTICE 'users_dni_unique no se creó: hay DNI repetidos: %', repetidos;
      END $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS users_dni_unique;');
  },
};
