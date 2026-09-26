import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

/**
 * Sin pago confirmado no se puede abrir un reclamo, en los contratos que se
 * pagan al terminar.
 *
 * Esto se prueba contra la base y no sólo con la función pura porque lo que
 * importa no es que la regla exista: es que el camino entero la respete. El
 * botón apagado en la pantalla es una cortesía; si el servicio deja crear la
 * orden y después el contrato no refleja el pago, o si la orden se confirma y
 * el reclamo sigue bloqueado, la regla está bien escrita y mal conectada.
 *
 * Por qué importa tanto: un reclamo sobre una operación que DOAPP no vio no se
 * puede resolver de ninguna manera —no hay fondos, no hay constancia, no hay
 * nada sobre lo que decidir—. Dejarlo abrir es prometer un servicio que
 * después hay que incumplir a mano, con alguien enojado del otro lado.
 */
describe('reclamo: hace falta un pago confirmado cuando se paga al terminar', () => {
  let cliente: any;
  let trabajador: any;
  let trabajo: any;
  let contrato: any;
  let puedeReclamar: any;
  let ordenDelContrato: any;
  let ordenCubierta: any;

  beforeAll(async () => {
    ({ puedeReclamar } = await import('../../shared/pagos/modoDePago.js'));
    ({ ordenDelContrato, ordenCubierta } = await import('../../server/services/pagoAlTerminar.js'));

    cliente = await crearUsuario();
    trabajador = await crearUsuario();
    trabajo = await crearTrabajo(cliente.id, { paymentMode: 'on_completion', pricingMode: 'quote' });
    contrato = await crearContrato(
      { jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id },
      { status: 'awaiting_confirmation', paymentMode: 'on_completion', paymentStatus: 'pending' },
    );
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { contractId: contrato.id } });
      await Contract.destroy({ where: { id: contrato.id }, force: true });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('el contrato hereda el modo del trabajo sin que nadie lo copie', () => {
    // Lo hace un hook del modelo. Si algún día alguien lo saca, el contrato
    // saldría con protección sobre un trabajo que no la tiene, y las dos
    // partes creerían cosas distintas sobre dónde está la plata.
    expect(contrato.paymentMode).toBe('on_completion');
  });

  it('recién terminado y sin orden, no se puede reclamar', async () => {
    expect(await ordenDelContrato(contrato.id)).toBeNull();
    expect(puedeReclamar(contrato)).toBe(false);
  });

  it('con la orden creada pero sin pagar, tampoco', async () => {
    // Es el caso que más se va a dar: la orden existe, el link está generado,
    // y nadie pagó. Que exista la orden no es que haya entrado la plata.
    const orden = await Payment.create({
      contractId: contrato.id,
      payerId: cliente.id,
      recipientId: trabajador.id,
      amount: 1000,
      currency: 'ARS',
      platformFee: 0,
      platformFeePercentage: 0,
      paymentType: 'on_completion',
      paymentMethod: 'mercadopago',
      isEscrow: false,
      status: 'pending',
      metadata: { metodo: 'mercadopago' },
    } as any);

    expect(ordenCubierta(orden)).toBe(false);

    const recargado = await Contract.findByPk(contrato.id);
    expect(puedeReclamar(recargado as any)).toBe(false);
  });

  it('confirmar el pago habilita el reclamo Y deja constancia en el contrato', async () => {
    const { confirmarPagoDeOrden } = await import('../../server/services/pagoAlTerminar.js');
    const orden = await ordenDelContrato(contrato.id);

    const ok = await confirmarPagoDeOrden(orden!.id, {
      mercadopagoPaymentId: 'mp-test-1',
      estado: 'approved',
      monto: 1000,
    });
    expect(ok).toBe(true);

    const confirmada = await Payment.findByPk(orden!.id);
    expect(ordenCubierta(confirmada)).toBe(true);

    /**
     * El reflejo en el contrato. Sin esto la orden queda pagada y el contrato
     * sigue diciendo "se paga al terminar (sin retención)" para siempre, y los
     * listados —que no consultan la orden de cada fila— lo seguirían mostrando
     * como impago.
     */
    const recargado = await Contract.findByPk(contrato.id);
    expect(recargado!.paymentStatus).toBe('completed');
    expect(puedeReclamar(recargado as any)).toBe(true);
  });

  it('un webhook repetido no rompe nada', async () => {
    // MercadoPago reintenta. Confirmar dos veces tiene que ser inocuo.
    const { confirmarPagoDeOrden } = await import('../../server/services/pagoAlTerminar.js');
    const orden = await ordenDelContrato(contrato.id);
    expect(await confirmarPagoDeOrden(orden!.id, {
      mercadopagoPaymentId: 'mp-test-1',
      estado: 'approved',
    })).toBe(true);
  });

  it('un pago de OTRA preferencia no confirma la orden', async () => {
    /**
     * El corazón de la verificación. Un pago aprobado del mismo cliente por el
     * mismo monto podría ser cualquier otra cosa —otro contrato, una
     * membresía—; lo único que ata el pago a ESTA orden es la preferencia.
     */
    const otroContrato = await crearContrato(
      { jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id },
      { status: 'awaiting_confirmation', paymentMode: 'on_completion', paymentStatus: 'pending' },
    );

    const orden = await Payment.create({
      contractId: otroContrato.id,
      payerId: cliente.id,
      recipientId: trabajador.id,
      amount: 1000,
      currency: 'ARS',
      platformFee: 0,
      platformFeePercentage: 0,
      paymentType: 'on_completion',
      paymentMethod: 'mercadopago',
      isEscrow: false,
      status: 'pending',
      mercadopagoPreferenceId: 'pref-de-esta-orden',
      metadata: { metodo: 'mercadopago' },
    } as any);

    const { confirmarPagoDeOrden } = await import('../../server/services/pagoAlTerminar.js');
    const confirmada = await confirmarPagoDeOrden(orden.id, {
      mercadopagoPaymentId: 'mp-test-2',
      preferenceId: 'pref-de-otra-cosa',
      estado: 'approved',
      monto: 1000,
    });

    expect(confirmada).toBe(false);

    const recargada = await Payment.findByPk(orden.id);
    expect(recargada!.status).toBe('pending');
    // Y queda anotado, que es lo que permite revisarlo a mano.
    expect((recargada!.metadata as any)?.preferenciaQueNoCoincide).toBe('pref-de-otra-cosa');

    await Payment.destroy({ where: { id: orden.id } });
    await Contract.destroy({ where: { id: otroContrato.id }, force: true });
  });

  it('un contrato con protección de pago puede reclamar siempre', async () => {
    const conProteccion = await crearContrato(
      { jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id },
      { status: 'in_progress', paymentMode: 'escrow', paymentStatus: 'pending' },
    );
    expect(puedeReclamar(conProteccion)).toBe(true);
    await Contract.destroy({ where: { id: conProteccion.id }, force: true });
  });
});
