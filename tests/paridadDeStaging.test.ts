import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import {
  compararMigraciones,
  compararVariables,
  nombresDeVariables,
  pendientesDeParidad,
  VARIABLES_QUE_DIFIEREN_POR_DISENO,
} from '../server/services/paridadDeEntornos.js';

/**
 * Staging con paridad (regla del dueño, 2026-11-09: «hacer el staging con paridad desde ahora»).
 *
 * Lo que había: staging era una copia a medias. Tenía UNA sola puerta antes de desplegar (los tipos del servidor) contra cuatro de producción, no tenía rollback ni la espera de
 * estabilidad de un minuto, reiniciaba con `startOrReload` en vez de parar y arrancar de cero, y nada impedía que las dos se separaran más con cada cambio en una y no en la otra.
 * Lo que se prueba en un entorno que recorre otro camino no prueba nada: «en staging andaba» es el incidente que esto evita.
 *
 * Esta prueba falla si `staging.yml` y `ci-cd.yml` se separan, o si la configuración de PM2 de staging difiere de la de producción en algo que no sea nombre, carpeta, puerto,
 * entorno y registros. Los secretos y los datos NO se igualan (staging usa claves de prueba y su propia base): paridad es de camino y de configuración, no de contenido.
 */

const raiz = process.cwd();
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const prod = leer('.github/workflows/ci-cd.yml');
const staging = leer('.github/workflows/staging.yml');
const requerir = createRequire(import.meta.url);

/** Solo el guion que corre en el servidor (desde guardar el commit anterior). */
const guion = (t: string) => t.slice(t.indexOf('ANTERIOR="$(git rev-parse HEAD)"'));

