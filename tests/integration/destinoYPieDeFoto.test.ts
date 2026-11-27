import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/** Dirección de destino (mudanzas, mandados) y pie de las fotos (pedido del dueño, 2026-11-27). La calle y el número no salen por ninguna puerta pública. */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));

import { Job } from '../../server/models/sql/Job.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import searchService from '../../server/services/search.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';
import { leerDestino, piesDeLasFotos } from '../../shared/jobs/destinoYPies.js';

const destino = { location: 'Resistencia, Chaco', neighborhood: 'Centro', street: 'San Martín', number: '742', details: 'portón verde', latitude: -27.45, longitude: -58.98 };

describe('dirección de destino y pie de foto', () => {
  let app: Express;
  let duenio: any, curioso: any, trabajo: any;
  const foto = '/uploads/job-images/antes.jpg';
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    duenio = await crearUsuario({ role: 'client' });
    curioso = await crearUsuario({ role: 'doer' });
    trabajo = await crearTrabajo(duenio.id, { status: 'open', title: `Mudanza ${Date.now()}`, startDate: new Date(Date.now() + 10 * 86_400_000), endDate: new Date(Date.now() + 11 * 86_400_000), images: [foto], addressStreet: 'Junín', addressNumber: '1500' });
  });

  const guardar = (datos: Record<string, unknown>) => request(app).put(`/api/jobs/${trabajo.id}`).set(con(duenio)).send({ endDate: new Date(trabajo.endDate).toISOString(), ...datos });

  it('se guardan el destino y el pie, y quien publica los ve completos', async () => {
    await guardar({ destination: JSON.stringify(destino), existingImages: JSON.stringify([foto]), existingCaptions: JSON.stringify({ [foto]: 'El ropero grande' }) }).expect(200);
    const mio = await request(app).get(`/api/jobs/${trabajo.id}`).set(con(duenio)).expect(200);
    expect(mio.body.job.destination).toMatchObject({ location: 'Resistencia, Chaco', street: 'San Martín', number: '742' });
    expect(mio.body.job.imageCaptions).toEqual({ [foto]: 'El ropero grande' });
  });

  it('otra persona ve la zona del destino, sin la calle, el número ni el punto exacto', async () => {
    for (const pedido of [request(app).get(`/api/jobs/${trabajo.id}`).set(con(curioso)), request(app).get(`/api/jobs/${trabajo.id}`)]) {
      const r = await pedido.expect(200);
      expect(r.body.job.destination).toEqual({ location: 'Resistencia, Chaco', neighborhood: 'Centro', postalCode: null });
    }
  });

  it('la búsqueda pública no devuelve la calle ni el número, ni del origen ni del destino', async () => {
    const r: any = await searchService.searchJobs({ query: trabajo.title } as any);
    const visto = r.jobs.find((j: any) => j.id === trabajo.id);
    expect(visto).toBeTruthy();
    expect([visto.addressStreet, visto.addressNumber, visto.destination.street, visto.destination.number]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('un teléfono en el pie de una foto se frena como en el resto de la publicación', async () => {
    const r = await guardar({ existingCaptions: JSON.stringify({ [foto]: 'llamame al 3794 123456' }) });
    expect([r.status, r.body.code]).toEqual([400, 'DATOS_DE_CONTACTO_EN_LA_PUBLICACION']);
  });

  it('quitar el destino lo borra', async () => {
    await guardar({ destination: '' }).expect(200);
    expect(((await conSistema(() => Job.findByPk(trabajo.id))) as any).destination).toBeNull();
  });

  it('las reglas: sin datos no hay destino, la calle sin localidad no alcanza y el número pegado a la calle se separa', () => {
    expect(leerDestino('')).toEqual({ ok: true, destino: null });
    expect(leerDestino({ location: '', street: '', number: '' })).toEqual({ ok: true, destino: null });
    expect(leerDestino({ street: 'Junín', number: '10' }).ok).toBe(false);
    const r = leerDestino({ location: 'Corrientes', street: 'Junín 1500' });
    expect(r.ok && r.destino).toMatchObject({ street: 'Junín', number: '1500' });
    expect(piesDeLasFotos(['a'], { a: 'uno', b: 'se quitó' }, ['c', 'd'], ['', 'cuatro'])).toEqual({ a: 'uno', d: 'cuatro' });
  });
});
