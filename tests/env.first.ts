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

/**
 * Un pool de conexiones CHICO por archivo de test.
 *
 * Cada archivo de test crea su propia instancia de Sequelize y no la cierra (ver setup.integration.ts: cerrarla
 * deja sin conexión al archivo siguiente). Con el pool de producción (mínimo 5, máximo 20) cada archivo deja 5
 * conexiones abiertas para siempre: con 26 archivos son 130, más que el máximo de Postgres (100), y las suites
 * del final fallaban al azar con "ya tenemos demasiados clientes" -- una suite distinta cada corrida, que es la
 * peor forma de fallar. Con mínimo 0 las conexiones inactivas se devuelven enseguida.
 */
process.env.DB_POOL_MIN = '0';
process.env.DB_POOL_MAX = '5';
process.env.DB_POOL_IDLE = '1000';