describe('staging recorre el mismo camino que producción', () => {
  it('las mismas puertas antes de desplegar: tipos, hooks de React, secretos, migraciones desde cero, build', () => {
    const puertas = [
      'npx tsc --noEmit --project tsconfig.server.json',
      "m.ruleId==='react-hooks/rules-of-hooks'",
      'sk-[a-zA-Z0-9]{20,}',
      'NODE_ENV=test npx sequelize-cli db:migrate',
      'NODE_ENV=test npx sequelize-cli db:migrate:undo',
      'npm run build:client',
      'Verify build output',
    ];
    for (const puerta of puertas) {
      expect([puerta, prod.includes(puerta)]).toEqual([puerta, true]);
      expect([puerta, staging.includes(puerta)]).toEqual([puerta, true]);
    }
  });

  it('el deploy de staging no sale si tipos, hooks o secretos fallan: depende del job de las puertas', () => {
    expect(staging).toMatch(/migrations:\n(?:.*\n)*?\s+needs: lint/);
    expect(staging).toMatch(/build:\n(?:.*\n)*?\s+needs: lint/);
    expect(staging).toMatch(/deploy-staging:\n(?:.*\n)*?\s+needs: \[build, migrations\]/);
  });

  it('los mismos pasos en el servidor, en el mismo orden', () => {
    const pasos = [
      'git rev-parse HEAD',
      'volver_atras() {',
      'git fetch origin',
      'git reset --hard',
      "trap 'volver_atras' ERR",
      'npm install --legacy-peer-deps',
      'npm run build:client',
      'NODE_ENV=production npx sequelize-cli db:migrate',
      'pm2 stop',
      'pm2 delete',
      'pm2 start',
      'seq 1 18',
      '/api/health',
      'for j in 1 2 3 4 5 6',
      'id="root"',
    ];
    for (const [nombre, t] of [['producción', guion(prod)], ['staging', guion(staging)]] as const) {
      let desde = 0;
      for (const paso of pasos) {
        const donde = t.indexOf(paso, desde);
        expect([nombre, paso, donde >= 0]).toEqual([nombre, paso, true]);
        desde = donde;
      }
    }
  });

  it('con rollback: las dos salidas con error vuelven al commit anterior y el rollback reconstruye y reinicia', () => {
    for (const t of [guion(prod), guion(staging)]) {
      expect([...t.matchAll(/volver_atras \|\| true\n\s+exit 1/g)].length).toBe(2);
      const bloque = t.slice(t.indexOf('volver_atras() {'), t.indexOf('echo "📥 Pulling latest code'));
      for (const paso of ['git reset --hard "$ANTERIOR"', 'npm run build:client', 'pm2 start']) expect(bloque).toContain(paso);
    }
  });

  it('el mismo tiempo máximo y la misma espera de estabilidad', () => {
    expect(staging).toContain('command_timeout: 25m');
    expect(prod).toContain('command_timeout: 25m');
    expect(guion(staging)).toContain('Confirming stability for 60s');
    expect(guion(prod)).toContain('Confirming stability for 60s');
  });

  it('lo único distinto en el servidor es carpeta, nombre en PM2, puerto y archivo de PM2', () => {
    // Producción con sus nombres cambiados por los de staging tiene que dejar los mismos comandos (salvo la rama, que en staging se elige).
    const comoStaging = guion(prod)
      .replace(/\/var\/www\/doapp\b/g, '/var/www/doapp-staging')
      .replace(/pm2 (stop|delete|logs) doapp\b/g, 'pm2 $1 doapp-staging')
      .replace(/ecosystem\.config\.cjs/g, 'ecosystem.staging.config.cjs')
      .replace(/localhost:3001/g, 'localhost:3002');
    const comandos = (t: string) =>
      t
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^(git |npm |NODE_ENV=|pm2 |curl |trap |volver_atras|for |seq )/.test(l) || /^\s*if .*curl/.test(l));
    // Lo que cambia por diseño: la rama (en staging se elige) y el nombre de dominio con el que nginx reconoce el sitio.
    const esperados = new Set(
      comandos(comoStaging).map((l) =>
        l.replace(/origin\/master/g, '"origin/${GITHUB_REF_NAME:-master}"').replace("curl -sf http://localhost/ 2", "curl -sf http://localhost/ -H 'Host: staging.doapparg.com' 2"),
      ),
    );
    const de = comandos(guion(staging));
    // Lo que staging agrega: apagar la trampa de rollback antes del informe de paridad y el informe mismo (solo lee).
    const sobrantes = de.filter((l) => !esperados.has(l) && !/paridadDeEntornos|tsx server\/scripts/.test(l) && l !== 'trap - ERR');
    expect(sobrantes).toEqual([]);
  });

  it('los comandos de producción que staging no tiene son solo los de producción (chequeo externo de Cloudflare)', () => {
    const faltan = ['pm2 logs doapp --lines 30 --nostream --err'].filter((c) => !guion(staging).includes(c));
    // staging no tiene Cloudflare delante: ese chequeo externo no aplica
    expect(faltan.length).toBeLessThanOrEqual(1);
  });
});

describe('la configuración de PM2 de staging es la de producción (salvo lo que tiene que cambiar)', () => {
  const p = requerir(join(raiz, 'ecosystem.config.cjs')).apps[0];
  const s = requerir(join(raiz, 'ecosystem.staging.config.cjs')).apps[0];
  const sinLoQueCambia = (a: Record<string, unknown>) => {
    const { name, cwd, env, env_production, error_file, out_file, ...resto } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
    return resto;
  };

  it('misma forma de correr: comando, argumentos, modo, reinicios y memoria', () => {
    expect(sinLoQueCambia(s)).toEqual(sinLoQueCambia(p));
  });

  it('lo que cambia está bien cambiado: otro nombre, otra carpeta, otro puerto y la marca de staging', () => {
    expect(s.name).toBe('doapp-staging');
    expect(p.name).toBe('doapp');
    expect(s.cwd).toBe('/var/www/doapp-staging');
    expect(p.cwd).toBe('/var/www/doapp');
    expect(s.env.PORT).not.toBe(p.env.PORT);
    expect(s.env.NODE_ENV).toBe(p.env.NODE_ENV); // staging corre en modo producción: es lo que se prueba
    expect(s.env.APP_ENV).toBe('staging');
    expect(p.env.APP_ENV).toBeUndefined();
    expect(s.error_file).not.toBe(p.error_file);
    expect(s.out_file).not.toBe(p.out_file);
  });
});

