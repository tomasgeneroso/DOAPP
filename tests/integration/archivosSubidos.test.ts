import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';

/**
 * Archivos subidos: no se ejecutan (auditoría de seguridad, 2026-11-24, falla crítica).
 * Antes un archivo `ataque.html` con tipo falso `image/png` y encabezado de GIF se guardaba con su extensión y se servía desde el mismo sitio como `text/html`:
 * su script corría con la sesión de quien lo abriera. Se pudo hacer SIN cuenta, por la consulta de invitado.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { cabecerasDeSeguridad, cabecerasDeArchivoSubido, opcionesDeHelmet } from '../../server/middleware/cabecerasDeSeguridad.js';

describe('archivos subidos: no se ejecutan', () => {
  let app: Express;
  let usuario: any;
  const carpeta = path.join(process.cwd(), 'uploads', 'tickets');
  const sueltos: string[] = [];
  const ticketsCreados: string[] = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(helmet(opcionesDeHelmet()));
    app.use(cabecerasDeSeguridad);
    app.use('/api/tickets', (await import('../../server/routes/tickets.js')).default);
    app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads'), { setHeaders: cabecerasDeArchivoSubido }));
    usuario = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    for (const f of sueltos) { try { fs.unlinkSync(f); } catch { /* ya no está */ } }
    try {
      await Ticket.destroy({ where: { id: ticketsCreados }, force: true } as any);
      await User.destroy({ where: { id: usuario.id }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  const subirComoInvitado = (nombre: string, tipo: string, contenido: Buffer) =>
    request(app).post('/api/tickets/guest').field('email', usuario.email).field('subject', 'Captura').field('message', 'Adjunto la captura').field('category', 'support')
      .attach('attachments', contenido, { filename: nombre, contentType: tipo });

  const guardado = async (ticketId: string): Promise<string> => {
    const t: any = await Ticket.findByPk(ticketId);
    const url: string = t.messages[0].attachments[0].fileUrl;
    sueltos.push(path.join(carpeta, path.basename(url)));
    return url;
  };

  it('un .html con tipo falso de imagen y firma de GIF se guarda como imagen (.png) y se sirve como imagen, nunca como página', async () => {
    const r = await subirComoInvitado('ataque.html', 'image/png', Buffer.from('GIF89a<html><body><script>document.title="XSS"</script></body></html>'));
    expect(r.status).toBe(201);
    ticketsCreados.push(r.body.ticket.id);
    const url = await guardado(r.body.ticket.id);
    expect(url).toMatch(/\.png$/);
    expect(url).not.toMatch(/html/i);
    const g = await request(app).get('/api/uploads/tickets/' + path.basename(url));
    expect(g.status).toBe(200);
    expect(String(g.headers['content-type'])).toMatch(/^image\/png/);
    expect(g.headers['x-content-type-options']).toBe('nosniff');
    expect(String(g.headers['content-security-policy'])).toContain("script-src 'none'");
  });

  it('lo que no empieza con la firma de una imagen o un PDF se rechaza (400) y no queda guardado', async () => {
    const antes = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).length : 0;
    const r = await subirComoInvitado('pagina.png', 'image/png', Buffer.from('<html><script>alert(1)</script></html>'));
    expect(r.status).toBe(400);
    expect(fs.existsSync(carpeta) ? fs.readdirSync(carpeta).length : 0).toBe(antes);
  });

  it('un archivo de antes, que ya estaba en el disco como .html, se DESCARGA y no se abre (y sin scripts)', async () => {
    fs.mkdirSync(carpeta, { recursive: true });
    const viejo = path.join(carpeta, `viejo-${Date.now()}.html`);
    fs.writeFileSync(viejo, '<html><script>document.title="XSS"</script></html>');
    sueltos.push(viejo);
    const g = await request(app).get('/api/uploads/tickets/' + path.basename(viejo));
    expect(g.status).toBe(200);
    expect(String(g.headers['content-disposition'])).toContain('attachment');
    expect(String(g.headers['content-security-policy'])).toContain("script-src 'none'");
  });

  it('una imagen normal se sigue mostrando en la página (sin «attachment»)', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const r = await subirComoInvitado('foto.png', 'image/png', png);
    expect(r.status).toBe(201);
    ticketsCreados.push(r.body.ticket.id);
    const url = await guardado(r.body.ticket.id);
    const g = await request(app).get('/api/uploads/tickets/' + path.basename(url));
    expect(g.status).toBe(200);
    expect(g.headers['content-disposition']).toBeUndefined();
  });
});
