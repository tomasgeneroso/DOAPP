import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Descargar una factura desde la app. La ruta de descarga exige sesión (cabecera Authorization), pero la app abre el PDF
 * con el navegador del teléfono, que no la manda: la persona veía un error. Ahora la app pide una dirección firmada de
 * corta vida y la abre. Lo que se cuida acá: sirve sólo para esa factura y esa persona, vence, y NO sirve como sesión.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));
jest.mock('../../server/services/mercadopago.js', () => ({ __esModule: true, default: {} }));

import { User } from '../../server/models/sql/User.model.js';
import { Invoice } from '../../server/models/sql/Invoice.model.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { config } from '../../server/config/env.js';
import { firmarDescargaDeFactura, verificarDescargaDeFactura } from '../../server/services/descargaDeFactura.js';

describe('descarga de facturas con dirección firmada', () => {
  let app: Express;
  let duena: any, otra: any;
  let factura: any, facturaDeOtra: any;
  let carpeta: string;
  const sesion = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, config.jwtSecret)}` });
  const crearFactura = (userId: string, numero: string, archivo: string) =>
    Invoice.create({
      invoiceNumber: numero, type: 'client_payment', userId, amount: 1000, commission: 0, total: 1000,
      currency: 'ARS', status: 'generated', pdfUrl: archivo, metadata: {},
    } as any) as Promise<any>;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    duena = await crearUsuario({ role: 'client' });
    otra = await crearUsuario({ role: 'client' });
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'facturas-'));
    const pdf = path.join(carpeta, 'a.pdf');
    const pdfDeOtra = path.join(carpeta, 'b.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 factura de la dueña');
    fs.writeFileSync(pdfDeOtra, '%PDF-1.4 factura de otra');
    const sufijo = Date.now().toString(36);
    factura = await crearFactura(duena.id, `T-${sufijo}-1`, pdf);
    facturaDeOtra = await crearFactura(otra.id, `T-${sufijo}-2`, pdfDeOtra);
  });

  afterAll(async () => {
    try {
      await Invoice.destroy({ where: { userId: [duena.id, otra.id] }, force: true });
      await User.destroy({ where: { id: [duena.id, otra.id] }, force: true });
      fs.rmSync(carpeta, { recursive: true, force: true });
    } catch { /* ok */ }
  });

  const pedirDireccion = (id: string, quien: any) =>
    request(app).post(`/api/payments/invoices/${id}/download-link`).set(sesion(quien)).send({});

  it('la dueña pide la dirección y con ella baja el PDF SIN mandar sesión', async () => {
    const r = await pedirDireccion(factura.id, duena);
    expect(r.status).toBe(200);
    expect(r.body.ruta).toMatch(new RegExp(`^/payments/invoices/${factura.id}/download-signed\\?t=`));

    const descarga = await request(app).get(`/api${r.body.ruta}`); // sin Authorization
    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-type']).toMatch(/application\/pdf/);
    expect(descarga.headers['content-disposition']).toContain(`factura_${factura.invoiceNumber}.pdf`);
    expect(descarga.headers['cache-control']).toBe('no-store');
    expect(Buffer.from(descarga.body).toString()).toContain('factura de la dueña');
  });

  it('no se puede pedir la dirección de la factura de otra persona (404, sin firmar nada)', async () => {
    const r = await pedirDireccion(facturaDeOtra.id, duena);
    expect(r.status).toBe(404);
    expect(r.body.ruta).toBeUndefined();
  });

  it('pedir la dirección exige sesión', async () => {
    const r = await request(app).post(`/api/payments/invoices/${factura.id}/download-link`).send({});
    expect(r.status).toBe(401);
  });

  it('sin firma, con una firma inventada o rota: 401 y no se entrega nada', async () => {
    for (const t of ['', 'abc', 'a.b.c', 'x'.repeat(3000)]) {
      const r = await request(app).get(`/api/payments/invoices/${factura.id}/download-signed`).query({ t });
      expect(r.status).toBe(401);
    }
    const sinParametro = await request(app).get(`/api/payments/invoices/${factura.id}/download-signed`);
    expect(sinParametro.status).toBe(401);
  });

  it('la firma de una factura NO sirve para otra', async () => {
    const firma = firmarDescargaDeFactura(String(factura.id), String(duena.id));
    const r = await request(app).get(`/api/payments/invoices/${facturaDeOtra.id}/download-signed`).query({ t: firma });
    expect(r.status).toBe(401);
  });

  it('una firma de la dueña sobre la factura de otra persona no entrega el archivo (la factura tiene que ser de quien firmó)', async () => {
    const firma = firmarDescargaDeFactura(String(facturaDeOtra.id), String(duena.id));
    const r = await request(app).get(`/api/payments/invoices/${facturaDeOtra.id}/download-signed`).query({ t: firma });
    expect(r.status).toBe(404);
  });

  it('una firma vencida no sirve', async () => {
    jest.useFakeTimers({ now: Date.now() - 10 * 60 * 1000, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const vieja = firmarDescargaDeFactura(String(factura.id), String(duena.id));
    jest.useRealTimers();
    expect(verificarDescargaDeFactura(vieja, String(factura.id))).toBeNull();
    const r = await request(app).get(`/api/payments/invoices/${factura.id}/download-signed`).query({ t: vieja });
    expect(r.status).toBe(401);
  });

  it('la firma de descarga NO sirve como sesión (clave derivada distinta): ninguna ruta protegida la acepta', async () => {
    const firma = firmarDescargaDeFactura(String(factura.id), String(duena.id));
    const r = await request(app).get('/api/payments/invoices').set({ Authorization: `Bearer ${firma}` });
    expect(r.status).toBe(401);
  });

  it('un token de SESIÓN no sirve como firma de descarga', async () => {
    const sesionJwt = jwt.sign({ id: duena.id, email: duena.email }, config.jwtSecret, { expiresIn: 300 });
    expect(verificarDescargaDeFactura(sesionJwt, String(factura.id))).toBeNull();
    const r = await request(app).get(`/api/payments/invoices/${factura.id}/download-signed`).query({ t: sesionJwt });
    expect(r.status).toBe(401);
  });

  it('una firma con la misma forma pero hecha con la clave de las SESIONES no vale (la clave de descarga es otra)', async () => {
    const conLaClaveDeSesion = jwt.sign(
      { typ: 'descarga-de-factura', inv: String(factura.id), sub: String(duena.id) },
      config.jwtSecret,
      { expiresIn: 300 },
    );
    expect(verificarDescargaDeFactura(conLaClaveDeSesion, String(factura.id))).toBeNull();
  });

  it('un token firmado con la clave correcta pero de otro tipo se rechaza', async () => {
    // Se arma como lo haría alguien que conociera la clave derivada: el campo `typ` sigue siendo obligatorio.
    const crypto = await import('crypto');
    const clave = crypto.createHash('sha256').update(`${config.jwtSecret}:descarga-de-factura`).digest('hex');
    const raro = jwt.sign({ typ: 'otra-cosa', inv: String(factura.id), sub: String(duena.id) }, clave, { expiresIn: 300 });
    expect(verificarDescargaDeFactura(raro, String(factura.id))).toBeNull();
  });

  it('si el archivo ya no está, 404 claro (no un error del servidor)', async () => {
    const huerfana = await crearFactura(duena.id, `T-${Date.now().toString(36)}-3`, path.join(carpeta, 'no-existe.pdf'));
    const firma = firmarDescargaDeFactura(String(huerfana.id), String(duena.id));
    const r = await request(app).get(`/api/payments/invoices/${huerfana.id}/download-signed`).query({ t: firma });
    expect(r.status).toBe(404);
  });

  it('la descarga con sesión de siempre sigue funcionando', async () => {
    const r = await request(app).get(`/api/payments/invoices/${factura.id}/download`).set(sesion(duena));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/pdf/);
  });
});
