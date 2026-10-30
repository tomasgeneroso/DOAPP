/**
 * Levanta TODOS los gemelos en un solo proceso (`npx tsx tests/e2e-real/gemelos/index.ts`). Lo lanza el arranque de las pruebas (`entorno/levantar.ts`)
 * y los deja corriendo hasta que se lo corta. Cuando están listos imprime `GEMELOS LISTOS`.
 */
import { PUERTOS, SECRETOS, URL_DEL_SERVIDOR } from '../entorno/variables.js';
import { levantarGemeloDelCorreo } from './correo.js';
import { levantarGemeloDeMercadoPago } from './mercadopago.js';
import { levantarGemeloDeDidit } from './didit.js';
import { levantarGemeloDeTerceros } from './terceros.js';

const secretoMp = process.env.E2E_SECRETO_WEBHOOK_MP || SECRETOS.webhookMp;
const secretoDidit = process.env.E2E_SECRETO_WEBHOOK_DIDIT || SECRETOS.webhookDidit;

const detenedores: Array<() => Promise<void>> = [];
const correo = await levantarGemeloDelCorreo(PUERTOS.correoSmtp, PUERTOS.correoApi);
detenedores.push(correo.detener);
const mp = await levantarGemeloDeMercadoPago({ puerto: PUERTOS.mercadoPago, urlWebhook: `${URL_DEL_SERVIDOR}/api/webhooks/mercadopago`, secretoDelWebhook: secretoMp });
detenedores.push(mp.detener);
const didit = await levantarGemeloDeDidit({
  puerto: PUERTOS.didit,
  urlWebhook: `${URL_DEL_SERVIDOR}/api/auth/kyc/webhook`,
  secretoDelWebhook: secretoDidit,
  workflowId: process.env.E2E_WORKFLOW_DIDIT || '00000000-0000-4000-8000-0000000000e2',
});
detenedores.push(didit.detener);
const terceros = await levantarGemeloDeTerceros(PUERTOS.terceros);
detenedores.push(terceros.detener);

console.log('GEMELOS LISTOS');
const cortar = async () => {
  await Promise.all(detenedores.map((d) => d().catch(() => undefined)));
  process.exit(0);
};
process.on('SIGINT', cortar);
process.on('SIGTERM', cortar);
