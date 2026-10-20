import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mensajeDeError, mensajeSegunEstado, motivoDelCuerpo, MENSAJE_SIN_CONEXION } from '../shared/errores/mensajesPorEstado.js';
import { respuestasDeError } from '../server/middleware/respuestasDeError.js';
import { errorHandler, ErrorResponse } from '../server/middleware/errorHandler.js';
import { normalizarRespuestaDeError, errorDeRedLegible } from '../client/utils/respuestasDeError.js';

/**
 * Incidente 2026-10-19: crear un trabajo con un dato inválido mostraba «Error al crear el trabajo» sin decir qué campo estaba mal, y el
 * servidor no dejaba nada en el log. Ninguna respuesta de error puede salir sin un motivo legible, ni del servidor ni de nginx/Cloudflare.
 */

describe('el texto de un error siempre existe', () => {
  it('toma el motivo del cuerpo sea cual sea la forma: message, error, errors[{msg}], errors[{message}], errors[texto]', () => {
    expect(motivoDelCuerpo({ message: 'Uno' })).toBe('Uno');
    expect(motivoDelCuerpo({ error: 'Dos' })).toBe('Dos');
    expect(motivoDelCuerpo({ error: { message: 'Tres' } })).toBe('Tres');
    expect(motivoDelCuerpo({ errors: [{ msg: 'A' }, { msg: 'B' }, { msg: 'A' }] })).toBe('A. B');
    expect(motivoDelCuerpo({ errors: [{ message: 'C' }] })).toBe('C');
    expect(motivoDelCuerpo({ errors: ['D'] })).toBe('D');
    expect(motivoDelCuerpo({ message: '   ', errors: [{ msg: 'E' }] })).toBe('E');
  });

  it('si no hay motivo, el que corresponde al estado, con el código para soporte', () => {
    expect(mensajeDeError({}, 413)).toContain('demasiado grandes');
    expect(mensajeDeError(null, 502)).toContain('no está disponible');
    expect(mensajeSegunEstado(418)).toContain('(error 418)');
    expect(mensajeSegunEstado(599)).toContain('Algo falló en el servidor');
    expect(mensajeSegunEstado(499)).toContain('(error 499)');
  });
});

