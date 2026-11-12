import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Descarga de la app para Android (APK) sin tienda (regla del dueño, 2026-11-12). Sin archivo: la descarga responde 404 con un mensaje claro y el estado dice
 * «no disponible» (el botón de la web sale apagado). Con archivo: se entrega como descarga con su tipo y la ficha (versión, tamaño) sale limpia.
 */
describe('descarga del APK', () => {
  let app: Express;
  let carpeta = '';

  beforeAll(async () => {
    carpeta = mkdtempSync(join(tmpdir(), 'apk-'));
    process.env.APK_DIR = carpeta;
    process.env.APP_ENV = 'staging';
    app = express();
    app.use('/api/app', (await import('../server/routes/appAndroid.js')).default);
  });

  afterAll(() => {
    delete process.env.APK_DIR;
    delete process.env.APP_ENV;
    rmSync(carpeta, { recursive: true, force: true });
  });

  it('sin archivo: estado «no disponible» y descarga 404 con código APK-NO-DISPONIBLE', async () => {
    const estado = await request(app).get('/api/app/android/estado');
    expect(estado.status).toBe(200);
    expect(estado.body).toMatchObject({ success: true, disponible: false });
    const bajada = await request(app).get('/api/app/android');
    expect(bajada.status).toBe(404);
    expect(bajada.body.code).toBe('APK-NO-DISPONIBLE');
  });

  it('un archivo vacío (subida a medio hacer) no se ofrece', async () => {
    writeFileSync(join(carpeta, 'doapp.apk'), '');
    expect((await request(app).get('/api/app/android/estado')).body.disponible).toBe(false);
    expect((await request(app).get('/api/app/android')).status).toBe(404);
  });

  it('con archivo: se descarga como adjunto con el tipo del APK, sin guardarse en intermediarios, y el estado trae versión y tamaño', async () => {
    writeFileSync(join(carpeta, 'doapp.apk'), Buffer.alloc(2 * 1024 * 1024, 7));
    writeFileSync(join(carpeta, 'doapp.apk.json'), JSON.stringify({ version: '2.0.0', build: '57', fecha: '2026-11-12T10:00:00Z' }));
    const estado = await request(app).get('/api/app/android/estado');
    expect(estado.body).toMatchObject({ success: true, disponible: true, version: '2.0.0', build: '57', tamanoMB: 2, fecha: '2026-11-12T10:00:00Z' });
    const bajada = await request(app).get('/api/app/android').buffer(true).parse((res, cb) => {
      const trozos: Buffer[] = [];
      res.on('data', (c: Buffer) => trozos.push(c));
      res.on('end', () => cb(null, Buffer.concat(trozos)));
    });
    expect(bajada.status).toBe(200);
    expect(bajada.headers['content-type']).toContain('application/vnd.android.package-archive');
    expect(bajada.headers['content-disposition']).toContain('attachment');
    expect(bajada.headers['content-disposition']).toContain('doapp.apk');
    expect(bajada.headers['cache-control']).toBe('no-cache');
    expect((bajada.body as Buffer).length).toBe(2 * 1024 * 1024);
  });

  it('una ficha rota o con texto raro no rompe la pantalla pública: se descarta lo que no cumple', async () => {
    writeFileSync(join(carpeta, 'doapp.apk.json'), JSON.stringify({ version: '<script>alert(1)</script>', build: 'abc', fecha: 'ayer' }));
    const estado = await request(app).get('/api/app/android/estado');
    expect(estado.body.disponible).toBe(true);
    expect(estado.body.version).toBeNull();
    expect(estado.body.build).toBeNull();
    writeFileSync(join(carpeta, 'doapp.apk.json'), '{no es json');
    expect((await request(app).get('/api/app/android/estado')).body.disponible).toBe(true);
  });

  it('en PRODUCCIÓN no se ofrece aunque el archivo exista: el estado dice «oculto» y la descarga da 404', async () => {
    writeFileSync(join(carpeta, 'doapp.apk'), Buffer.alloc(1024, 1));
    process.env.APP_ENV = 'production';
    try {
      const estado = await request(app).get('/api/app/android/estado');
      expect(estado.body).toMatchObject({ success: true, disponible: false, oculto: true });
      expect((await request(app).get('/api/app/android')).status).toBe(404);
    } finally {
      process.env.APP_ENV = 'staging';
    }
  });

  it('el nombre del archivo es fijo: nada del pedido entra en la ruta del disco', async () => {
    const r = await request(app).get('/api/app/android/../../etc/passwd');
    expect([404, 400]).toContain(r.status);
  });
});
