import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import fs from 'node:fs';

/**
 * La foto de perfil se guarda y sigue ahí al actualizar la página (reporte del dueño, 2026-11-17: «cambio la foto, guardo, actualizo y no aparece más»).
 * Camino completo con la base de pruebas real: subir → /auth/me la devuelve → el archivo se sirve → guardar la configuración NO la borra.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { archivoPorConsulta } from '../../server/middleware/archivoPorConsulta.js';
import { protegerArchivosPrivados } from '../../server/middleware/archivosPrivados.js';
import { crearUsuario } from '../helpers/fixtures.js';

// PNG de 1×1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('foto de perfil', () => {
  let app: Express;
  let persona: any;
  let archivo = '';
  const con = () => ({ Authorization: `Bearer ${jwt.sign({ id: persona.id, email: persona.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));
    // La dirección con la que la web pide las imágenes (el nginx del servidor responde solo a las que terminan en .png/.jpg): server/index.ts.
    const porConsulta = express.Router();
    porConsulta.use(archivoPorConsulta, protegerArchivosPrivados, express.static(path.join(process.cwd(), 'uploads')));
    app.use('/api/archivo', porConsulta);
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    // El manejador de errores de verdad: convierte «archivo demasiado grande» en un mensaje claro.
    app.use((await import('../../server/middleware/errorHandler.js')).errorHandler as any);
    persona = await crearUsuario({ role: 'client', dniVerified: true });
  });

  afterAll(async () => {
    try {
      if (archivo) fs.unlinkSync(path.join(process.cwd(), 'uploads', 'avatars', archivo));
    } catch { /* no pasa nada si ya no está */ }
    try {
      await User.destroy({ where: { id: persona.id }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('se sube, queda guardada y /auth/me la devuelve', async () => {
    const r = await request(app).post('/api/auth/upload-avatar').set(con()).attach('avatar', PNG, { filename: 'foto.png', contentType: 'image/png' });
    expect(r.status).toBe(200);
    expect(r.body.avatar).toMatch(/^\/uploads\/avatars\/.+\.png$/);
    archivo = path.basename(r.body.avatar);

    const me = await request(app).get('/api/auth/me').set(con());
    expect(me.status).toBe(200);
    expect(me.body.user.avatar).toBe(r.body.avatar);
  });

  it('el archivo se sirve por la dirección que usa la web (/api/uploads/avatars/…)', async () => {
    const r = await request(app).get(`/api/uploads/avatars/${archivo}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/image\/png/);
  });

  it('y por la dirección SIN extensión (?ruta=…), la que usa la web: llega a la aplicación y entrega la imagen', async () => {
    const r = await request(app).get('/api/archivo').query({ ruta: `avatars/${archivo}`, v: '123' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/image\/png/);
    const sinRuta = await request(app).get('/api/archivo');
    expect(sinRuta.status).toBe(400);
    // una ruta que se escapa de la carpeta no entrega nada
    const fuera = await request(app).get('/api/archivo').query({ ruta: '../package.json' });
    expect(fuera.status).not.toBe(200);
  });

  it('guardar la configuración después no borra la foto', async () => {
    const r = await request(app).put('/api/auth/settings').set(con()).send({ name: 'Nombre Nuevo', bio: 'una bio' });
    expect(r.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set(con());
    expect(me.body.user.avatar).toMatch(/\/uploads\/avatars\/.+\.png$/);
  });

  it('una imagen enorme se rechaza con un mensaje claro (no queda como si se hubiera guardado)', async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024, 1)]);
    const r = await request(app).post('/api/auth/upload-avatar').set(con()).attach('avatar', grande, { filename: 'grande.png', contentType: 'image/png' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.success).toBe(false);
    expect(String(r.body.message || '')).toMatch(/demasiado grande/i);
  });
});
