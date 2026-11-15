import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Agregar un comprobante a un pago (el cliente o el equipo) avisa al instante a quien mira ese pago (pedido del dueño, 2026-11-15: «actualizar siempre todos los
 * timeline, la app debe estar toda sincronizada»). Antes `PaymentProof` no avisaba a nadie: la línea de tiempo y el visor seguían con lo de antes hasta recargar.
 */
import { Payment } from '../../server/models/sql/Payment.model.js';
import { PaymentProof } from '../../server/models/sql/PaymentProof.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { registrarAvisosEnVivo, SALA_DE_ADMINISTRACION } from '../../server/services/avisosEnVivo.js';
import { instalarAvisosPorCambios } from '../../server/services/avisosPorCambios.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('un comprobante nuevo avisa en vivo', () => {
  const aUsuarios: { usuario: string; evento: string; datos: any }[] = [];
  const aSalas: { sala: string; evento: string; datos: any }[] = [];
  let cliente: any, admin: any, trabajo: any, pago: any;
  let comprobante: any;

  beforeAll(async () => {
    registrarAvisosEnVivo({
      aUsuario: (usuario: string, evento: string, datos: any) => { aUsuarios.push({ usuario: String(usuario), evento, datos }); },
      aSala: (sala: string, evento: string, datos: any) => { aSalas.push({ sala, evento, datos }); },
    } as any);
    instalarAvisosPorCambios();
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    admin = await crearUsuario({ role: 'client', adminRole: 'owner' });
    trabajo = await crearTrabajo(cliente.id, { status: 'pending_payment' });
    pago = await Payment.create({
      payerId: cliente.id, amount: 100, amountArs: 100, currency: 'ARS', status: 'pending', paymentType: 'job_publication', paymentMethod: 'bank_transfer',
      platformFee: 0, platformFeePercentage: 0, jobId: trabajo.id,
    } as any);
    await esperar(500);
    aUsuarios.length = 0;
    aSalas.length = 0;
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        await PaymentProof.destroy({ where: { paymentId: pago.id } as any, force: true } as any);
        await Payment.destroy({ where: { id: pago.id }, force: true } as any);
        await Job.destroy({ where: { id: trabajo.id }, force: true });
        await User.destroy({ where: { id: [cliente.id, admin.id] }, force: true });
      });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('avisa al cliente, a la pantalla de su trabajo y al panel del equipo', async () => {
    comprobante = await conSistema(() =>
      PaymentProof.create({
        paymentId: pago.id, userId: admin.id, kind: 'admin_verification', uploadedByRole: 'admin', sequence: 1, fileUrl: '/uploads/payment-proofs/x.png', fileType: 'png',
        fileName: 'x.png', fileSize: 1, status: 'approved', isActive: false, uploadedAt: new Date(),
      } as any),
    );
    await esperar(600);
    expect(aUsuarios.some((a) => a.usuario === String(cliente.id) && a.evento === 'payment:updated' && a.datos?.paymentId === String(pago.id))).toBe(true);
    expect(aUsuarios.some((a) => a.usuario === String(cliente.id) && a.evento === 'job:updated' && a.datos?.jobId === String(trabajo.id))).toBe(true);
    expect(aSalas.some((s) => s.sala === SALA_DE_ADMINISTRACION && s.evento === 'admin:cambio' && s.datos?.tipo === 'payment' && s.datos?.id === String(pago.id))).toBe(true);
    expect(aSalas.some((s) => s.sala === SALA_DE_ADMINISTRACION && s.evento === 'admin:cambio' && s.datos?.tipo === 'job')).toBe(true);
  });

  it('un cambio de estado del pago también avisa a la pantalla del trabajo', async () => {
    aUsuarios.length = 0;
    await conSistema(() => Payment.update({ status: 'completed' } as any, { where: { id: pago.id } }).then(() => Payment.findByPk(pago.id).then((p: any) => p.update({ status: 'held_escrow' }))));
    await esperar(600);
    expect(aUsuarios.some((a) => a.usuario === String(cliente.id) && a.evento === 'job:updated' && a.datos?.jobId === String(trabajo.id))).toBe(true);
  });
});
