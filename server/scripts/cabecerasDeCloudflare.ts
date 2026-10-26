/**
 * Pone las cabeceras de seguridad del sitio en Cloudflare (Transform Rules → Modify Response Header), sin tocar el VPS.
 * Usa las mismas cabeceras que nginx/seguridad.conf (shared/seguridad/csp.ts).
 *
 * Vista previa por defecto: muestra la regla y qué haría (crear, actualizar o nada). Solo escribe con --aplicar.
 *
 *   npx tsx server/scripts/cabecerasDeCloudflare.ts                              # vista previa (no necesita credenciales)
 *   npx tsx server/scripts/cabecerasDeCloudflare.ts --host=staging.doapparg.com  # probar primero en staging
 *   npx tsx server/scripts/cabecerasDeCloudflare.ts --host=doapparg.com --aplicar
 *   npx tsx server/scripts/cabecerasDeCloudflare.ts --host=doapparg.com --quitar --aplicar   # saca la regla (rollback)
 *
 * Para consultar o aplicar hacen falta dos variables (no se guardan en ningún archivo del repositorio):
 *   CLOUDFLARE_API_TOKEN  token con permiso «Zone → Transform Rules → Edit» (y «Zone → Zone Settings → Read» para saber si ya hay HSTS)
 *   CLOUDFLARE_ZONE_ID    Cloudflare → el dominio → Overview, columna derecha, «Zone ID»
 *
 * Si Cloudflare ya manda HSTS (SSL/TLS → Edge Certificates), la regla no lo pone: dos HSTS se pisan y tiene que quedar uno solo.
 * Toca solo la regla con la descripción DESCRIPCION_DE_LA_REGLA; las demás reglas de la zona quedan como están.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CSP_SOLO_AVISA } from '../../shared/seguridad/csp.js';
import { DESCRIPCION_DE_LA_REGLA, reglaDeCabeceras, type ReglaDeCabeceras } from '../../shared/seguridad/cloudflare.js';

const API = 'https://api.cloudflare.com/client/v4';
const FASE = 'http_response_headers_transform';

interface RespuestaCloudflare<T> { success: boolean; result: T; errors?: Array<{ code: number; message: string }> }
interface ReglaGuardada extends Partial<ReglaDeCabeceras> { id: string }
interface ConjuntoDeReglas { id: string; rules?: ReglaGuardada[] }

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const quitar = args.includes('--quitar');
const hosts = args.filter((a) => a.startsWith('--host=')).map((a) => a.slice('--host='.length).trim().toLowerCase()).filter(Boolean);
const forzarSinHsts = args.includes('--sin-hsts');
const token = process.env.CLOUDFLARE_API_TOKEN;
const zona = process.env.CLOUDFLARE_ZONE_ID;

async function cf<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<{ estado: number; json: RespuestaCloudflare<T> }> {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: res.status, json: (await res.json()) as RespuestaCloudflare<T> };
}

function fallar(mensaje: string, json?: RespuestaCloudflare<unknown>): never {
  console.error(`✗ ${mensaje}`);
  for (const e of json?.errors ?? []) console.error(`  Cloudflare dice (${e.code}): ${e.message}`);
  process.exit(1);
}

/** HSTS ya activo en Cloudflare: devuelve null si no se pudo saber (el token no tiene el permiso o no hay credenciales). */
async function cloudflareYaManda(): Promise<boolean | null> {
  if (!token || !zona) return null;
  const { json } = await cf<{ value?: { strict_transport_security?: { enabled?: boolean } } }>('GET', `/zones/${zona}/settings/security_header`);
  if (!json.success) return null;
  return Boolean(json.result?.value?.strict_transport_security?.enabled);
}

async function main(): Promise<void> {
  if (hosts.length === 0) fallar('Falta el dominio: --host=doapparg.com (varios: --host=a.com --host=b.com).');
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  const hstsDeCloudflare = forzarSinHsts ? true : await cloudflareYaManda();
  const regla = reglaDeCabeceras(html, { hosts, soloAvisa: CSP_SOLO_AVISA, sinHsts: hstsDeCloudflare === true });

  console.log(quitar ? 'Se QUITARÍA la regla de cabeceras de seguridad de Cloudflare.' : 'Regla de Cloudflare (Transform Rules → Modify Response Header):');
  if (!quitar) {
    console.log(`  Cuándo:  ${regla.expression}`);
    for (const [nombre, h] of Object.entries(regla.action_parameters.headers)) {
      console.log(`  Poner:   ${nombre} = ${h.value.length > 90 ? `${h.value.slice(0, 90)}… (${h.value.length} caracteres)` : h.value}`);
    }
    if (hstsDeCloudflare === true) console.log('  Sin HSTS: Cloudflare ya lo manda (o se pidió --sin-hsts); que quede uno solo.');
    else if (hstsDeCloudflare === null) console.log('  HSTS: no se pudo consultar a Cloudflare. Si ya lo manda desde SSL/TLS → Edge Certificates, corré con --sin-hsts.');
    console.log('  La API (/api/, /socket.io/) queda afuera: ya trae sus propias cabeceras desde Express.');
  }

  if (!token || !zona) {
    console.log('\nFaltan CLOUDFLARE_API_TOKEN y/o CLOUDFLARE_ZONE_ID: esto es solo la vista previa. Para aplicar, definilas y sumá --aplicar.');
    console.log('Sin credenciales también se puede a mano: Cloudflare → el dominio → Rules → Transform Rules → Modify Response Header → Create rule, con lo de arriba.');
    return;
  }

  const lista = await cf<ConjuntoDeReglas>('GET', `/zones/${zona}/rulesets/phases/${FASE}/entrypoint`);
  const existe = lista.estado !== 404 && lista.json.success;
  if (!existe && lista.estado !== 404) fallar('No pude leer las reglas de la zona (revisá el token y el Zone ID).', lista.json);
  const conjunto = existe ? lista.json.result : null;
  const propia = conjunto?.rules?.find((r) => r.description === DESCRIPCION_DE_LA_REGLA);

  const accion = quitar ? (propia ? 'quitar la regla existente' : 'nada (no hay regla propia)') : propia ? 'actualizar la regla existente' : 'crear la regla';
  console.log(`\nEn Cloudflare hoy: ${propia ? 'ya hay una regla propia' : 'no hay regla propia'}${conjunto?.rules ? ` (${conjunto.rules.length} regla(s) en total en esta fase)` : ''}.`);
  console.log(`Se haría: ${accion}.`);

  if (!aplicar) { console.log('\nVista previa: no se escribió nada. Para aplicar, sumá --aplicar.'); return; }
  if (quitar && !propia) return;

  let r;
  if (quitar && conjunto && propia) r = await cf('DELETE', `/zones/${zona}/rulesets/${conjunto.id}/rules/${propia.id}`);
  else if (propia && conjunto) r = await cf('PATCH', `/zones/${zona}/rulesets/${conjunto.id}/rules/${propia.id}`, regla);
  else if (conjunto) r = await cf('POST', `/zones/${zona}/rulesets/${conjunto.id}/rules`, regla);
  else r = await cf('PUT', `/zones/${zona}/rulesets/phases/${FASE}/entrypoint`, { rules: [regla] });
  if (!r.json.success) fallar('Cloudflare rechazó el cambio.', r.json);
  console.log(`\n✓ Hecho: ${accion}. Verificá desde tu compu (PowerShell): curl.exe -sI https://${hosts[0]}/  — si no aparecen las cabeceras, purgá la caché de Cloudflare.`);
}

main().catch((e: unknown) => fallar(e instanceof Error ? e.message : String(e)));
