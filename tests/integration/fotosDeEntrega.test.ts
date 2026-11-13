import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

/**
 * Fotos de entrega (pedido del dueño, 2026-11-13): al terminar el trabajo se pueden dejar fotos de cómo quedó. Solo las partes, solo con el trabajo en marcha o
 * esperando la confirmación, hasta un tope, solo imágenes, y la carpeta es privada (las ven las partes y el equipo). Base de pruebas real.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { parsearRutaDeArchivo, CARPETAS_PRIVADAS, protegerArchivosPrivados } from '../../server/middleware/archivosPrivados.js';

// Un PNG de 1×1 válido.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('fotos de entrega del contrato', () => {
  let app: Express;
  let cliente: any, trabajador: any, ajeno: any;
  const creados = { contratos: [] as string[], jobs: [] as string[], archivos: [] as string[] };
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  const nuevoContrato = async (status: string) => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'in_progress', publicationPaid: true });
    creados.jobs.push(trabajo.id);
    const contrato: any = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status, price: 5000 });
    creados.contratos.push(contrato.id);
    return contrato;
  };
  const guardar = (r: any) => {
    for (const f of r.body?.fotos ?? []) creados.archivos.push(path.join(process.cwd(), 'uploads', 'delivery', path.basename(f.url)));
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/uploads', protegerArchivosPrivados, express.static(path.join(process.cwd(), 'uploads')));
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
    ajeno = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  afterAll(async () => {
    try {
      for (const a of creados.archivos) await fs.promises.unlink(a).catch(() => undefined);
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: [cliente, trabajador, ajeno].map((u) => u.id) }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('el trabajador deja fotos con el trabajo en marcha: quedan con autor y fecha, y el otro lado las ve', async () => {
    const c = await nuevoContrato('in_progress');
    const r = await request(app).post(`/api/contracts/${c.id}/delivery-photos`).set(con(trabajador))
      .attach('fotos', PNG, { filename: 'cocina.png', contentType: 'image/png' })
      .attach('fotos', PNG, { filename: 'bano.png', contentType: 'image/png' });
    guardar(r);
    expect(r.status).toBe(200);
    expect(r.body.fotos).toHaveLength(2);
    expect(r.body.fotos[0]).toMatchObject({ subidoPor: 'worker', subidoPorId: trabajador.id, nombre: 'cocina.png' });
    expect(r.body.fotos[0].url).toMatch(/^\/uploads\/delivery\//);
    expect(new Date(r.body.fotos[0].subidoEl).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(((await Contract.findByPk(c.id)) as any).deliveryPhotos).toHaveLength(2);
    // El estado del contrato y el pago no se tocan.
    expect(((await Contract.findByPk(c.id)) as any).status).toBe('in_progress');
  });

  it('también con el contrato esperando la confirmación; el cliente puede dejar las suyas', async () => {
    const c = await nuevoContrato('awaiting_confirmation');
    const r = await request(app).post(`/api/contracts/${c.id}/delivery-photos`).set(con(cliente))
      .attach('fotos', PNG, { filename: 'detalle.png', contentType: 'image/png' });
    guardar(r);
    expect(r.status).toBe(200);
    expect(r.body.fotos[0].subidoPor).toBe('client');
  });

  it('una persona ajena al contrato no puede (403/404) y la foto no queda en el disco', async () => {
    const c = await nuevoContrato('in_progress');
    const antes = fs.existsSync(path.join(process.cwd(), 'uploads', 'delivery')) ? fs.readdirSync(path.join(process.cwd(), 'uploads', 'delivery')).length : 0;
    const r = await request(app).post(`/api/contracts/${c.id}/delivery-photos`).set(con(ajeno))
      .attach('fotos', PNG, { filename: 'x.png', contentType: 'image/png' });
    // Con la seguridad por fila de la base, el contrato ajeno ni siquiera se ve: 404 (o 403 si se viera). Lo importante: no se guarda nada.
    expect([403, 404]).toContain(r.status);
    const despues = fs.existsSync(path.join(process.cwd(), 'uploads', 'delivery')) ? fs.readdirSync(path.join(process.cwd(), 'uploads', 'delivery')).length : 0;
    expect(despues).toBe(antes);
    expect(((await Contract.findByPk(c.id)) as any).deliveryPhotos).toHaveLength(0);
  });

  it('con el contrato terminado ya no se agregan (409), y sin archivos es 400', async () => {
    const terminado = await nuevoContrato('completed');
    const r1 = await request(app).post(`/api/contracts/${terminado.id}/delivery-photos`).set(con(trabajador))
      .attach('fotos', PNG, { filename: 'tarde.png', contentType: 'image/png' });
    expect(r1.status).toBe(409);
    expect(r1.body.code).toBe('FOTOS_FUERA_DE_TIEMPO');

    const enMarcha = await nuevoContrato('in_progress');
    const r2 = await request(app).post(`/api/contracts/${enMarcha.id}/delivery-photos`).set(con(trabajador)).send({});
    expect(r2.status).toBe(400);
    expect(r2.body.code).toBe('SIN_FOTOS');
  });

  it('solo imágenes: un documento se rechaza', async () => {
    const c = await nuevoContrato('in_progress');
    const r = await request(app).post(`/api/contracts/${c.id}/delivery-photos`).set(con(trabajador))
      .attach('fotos', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(((await Contract.findByPk(c.id)) as any).deliveryPhotos).toHaveLength(0);
  });

  it('hay un tope de fotos por contrato (8)', async () => {
    const c = await nuevoContrato('in_progress');
    for (let i = 0; i < 2; i++) {
      const r = await request(app).post(`/api/contracts/${c.id}/delivery-photos`).set(con(trabajador))
        .attach('fotos', PNG, { filename: `a${i}1.png`, contentType: 'image/png' })
        .attach('fotos', PNG, { filename: `a${i}2.png`, contentType: 'image/png' })
        .attach('fotos', PNG, { filename: `a${i}3.png`, contentType: 'image/png' })
        .attach('fotos', PNG, { filename: `a${i}4.png`, contentType: 'image/png' });
      guardar(r);
      expect(r.status).toBe(200);
    }
    const de_mas = await request(app).post(`/api/contracts/${c.id}/delivery-photos`).set(con(trabajador))
      .attach('fotos', PNG, { filename: 'extra.png', contentType: 'image/png' });
    expect(de_mas.status).toBe(400);
    expect(de_mas.body.code).toBe('TOPE_DE_FOTOS');
    expect(((await Contract.findByPk(c.id)) as any).deliveryPhotos).toHaveLength(8);
  });

  it('el archivo lo abren las dos partes; una persona ajena (403) o sin sesión (401) no', async () => {
    const c = await nuevoContrato('in_progress');
    const subida = await request(app).post(`/api/contracts/${c.id}/delivery-photos`).set(con(trabajador)).attach('fotos', PNG, { filename: 'p.png', contentType: 'image/png' });
    guardar(subida);
    const url: string = subida.body.fotos[0].url;
    expect((await request(app).get(url).set(con(trabajador))).status).toBe(200);
    expect((await request(app).get(url).set(con(cliente))).status).toBe(200);
    expect((await request(app).get(url).set(con(ajeno))).status).toBe(403);
    expect((await request(app).get(url)).status).toBe(401);
  });

  it('la carpeta de entrega es PRIVADA', () => {
    expect(CARPETAS_PRIVADAS).toContain('delivery');
    expect(parsearRutaDeArchivo('/delivery/abc.png')).toEqual({ carpeta: 'delivery', archivo: 'abc.png' });
  });
});
