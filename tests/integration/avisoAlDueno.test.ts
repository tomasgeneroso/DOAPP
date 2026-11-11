import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

/**
 * Aviso al dueño por correo (regla del dueño, 2026-11-11: «cuando salten errores así que me avisen al mail»). «Al registrarse da error 502» (Didit sin créditos), una tabla que
 * faltaba y el RLS apagado quedaron en el registro del servidor y nadie los leyó. Ahora un 5xx, una tabla o columna que falta, el RLS apagado y Didit sin créditos le llegan
 * por correo al dueño: UNA vez por problema cada 6 horas, con un tope por hora, sin datos de personas, y solo en producción.
 */
const correos: Array<{ to: string; subject: string; html: string; text?: string }> = [];
let salida = true;
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: {
    sendEmail: async (o: any) => {
      correos.push(o);
      return salida;
    },
  },
}));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import {
  avisarAlDuenoPorCorreo,
  avisarDeUnErrorDelServidor,
  rutaSinIds,
  __activarAvisos,
  __reiniciarAvisos,
  ENTRE_AVISOS_MS,
  MAXIMO_POR_HORA,
} from '../../server/services/avisoAlDueno.js';
import { respuestasDeError } from '../../server/middleware/respuestasDeError.js';
import { errorHandler } from '../../server/middleware/errorHandler.js';
import { crearUsuario } from '../helpers/fixtures.js';

const BASE = 10 * 24 * 3_600_000;
const aviso = (clave: string, extra: Record<string, unknown> = {}) => ({ clave, asunto: `Problema ${clave}`, quePaso: 'Algo falló.', queHacer: 'Mirá el registro.', ...extra });

