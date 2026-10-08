import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Rutas de "diagnóstico (temporal)".
 *
 * GET /api/contracts/debug-job/:jobId y GET /api/jobs/debug-by-code/:code le devolvían a CUALQUIER usuario
 * con sesión el nombre, el correo y los ids del cliente y del trabajador de cualquier trabajo o contrato (el
 * segundo, además, cargaba todos los trabajos de la base en cada llamada). Ninguna pantalla las usaba.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('las rutas de diagnóstico ya no existen', () => {
  let app: Express;
  let cliente: any, trabajador: any, curioso: any, trabajo: any, contrato: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    cliente = await crearUsuario({ role: 'client', email: `cliente-diag-${Date.now()}@test.local` });
    trabajador = await crearUsuario({ role: 'doer', email: `trabajador-diag-${Date.now()}@test.local` });
    curioso = await crearUsuario({ role: 'doer' });
    trabajo = await crearTrabajo(cliente.id, { status: 'in_progress' });
    contrato = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id });
  });

  afterAll(async () => {
    try {
      await Contract.destroy({ where: { id: contrato.id }, force: true });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id, curioso.id] }, force: true });
    } catch { /* ok */ }
  });

  it('debug-job: un tercero con sesión no obtiene los correos del cliente ni del trabajador', async () => {
    const r = await request(app).get(`/api/contracts/debug-job/${trabajo.id}`).set(con(curioso));
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toContain(cliente.email);
    expect(JSON.stringify(r.body)).not.toContain(trabajador.email);
  });

  it('debug-by-code: tampoco, ni con el código real del trabajo', async () => {
    const r = await request(app).get(`/api/jobs/debug-by-code/${String(trabajo.id).slice(0, 8)}`).set(con(curioso));
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toContain(cliente.email);
    expect(JSON.stringify(r.body)).not.toContain(trabajador.email);
  });

  it('ninguna ruta de servidor tiene "debug" en su dirección (diagnósticos que se quedan "temporales")', () => {
    const raiz = process.cwd();
    const archivos = (dir: string, acc: string[] = []): string[] => {
      for (const e of readdirSync(join(raiz, dir), { withFileTypes: true })) {
        const ruta = `${dir}/${e.name}`;
        if (e.isDirectory()) archivos(ruta, acc);
        else if (/\.ts$/.test(e.name)) acc.push(ruta);
      }
      return acc;
    };
    const malos: string[] = [];
    for (const f of archivos('server/routes')) {
      const texto = readFileSync(join(raiz, f), 'utf8');
      const re = /router\.(?:get|post|put|patch|delete|all)\(\s*["'`][^"'`]*debug[^"'`]*["'`]/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto))) malos.push(`${f}:${texto.slice(0, m.index).split('\n').length} ${m[0].slice(0, 80)}`);
    }
    expect(malos).toEqual([]);
  });
});
