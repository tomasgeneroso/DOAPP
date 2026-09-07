/**
 * Carga .env.test ANTES que cualquier otro modulo. Va en `setupFiles`, que jest
 * ejecuta antes de importar nada del test.
 *
 * Por que existe: server/config/database.ts llama a dotenv.config() en su
 * primera linea, cuando se lo importa. Eso carga .env, que apunta a doapp_dev.
 * Su rama para .env.test tiene la condicion `!process.env.DB_PASSWORD`, y para
 * cuando se evalua, .env ya definio DB_PASSWORD -- asi que nunca se dispara.
 * dotenv tampoco pisa variables ya definidas si no se lo pide explicitamente.
 *
 * Resultado: bajo tests, sequelize apuntaba a doapp_dev, y setup.models.ts le
 * hacia DROP SCHEMA a la base de desarrollo en cada corrida. Tener .env y
 * .env.test separados no alcanzaba: el orden de carga anulaba la separacion.
 *
 * `override: true` es la parte que importa. Sin eso este archivo no hace nada,
 * porque las variables de .env ya estarian puestas.
 */
import { config } from 'dotenv';

config({ path: '.env.test', override: true });

process.env.NODE_ENV = 'test';