describe('servidor: toda respuesta de error trae message y deja registro', () => {
  let warn: jest.SpiedFunction<typeof console.warn>;
  let error: jest.SpiedFunction<typeof console.error>;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const app = () => {
    const a = express();
    a.use(express.json({ limit: '1kb' }));
    a.use(respuestasDeError);
    a.post('/validacion', (_q, r) => void r.status(400).json({ success: false, errors: [{ msg: 'El título es requerido', path: 'title' }] }));
    a.get('/solo-error', (_q, r) => void r.status(409).json({ error: 'Ya existe' }));
    a.get('/vacio', (_q, r) => void r.status(500).json({}));
    a.get('/con-mensaje', (_q, r) => void r.status(403).json({ success: false, code: 'X', message: 'No podés', extra: 1 }));
    a.get('/ok', (_q, r) => void r.json({ success: true, data: [1] }));
    a.get('/no-encontrado', (_q, r) => void r.status(404).json({ success: false }));
    a.get('/lanza', () => {
      throw new Error('boom');
    });
    a.post('/json', (_q, r) => void r.json({ ok: true }));
    a.use(errorHandler);
    return a;
  };

  it('una validación sin message recibe el motivo de la lista errors (y conserva errors)', async () => {
    const r = await request(app()).post('/validacion').send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('El título es requerido');
    expect(r.body.errors).toHaveLength(1);
    expect(r.body.success).toBe(false);
  });

  it('un {error:"…"} pasa a message; un cuerpo vacío recibe el texto del estado', async () => {
    expect((await request(app()).get('/solo-error')).body.message).toBe('Ya existe');
    const v = await request(app()).get('/vacio');
    expect(v.status).toBe(500);
    expect(v.body.message).toContain('Algo falló en el servidor');
    expect(v.body.success).toBe(false);
  });

  it('lo que ya trae message no se toca, y las respuestas buenas tampoco', async () => {
    const c = await request(app()).get('/con-mensaje');
    expect(c.body).toEqual({ success: false, code: 'X', message: 'No podés', extra: 1 });
    const ok = await request(app()).get('/ok');
    expect(ok.body).toEqual({ success: true, data: [1] });
  });

  it('deja una línea en el log con la ruta, el código de estado y el motivo (los 5xx por console.error)', async () => {
    await request(app()).post('/validacion').send({});
    expect(String(warn.mock.calls[0][0])).toMatch(/\[HTTP 400\] POST \/validacion — El título es requerido/);
    await request(app()).get('/vacio');
    expect(String(error.mock.calls[0][0])).toMatch(/\[HTTP 500\] GET \/vacio/);
  });

  it('no llena el log con lo corriente (404 y 401) y no repite lo que el manejador global ya registró', async () => {
    await request(app()).get('/no-encontrado');
    expect(warn).not.toHaveBeenCalled();
    await request(app()).get('/lanza');
    expect(error.mock.calls.filter((c) => String(c[0]).startsWith('[HTTP 500]'))).toHaveLength(0);
  });

  it('un JSON mal formado o demasiado grande se explica en español, no «Unexpected token» ni un 500', async () => {
    const malo = await request(app()).post('/json').set('Content-Type', 'application/json').send('{"a": ');
    expect(malo.status).toBe(400);
    expect(malo.body.message).toContain('formato válido');
    const grande = await request(app()).post('/json').send({ x: 'a'.repeat(5000) });
    expect(grande.status).toBe(413);
    expect(grande.body.message).toContain('demasiado grandes');
  });

  it('la respuesta ErrorResponse del manejador global conserva su mensaje', () => {
    expect(new ErrorResponse('hola', 418).statusCode).toBe(418);
  });

  it('está montado en el servidor ANTES de las rutas, para alcanzarlas todas', () => {
    const idx = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
    const mont = idx.indexOf('app.use(respuestasDeError)');
    expect(mont).toBeGreaterThan(0);
    expect(mont).toBeLessThan(idx.indexOf('app.use("/api/auth"'));
  });
});

describe('cliente: una respuesta de error siempre trae un motivo legible', () => {
  const html = (status: number) => new Response('<html><body><h1>413 Request Entity Too Large</h1></body></html>', { status, headers: { 'Content-Type': 'text/html' } });

  it('una página HTML de nginx (413, 502) se vuelve JSON con el texto del estado', async () => {
    const r = await normalizarRespuestaDeError(html(413));
    expect(r.status).toBe(413);
    const d = await r.json();
    expect(d.message).toContain('demasiado grandes');
    expect(d.message).toContain('(error 413)');
    expect(d.success).toBe(false);
    expect((await (await normalizarRespuestaDeError(html(502))).json()).message).toContain('no está disponible');
  });

  it('un JSON sin message recibe el motivo de errors; un cuerpo vacío, el del estado', async () => {
    const a = await normalizarRespuestaDeError(new Response(JSON.stringify({ success: false, errors: [{ msg: 'Fecha de inicio inválida' }] }), { status: 400 }));
    expect((await a.json()).message).toBe('Fecha de inicio inválida');
    const b = await normalizarRespuestaDeError(new Response('', { status: 500 }));
    expect((await b.json()).message).toContain('Algo falló en el servidor');
  });

  it('lo que ya trae message y las respuestas buenas pasan sin tocarse', async () => {
    const buena = new Response(JSON.stringify({ ok: 1 }), { status: 200 });
    expect(await normalizarRespuestaDeError(buena)).toBe(buena);
    const conMensaje = new Response(JSON.stringify({ message: 'No podés' }), { status: 403 });
    expect(await normalizarRespuestaDeError(conMensaje)).toBe(conMensaje);
  });

  it('un corte de red dice que no hubo conexión; una cancelación voluntaria se respeta', () => {
    expect((errorDeRedLegible(new TypeError('Failed to fetch')) as Error).message).toBe(MENSAJE_SIN_CONEXION);
    const cancelado = new DOMException('cancelado', 'AbortError');
    expect(errorDeRedLegible(cancelado)).toBe(cancelado);
  });
});
