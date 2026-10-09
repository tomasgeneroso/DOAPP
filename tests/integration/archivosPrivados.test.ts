import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * /uploads: los documentos privados no se sirven a cualquiera.
 *
 * Todo `uploads/` se servía sin autenticación. Las fotos del DNI y la selfie, la matrícula y el seguro, los
 * comprobantes de pago (con datos bancarios), las facturas y los recibos estaban a una URL de distancia de
 * cualquiera que la conociera, y la auditoría de "ver documentos de identidad" era decorativa: el panel pedía
 * las URLs por un endpoint auditado y cargaba la imagen de la carpeta pública.
 */

import { User } from '../../server/models/sql/User.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { PaymentProof } from '../../server/models/sql/PaymentProof.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { protegerArchivosPrivados, parsearRutaDeArchivo } from '../../server/middleware/archivosPrivados.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('parsearRutaDeArchivo', () => {
  it('separa carpeta y archivo, en minúscula', () => {
    expect(parsearRutaDeArchivo('/dni/a.jpg')).toEqual({ carpeta: 'dni', archivo: 'a.jpg' });
    expect(parsearRutaDeArchivo('/DNI/A.JPG')).toEqual({ carpeta: 'dni', archivo: 'A.JPG' });
    expect(parsearRutaDeArchivo('/payment-proofs/sub/x.png')).toEqual({ carpeta: 'payment-proofs', archivo: 'sub/x.png' });
  });

  it('decodifica antes de decidir (%2e%2e, %2f)', () => {
    expect(parsearRutaDeArchivo('/dni%2fa.jpg')).toEqual({ carpeta: 'dni', archivo: 'a.jpg' });
    expect(parsearRutaDeArchivo('/avatars/%2e%2e/dni/a.jpg')).toBeNull();
  });

  it.each(['/avatars/../dni/a.jpg', '/../../etc/passwd', '/dni/..%5Ca.jpg', '/dni/a.jpg\0.png', '/%E0%A4%A'])(
    'una ruta insegura (%s) se rechaza',
    (ruta) => {
      expect(parsearRutaDeArchivo(ruta)).toBeNull();
    },
  );
});

