import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * La tabla `portfolio_items` (portafolio del perfil) no tenía migración: en producción, «compartir el trabajo terminado en mi perfil» daba
 * `relation "portfolio_items" does not exist` (2026-11-09). Se creaba solo con `sequelize.sync()` en desarrollo.
 *
 * Esta prueba comprueba que el SQL de la migración (y su espejo en ensureSchema) crea EXACTAMENTE las columnas que el modelo espera. Un campo nuevo en el modelo sin su
 * columna rompe acá, no en producción. (Ejecutar el CREATE TABLE no se puede desde la prueba: el usuario de la base de pruebas no tiene permiso de crear tablas en el
 * esquema público, a propósito. El SQL se validó una vez con la conexión de migraciones.)
 */
import { Portfolio } from '../../server/models/sql/Portfolio.model.js';

const raiz = process.cwd();
const migracion = readFileSync(join(raiz, 'migrations/20261109140000-portfolio-items.cjs'), 'utf8');
const ensure = readFileSync(join(raiz, 'server/config/ensureSchema.ts'), 'utf8');

const sqlDeCrear = (texto: string) => {
  const m = texto.match(/CREATE TABLE IF NOT EXISTS portfolio_items \(([\s\S]*?)\)(?:`|\s*`\))/);
  if (!m) throw new Error('No encontré el CREATE TABLE de portfolio_items');
  return m[0].replace(/`\)?$/, '').trim();
};
const columnasDe = (sql: string) =>
  [...sql.matchAll(/(?:^|,|\()\s*([a-z_]+)\s+(?:UUID|VARCHAR|TEXT|NUMERIC|BOOLEAN|INTEGER|TIMESTAMPTZ)/gim)].map((m) => m[1].toLowerCase()).sort();

describe('portfolio_items: migración y modelo coinciden', () => {
  it('la migración y su espejo en ensureSchema crean las mismas columnas', () => {
    const deLaMigracion = columnasDe(sqlDeCrear(migracion));
    const delEspejo = columnasDe(sqlDeCrear(ensure));
    expect(deLaMigracion.length).toBeGreaterThan(15);
    expect(delEspejo).toEqual(deLaMigracion);
  });

  it('crean exactamente las columnas del modelo (ni una de menos ni una de más)', () => {
    const delModelo = Object.values((Portfolio as any).rawAttributes as Record<string, { field?: string }>)
      .map((a) => String(a.field))
      .sort();
    expect(columnasDe(sqlDeCrear(migracion))).toEqual(delModelo);
  });
});
