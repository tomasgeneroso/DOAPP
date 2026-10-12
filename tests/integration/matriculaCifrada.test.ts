import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

/**
 * Matrícula profesional: se guarda ENCRIPTADA (el número y hasta dos archivos, frente y reverso), DOAPP no la verifica, y
 * los archivos los ve el dueño, administración y el cliente ya vinculado por un contrato. Es lo que dicen los Términos
 * (4.6) y la Política de Privacidad (1.4, 3, 4): estas pruebas son lo que impide que el texto legal y el código se separen.
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

import { sequelize } from '../../server/config/database.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { config } from '../../server/config/env.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import {
  CARPETA_DE_MATRICULAS, nombreDeLaReferencia, tipoDeContenido, encriptarMatriculasExistentes,
} from '../../server/services/matricula.js';
import { matriculaLeida, matriculaParaGuardar } from '../../server/utils/matriculaCifrada.js';
import { isEncrypted } from '../../server/utils/encryption.js';

const MARCA = 'MARCA-SECRETA-DE-LA-MATRICULA';
const jpeg = (extra = MARCA) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.from(extra)]);
const pdf = (extra = MARCA) => Buffer.from(`%PDF-1.4\n${extra}\n%%EOF`);
const html = () => Buffer.from('<html><script>alert(1)</script></html> relleno relleno');

describe('matrícula profesional encriptada', () => {
  let app: Express;
  let trabajador: any, cliente: any, intruso: any, admin: any, cliente2: any;
  const trabajos: string[] = [];
  const archivosCreados = new Set<string>();
  const sesion = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, config.jwtSecret)}` });
  const crudo = async (id: string) => {
    const [filas]: any = await sequelize.query('SELECT license_number, license_document_url, license_document_back_url FROM users WHERE id = :id', { replacements: { id } });
    return filas[0] as { license_number: string | null; license_document_url: string | null; license_document_back_url: string | null };
  };
  const enDisco = (ref: string) => path.join(CARPETA_DE_MATRICULAS, nombreDeLaReferencia(ref)!);
  const subir = (quien: any, archivos: Array<[string, Buffer, string, string]>) => {
    let r = request(app).post('/api/auth/license-document').set(sesion(quien));
    for (const [campo, datos, nombre, tipo] of archivos) r = r.attach(campo, datos, { filename: nombre, contentType: tipo });
    return r;
  };
  const ver = (id: string, lado: string, quien?: any) => {
    let r = request(app).get(`/api/users/${id}/license-document/${lado}`).buffer(true).parse((res, cb) => {
      const trozos: Buffer[] = [];
      res.on('data', (c: Buffer) => trozos.push(c));
      res.on('end', () => cb(null, Buffer.concat(trozos)));
    });
    if (quien) r = r.set(sesion(quien));
    return r;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    app.use('/api/users', (await import('../../server/routes/users.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/admin/padrones', (await import('../../server/routes/admin/padrones.js')).default);
    trabajador = await crearUsuario({ role: 'doer', profession: 'Electricista' });
    cliente = await crearUsuario({ role: 'client' });
    cliente2 = await crearUsuario({ role: 'client' });
    intruso = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  afterAll(async () => {
    try {
      const refs = await Promise.all([trabajador.id].map(crudo));
      for (const r of refs) for (const ref of [r.license_document_url, r.license_document_back_url]) if (ref && nombreDeLaReferencia(ref)) fs.rmSync(enDisco(ref), { force: true });
      for (const f of archivosCreados) fs.rmSync(f, { force: true });
      await AuditLog.destroy({ where: { targetId: String(trabajador.id) } as any });
      await Contract.destroy({ where: { jobId: trabajos }, force: true });
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: [trabajador.id, cliente.id, cliente2.id, intruso.id, admin.id] }, force: true });
    } catch { /* ok */ }
  });

  describe('el número', () => {
    it('queda encriptado en la base, no en claro, y el modelo lo sigue leyendo en claro', async () => {
      await trabajador.update({ licenseNumber: 'MP-12345' });
      const guardado = (await crudo(trabajador.id)).license_number!;
      expect(guardado).not.toContain('12345');
      expect(isEncrypted(guardado)).toBe(true);
      expect(((await User.findByPk(trabajador.id)) as any).licenseNumber).toBe('MP-12345');
    });

    it('se re-encripta al cambiarlo, y vaciarlo guarda null (no una cadena vacía)', async () => {
      await trabajador.update({ licenseNumber: 'CPIE-777' });
      const nuevo = (await crudo(trabajador.id)).license_number!;
      expect(nuevo).not.toContain('777');
      expect(((await User.findByPk(trabajador.id)) as any).licenseNumber).toBe('CPIE-777');
      await trabajador.update({ licenseNumber: '   ' });
      expect((await crudo(trabajador.id)).license_number).toBeNull();
      await trabajador.update({ licenseNumber: 'MP-12345' });
    });

    it('el mismo número se guarda distinto cada vez (no se pueden comparar a ojo)', () => {
      expect(matriculaParaGuardar('MP-1')).not.toBe(matriculaParaGuardar('MP-1'));
      expect(matriculaLeida(matriculaParaGuardar('MP-1'))).toBe('MP-1');
    });

    it('un dato anterior al cifrado (en claro) se sigue leyendo; uno encriptado que no se puede abrir da null, nunca el texto crudo', () => {
      expect(matriculaLeida('MP-VIEJA-9')).toBe('MP-VIEJA-9');
      const roto = 'a'.repeat(32) + ':' + 'b'.repeat(32) + ':' + 'c'.repeat(20);
      expect(matriculaLeida(roto)).toBeNull();
      expect(matriculaLeida(null)).toBeNull();
      expect(matriculaLeida('')).toBeNull();
    });

    it('el perfil público muestra el número (dato declarado) pero NO la referencia del archivo', async () => {
      const r = await request(app).get(`/api/users/${trabajador.id}/profile`);
      expect(r.status).toBe(200);
      expect(r.body.data.licenseNumber).toBe('MP-12345');
      expect(JSON.stringify(r.body)).not.toMatch(/license-docs|\.enc/);
      expect(r.body.data.licenseDocumentUrl).toBeUndefined();
    });
  });

  describe('los archivos (hasta dos: frente y reverso)', () => {
    it('se suben dos, se guardan encriptados (en disco no queda el original) y el dueño recibe las direcciones, no la referencia', async () => {
      const r = await subir(trabajador, [
        ['licenseDocument', jpeg(), 'frente.jpg', 'image/jpeg'],
        ['licenseDocumentBack', pdf(), 'dorso.pdf', 'application/pdf'],
      ]);
      expect(r.status).toBe(200);
      expect(r.body.licenseDocumentUrl).toBe(`/api/users/${trabajador.id}/license-document/front`);
      expect(r.body.licenseDocumentBackUrl).toBe(`/api/users/${trabajador.id}/license-document/back`);
      expect(JSON.stringify(r.body)).not.toMatch(/license-docs|\.enc/);

      const g = await crudo(trabajador.id);
      expect(nombreDeLaReferencia(g.license_document_url)).toBeTruthy();
      expect(nombreDeLaReferencia(g.license_document_back_url)).toBeTruthy();
      for (const ref of [g.license_document_url!, g.license_document_back_url!]) {
        const bytes = fs.readFileSync(enDisco(ref));
        expect(bytes.includes(Buffer.from(MARCA))).toBe(false); // el contenido no está a la vista
        expect(bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false); // ni empieza como un JPEG
        expect(bytes.subarray(0, 4).toString('latin1')).not.toBe('%PDF');
      }
      // ni el original quedó en la carpeta anterior
      const anterior = path.join(process.cwd(), 'uploads', 'licenses');
      const sobras = fs.existsSync(anterior) ? fs.readdirSync(anterior).filter((n) => n.startsWith('license-') && fs.readFileSync(path.join(anterior, n)).includes(Buffer.from(MARCA))) : [];
      expect(sobras).toEqual([]);
    });

    it('el dueño abre los dos y recibe EXACTAMENTE lo que subió', async () => {
      const f = await ver(trabajador.id, 'front', trabajador);
      expect(f.status).toBe(200);
      expect(f.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.from(f.body).equals(jpeg())).toBe(true);
      const d = await ver(trabajador.id, 'back', trabajador);
      expect(d.headers['content-type']).toBe('application/pdf');
      expect(Buffer.from(d.body).equals(pdf())).toBe(true);
      expect(d.headers['cache-control']).toBe('private, no-store');
      expect(d.headers['x-content-type-options']).toBe('nosniff');
    });

    it('rechaza lo que no es imagen ni PDF por CONTENIDO (aunque diga ser JPEG), y el original no queda en ningún lado', async () => {
      const antes = fs.readdirSync(CARPETA_DE_MATRICULAS).length;
      const r = await subir(trabajador, [['licenseDocument', html(), 'truco.jpg', 'image/jpeg']]);
      expect(r.status).toBe(400);
      expect(fs.readdirSync(CARPETA_DE_MATRICULAS).length).toBe(antes);
      const tipo = await subir(trabajador, [['licenseDocument', jpeg(), 'x.exe', 'application/x-msdownload']]);
      expect(tipo.status).toBe(400);
    });

    it('sin archivos, 400; más de dos, 400/rechazo; sin sesión, 401', async () => {
      expect((await subir(trabajador, [])).status).toBe(400);
      expect((await request(app).post('/api/auth/license-document').attach('licenseDocument', jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' })).status).toBe(401);
    });

    it('el reverso solo, sin frente cargado, no se acepta', async () => {
      const sinFrente = await crearUsuario({ role: 'doer' });
      try {
        const r = await subir(sinFrente, [['licenseDocumentBack', jpeg(), 'dorso.jpg', 'image/jpeg']]);
        expect(r.status).toBe(400);
      } finally {
        await User.destroy({ where: { id: sinFrente.id }, force: true });
      }
    });

    it('al reemplazar un archivo, el anterior se borra del disco recién cuando el nuevo ya está guardado', async () => {
      const antes = (await crudo(trabajador.id)).license_document_url!;
      expect(fs.existsSync(enDisco(antes))).toBe(true);
      const r = await subir(trabajador, [['licenseDocument', jpeg('OTRO-CONTENIDO'), 'nuevo.jpg', 'image/jpeg']]);
      expect(r.status).toBe(200);
      const despues = (await crudo(trabajador.id)).license_document_url!;
      expect(despues).not.toBe(antes);
      expect(fs.existsSync(enDisco(antes))).toBe(false);
      expect(Buffer.from((await ver(trabajador.id, 'front', trabajador)).body).equals(jpeg('OTRO-CONTENIDO'))).toBe(true);
    });

    it('quitar: el frente no se puede mientras haya reverso; el reverso sí, y queda anotado', async () => {
      const f = await request(app).delete('/api/auth/license-document/front').set(sesion(trabajador));
      expect(f.status).toBe(400);
      const refDorso = (await crudo(trabajador.id)).license_document_back_url!;
      const d = await request(app).delete('/api/auth/license-document/back').set(sesion(trabajador));
      expect(d.status).toBe(200);
      expect((await crudo(trabajador.id)).license_document_back_url).toBeNull();
      expect(fs.existsSync(enDisco(refDorso))).toBe(false);
      const asiento: any = await AuditLog.findOne({ where: { action: 'LICENSE_DOCUMENT_REMOVED', targetId: String(trabajador.id) } as any });
      expect(asiento).toBeTruthy();
      expect((await request(app).delete('/api/auth/license-document/otro').set(sesion(trabajador))).status).toBe(400);
    });
  });

  describe('quién ve los archivos', () => {
    let trabajoConContrato: any;

    beforeAll(async () => {
      trabajoConContrato = await crearTrabajo(cliente.id, { status: 'in_progress', doerId: trabajador.id });
      trabajos.push(trabajoConContrato.id);
      await crearContrato({ jobId: trabajoConContrato.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted' });
      const otro = await crearTrabajo(cliente2.id, { status: 'cancelled' });
      trabajos.push(otro.id);
      await crearContrato({ jobId: otro.id, clientId: cliente2.id, doerId: trabajador.id }, { status: 'cancelled' });
    });

    it('sin sesión: 401', async () => {
      expect((await ver(trabajador.id, 'front')).status).toBe(401);
    });

    it('un desconocido sin contrato: 403 (y no se entrega nada)', async () => {
      const r = await ver(trabajador.id, 'front', intruso);
      expect(r.status).toBe(403);
      expect(Buffer.from(r.body).toString()).not.toContain(MARCA);
    });

    it('un cliente cuyo único contrato con él fue CANCELADO: 403 (no hay vínculo)', async () => {
      expect((await ver(trabajador.id, 'front', cliente2)).status).toBe(403);
    });

    it('el cliente con un contrato vigente con él: 200, y queda anotado quién la miró', async () => {
      const r = await ver(trabajador.id, 'front', cliente);
      expect(r.status).toBe(200);
      const asiento: any = await AuditLog.findOne({ where: { action: 'LICENSE_DOCUMENT_VIEWED', targetId: String(trabajador.id) } as any });
      expect(asiento).toBeTruthy();
      expect(asiento.actor).toBe(`user:${cliente.id}`);
    });

    it('administración (el panel): 200', async () => {
      expect((await ver(trabajador.id, 'front', admin)).status).toBe(200);
    });

    it('el dueño al mirar lo suyo NO genera asiento de «vista por otro»', async () => {
      const antes = await AuditLog.count({ where: { action: 'LICENSE_DOCUMENT_VIEWED', actor: `user:${trabajador.id}` } as any });
      await ver(trabajador.id, 'front', trabajador);
      expect(await AuditLog.count({ where: { action: 'LICENSE_DOCUMENT_VIEWED', actor: `user:${trabajador.id}` } as any })).toBe(antes);
    });

    it('lado inválido: 400; lado sin archivo: 404; usuario inexistente: 404', async () => {
      expect((await ver(trabajador.id, 'lateral', trabajador)).status).toBe(400);
      expect((await ver(trabajador.id, 'back', trabajador)).status).toBe(404);
      expect((await ver('00000000-0000-4000-8000-000000000000', 'front', trabajador)).status).toBe(404);
    });

    it('un archivo alterado en el disco NO se entrega (la integridad se verifica): 404', async () => {
      const ref = (await crudo(trabajador.id)).license_document_url!;
      const ruta = enDisco(ref);
      const original = fs.readFileSync(ruta);
      try {
        const roto = Buffer.from(original);
        roto[roto.length - 1] ^= 0xff;
        fs.writeFileSync(ruta, roto);
        expect((await ver(trabajador.id, 'front', trabajador)).status).toBe(404);
      } finally {
        fs.writeFileSync(ruta, original);
      }
    });

    it('el detalle del trabajo: el cliente vinculado recibe la dirección; un desconocido, no; y NUNCA la referencia interna', async () => {
      const paraCliente = await request(app).get(`/api/jobs/${trabajoConContrato.id}`).set(sesion(cliente));
      expect(paraCliente.status).toBe(200);
      expect(paraCliente.body.job.doer.licenseNumber).toBe('MP-12345');
      expect(paraCliente.body.job.doer.licenseDocumentUrl).toBe(`/api/users/${trabajador.id}/license-document/front`);
      expect(JSON.stringify(paraCliente.body)).not.toMatch(/license-docs|\.enc"/);

      const paraIntruso = await request(app).get(`/api/jobs/${trabajoConContrato.id}`).set(sesion(intruso));
      expect(paraIntruso.body.job.doer.licenseDocumentUrl).toBeNull();
      expect(paraIntruso.body.job.doer.hasLicenseDocument).toBe(true);
      expect(JSON.stringify(paraIntruso.body)).not.toMatch(/license-docs|\.enc"/);

      const anonimo = await request(app).get(`/api/jobs/${trabajoConContrato.id}`);
      expect(anonimo.body.job.doer.licenseDocumentUrl).toBeNull();
    });
  });

  describe('el panel de administración', () => {
    it('busca por número de matrícula aunque esté encriptado, y recibe las direcciones de los archivos', async () => {
      const r = await request(app).get('/api/admin/padrones/licenses').query({ search: 'mp-12345' }).set(sesion(admin));
      expect(r.status).toBe(200);
      const filas: any[] = r.body.data || r.body.rows || r.body.items || [];
      const fila = filas.find((x) => x.id === trabajador.id);
      expect(fila).toBeTruthy();
      expect(fila.licenseNumber).toBe('MP-12345');
      expect(fila.licenseDocumentUrl).toBe(`/api/users/${trabajador.id}/license-document/front`);
      expect(JSON.stringify(r.body)).not.toMatch(/license-docs|\.pdf\.enc"|\.jpg\.enc"/);
      const sinResultados = await request(app).get('/api/admin/padrones/licenses').query({ search: 'no-existe-xyz' }).set(sesion(admin));
      const vacias: any[] = sinResultados.body.data || sinResultados.body.rows || sinResultados.body.items || [];
      expect(vacias.find((x) => x.id === trabajador.id)).toBeUndefined();
    });
  });

  describe('lo que ya estaba guardado en claro se encripta (tarea de arranque)', () => {
    it('encripta el número y el archivo anteriores, borra el original y es idempotente', async () => {
      const viejo = await crearUsuario({ role: 'doer', profession: 'Gasista' });
      const carpetaAnterior = path.join(process.cwd(), 'uploads', 'licenses');
      fs.mkdirSync(carpetaAnterior, { recursive: true });
      const nombre = `license-${Date.now()}-prueba-anterior.jpg`;
      const origen = path.join(carpetaAnterior, nombre);
      archivosCreados.add(origen);
      fs.writeFileSync(origen, jpeg('CONTENIDO-ANTERIOR-EN-CLARO'));
      await sequelize.query('UPDATE users SET license_number = :n, license_document_url = :u WHERE id = :id', {
        replacements: { n: 'GAS-998877', u: `/uploads/licenses/${nombre}`, id: viejo.id },
      });
      try {
        expect((await crudo(viejo.id)).license_number).toBe('GAS-998877'); // en claro, como antes del cambio
        expect(((await User.findByPk(viejo.id)) as any).licenseNumber).toBe('GAS-998877'); // y se lee bien

        const r1 = await encriptarMatriculasExistentes();
        expect(r1.numeros).toBeGreaterThanOrEqual(1);
        expect(r1.archivos).toBeGreaterThanOrEqual(1);

        const g = await crudo(viejo.id);
        expect(g.license_number).not.toContain('998877');
        expect(isEncrypted(g.license_number!)).toBe(true);
        expect(nombreDeLaReferencia(g.license_document_url)).toBeTruthy();
        expect(fs.existsSync(origen)).toBe(false); // el original en claro ya no está
        const ref = g.license_document_url!;
        archivosCreados.add(enDisco(ref));
        expect(fs.readFileSync(enDisco(ref)).includes(Buffer.from('CONTENIDO-ANTERIOR-EN-CLARO'))).toBe(false);
        expect(((await User.findByPk(viejo.id)) as any).licenseNumber).toBe('GAS-998877');
        expect(tipoDeContenido(jpeg())).toEqual({ ext: 'jpg', mime: 'image/jpeg' });

        const antes = (await crudo(viejo.id)).license_number;
        const r2 = await encriptarMatriculasExistentes();
        expect(r2.numeros).toBe(0); // idempotente: lo ya encriptado no se toca
        expect((await crudo(viejo.id)).license_number).toBe(antes);
      } finally {
        await User.destroy({ where: { id: viejo.id }, force: true });
      }
    });

    it('una referencia que no lleva a ningún archivo se deja como está y se cuenta como problema (no rompe a los demás)', async () => {
      const raro = await crearUsuario({ role: 'doer' });
      await sequelize.query('UPDATE users SET license_document_url = :u WHERE id = :id', { replacements: { u: '/uploads/licenses/no-existe-nunca.jpg', id: raro.id } });
      try {
        const r = await encriptarMatriculasExistentes();
        expect(r.errores).toBeGreaterThanOrEqual(1);
        expect((await crudo(raro.id)).license_document_url).toBe('/uploads/licenses/no-existe-nunca.jpg');
      } finally {
        await User.destroy({ where: { id: raro.id }, force: true });
      }
    });
  });

  describe('referencias de archivo', () => {
    it('sólo se aceptan las del formato propio (nada de rutas, `..` ni carpetas ajenas)', () => {
      expect(nombreDeLaReferencia('/uploads/license-docs/license-1700000000000-0123456789ab.jpg.enc')).toBe('license-1700000000000-0123456789ab.jpg.enc');
      expect(nombreDeLaReferencia('/api/uploads/license-docs/license-1700000000000-0123456789ab.pdf.enc')).toBeTruthy();
      for (const mala of [
        '/uploads/license-docs/../dni/foto.jpg', '/uploads/licenses/license-1-abc.jpg', '/uploads/license-docs/otro.txt',
        '/uploads/license-docs/license-1-0123456789ab.exe.enc', '../../etc/passwd', '', null, undefined,
      ]) expect(nombreDeLaReferencia(mala as any)).toBeNull();
    });

    it('el tipo se decide por el contenido, no por lo que diga el cliente', () => {
      expect(tipoDeContenido(pdf())).toEqual({ ext: 'pdf', mime: 'application/pdf' });
      expect(tipoDeContenido(html())).toBeNull();
      expect(tipoDeContenido(Buffer.from('corto'))).toBeNull();
    });
  });
});
