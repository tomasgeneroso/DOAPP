/**
 * Deja el sistema de las pruebas levantado (base, gemelos, servidor y web) hasta que se lo corta con Ctrl+C. Sirve para mirar la web a mano o
 * para correr las pruebas varias veces sin esperar el arranque: `E2E_REUSAR=1 npm run test:real`.
 */
import levantar from './levantar';

const bajar = await levantar();
console.log('[e2e] entorno levantado. Ctrl+C para cortarlo.');
const cortar = async () => {
  await bajar();
  process.exit(0);
};
process.on('SIGINT', cortar);
process.on('SIGTERM', cortar);
setInterval(() => undefined, 1 << 30);