describe('/uploads: carpetas privadas', () => {
  let app: Express;
  let raiz: string;
  const creados: { users: string[]; jobs: string[]; contratos: string[]; pagos: string[] } = { users: [], jobs: [], contratos: [], pagos: [] };
  const U: Record<string, any> = {};
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  const archivos = ['dni/dni-frente.jpg', 'licenses/matricula.pdf', 'payment-proofs/comprobante.png', 'worker-payment-proofs/transferencia.png', 'invoices/factura.pdf', 'avatars/avatar.png', 'job-images/foto.jpg'];

  beforeAll(async () => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'doapp-uploads-'));
    for (const a of archivos) {
      fs.mkdirSync(path.join(raiz, path.dirname(a)), { recursive: true });
      fs.writeFileSync(path.join(raiz, a), 'contenido-de-prueba');
    }
    app = express();
    app.use(cookieParser());
    const estaticos = express.static(raiz);
    app.use('/uploads', protegerArchivosPrivados, estaticos);
    app.use('/api/uploads', protegerArchivosPrivados, estaticos);

    const mk = async (clave: string, over: Record<string, unknown> = {}) => {
      U[clave] = await crearUsuario({ role: 'doer', ...over });
      creados.users.push(U[clave].id);
    };
    await mk('dueno', { dniPhotoFront: '/uploads/dni/dni-frente.jpg', licenseDocumentUrl: '/api/uploads/licenses/matricula.pdf' });
    await mk('ajeno');
    await mk('owner', { adminRole: 'owner' });
    await mk('super', { adminRole: 'super_admin' });
    await mk('admin', { adminRole: 'admin' });
    await mk('support', { adminRole: 'support' });
    await mk('dpo', { adminRole: 'dpo' });
    await mk('marketing', { adminRole: 'marketing' });
    await mk('analista', { adminRole: 'analista' });
    await mk('baneado', { dniPhotoFront: '/uploads/dni/otro.jpg', isBanned: true, banReason: 'prueba' });
    await mk('pagador');
    await mk('receptor');
    await mk('cliente', { role: 'client' });
    await mk('trabajador');

    // un pago con su comprobante, y un contrato con la transferencia al trabajador
    const pago: any = await Payment.create({
      payerId: U.pagador.id, recipientId: U.receptor.id, amount: 1000, currency: 'ARS', status: 'pending_verification',
      paymentType: 'contract_payment', paymentMethod: 'bank_transfer', isEscrow: true, platformFee: 0, platformFeePercentage: 0,
    } as any);
    creados.pagos.push(pago.id);
    await PaymentProof.create({
      paymentId: pago.id, userId: U.pagador.id, fileUrl: '/uploads/payment-proofs/comprobante.png', fileName: 'comprobante.png', fileSize: 10,
      kind: 'client_receipt', status: 'pending', uploadedAt: new Date(), isActive: true,
    } as any);
    const trabajo = await crearTrabajo(U.cliente.id, { status: 'completed' });
    creados.jobs.push(trabajo.id);
    const contrato = await crearContrato({ jobId: trabajo.id, clientId: U.cliente.id, doerId: U.trabajador.id }, { status: 'completed', paymentProofUrl: '/uploads/worker-payment-proofs/transferencia.png' });
    creados.contratos.push(contrato.id);
  });

  afterAll(async () => {
    try {
      await PaymentProof.destroy({ where: { paymentId: creados.pagos } });
      await Payment.destroy({ where: { id: creados.pagos } });
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: creados.users }, force: true });
      fs.rmSync(raiz, { recursive: true, force: true });
    } catch { /* ok */ }
  });

  describe('sin sesión', () => {
    it.each(['/uploads/dni/dni-frente.jpg', '/uploads/payment-proofs/comprobante.png', '/uploads/worker-payment-proofs/transferencia.png', '/uploads/invoices/factura.pdf', '/api/uploads/dni/dni-frente.jpg'])(
      '%s → 401',
      async (ruta) => {
        const r = await request(app).get(ruta);
        expect([ruta, r.status]).toEqual([ruta, 401]);
        expect(r.text).not.toContain('contenido-de-prueba');
      },
    );

    it.each(['/uploads/avatars/avatar.png', '/uploads/job-images/foto.jpg', '/api/uploads/avatars/avatar.png', '/uploads/licenses/matricula.pdf'])('lo público sigue público (la matrícula se le muestra a propósito a quien contrata): %s → 200', async (ruta) => {
      expect((await request(app).get(ruta)).status).toBe(200);
    });

    it('variantes de la ruta para esquivar la guarda también dan 401 o 400, nunca el archivo', async () => {
      for (const ruta of ['/uploads/DNI/dni-frente.jpg', '/uploads/dni%2fdni-frente.jpg', '/uploads/avatars/%2e%2e/dni/dni-frente.jpg', '/uploads//dni/dni-frente.jpg', '/uploads/dni/dni-frente.jpg?x=1']) {
        const r = await request(app).get(ruta);
        expect([ruta, [400, 401, 404].includes(r.status)]).toEqual([ruta, true]);
        expect(r.text).not.toContain('contenido-de-prueba');
      }
    });
  });

  describe('el dueño del documento', () => {
    it('ve su DNI, con o sin el prefijo /api', async () => {
      expect((await request(app).get('/uploads/dni/dni-frente.jpg').set(con(U.dueno))).status).toBe(200);
      expect((await request(app).get('/api/uploads/dni/dni-frente.jpg').set(con(U.dueno))).status).toBe(200);
    });

    it('otro usuario con sesión NO lo ve (403)', async () => {
      const r = await request(app).get('/uploads/dni/dni-frente.jpg').set(con(U.ajeno));
      expect(r.status).toBe(403);
      expect(r.text).not.toContain('contenido-de-prueba');
    });

    it('con una cuenta baneada no se ve ni lo propio', async () => {
      const r = await request(app).get('/uploads/dni/otro.jpg').set(con(U.baneado));
      expect(r.status).toBe(401);
    });

    it('un token inválido es 401', async () => {
      const r = await request(app).get('/uploads/dni/dni-frente.jpg').set({ Authorization: 'Bearer token-roto' });
      expect(r.status).toBe(401);
    });
  });

  describe('administración', () => {
    it.each(['owner', 'super', 'admin', 'support', 'dpo'])('un %s ve los documentos privados', async (rol) => {
      for (const ruta of ['/uploads/dni/dni-frente.jpg', '/uploads/payment-proofs/comprobante.png', '/uploads/invoices/factura.pdf']) {
        const r = await request(app).get(ruta).set(con(U[rol]));
        expect([rol, ruta, r.status]).toEqual([rol, ruta, 200]);
      }
    });

    it.each(['marketing', 'analista'])('un %s NO (marketing no necesita documentos de identidad; el analista sólo ve el plan de negocio)', async (rol) => {
      const r = await request(app).get('/uploads/dni/dni-frente.jpg').set(con(U[rol]));
      expect([rol, r.status]).toEqual([rol, 403]);
    });

    it('un archivo que no existe: al admin le llega el 404 de siempre; a un usuario común, 403 (no revela qué existe)', async () => {
      expect((await request(app).get('/uploads/dni/no-existe.jpg').set(con(U.admin))).status).toBe(404);
      expect((await request(app).get('/uploads/dni/no-existe.jpg').set(con(U.ajeno))).status).toBe(403);
    });
  });

  describe('comprobantes de pago', () => {
    it('quien pagó y quien recibe lo ven; un tercero no', async () => {
      expect((await request(app).get('/uploads/payment-proofs/comprobante.png').set(con(U.pagador))).status).toBe(200);
      expect((await request(app).get('/uploads/payment-proofs/comprobante.png').set(con(U.receptor))).status).toBe(200);
      expect((await request(app).get('/uploads/payment-proofs/comprobante.png').set(con(U.ajeno))).status).toBe(403);
    });

    it('la transferencia al trabajador la ven las dos partes del contrato; un tercero no', async () => {
      expect((await request(app).get('/uploads/worker-payment-proofs/transferencia.png').set(con(U.cliente))).status).toBe(200);
      expect((await request(app).get('/uploads/worker-payment-proofs/transferencia.png').set(con(U.trabajador))).status).toBe(200);
      expect((await request(app).get('/uploads/worker-payment-proofs/transferencia.png').set(con(U.ajeno))).status).toBe(403);
    });

    it('una factura sin dueño registrado sólo la ve un administrador', async () => {
      expect((await request(app).get('/uploads/invoices/factura.pdf').set(con(U.dueno))).status).toBe(403);
      expect((await request(app).get('/uploads/invoices/factura.pdf').set(con(U.admin))).status).toBe(200);
    });
  });
});
