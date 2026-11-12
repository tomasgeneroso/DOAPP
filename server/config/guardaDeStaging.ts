/**
 * Staging nunca puede correr contra la base de producción.
 *
 * Incidente 2026-10-18: el `.env` de staging se armó copiando el de producción y la guía pedía cambiar solo `DATABASE_URL`. Pero hay DOS
 * lugares donde se dice a qué base conectar: la app lee `DB_NAME` / `DB_USER` / `DB_PASSWORD` y las migraciones (sequelize-cli) leen
 * `DATABASE_URL`. Staging migraba su base propia y la app seguía conectada a la real: sus tareas programadas (confirmar contratos, cancelar
 * publicaciones, correos, auditoría) corrían dos veces sobre los datos de los usuarios.
 *
 * `ecosystem.staging.config.cjs` declara `APP_ENV=staging`; con eso, una base con el nombre de la de producción (`doapp`, que también es
 * el valor por defecto cuando falta `DB_NAME`) corta el arranque con un mensaje que dice qué cambiar.
 */
import { DOMINIO } from '../../shared/constants/contacto.js';

export const BASE_DE_PRODUCCION = 'doapp';

export function verificarBaseDeStaging(env: Record<string, string | undefined> = process.env): void {
  if (env.APP_ENV !== 'staging') return;
  const base = (env.DB_NAME || BASE_DE_PRODUCCION).trim();
  if (base === BASE_DE_PRODUCCION) {
    throw new Error(
      `STAGING apuntando a la base de producción ("${base}"). Cambiá DB_NAME, DB_USER y DB_PASSWORD en el .env de staging por los de una base propia ` +
        `(por ejemplo doapp_staging) y poné la misma base en DATABASE_URL (la usan las migraciones). Ver .github/STAGING.md.`,
    );
  }
  const deLaUrl = nombreDeBaseDeLaUrl(env.DATABASE_URL);
  if (deLaUrl && deLaUrl !== base) {
    throw new Error(
      `STAGING con dos bases distintas: la app usa DB_NAME="${base}" y las migraciones DATABASE_URL="${deLaUrl}". Tienen que ser la misma. Ver .github/STAGING.md.`,
    );
  }
}

/** El nombre de la base de una URL postgres://usuario:clave@host:puerto/base (sin devolver nunca la clave). */
export function nombreDeBaseDeLaUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const nombre = decodeURIComponent(new URL(url).pathname.replace(/^\//, '')).trim();
    return nombre || null;
  } catch {
    return null;
  }
}

/**
 * Los enlaces que salen de staging (correos de verificación, recuperar contraseña, regreso de pagos y de Google) tienen que volver a STAGING.
 *
 * Informe del dueño (2026-11-12): en staging «ingreso y me manda a producción». El `.env` de staging se arma copiando el de producción, y con `CLIENT_URL` /
 * `SERVER_URL` copiados (o sin definir, que en producción cae al dominio real) el enlace del correo de verificación abría el SITIO REAL, donde esa cuenta
 * no existe. Con `APP_ENV=staging`, una dirección vacía o que sea la del sitio real se reemplaza por la de staging (`staging.<dominio>`); una dirección propia
 * de staging (o de pruebas locales) se respeta tal cual. Fuera de staging no toca nada.
 */
export function direccionPropiaDeStaging(valor: string | undefined, env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.APP_ENV !== 'staging') return valor;
  const propia = `https://staging.${DOMINIO}`;
  if (!valor || !valor.trim()) return propia;
  try {
    const host = new URL(valor).hostname.toLowerCase();
    if (host === DOMINIO || host === `www.${DOMINIO}`) return propia;
  } catch {
    return propia;
  }
  return valor;
}
