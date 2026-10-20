import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * POST /api/jobs — la dirección y las tareas que se cargan al crear.
 *
 * Lo que había: la calle y el número de puerta se guardaban tal cual llegaban (un número dentro de la calle, letras en el número) y las
 * tareas de una «entrega por tareas» no se podían detallar al crear: se agregaban recién después, sin día. Ahora el servidor separa el
 * número de la calle, rechaza lo que no es una dirección y guarda las tareas con su día, dentro de las fechas del trabajo.
 */

jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { JobTask } from '../../server/models/sql/JobTask.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('POST /api/jobs: dirección y tareas', () => {
  let app: Express;
  const usuarios: string[] = [];
  const trabajos: string[] = [];
  const token = (u: any) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret');
  const dia = (n: number) => new Date(Date.now() + n * 86_400_000);
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Cada prueba usa una persona nueva: crear revisa que no se superponga con otros trabajos de la misma persona.
  const publicar = async (over: Record<string, unknown> = {}) => {
    const u = await crearUsuario({ role: 'client', dniVerified: true });
    usuarios.push(u.id);
    const r = await request(app)
      .post('/api/jobs')
      .set({ Authorization: `Bearer ${token(u)}` })
      .send({
        title: 'Pintar el living completo',
        summary: 'Pintura de paredes y techo',
        description: 'Pintar paredes y techo del living con dos manos de látex, incluyendo el pasillo.',
        price: 50000,
        category: 'Reparaciones',
        location: 'Buenos Aires',
        startDate: dia(30).toISOString(),
        endDate: dia(36).toISOString(),
        ...over,
      });
    if (r.body?.job?.id) trabajos.push(r.body.job.id);
    return r;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
  });

  afterAll(async () => {
    try {
      await JobTask.destroy({ where: { jobId: trabajos }, force: true });
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('el número escrito dentro de la calle pasa a su campo', async () => {
    const r = await publicar({ addressStreet: 'Avenida Corrientes 1234', addressNumber: '' });
    expect(r.status).toBe(201);
    const j = (await Job.findByPk(r.body.job.id)) as any;
    expect(j.addressStreet).toBe('Avenida Corrientes');
    expect(j.addressNumber).toBe('1234');
  });

  it('un número de puerta con letras se rechaza (400, DIRECCION_INVALIDA) y no se crea nada', async () => {
    const r = await publicar({ addressStreet: 'Avenida Corrientes', addressNumber: '12ab' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('DIRECCION_INVALIDA');
    expect(r.body.job).toBeUndefined();
  });

  it('con entrega por tareas guarda cada tarea con su día y en orden', async () => {
    const r = await publicar({
      singleDelivery: false,
      tasks: JSON.stringify([
        { title: 'Lijar paredes', dueDate: ymd(dia(32)) },
        { title: 'Dar la primera mano', dueDate: ymd(dia(34)) },
        { title: '   ', dueDate: '' }, // fila vacía del formulario: se descarta
      ]),
    });
    expect(r.status).toBe(201);
    const filas = (await JobTask.findAll({ where: { jobId: r.body.job.id }, order: [['orderIndex', 'ASC']] })) as any[];
    expect(filas.map((t) => t.title)).toEqual(['Lijar paredes', 'Dar la primera mano']);
    expect(filas.every((t) => t.dueDate instanceof Date)).toBe(true);
    expect(filas[0].orderIndex).toBeLessThan(filas[1].orderIndex);
  });

  it('una tarea con un día fuera de las fechas del trabajo se rechaza (400, TAREAS_INVALIDAS)', async () => {
    const r = await publicar({ singleDelivery: false, tasks: JSON.stringify([{ title: 'Lijar', dueDate: ymd(dia(60)) }]) });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('TAREAS_INVALIDAS');
  });

  it('tareas que no son una lista se rechazan', async () => {
    const r = await publicar({ singleDelivery: false, tasks: '{no es una lista' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('TAREAS_INVALIDAS');
  });

  it('con entrega única las tareas que lleguen se ignoran', async () => {
    const r = await publicar({ singleDelivery: true, tasks: JSON.stringify([{ title: 'Lijar', dueDate: ymd(dia(32)) }]) });
    expect(r.status).toBe(201);
    expect(await JobTask.count({ where: { jobId: r.body.job.id } })).toBe(0);
  });

  it('un dato inválido responde con el MOTIVO (antes sin mensaje: la pantalla decía «Error al crear el trabajo» sin decir qué campo)', async () => {
    const r = await publicar({ startDate: 'mañana', title: '' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('DATOS_INVALIDOS');
    expect(r.body.message).toContain('El título es requerido');
    expect(r.body.message).toContain('Fecha de inicio inválida');
    expect(Array.isArray(r.body.errors)).toBe(true);
  });
});
