// Setup for the CommonJS "models" jest project.
// CommonJS tolerates the circular imports between Sequelize models (ESM throws a
// TDZ: "Cannot access 'Payment' before initialization"), so here we can safely
// register the full model set on the shared Sequelize instance.
import dotenv from 'dotenv';
import { initDatabase, sequelize } from '../server/config/database.js';

dotenv.config({ path: '.env.test' });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.CLIENT_URL = 'http://localhost:5173';

if (typeof jest !== 'undefined') {
  jest.setTimeout(30000);
}

// Register all models (sequelize.addModels) before model tests run.
beforeAll(async () => {
  /**
   * Comprobación antes de destruir nada.
   *
   * Esta línea de abajo borra un esquema entero, y durante mucho tiempo lo hizo
   * sobre doapp_dev sin que nadie se enterara: database.ts carga .env al
   * importarse y su rama para .env.test nunca se disparaba, así que `sequelize`
   * apuntaba a la base de desarrollo. Tener dos bases separadas no alcanzaba —
   * el orden de carga anulaba la separación.
   *
   * El preloader tests/env.first.ts lo arregla. Esta comprobación existe para
   * el día que alguien lo saque sin darse cuenta: cuesta una línea y convierte
   * una pérdida de datos silenciosa en un error que se lee.
   */
  const nombre = String((sequelize.config as any).database || '');
  if (!/test/i.test(nombre)) {
    throw new Error(
      `Los tests de modelos iban a borrar el esquema de "${nombre}", que no parece una base de tests. ` +
        'Revisá que tests/env.first.ts siga en setupFiles y que .env.test apunte a doapp_test.',
    );
  }

  // doapp_test is a dedicated test DB. Wipe the schema first so we rebuild every
  // table from the models — initDatabase's { alter: false } sync never reconciles
  // drift (payments.astropay_*, contract extension fields, etc.) and chokes on any
  // partially-created table left behind by an earlier run.
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await initDatabase();
});

/**
 * Por qué el cierre del pool NO está acá.
 *
 * Cada archivo de este proyecto termina con `afterAll(() => sequelize.close())`
 * y parece repetición evitable. No lo es: jest corre los `afterAll` del mismo
 * nivel en orden de definición, y el de este archivo se define primero —los
 * `setupFilesAfterEach` corren antes que el test—. Si el cierre viviera acá,
 * se ejecutaría ANTES del `afterAll` de cada archivo, y cualquiera que use la
 * base para limpiar lo que dejó —flujoDinero restaura la fase de la
 * plataforma, por ejemplo— moriría con "ConnectionManager.getConnection was
 * called after the connection manager was closed".
 *
 * Y cerrar importa: sin cierre los tests pasan y jest se queda colgado para
 * siempre ("Jest did not exit one second after the test run has completed"),
 * con dos docenas de conexiones en `idle` sobre doapp_test. En CI eso no se ve
 * como un test roto: se ve como un job que corre hasta el límite de tiempo y
 * se reporta en rojo con todo en verde adentro.
 *
 * Si agregás un archivo de tests de modelos, cerrá el pool en su `afterAll`.
 */

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
