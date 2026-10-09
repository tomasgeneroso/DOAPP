import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

/**
 * GET /api/jobs — el listado PÚBLICO (sin sesión).
 *
 * Lo que había: `status` se copiaba tal cual a la consulta, así que `?status=draft`, `pending_payment`,
 * `pending_approval` o `cancelled` devolvía los borradores, los trabajos sin pagar y los dados de baja de OTRAS
 * personas; y sin `status` devolvía todo. `limit` se aplicaba DESPUÉS de cargar la tabla entera en memoria. La
 * búsqueda de texto pisaba la condición de "no vencidos" (las dos usaban query[Op.or]). Y `client`/`userId`, que
 * mandan varias pantallas, se ignoraban.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('GET /api/jobs: sólo lo publicado', () => {
  let app: Express;
  let ana: any, beto: any;
  const jobs: string[] = [];
  const porTitulo: Record<string, any> = {};
  let dia = 1;

  const crear = async (titulo: string, dueno: any, over: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(dueno.id, { title: titulo, startDate: new Date(Date.now() + (dia++) * 86_400_000), ...over });
    jobs.push(t.id);
    porTitulo[titulo] = t;
    return t;
  };
  const listar = (qs = '') => request(app).get(`/api/jobs${qs}`);
  const titulos = (r: request.Response) => (r.body.jobs || []).map((j: any) => j.title) as string[];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    ana = await crearUsuario({ role: 'client' });
    beto = await crearUsuario({ role: 'client' });

    await crear('Publicado abierto de Ana', ana, { status: 'open' });
    await crear('Publicado abierto de Beto', beto, { status: 'open' });
    await crear('En curso de Ana', ana, { status: 'in_progress' });
    await crear('Terminado de Beto', beto, { status: 'completed' });
    await crear('Borrador de Ana', ana, { status: 'draft' });
    await crear('Sin pagar de Ana', ana, { status: 'pending_payment' });
    await crear('En revision de Beto', beto, { status: 'pending_approval' });
    await crear('Pausado de Beto', beto, { status: 'paused' });
    await crear('Cancelado de Ana', ana, { status: 'cancelled' });
    await crear('Vencido abierto de Ana', ana, { status: 'open', startDate: new Date(Date.now() - 10 * 86_400_000), endDate: new Date(Date.now() - 3 * 86_400_000), endDateFlexible: false });
    await crear('Oferta del 100% de descuento', beto, { status: 'open' });
    await crear('Oferta de 100 pesos', beto, { status: 'open' });
  });

  afterAll(async () => {
    try {
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [ana.id, beto.id] }, force: true });
    } catch { /* ok */ }
  });

  it('con status=open devuelve lo abierto y vigente', async () => {
    const r = await listar('?status=open&limit=100');
    expect(r.status).toBe(200);
    const t = titulos(r);
    expect(t).toEqual(expect.arrayContaining(['Publicado abierto de Ana', 'Publicado abierto de Beto']));
    expect(t).not.toContain('Vencido abierto de Ana'); // con la fecha de fin ya pasada
    expect(t).not.toContain('En curso de Ana');
  });

  it.each(['draft', 'pending_payment', 'pending_approval', 'paused', 'cancelled', 'rejected'])(
    'status=%s NO devuelve trabajos de otras personas (400, sin datos)',
    async (estado) => {
      const r = await listar(`?status=${estado}&limit=100`);
      expect([estado, r.status]).toEqual([estado, 400]);
      expect(r.body.jobs).toBeUndefined();
    },
  );

  it('un status con texto cualquiera, vacío o en otro formato es 400 y no llega a la consulta', async () => {
    for (const qs of ['?status=cualquier-cosa', '?status=', '?status=OPEN', '?status=open,draft']) {
      const r = await listar(qs);
      expect([qs, r.status]).toEqual([qs, 400]);
    }
  });

  it('las formas anidadas (status[ne], status[]) no inyectan operadores: se ignoran y no devuelven nada privado', async () => {
    // El parser de consulta de Express 5 las deja como claves literales distintas de "status".
    for (const qs of ['?status[ne]=open&limit=100', '?status[]=draft&status[]=open&limit=100', '?status[$ne]=open&limit=100']) {
      const r = await listar(qs);
      expect([qs, r.status]).toEqual([qs, 200]);
      const t = titulos(r);
      for (const privado of ['Borrador de Ana', 'Sin pagar de Ana', 'En revision de Beto', 'Pausado de Beto', 'Cancelado de Ana']) {
        expect([qs, privado, t.includes(privado)]).toEqual([qs, privado, false]);
      }
    }
  });

  it('sin status devuelve los estados PÚBLICOS (open, in_progress, completed) y nunca los privados', async () => {
    const t = titulos(await listar('?limit=100'));
    expect(t).toEqual(expect.arrayContaining(['Publicado abierto de Ana', 'En curso de Ana', 'Terminado de Beto']));
    for (const privado of ['Borrador de Ana', 'Sin pagar de Ana', 'En revision de Beto', 'Pausado de Beto', 'Cancelado de Ana']) {
      expect(t).not.toContain(privado);
    }
  });

  it('in_progress y completed se piden explícitamente', async () => {
    expect(titulos(await listar('?status=in_progress&limit=100'))).toContain('En curso de Ana');
    expect(titulos(await listar('?status=completed&limit=100'))).toContain('Terminado de Beto');
  });

  it('client / userId limitan a los trabajos de esa persona (antes se ignoraban)', async () => {
    for (const param of ['client', 'userId']) {
      const t = titulos(await listar(`?${param}=${ana.id}&status=open&limit=100`));
      expect([param, t.includes('Publicado abierto de Ana')]).toEqual([param, true]);
      expect([param, t.includes('Publicado abierto de Beto')]).toEqual([param, false]);
    }
    expect((await listar('?client=no-es-un-uuid')).status).toBe(400);
  });

  it('limit se respeta, se acota a 500 y un valor raro vuelve al por defecto', async () => {
    expect((await listar('?status=open&limit=2')).body.jobs.length).toBe(2);
    for (const raro of ['abc', '-5', '0', '']) {
      const r = await listar(`?status=open&limit=${raro}`);
      expect([raro, r.status]).toEqual([raro, 200]);
      expect(r.body.jobs.length).toBeLessThanOrEqual(20);
    }
    expect((await listar('?status=open&limit=99999')).status).toBe(200);
  });

  it('el límite se aplica en la CONSULTA (antes se cargaba toda la tabla y se cortaba en memoria) y no pasa de 500', async () => {
    const espiar = jest.spyOn(Job, 'findAll');
    try {
      // sortBy distinto en cada pedido: las respuestas se cachean 60 s por parámetros y una respuesta en caché no consulta.
      await listar('?status=open&limit=99999&sortBy=budget-desc');
      await listar('?status=open&limit=7&sortBy=budget-desc');
      await listar('?status=open&limit=abc&sortBy=budget-desc');
      const limites = espiar.mock.calls.map((c: any[]) => c[0]?.limit);
      expect(limites).toEqual([500, 7, 20]);
    } finally {
      espiar.mockRestore();
    }
  });

  it('la búsqueda de texto no pierde la condición de "no vencido" (antes la pisaba)', async () => {
    const t = titulos(await listar('?status=open&query=Ana&limit=100'));
    expect(t).toContain('Publicado abierto de Ana');
    expect(t).not.toContain('Vencido abierto de Ana');
  });

  it('los comodines de LIKE que escribe quien busca son texto: "100%" no significa "todo"', async () => {
    const porcentaje = titulos(await listar(`?status=open&query=${encodeURIComponent('100%')}&limit=100`));
    expect(porcentaje).toEqual(['Oferta del 100% de descuento']);
    const guion = titulos(await listar(`?status=open&query=${encodeURIComponent('100_pesos')}&limit=100`));
    expect(guion).toEqual([]); // "_" es un guion bajo, no "cualquier carácter" (no coincide con "100 pesos")
  });

  it('el listado público no expone los datos de contacto ni la dirección de nadie', async () => {
    const r = await listar('?status=open&limit=100');
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain(ana.email);
    expect(texto).not.toContain(beto.email);
    for (const j of r.body.jobs) {
      expect(j.client?.email).toBeUndefined();
    }
  });
});