describe('aviso al dueño por correo', () => {
  let dueno: any;
  const aEl = () => correos.filter((c) => c.to === dueno.email);
  const esperarCorreos = async (cuantos: number) => {
    for (let i = 0; i < 60 && aEl().length < cuantos; i++) await new Promise((x) => setTimeout(x, 50));
  };

  beforeAll(async () => {
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
  });

  beforeEach(() => {
    correos.length = 0;
    salida = true;
    __reiniciarAvisos();
    __activarAvisos(true);
    delete process.env.APP_ENV;
  });

  afterAll(async () => {
    __activarAvisos(false);
    try {
      await User.destroy({ where: { id: dueno.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('apagado (desarrollo y pruebas) no manda nada', async () => {
    __activarAvisos(false);
    expect(await avisarAlDuenoPorCorreo(aviso('a'), BASE)).toBe(false);
    expect(aEl()).toHaveLength(0);
  });

  it('manda el aviso al dueño con el asunto, qué pasó y qué hacer', async () => {
    expect(await avisarAlDuenoPorCorreo(aviso('a', { detalle: 'relation "x" does not exist' }), BASE)).toBe(true);
    expect(aEl()).toHaveLength(1);
    expect(aEl()[0].subject).toBe('DOAPP: Problema a');
    expect(aEl()[0].text).toMatch(/Algo falló\./);
    expect(aEl()[0].text).toMatch(/Qué tenés que hacer: Mirá el registro\./);
    expect(aEl()[0].html).toMatch(/relation &quot;x&quot; does not exist/);
  });

  it('el mismo problema no se repite hasta pasadas 6 horas; otro problema sale enseguida', async () => {
    expect(await avisarAlDuenoPorCorreo(aviso('a'), BASE)).toBe(true);
    expect(await avisarAlDuenoPorCorreo(aviso('a'), BASE + 60_000)).toBe(false);
    expect(await avisarAlDuenoPorCorreo(aviso('a'), BASE + ENTRE_AVISOS_MS - 1)).toBe(false);
    expect(await avisarAlDuenoPorCorreo(aviso('b'), BASE + 60_000)).toBe(true);
    expect(await avisarAlDuenoPorCorreo(aviso('a'), BASE + ENTRE_AVISOS_MS + 1)).toBe(true);
    expect(aEl()).toHaveLength(3);
  });

  it('cien errores iguales a la vez mandan un solo correo', async () => {
    const r = await Promise.all(Array.from({ length: 100 }, () => avisarAlDuenoPorCorreo(aviso('misma'), BASE)));
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(aEl()).toHaveLength(1);
  });

  it(`tope de ${MAXIMO_POR_HORA} por hora: lo que sobra no sale y el próximo correo dice cuántos faltaron`, async () => {
    for (let i = 0; i < MAXIMO_POR_HORA; i++) expect(await avisarAlDuenoPorCorreo(aviso(`k${i}`), BASE + i)).toBe(true);
    expect(await avisarAlDuenoPorCorreo(aviso('de-mas'), BASE + 1000)).toBe(false);
    expect(await avisarAlDuenoPorCorreo(aviso('de-mas-2'), BASE + 2000)).toBe(false);
    expect(aEl()).toHaveLength(MAXIMO_POR_HORA);
    expect(await avisarAlDuenoPorCorreo(aviso('despues'), BASE + 2 * 3_600_000)).toBe(true);
    expect(aEl()[MAXIMO_POR_HORA].text).toMatch(/Además hubo 2 avisos de otros problemas que no se mandaron/);
  });

  it('no manda datos de personas: correos y números largos del texto técnico salen tapados', async () => {
    await avisarAlDuenoPorCorreo(aviso('p', { detalle: 'duplicate key: Key (email)=(persona.real@ejemplo.com) already exists; cbu 0170099220000067797370' }), BASE);
    const c = aEl()[0];
    expect(c.text + c.html).not.toMatch(/persona\.real@ejemplo\.com/);
    expect(c.text + c.html).not.toMatch(/0170099220000067797370/);
    expect(c.text).toMatch(/\[correo\]/);
    expect(c.text).toMatch(/\[número\]/);
  });

  it('si el correo no salió, la próxima vez se vuelve a intentar (no se da por avisado)', async () => {
    salida = false;
    expect(await avisarAlDuenoPorCorreo(aviso('a'), BASE)).toBe(false);
    salida = true;
    expect(await avisarAlDuenoPorCorreo(aviso('a'), BASE + 1000)).toBe(true);
  });

  it('en staging el asunto lo dice', async () => {
    process.env.APP_ENV = 'staging';
    await avisarAlDuenoPorCorreo(aviso('s'), BASE);
    expect(aEl()[0].subject).toBe('[STAGING] DOAPP: Problema s');
  });

  it('enlaza a la guía solo si el código está en el catálogo', async () => {
    await avisarAlDuenoPorCorreo(aviso('g1', { codigo: 'SALDO-NO-CIERRA-LIBRO' }), BASE);
    await avisarAlDuenoPorCorreo(aviso('g2', { codigo: 'CODIGO-INVENTADO' }), BASE);
    expect(aEl()[0].text).toMatch(/\/admin\/guia-de-errores#SALDO-NO-CIERRA-LIBRO/);
    expect(aEl()[1].text).not.toMatch(/guia-de-errores/);
  });

  describe('rutaSinIds', () => {
    it('junta las rutas que solo cambian en el id y deja afuera la consulta', () => {
      expect(rutaSinIds('/api/jobs/9ff0c7ff-0000-4000-8000-000000000001/pay?token=secreto')).toBe('/api/jobs/:id/pay');
      expect(rutaSinIds('/api/jobs/9ff0c7ff-0000-4000-8000-000000000002/pay')).toBe('/api/jobs/:id/pay');
      expect(rutaSinIds('/api/tickets/1234')).toBe('/api/tickets/:n');
      expect(rutaSinIds('/api/auth/verify-email/abcdefghijklmnopqrstuvwxyz0123')).toBe('/api/auth/verify-email/:token');
    });
  });

  describe('avisarDeUnErrorDelServidor', () => {
    it('un 5xx avisa; lo que no es 5xx y los códigos con aviso propio no', async () => {
      avisarDeUnErrorDelServidor({ metodo: 'POST', ruta: '/api/x', estado: 404 });
      avisarDeUnErrorDelServidor({ metodo: 'POST', ruta: '/api/didit', estado: 503, codigo: 'VERIFICACION_NO_DISPONIBLE' });
      await new Promise((x) => setTimeout(x, 200));
      expect(aEl()).toHaveLength(0);
      avisarDeUnErrorDelServidor({ metodo: 'POST', ruta: '/api/x', estado: 502, mensaje: 'No pudimos iniciar la verificación.' });
      await esperarCorreos(1);
      expect(aEl()).toHaveLength(1);
      expect(aEl()[0].subject).toBe('DOAPP: Error 502 en POST /api/x');
      expect(aEl()[0].text).toMatch(/No pudimos iniciar la verificación\./);
    });

    it('el mismo error en la misma ruta con distinto id es UN solo aviso', async () => {
      avisarDeUnErrorDelServidor({ metodo: 'POST', ruta: '/api/jobs/9ff0c7ff-0000-4000-8000-000000000001/pay', estado: 500 });
      avisarDeUnErrorDelServidor({ metodo: 'POST', ruta: '/api/jobs/9ff0c7ff-0000-4000-8000-000000000002/pay', estado: 500 });
      await esperarCorreos(1);
      await new Promise((x) => setTimeout(x, 200));
      expect(aEl()).toHaveLength(1);
      expect(aEl()[0].subject).toBe('DOAPP: Error 500 en POST /api/jobs/:id/pay');
    });
  });

  describe('conectado a las respuestas del servidor', () => {
    let app: Express;
    beforeAll(() => {
      app = express();
      app.use(respuestasDeError);
      app.get('/api/falla/:id', (_req, res) => {
        res.status(500).json({ success: false, message: 'Algo se rompió' });
      });
      app.get('/api/rechazo', (_req, res) => {
        res.status(400).json({ success: false, message: 'Falta un dato' });
      });
      app.get('/api/tabla', (_req, _res, next) => {
        const e: any = new Error('relation "login_devices" does not exist');
        e.name = 'SequelizeDatabaseError';
        e.parent = { code: '42P01' };
        next(e);
      });
      app.get('/api/explota', (_req, _res, next) => {
        next(new Error('Fallo interno del cobro de la persona.real@ejemplo.com'));
      });
      app.use(errorHandler);
    });

    it('una respuesta 500 de una ruta le avisa al dueño; un 400 no', async () => {
      await request(app).get('/api/rechazo?x=1');
      await request(app).get('/api/falla/9ff0c7ff-0000-4000-8000-000000000001?token=secreto');
      await esperarCorreos(1);
      await new Promise((x) => setTimeout(x, 200));
      expect(aEl()).toHaveLength(1);
      expect(aEl()[0].subject).toBe('DOAPP: Error 500 en GET /api/falla/:id');
      expect(aEl()[0].text + aEl()[0].html).not.toMatch(/secreto|9ff0c7ff/);
    });

    it('una tabla que falta manda su propio aviso (qué hacer) y no el genérico de 500', async () => {
      const r = await request(app).get('/api/tabla');
      expect(r.status).toBe(500);
      await esperarCorreos(1);
      await new Promise((x) => setTimeout(x, 200));
      expect(aEl()).toHaveLength(1);
      expect(aEl()[0].subject).toBe('DOAPP: Falta una tabla en la base: login_devices');
      expect(aEl()[0].text).toMatch(/verificarTablas\.ts/);
      expect(r.body.message).toBe('Error del servidor'); // la persona no ve el detalle
    });

    it('una excepción sin atrapar lleva el texto técnico al correo, con los correos tapados, y no al usuario', async () => {
      const r = await request(app).get('/api/explota');
      expect(r.status).toBe(500);
      await esperarCorreos(1);
      expect(aEl()).toHaveLength(1);
      expect(aEl()[0].text).toMatch(/Fallo interno del cobro de la \[correo\]/);
      expect(aEl()[0].text + aEl()[0].html).not.toMatch(/persona\.real@ejemplo\.com/);
    });
  });
});
