import { defineConfig, devices } from '@playwright/test';
import { URL_DE_LA_WEB } from './entorno/variables';

/**
 * Las pruebas «reales»: un navegador de verdad hace lo que haría una persona sobre el sistema de DOAPP completo (build de producción de la web,
 * servidor en modo producción, base de datos propia). Lo único que no es real son los terceros, que son gemelos locales (ver `gemelos/`).
 *
 *   npm run test:real                     todas
 *   npm run test:real -- -g "A1"          un caso (los nombres llevan el número de la lista de pruebas manuales)
 *   npm run test:real:ver                 con el navegador a la vista
 */
export default defineConfig({
  testDir: './casos',
  globalSetup: './entorno/levantar.ts',
  outputDir: './.resultados',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: './.informe' }]],
  use: {
    baseURL: URL_DE_LA_WEB,
    ignoreHTTPSErrors: true,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] }, grep: /@celular/ },
  ],
});
