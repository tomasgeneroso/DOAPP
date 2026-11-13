import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El build de la web llama siempre a su propio sitio (`/api`), no a lo que diga `VITE_API_URL` en el `.env` del servidor.
 *
 * Informe del dueño (2026-11-13): en staging, confirmar un pago, abrir un expediente y aceptar/rechazar un pago daban «Failed to fetch» y
 * `Access to fetch at 'https://doapparg.com/api/...' from origin 'https://staging.doapparg.com' has been blocked by CORS`. El servidor recompila la web con su
 * `.env`, el de staging era una copia del de producción y la web de staging hablaba con la API de producción.
 */
const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('vite.config.ts fija la dirección de la API del build', () => {
  it("en el build `import.meta.env.VITE_API_URL` es '/api' pase lo que pase con el .env", () => {
    expect(config).toMatch(/command === 'build' \? \{ 'import\.meta\.env\.VITE_API_URL': JSON\.stringify\('\/api'\) \}/);
  });

  it('usa la forma de función de defineConfig para conocer el comando', () => {
    expect(config).toMatch(/defineConfig\(\(\{ command \}\) => \(\{/);
  });
});
