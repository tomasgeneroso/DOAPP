import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { verificarBaseDeStaging } from '../server/config/guardaDeStaging.js';

/** Incidente 2026-10-18: staging corría contra la base de producción (su .env se copió de producción y `DATABASE_URL` no se lee). */
describe('staging no puede usar la base de producción', () => {
  it('APP_ENV=staging con la base de producción (o sin DB_NAME) no arranca, y el mensaje dice qué cambiar', () => {
    expect(() => verificarBaseDeStaging({ APP_ENV: 'staging', DB_NAME: 'doapp' })).toThrow(/DB_NAME, DB_USER y DB_PASSWORD/);
    expect(() => verificarBaseDeStaging({ APP_ENV: 'staging' })).toThrow(/base de producción/);
    expect(() => verificarBaseDeStaging({ APP_ENV: 'staging', DB_NAME: ' doapp ' })).toThrow();
  });

  it('si la app y las migraciones apuntan a bases distintas, tampoco arranca (y el mensaje no muestra la clave)', () => {
    const url = (base: string) => `postgres://doappuser:SECRETO@localhost:5432/${base}`;
    expect(() => verificarBaseDeStaging({ APP_ENV: 'staging', DB_NAME: 'doapp_staging', DATABASE_URL: url('doapp') })).toThrow(/dos bases distintas/);
    try {
      verificarBaseDeStaging({ APP_ENV: 'staging', DB_NAME: 'doapp_staging', DATABASE_URL: url('otra') });
    } catch (e: any) {
      expect(e.message).not.toContain('SECRETO');
    }
    expect(() => verificarBaseDeStaging({ APP_ENV: 'staging', DB_NAME: 'doapp_staging', DATABASE_URL: url('doapp_staging') })).not.toThrow();
  });

  it('con una base propia arranca; producción y desarrollo no se ven afectados', () => {
    expect(() => verificarBaseDeStaging({ APP_ENV: 'staging', DB_NAME: 'doapp_staging' })).not.toThrow();
    expect(() => verificarBaseDeStaging({ APP_ENV: 'production', DB_NAME: 'doapp' })).not.toThrow();
    expect(() => verificarBaseDeStaging({ NODE_ENV: 'production' })).not.toThrow();
  });

  it('el ecosistema de staging declara APP_ENV=staging (sin eso la guarda no se activa)', () => {
    const eco = readFileSync(join(process.cwd(), 'ecosystem.staging.config.cjs'), 'utf8');
    expect(eco).toContain("APP_ENV: 'staging'");
  });
});
