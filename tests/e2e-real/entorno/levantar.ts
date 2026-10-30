import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { NOMBRE_DE_LA_BASE, PUERTOS, URL_DE_LA_WEB, URL_DEL_SERVIDOR, URL_MP, credencialesDeLaBase, variablesDelBuild, variablesDelServidor } from './variables';
import { cortar, esperarHasta, lanzar, responde, type Proceso } from './procesos';

/**
 * El arranque de las pruebas «reales» (lo corre Playwright antes de empezar y lo corta al terminar):
 *
 *   1. una base nueva y vacía (`doapp_e2e`) con las tablas de los modelos;
 *   2. los gemelos de los terceros (Mercado Pago, Didit, correo, cotización del dólar);
 *   3. el servidor de DOAPP, igual que en producción (`NODE_ENV=production`), hablando con los gemelos;
 *   4. la web: el BUILD de producción (se construye si hay cambios desde el último) servido con `vite preview`.
 *
 * Variables para iterar más rápido: `E2E_REUSAR=1` (si ya está todo levantado no toca nada y no lo corta al terminar),
 * `E2E_RECONSTRUIR=1` (vuelve a construir la web), `E2E_SIN_BUILD=1` (usa la web ya construida aunque haya cambios).
 */
const RAIZ = process.cwd();
/** La web de las pruebas se construye aparte de la normal (con las variables públicas en blanco), en su propia carpeta. */
const CARPETA_DE_LA_WEB = join('dist-e2e', 'spa');

async function recrearLaBase(): Promise<void> {
  if (!/_e2e$/.test(NOMBRE_DE_LA_BASE)) throw new Error('La base de las pruebas tiene que terminar en _e2e');
  const c = credencialesDeLaBase(RAIZ);
  const cliente = new pg.Client({ host: c.host, port: Number(c.port), user: c.user, password: c.password, database: 'postgres' });
  await cliente.connect();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS ${NOMBRE_DE_LA_BASE} WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE ${NOMBRE_DE_LA_BASE}`);
  } finally {
    await cliente.end();
  }
  const r = spawnSync('npx', ['tsx', 'tests/e2e-real/entorno/crear-esquema.ts'], { cwd: RAIZ, env: { ...process.env, ...variablesDelServidor(RAIZ) }, shell: true, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || !/esquema listo/.test(r.stdout || '')) throw new Error(`No se pudo crear el esquema de ${NOMBRE_DE_LA_BASE}:\n${(r.stdout || '') + (r.stderr || '')}`.slice(-3000));
}

function masNuevoQue(archivo: string, carpetas: string[]): boolean {
  const referencia = statSync(archivo).mtimeMs;
  const recorrer = (dir: string): boolean => {
    for (const nombre of readdirSync(dir)) {
      if (nombre === 'node_modules' || nombre === '.git') continue;
      const ruta = join(dir, nombre);
      const s = statSync(ruta);
      if (s.isDirectory()) {
        if (recorrer(ruta)) return true;
      } else if (s.mtimeMs > referencia) return true;
    }
    return false;
  };
  return carpetas.filter((c) => existsSync(c)).some(recorrer);
}

function construirLaWebSiHaceFalta(): void {
  const indice = join(RAIZ, CARPETA_DE_LA_WEB, 'index.html');
  const falta = !existsSync(indice);
  const hayCambios = !falta && !process.env.E2E_SIN_BUILD && masNuevoQue(indice, [join(RAIZ, 'client'), join(RAIZ, 'shared'), join(RAIZ, 'public')]);
  if (!falta && !hayCambios && !process.env.E2E_RECONSTRUIR) return;
  console.log('[e2e] construyendo la web (build de producción)…');
  const r = spawnSync('npx', ['vite', 'build', '--outDir', CARPETA_DE_LA_WEB.replace(/\\/g, '/'), '--emptyOutDir'], { cwd: RAIZ, env: { ...process.env, ...variablesDelBuild(RAIZ) }, shell: true, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`No se pudo construir la web:\n${(r.stdout || '') + (r.stderr || '')}`.slice(-3000));
}

export default async function levantar(): Promise<() => Promise<void>> {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const reusar = !!process.env.E2E_REUSAR;
  const yaEstaTodo = reusar && (await responde(`${URL_DEL_SERVIDOR}/api/health`).catch(() => false)) && (await responde(`${URL_DE_LA_WEB}/`, true).catch(() => false));
  if (yaEstaTodo) {
    console.log('[e2e] ya está todo levantado: se reutiliza');
    return async () => undefined;
  }

  const procesos: Proceso[] = [];
  const detener = async () => {
    for (const p of procesos.reverse()) cortar(p);
  };

  try {
    console.log(`[e2e] base nueva: ${NOMBRE_DE_LA_BASE}`);
    await recrearLaBase();

    console.log('[e2e] gemelos de los terceros…');
    const gemelos = lanzar('gemelos', 'npx', ['tsx', 'tests/e2e-real/gemelos/index.ts'], {});
    procesos.push(gemelos);
    await esperarHasta('los gemelos', async () => gemelos.ultimas().includes('GEMELOS LISTOS'), 60_000, gemelos);

    console.log('[e2e] servidor de DOAPP (producción) …');
    const precarga = join(RAIZ, 'tests', 'e2e-real', 'entorno', 'precarga-terceros.cjs').replace(/\\/g, '/');
    const servidor = lanzar('servidor', 'npx', ['tsx', 'server/index.ts'], { ...variablesDelServidor(RAIZ), NODE_OPTIONS: `--require "${precarga}"` });
    procesos.push(servidor);
    await esperarHasta('el servidor', () => responde(`${URL_DEL_SERVIDOR}/api/health`), 120_000, servidor);

    construirLaWebSiHaceFalta();
    console.log('[e2e] la web (build de producción) …');
    const web = lanzar('web', 'npx', ['vite', 'preview', '--config', 'tests/e2e-real/entorno/vite.e2e.config.ts', '--outDir', CARPETA_DE_LA_WEB.replace(/\\/g, '/')], {});
    procesos.push(web);
    await esperarHasta('la web', () => responde(`${URL_DE_LA_WEB}/`, true), 60_000, web);

    // Una última comprobación: el servidor tiene que poder hablar con los gemelos (si no, la primera prueba falla por un motivo que no es suyo).
    await esperarHasta('el gemelo de Mercado Pago', () => responde(`${URL_MP}/__control/estado`), 10_000);
    console.log(`[e2e] todo listo: ${URL_DE_LA_WEB} (web) · ${URL_DEL_SERVIDOR} (servidor) · puertos de los gemelos ${PUERTOS.mercadoPago}/${PUERTOS.didit}/${PUERTOS.correoApi}`);
  } catch (e) {
    await detener();
    throw e;
  }

  return async () => {
    if (reusar) return;
    await detener();
  };
}
