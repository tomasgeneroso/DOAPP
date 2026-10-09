import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { entornoLimpioParaPromover } from '../server/services/deployInfo.js';

/**
 * Promover staging a producción.
 *
 * staging lanza scripts/promote-to-prod.sh con TODO su entorno ({ ...process.env }): DB_NAME, DB_PASSWORD,
 * PORT=3002, APP_ENV=staging, las claves de prueba. El script corre en el directorio de producción
 * `sequelize-cli db:migrate` y `pm2 restart --update-env`, y dotenv NO pisa variables que ya existen: las
 * migraciones podían correr contra la base de staging y producción reiniciarse con la configuración de
 * staging. Además el chequeo de salud apuntaba al puerto 5000 y producción escucha en el 3001.
 */

describe('entornoLimpioParaPromover', () => {
  const entornoDeStaging = {
    PATH: '/usr/local/bin:/usr/bin',
    HOME: '/home/doapp',
    USER: 'doapp',
    LANG: 'es_AR.UTF-8',
    PM2_HOME: '/home/doapp/.pm2',
    // lo que NO tiene que llegar al script:
    NODE_ENV: 'staging',
    APP_ENV: 'staging',
    PORT: '3002',
    DB_NAME: 'doapp_staging',
    DB_USER: 'staging_user',
    DB_PASSWORD: 'no-es-un-secreto-real',
    DATABASE_URL: 'postgres://staging',
    JWT_SECRET: 'jwt-de-staging',
    ENCRYPTION_KEY: 'clave-de-staging',
    MERCADOPAGO_ACCESS_TOKEN: 'TEST-token',
    SMTP_PASS: 'x',
    CLIENT_URL: 'https://staging.doapparg.com',
  } as NodeJS.ProcessEnv;

  it('deja pasar lo que bash, git, npm y pm2 necesitan', () => {
    const e = entornoLimpioParaPromover(entornoDeStaging);
    expect(e.PATH).toBe('/usr/local/bin:/usr/bin');
    expect(e.HOME).toBe('/home/doapp');
    expect(e.PM2_HOME).toBe('/home/doapp/.pm2');
    expect(e.LANG).toBe('es_AR.UTF-8');
  });

  it('NO deja pasar la base, el puerto, el entorno, ni ninguna clave de staging', () => {
    const e = entornoLimpioParaPromover(entornoDeStaging);
    for (const nombre of ['NODE_ENV', 'APP_ENV', 'PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY', 'MERCADOPAGO_ACCESS_TOKEN', 'SMTP_PASS', 'CLIENT_URL']) {
      expect([nombre, e[nombre]]).toEqual([nombre, undefined]);
    }
  });

  it('marca que la promoción la lanzó la aplicación', () => {
    expect(entornoLimpioParaPromover(entornoDeStaging).PROMOTED_BY_APP).toBe('1');
  });

  it('no inventa variables que el entorno de origen no tenía', () => {
    const e = entornoLimpioParaPromover({ PATH: '/bin' } as unknown as NodeJS.ProcessEnv);
    expect(Object.keys(e).sort()).toEqual(['PATH', 'PROMOTED_BY_APP']);
  });

  it('permite pisar desde afuera sólo lo que el script declara (dónde vive producción y su puerto)', () => {
    const e = entornoLimpioParaPromover({ PATH: '/bin', PROD_DIR: '/srv/doapp', PROD_PM2: 'doapp', PROD_PORT: '3001' } as unknown as NodeJS.ProcessEnv);
    expect(e.PROD_DIR).toBe('/srv/doapp');
    expect(e.PROD_PM2).toBe('doapp');
    expect(e.PROD_PORT).toBe('3001');
  });
});

describe('scripts/promote-to-prod.sh', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/promote-to-prod.sh'), 'utf8');

  it('descarta la configuración heredada (base, puerto, claves) antes de migrar y reiniciar', () => {
    const descarte = script.indexOf('unset "$variable"');
    expect(descarte).toBeGreaterThan(0);
    expect(script.indexOf('db:migrate')).toBeGreaterThan(descarte);
    expect(script.indexOf('pm2 restart')).toBeGreaterThan(descarte);
    for (const prefijo of ['DB_', 'DATABASE_URL', 'PORT', 'APP_ENV', 'NODE_ENV', 'JWT_', 'ENCRYPTION_KEY', 'MERCADOPAGO_', 'SMTP_']) {
      expect(script).toContain(prefijo);
    }
  });

  it('migra y reinicia con NODE_ENV=production (sin él, las migraciones usan la base de desarrollo)', () => {
    const descarte = script.indexOf('unset "$variable"');
    const exporta = script.indexOf('export NODE_ENV=production');
    expect(exporta).toBeGreaterThan(descarte);
    expect(exporta).toBeLessThan(script.indexOf('npx sequelize-cli db:migrate'));
    expect(exporta).toBeLessThan(script.indexOf('pm2 restart "$PROD_PM2"'));
    expect(script).toContain('db:migrate --env production');
  });

  it('el chequeo de salud apunta al puerto de producción (3001, ver ecosystem.config.cjs), no al 5000', () => {
    const ecosistema = readFileSync(join(process.cwd(), 'ecosystem.config.cjs'), 'utf8');
    expect(ecosistema).toMatch(/PORT:\s*3001/);
    expect(script).toContain('${PROD_PORT:-3001}');
    expect(script).not.toContain('${PROD_PORT:-5000}');
  });

  it('el servicio que lo lanza usa el entorno mínimo, no una copia de process.env', () => {
    const servicio = readFileSync(join(process.cwd(), 'server/services/deployInfo.ts'), 'utf8');
    expect(servicio).toContain('env: entornoLimpioParaPromover()');
    expect(servicio).not.toMatch(/env:\s*\{\s*\.\.\.process\.env/);
  });
});
