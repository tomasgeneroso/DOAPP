// Setup del proyecto jest "integration".
//
// Estos tests llaman a rutas de Express que a su vez usan los modelos: User,
// Contract, Dispute. Necesitan lo mismo que los tests de modelos -- el juego
// completo registrado contra una base real -- y por eso no pueden correr en el
// proyecto "esm", donde nadie registra nada y toda llamada a User.create()
// muere con "Model not initialized".
//
// Igual que el proyecto "models", esto corre como CommonJS: los modelos tienen
// importaciones circulares entre si, y ESM las rechaza con un TDZ ("Cannot
// access 'Payment' before initialization"). CommonJS las tolera.
import dotenv from 'dotenv';
import { initDatabase, sequelize } from '../server/config/database.js';

dotenv.config({ path: '.env.test' });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.CLIENT_URL = 'http://localhost:5173';

/**
 * 60 segundos, y tiene que estar acá.
 *
 * `testTimeout` dentro de `projects[]` en jest.config.js esta version lo
 * ignora: sin esta línea el timeout vuelve al default de 5 s y falla hasta el
 * test más simple. Estaba en 30 s, y el del ciclo de vida de una disputa
 * —siete pedidos HTTP encadenados contra la base real— los pasaba al final de
 * la corrida completa, con la base ya cargada por las suites anteriores. Sólo
 * fallaba en ese orden, que es la peor forma de fallar: enseña a ignorar el
 * rojo.
 */
if (typeof jest !== 'undefined') {
  jest.setTimeout(60000);
}

beforeAll(async () => {
  /**
   * Comprobacion antes de destruir nada.
   *
   * Lo que sigue es un DROP SCHEMA. Si .env.test apuntara por error a la base
   * de desarrollo -- que ya paso una vez en este proyecto -- esto la borraria
   * entera. El chequeo cuesta una linea y convierte un desastre silencioso en
   * un error que se lee.
   */
  const nombre = String((sequelize.config as any).database || '');
  if (!/test/i.test(nombre)) {
    throw new Error(
      `Los tests de integracion iban a borrar el esquema de "${nombre}", que no parece una base de tests. ` +
        'Revisa DB_NAME en .env.test antes de seguir.',
    );
  }

  // Se reconstruye desde los modelos: el sync con { alter: false } de
  // initDatabase nunca reconcilia una tabla que quedo a medias de una corrida
  // anterior.
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await initDatabase();

  /**
   * Completa `username` cuando el test no lo pone.
   *
   * El modelo lo exige y es unico, pero estos tests son sobre disputas, roles y
   * analiticas: el nombre de usuario les da exactamente igual. Escribirlo en los
   * treinta y cuatro lugares donde se crea un usuario agregaria ruido a cada
   * test sin agregar una sola comprobacion.
   *
   * El hook se registra ACA y no en el modelo: es andamiaje de tests y no puede
   * cambiar como se comporta la aplicacion. Lo que si deja afuera es la
   * verificacion de que el registro real completa el campo -- eso lo cubren los
   * tests de autenticacion, que si mandan el username.
   *
   * Se deriva del email y no de un contador global para que sea estable entre
   * corridas: un test que falla tiene que fallar igual la segunda vez.
   */
  const { User } = await import('../server/models/sql/User.model.js');
  User.addHook('beforeValidate', (instancia: any) => {
    if (!instancia.username && instancia.email) {
      instancia.username = String(instancia.email)
        .split('@')[0]
        .replace(/[^a-z0-9_]/gi, '')
        .slice(0, 30);
    }
  });
});

// No se cierra la conexión acá a propósito. Los archivos de esta suite corren
// en serie contra la misma base y, según cómo jest reutilice el registro de
// módulos, cerrarla al terminar un archivo deja al siguiente sin conexión y
// falla entero sin decir por qué. Jest la cierra al terminar el proceso.

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
