import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Las variables con las que se levanta el sistema de las pruebas «reales».
 *
 * La idea: el servidor y la web corren como en producción (mismo código, el build de producción de la web, `NODE_ENV=production`) contra su
 * propia base (`doapp_e2e`). Lo único que cambia son los TERCEROS: Mercado Pago, Didit y el correo son «gemelos» locales que hablan el mismo
 * idioma que los de verdad (ver `../gemelos/`). Las credenciales de la base se toman de `.env.test` en el momento; nada se guarda acá.
 */
export const PUERTOS = {
  servidor: 3101,
  web: 4273,
  mercadoPago: 3201,
  didit: 3202,
  correoSmtp: 2526,
  correoApi: 3203,
  terceros: 3204,
} as const;

export const NOMBRE_DE_LA_BASE = 'doapp_e2e';
export const URL_DE_LA_WEB = `https://localhost:${PUERTOS.web}`;
export const URL_DEL_SERVIDOR = `http://localhost:${PUERTOS.servidor}`;
export const URL_MP = `http://localhost:${PUERTOS.mercadoPago}`;
export const URL_DIDIT = `http://localhost:${PUERTOS.didit}`;
export const URL_CORREO = `http://localhost:${PUERTOS.correoApi}`;
export const URL_TERCEROS = `http://localhost:${PUERTOS.terceros}`;

/** Claves de mentira, las mismas para el servidor y los gemelos (para firmar y verificar los avisos). Es un entorno local: no protegen nada. */
export const SECRETOS = {
  webhookMp: 'e2e-webhook-mp-secreto',
  webhookDidit: 'e2e-webhook-didit-secreto',
};

function leerEnv(ruta: string): Record<string, string> {
  if (!existsSync(ruta)) return {};
  const salida: Record<string, string> = {};
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !linea.trim().startsWith('#')) salida[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return salida;
}

/** Las credenciales de la base local (las de `.env.test`). Nunca se imprimen. */
export function credencialesDeLaBase(raiz: string): { host: string; port: string; user: string; password: string } {
  const e = leerEnv(join(raiz, '.env.test'));
  return { host: e.DB_HOST || 'localhost', port: e.DB_PORT || '5432', user: e.DB_USER || 'postgres', password: e.DB_PASSWORD || '' };
}

/**
 * El servidor carga el archivo `.env` al arrancar (dotenv no pisa lo que ya está definido, ni siquiera vacío). Esta lista deja en blanco CADA variable de ese archivo
 * que las pruebas no definen: así nada de lo real (Facebook, Firebase, correo, Mercado Pago…) se cuela en una corrida que tiene que hablar solo con los gemelos.
 */
export function entornoLocalEnBlanco(raiz: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const clave of Object.keys(leerEnv(join(raiz, '.env')))) salida[clave] = '';
  return salida;
}

/** Todo lo que necesita el servidor para arrancar «como en producción» contra los gemelos. */
export function variablesDelServidor(raiz: string): Record<string, string> {
  const db = credencialesDeLaBase(raiz);
  return {
    ...entornoLocalEnBlanco(raiz),
    NODE_ENV: 'production',
    PORT: String(PUERTOS.servidor),
    DB_HOST: db.host,
    DB_PORT: db.port,
    DB_USER: db.user,
    DB_PASSWORD: db.password,
    DB_NAME: NOMBRE_DE_LA_BASE,
    DB_SSL: 'false',
    JWT_SECRET: 'e2e-jwt-' + randomBytes(24).toString('hex'),
    JWT_REFRESH_SECRET: 'e2e-jwt-refresh-' + randomBytes(24).toString('hex'),
    ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    CLIENT_URL: URL_DE_LA_WEB,
    SERVER_URL: URL_DEL_SERVIDOR,
    JWT_EXPIRE: '7d',
    FRONTEND_URL: URL_DE_LA_WEB,
    APP_URL: URL_DE_LA_WEB,
    API_URL: `${URL_DEL_SERVIDOR}/api`,
    // Mercado Pago (el gemelo): el servidor cree que habla con el de verdad.
    MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-e2e-gemelo',
    MERCADOPAGO_PUBLIC_KEY: 'APP_USR-e2e-publica',
    MERCADOPAGO_WEBHOOK_SECRET: SECRETOS.webhookMp,
    MP_WEBHOOK_PROCESA_PAGOS: 'true',
    // Didit (el gemelo)
    DIDIT_API_KEY: 'e2e-didit',
    DIDIT_WORKFLOW_ID: '00000000-0000-4000-8000-0000000000e2',
    DIDIT_BASE_URL: URL_DIDIT,
    DIDIT_WEBHOOK_SECRET: SECRETOS.webhookDidit,
    // Correo (el gemelo escucha como un servidor SMTP)
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(PUERTOS.correoSmtp),
    SMTP_SECURE: 'false',
    SMTP_USER: 'no-responder@doapparg.com',
    SMTP_PASS: 'e2e',
    SMTP_FROM_EMAIL: 'no-responder@doapparg.com',
    SMTP_FROM_NAME: 'DOAPP',
    // Datos bancarios de DOAPP para la transferencia (los de mentira de las pruebas)
    BANK_ACCOUNT_HOLDER: 'DOAPP PRUEBAS',
    BANK_NAME: 'Banco de Pruebas',
    BANK_CBU: '0170099220000067797370',
    BANK_ALIAS: 'doapp.pruebas',
    BANK_CUIT: '30-00000000-7',
    // Los terceros de internet se redirigen a los gemelos (ver `precarga-terceros.cjs`)
    E2E_URL_MP: URL_MP,
    E2E_URL_TERCEROS: URL_TERCEROS,
    // Sin Redis (el servidor tiene alternativa) ni envío de notificaciones push
    REDIS_URL: '',
  };
}

/**
 * La web se construye con TODAS sus variables públicas (`VITE_*`, `FACEBOOK_*`, `GOOGLE_*`) en blanco: el `.env` de desarrollo trae claves de verdad (Google Places, Mapbox,
 * Firebase, Analytics) que quedarían escritas en el build y el navegador de la prueba las usaría. En blanco, esas funciones quedan apagadas y la web llama a su propia API.
 */
export function variablesDelBuild(raiz: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const clave of Object.keys(leerEnv(join(raiz, '.env')))) if (/^(VITE_|FACEBOOK_|GOOGLE_)/.test(clave)) salida[clave] = '';
  return { ...salida, VITE_API_URL: '' };
}