describe('el chequeo de paridad compara nombres y nunca valores', () => {
  const envProd = ['# comentario', 'DB_NAME=doapp', 'JWT_SECRET=secreto-de-produccion-123', 'MERCADOPAGO_ACCESS_TOKEN=APP_USR-xyz', 'SMTP_PASS=clave-del-correo', 'export NUEVA=1', '', 'PORT=3001'].join('\n');
  const envStaging = ['DB_NAME=doapp_staging', 'JWT_SECRET=otro', 'PORT=3002', 'SOLO_STAGING=1'].join('\n');

  it('lee los nombres (ignora comentarios, vacías y `export`) y no devuelve valores', () => {
    const nombres = nombresDeVariables(envProd);
    expect(nombres).toEqual(['DB_NAME', 'JWT_SECRET', 'MERCADOPAGO_ACCESS_TOKEN', 'NUEVA', 'PORT', 'SMTP_PASS']);
    expect(JSON.stringify(nombres)).not.toMatch(/secreto-de-produccion|APP_USR|clave-del-correo/);
  });

  it('dice qué le falta a staging y qué le sobra, sin tocar valores', () => {
    const d = compararVariables(nombresDeVariables(envProd), nombresDeVariables(envStaging));
    expect(d.faltanEnStaging).toEqual(['MERCADOPAGO_ACCESS_TOKEN', 'NUEVA', 'SMTP_PASS']);
    expect(d.soloEnStaging).toEqual(['SOLO_STAGING']);
    expect(d.enComun).toBe(3);
    expect(JSON.stringify(d)).not.toMatch(/secreto-de-produccion|APP_USR|clave-del-correo/);
  });

  it('una variable que debe ser distinta por diseño (base, puerto, URLs) no se reclama aunque falte', () => {
    const d = compararVariables(['DB_PASSWORD', 'CLIENT_URL', 'RESEND_API_KEY'], []);
    const pendientes = pendientesDeParidad(d, null, { produccion: null, staging: null });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toContain('RESEND_API_KEY');
    expect(pendientes[0]).not.toContain('DB_PASSWORD');
    expect(pendientes[0]).not.toContain('CLIENT_URL');
    for (const n of ['DB_NAME', 'DATABASE_URL', 'PORT', 'APP_ENV', 'CLIENT_URL']) expect(VARIABLES_QUE_DIFIEREN_POR_DISENO).toContain(n);
  });

  it('migraciones: lo que producción tiene y staging no es un pendiente; lo que staging tiene de más son las que vienen', () => {
    const m = compararMigraciones(['a', 'b', 'c'], ['a', 'b', 'd']);
    expect(m).toEqual({ soloEnProduccion: ['c'], soloEnStaging: ['d'] });
    const pendientes = pendientesDeParidad({ faltanEnStaging: [], soloEnStaging: [], enComun: 3 }, m, { produccion: null, staging: null });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toContain('c');
  });

  it('commits distintos se avisan; iguales, no; y sin diferencias no queda nada por corregir', () => {
    const vacio = { faltanEnStaging: [], soloEnStaging: [], enComun: 5 };
    expect(pendientesDeParidad(vacio, { soloEnProduccion: [], soloEnStaging: [] }, { produccion: 'abcdef1234', staging: '1234567abc' })).toHaveLength(1);
    expect(pendientesDeParidad(vacio, { soloEnProduccion: [], soloEnStaging: ['nueva'] }, { produccion: 'abcdef1234', staging: 'abcdef1234' })).toEqual([]);
  });
});

describe('la guía de staging explica la paridad', () => {
  const guia = leer('.github/STAGING.md');
  it('nombra el chequeo, qué se iguala y qué NO', () => {
    expect(guia).toContain('paridadDeEntornos');
    expect(guia).toMatch(/claves de prueba/i);
  });
});
