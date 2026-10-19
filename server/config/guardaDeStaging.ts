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
