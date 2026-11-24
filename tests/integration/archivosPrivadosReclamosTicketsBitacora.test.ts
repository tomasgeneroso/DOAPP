import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Reclamos, tickets y bitácora ya no son públicos por dirección (auditoría de seguridad, 2026-11-24).
 * Fotos del DNI, capturas del banco y el interior de las casas estaban a una dirección de distancia de cualquiera que la conociera: la dirección aparece en
 * respuestas de la API, registros y capturas, y no vence. Ahora las ven las partes y el equipo; la app móvil usa enlaces firmados de 10 minutos.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { Post } from '../../server/models/sql/Post.model.js';
import { protegerArchivosPrivados, firmarArchivo, firmaValida } from '../../server/middleware/archivosPrivados.js';
import { archivoPorConsulta } from '../../server/middleware/archivoPorConsulta.js';
import { crearUsuario, crearTrabajo, crearContrato, crearDisputa } from '../helpers/fixtures.js';
import { siguienteNumeroDeTicket } from '../../server/services/numeroDeTicket.js';
import { sequelize } from '../../server/config/database.js';

describe('reclamos, tickets y bitácora: privados', () => {
  let app: Express;
  let raiz: string;
  let cliente: any, trabajador: any, ajeno: any, soporte: any, marketing: any;
  let jobId = '', contratoId = '', disputaId = '', ticketId = '';
  const posts: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const ARCHIVOS = {
    prueba: 'disputes/prueba-del-reclamo.png',
    deLaPublicacion: 'disputes/foto-de-publicacion.png',
    sinPublicar: 'disputes/foto-de-borrador.png',
    ticket: 'tickets/captura.png',
    bitacora: 'daily-log/obra-dia-1.png',
  };

  beforeAll(async () => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'doapp-privados-'));
    for (const a of Object.values(ARCHIVOS)) {
      fs.mkdirSync(path.join(raiz, path.dirname(a)), { recursive: true });
      fs.writeFileSync(path.join(raiz, a), 'contenido-de-prueba');
    }
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    ajeno = await crearUsuario({ role: 'client' });
    soporte = await crearUsuario({ role: 'client', adminRole: 'support' });
    marketing = await crearUsuario({ role: 'client', adminRole: 'marketing' });
    const t: any = await crearTrabajo(cliente.id, { status: 'in_progress' });
    jobId = t.id;
    const c: any = await crearContrato({ jobId, clientId: cliente.id, doerId: trabajador.id }, { status: 'in_progress' });
    contratoId = c.id;
    await Contract.update({ dailyLog: [{ date: '2026-11-01', attachments: [{ url: '/uploads/daily-log/obra-dia-1.png', name: 'obra' }] }] } as any, { where: { id: contratoId } });
    const d: any = await crearDisputa(
      { contractId: contratoId, initiatedBy: cliente.id, against: trabajador.id },
      { evidence: [{ fileUrl: 'https://doapparg.com/uploads/disputes/prueba-del-reclamo.png', fileName: 'prueba.png' }] },
    );
    disputaId = d.id;
    const tk: any = await Ticket.create({
      ticketNumber: await siguienteNumeroDeTicket(sequelize),
      subject: 'Consulta', category: 'support', priority: 'medium', status: 'open', createdBy: cliente.id,
      messages: [{ author: cliente.id, message: 'Adjunto', isInternal: false, attachments: [{ fileUrl: 'http://127.0.0.1:3001/uploads/tickets/captura.png', fileName: 'captura.png' }] }],
    } as any);
    ticketId = tk.id;
    const publicada: any = await Post.create({ author: cliente.id, title: 'Publicada', description: 'x', type: 'post', isPublished: true, gallery: [{ url: '/uploads/disputes/foto-de-publicacion.png', type: 'image' }] } as any);
    const borrador: any = await Post.create({ author: cliente.id, title: 'Borrador', description: 'x', type: 'post', isPublished: false, gallery: [{ url: '/uploads/disputes/foto-de-borrador.png', type: 'image' }] } as any);
    posts.push(publicada.id, borrador.id);

    app = express();
    const enlace = (await import('../../server/routes/archivoEnlace.js')).default;
    app.use('/api/archivo/enlace', enlace);
    app.use('/uploads', protegerArchivosPrivados, express.static(raiz));
    const porConsulta = express.Router();
    porConsulta.use(archivoPorConsulta, protegerArchivosPrivados, express.static(raiz));
    app.use('/api/archivo', porConsulta);
  });

  afterAll(async () => {
    try {
      await Post.destroy({ where: { id: posts } });
      await Ticket.destroy({ where: { id: ticketId }, force: true } as any);
      await Dispute.destroy({ where: { id: disputaId }, force: true } as any);
      await Contract.destroy({ where: { id: contratoId }, force: true } as any);
      await Job.destroy({ where: { id: jobId }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id, ajeno.id, soporte.id, marketing.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
    try { fs.rmSync(raiz, { recursive: true, force: true }); } catch { /* ya no está */ }
  });

  describe('quién ve cada archivo', () => {
    it.each([
      ['la prueba de un reclamo', ARCHIVOS.prueba],
      ['el adjunto de un ticket', ARCHIVOS.ticket],
      ['la foto de la bitácora', ARCHIVOS.bitacora],
    ])('%s: sin sesión 401, una persona ajena 403', async (_n, archivo) => {
      expect((await request(app).get(`/uploads/${archivo}`)).status).toBe(401);
      expect((await request(app).get(`/uploads/${archivo}`).set(con(ajeno))).status).toBe(403);
    });

    it('la prueba de un reclamo la ven quien lo inició y contra quien es, y el equipo (no marketing)', async () => {
      expect((await request(app).get(`/uploads/${ARCHIVOS.prueba}`).set(con(cliente))).status).toBe(200);
      expect((await request(app).get(`/uploads/${ARCHIVOS.prueba}`).set(con(trabajador))).status).toBe(200);
      expect((await request(app).get(`/uploads/${ARCHIVOS.prueba}`).set(con(soporte))).status).toBe(200);
      expect((await request(app).get(`/uploads/${ARCHIVOS.prueba}`).set(con(marketing))).status).toBe(403);
    });

    it('el adjunto de un ticket lo ve quien lo creó y el equipo, pero no la otra parte de un contrato', async () => {
      expect((await request(app).get(`/uploads/${ARCHIVOS.ticket}`).set(con(cliente))).status).toBe(200);
      expect((await request(app).get(`/uploads/${ARCHIVOS.ticket}`).set(con(soporte))).status).toBe(200);
      expect((await request(app).get(`/uploads/${ARCHIVOS.ticket}`).set(con(trabajador))).status).toBe(403);
    });

    it('la foto de la bitácora la ven las dos partes del contrato y el equipo', async () => {
      expect((await request(app).get(`/uploads/${ARCHIVOS.bitacora}`).set(con(cliente))).status).toBe(200);
      expect((await request(app).get(`/uploads/${ARCHIVOS.bitacora}`).set(con(trabajador))).status).toBe(200);
      expect((await request(app).get(`/uploads/${ARCHIVOS.bitacora}`).set(con(soporte))).status).toBe(200);
    });

    it('lo mismo por la dirección que usa la web (/api/archivo?ruta=…)', async () => {
      expect((await request(app).get('/api/archivo').query({ ruta: ARCHIVOS.prueba })).status).toBe(401);
      expect((await request(app).get('/api/archivo').query({ ruta: ARCHIVOS.prueba }).set(con(cliente))).status).toBe(200);
    });
  });

  describe('fotos viejas de publicaciones guardadas en «disputes»', () => {
    it('la de una publicación YA PUBLICADA sigue siendo pública (es lo que la persona quiso mostrar)', async () => {
      expect((await request(app).get(`/uploads/${ARCHIVOS.deLaPublicacion}`)).status).toBe(200);
    });
    it('la de un borrador sin publicar NO: queda protegida como cualquier archivo de «disputes»', async () => {
      expect((await request(app).get(`/uploads/${ARCHIVOS.sinPublicar}`)).status).toBe(401);
    });
  });

  describe('enlaces firmados (los usa la app móvil)', () => {
    it('quien puede ver el archivo recibe un enlace que se abre SIN sesión; quien no, 403', async () => {
      const ok = await request(app).get('/api/archivo/enlace').query({ ruta: `/uploads/${ARCHIVOS.prueba}` }).set(con(cliente));
      expect(ok.status).toBe(200);
      expect(ok.body.firmado).toBe(true);
      const abierto = await request(app).get(ok.body.url.replace('/api/archivo', '/api/archivo'));
      expect(abierto.status).toBe(200);
      expect((await request(app).get('/api/archivo/enlace').query({ ruta: ARCHIVOS.prueba }).set(con(ajeno))).status).toBe(403);
      expect((await request(app).get('/api/archivo/enlace').query({ ruta: ARCHIVOS.prueba })).status).toBe(401);
    });

    it('acepta la dirección completa guardada en la base (con el servidor adelante)', async () => {
      const r = await request(app).get('/api/archivo/enlace').query({ ruta: 'https://doapparg.com/uploads/tickets/captura.png' }).set(con(cliente));
      expect(r.status).toBe(200);
      expect(r.body.url).toContain(encodeURIComponent('tickets/captura.png'));
    });

    it('la firma sirve solo para ESE archivo, y una firma cambiada o vencida no abre nada', async () => {
      const f = firmarArchivo('disputes', 'prueba-del-reclamo.png');
      expect((await request(app).get('/api/archivo').query({ ruta: ARCHIVOS.prueba, firma: f.firma, vence: f.vence })).status).toBe(200);
      // la firma de un archivo no abre otro
      expect((await request(app).get('/api/archivo').query({ ruta: ARCHIVOS.ticket, firma: f.firma, vence: f.vence })).status).toBe(401);
      // una firma alterada
      const mala = f.firma.slice(0, -1) + (f.firma.endsWith('0') ? '1' : '0');
      expect((await request(app).get('/api/archivo').query({ ruta: ARCHIVOS.prueba, firma: mala, vence: f.vence })).status).toBe(401);
      // un vencimiento más lejano con la misma firma
      expect((await request(app).get('/api/archivo').query({ ruta: ARCHIVOS.prueba, firma: f.firma, vence: f.vence + 3600 })).status).toBe(401);
    });

    it('vence a los 10 minutos', () => {
      const ahora = Date.now();
      const f = firmarArchivo('daily-log', 'obra-dia-1.png', ahora);
      expect(firmaValida('daily-log', 'obra-dia-1.png', f.firma, f.vence, ahora + 9 * 60_000)).toBe(true);
      expect(firmaValida('daily-log', 'obra-dia-1.png', f.firma, f.vence, ahora + 11 * 60_000)).toBe(false);
    });

    it('una carpeta pública no necesita enlace', async () => {
      const r = await request(app).get('/api/archivo/enlace').query({ ruta: 'avatars/foto.png' }).set(con(ajeno));
      expect(r.status).toBe(200);
      expect(r.body.firmado).toBe(false);
    });
  });
});
