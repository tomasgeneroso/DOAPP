import { describe, it, expect } from '@jest/globals';
import { estadoFinal, estadoDelContrato, estadoDelPago, estadoDelPagoDePublicacion, alertaDeLaFila, resumenDePublicacion, rotuloDelEstadoDeUnPago } from '../shared/admin/resumenDePublicacion.js';

/**
 * Qué dice cada fila del panel de publicaciones: ESTADO FINAL, CONTRATO y PAGO (regla del dueño, 2026-11-09).
 */
const trabajo = (over: Record<string, unknown> = {}) => ({ status: 'open', publicationPaid: true, publicationPaymentId: 'pub', ...over });
const contrato = (id: string, status: string, paymentStatus: string | null = null) => ({ id, status, paymentStatus });
const pagoPub = (status = 'completed') => ({ id: 'pub', status, paymentType: 'job_publication' });

describe('estado del pago de la publicación', () => {
  it('sin pago, en revisión, verificado, rechazado y devuelto', () => {
    expect(estadoDelPagoDePublicacion({ status: 'pending_payment', publicationPaid: false }, []).clave).toBe('sin_pagar');
    expect(estadoDelPagoDePublicacion(trabajo({ publicationPaid: false }), [pagoPub('pending_verification')]).clave).toBe('en_revision');
    expect(estadoDelPagoDePublicacion(trabajo(), [pagoPub('completed')]).rotulo).toBe('Pago verificado');
    expect(estadoDelPagoDePublicacion(trabajo({ publicationPaid: false }), [pagoPub('verified')]).clave).toBe('verificado');
    expect(estadoDelPagoDePublicacion(trabajo({ publicationPaid: false }), [pagoPub('rejected')]).clave).toBe('rechazado');
    expect(estadoDelPagoDePublicacion(trabajo(), [pagoPub('refunded')]).clave).toBe('devuelto');
  });

  it('manda el pago que el trabajo señala, aunque haya otros (un aumento de presupuesto no lo pisa)', () => {
    const aumento = { id: 'aumento', status: 'pending_verification', paymentType: 'budget_increase' };
    expect(estadoDelPagoDePublicacion(trabajo(), [pagoPub('completed'), aumento]).pagoId).toBe('pub');
  });
});

describe('estado del contrato', () => {
  it('sin contrato, en proceso, por empezar, esperando confirmación, en disputa, terminado y cancelado', () => {
    expect(estadoDelContrato([]).clave).toBe('sin_contrato');
    expect(estadoDelContrato([contrato('a', 'in_progress')]).rotulo).toBe('En proceso');
    expect(estadoDelContrato([contrato('a', 'accepted')]).clave).toBe('por_empezar');
    expect(estadoDelContrato([contrato('a', 'awaiting_confirmation')]).clave).toBe('esperando_confirmacion');
    expect(estadoDelContrato([contrato('a', 'disputed')]).clave).toBe('en_disputa');
    expect(estadoDelContrato([contrato('a', 'completed')]).clave).toBe('terminado');
    expect(estadoDelContrato([contrato('a', 'cancelled')]).clave).toBe('cancelado');
  });

  it('con varios, manda el que más atención pide y cuenta los terminados; un cancelado no cuenta', () => {
    const r = estadoDelContrato([contrato('a', 'completed'), contrato('b', 'in_progress'), contrato('c', 'cancelled')]);
    expect(r).toMatchObject({ clave: 'en_proceso', cantidad: 2, terminados: 1, contratoId: 'b' });
  });
});

describe('estado del pago de punta a punta', () => {
  it('con un contrato terminado manda lo que falta con el trabajador, y conserva el de la publicación como detalle', () => {
    const r = estadoDelPago(trabajo(), [contrato('a', 'completed', 'pending_payout')], [pagoPub()]);
    expect(r).toMatchObject({ clave: 'falta_pagar_trabajador', rotulo: 'Falta pagar al trabajador', detalle: 'Pago verificado' });
  });
  it('terminado y pagado', () => {
    expect(estadoDelPago(trabajo(), [contrato('a', 'completed', 'completed')], [pagoPub()]).clave).toBe('pagado_trabajador');
  });
  it('sin contratos terminados es el de la publicación', () => {
    expect(estadoDelPago(trabajo(), [contrato('a', 'in_progress', 'escrow')], [pagoPub()])).toMatchObject({ clave: 'verificado', detalle: null });
  });
});

describe('estado final (el ejemplo del dibujo del dueño: «esperando pago o contrato en proceso»)', () => {
  it('esperando pago: borrador, pendiente de pago, sin pagar o con el pago en revisión', () => {
    expect(estadoFinal({ status: 'draft', publicationPaid: false }, [], []).rotulo).toBe('Esperando pago');
    expect(estadoFinal({ status: 'pending_payment', publicationPaid: false }, [], []).clave).toBe('esperando_pago');
    expect(estadoFinal({ status: 'pending_approval', publicationPaid: false, publicationPaymentId: 'pub' }, [], [pagoPub('pending_verification')]).clave).toBe('esperando_pago');
  });
  it('esperando aprobación, abierta y pausada, ya con el pago verificado', () => {
    expect(estadoFinal(trabajo({ status: 'pending_approval' }), [], [pagoPub()]).clave).toBe('esperando_aprobacion');
    expect(estadoFinal(trabajo({ status: 'open' }), [], [pagoPub()]).clave).toBe('abierta');
    expect(estadoFinal(trabajo({ status: 'paused' }), [], [pagoPub()]).clave).toBe('pausada');
  });
  it('contrato en proceso, por empezar y esperando confirmación', () => {
    expect(estadoFinal(trabajo({ status: 'in_progress' }), [contrato('a', 'in_progress')], [pagoPub()]).rotulo).toBe('Contrato en proceso');
    expect(estadoFinal(trabajo({ status: 'open' }), [contrato('a', 'accepted')], [pagoPub()]).clave).toBe('contrato_por_empezar');
    expect(estadoFinal(trabajo({ status: 'in_progress' }), [contrato('a', 'awaiting_confirmation')], [pagoPub()]).clave).toBe('esperando_confirmacion');
  });
  it('terminada: falta pagar al trabajador, o pagada', () => {
    expect(estadoFinal(trabajo({ status: 'completed' }), [contrato('a', 'completed', 'pending_payout')], [pagoPub()]).clave).toBe('terminada_falta_pagar');
    expect(estadoFinal(trabajo({ status: 'completed' }), [contrato('a', 'completed', 'completed')], [pagoPub()]).rotulo).toBe('Terminada y pagada');
  });
  it('una disputa y una cancelación mandan sobre lo demás', () => {
    expect(estadoFinal(trabajo({ status: 'in_progress' }), [contrato('a', 'disputed')], [pagoPub()]).clave).toBe('en_disputa');
    expect(estadoFinal(trabajo({ status: 'cancelled' }), [contrato('a', 'in_progress')], [pagoPub()]).clave).toBe('cancelada');
    expect(estadoFinal(trabajo({ cancellationRequestedAt: new Date() }), [], [pagoPub()]).clave).toBe('cancelacion_pedida');
  });
  it('un contrato cancelado no impide que la publicación vuelva a estar abierta', () => {
    expect(estadoFinal(trabajo({ status: 'open' }), [contrato('a', 'cancelled')], [pagoPub()]).clave).toBe('abierta');
  });
});

describe('alertas: cuando el trabajo, el contrato y el pago se contradicen', () => {
  it('todos los contratos terminaron pero la publicación sigue en curso', () => {
    expect(alertaDeLaFila(trabajo({ status: 'in_progress' }), [contrato('a', 'completed', 'pending_payout')], [pagoPub()])).toMatch(/siguen? «en curso»|sigue «en curso»/);
  });
  it('un contrato en marcha sin pago verificado', () => {
    expect(alertaDeLaFila(trabajo({ publicationPaid: false }), [contrato('a', 'in_progress')], [pagoPub('pending_verification')])).toMatch(/no figura como verificado/);
  });
  it('una publicación cancelada con un contrato sin cerrar', () => {
    expect(alertaDeLaFila(trabajo({ status: 'cancelled' }), [contrato('a', 'in_progress')], [pagoPub()])).toMatch(/cancelada/);
  });
  it('si todo cuadra no hay alerta', () => {
    expect(alertaDeLaFila(trabajo({ status: 'in_progress' }), [contrato('a', 'in_progress')], [pagoPub()])).toBeNull();
    expect(resumenDePublicacion(trabajo({ status: 'open' }), [], [pagoPub()]).alerta).toBeNull();
  });
});

describe('la lista de estados finales de la pantalla', () => {
  it('cubre TODOS los estados que estadoFinal puede devolver (un estado nuevo sin rótulo en los filtros haría una fila imposible de filtrar)', async () => {
    const { ESTADOS_FINALES } = await import('../shared/admin/resumenDePublicacion.js');
    const claves = new Set(ESTADOS_FINALES.map((e) => e.clave));
    const t = (over: Record<string, unknown> = {}) => ({ status: 'open', publicationPaid: true, publicationPaymentId: 'pub', ...over });
    const c = (status: string, paymentStatus: string | null = null) => [{ id: 'a', status, paymentStatus }];
    const p = (status = 'completed') => [{ id: 'pub', status, paymentType: 'job_publication' }];
    const salidas = [
      estadoFinal({ status: 'cancelled' }, [], []),
      estadoFinal(t({ cancellationRequestedAt: new Date() }), [], p()),
      estadoFinal(t(), c('disputed'), p()),
      estadoFinal(t(), c('completed', 'completed'), p()),
      estadoFinal(t(), c('completed', 'pending_payout'), p()),
      estadoFinal(t(), c('awaiting_confirmation'), p()),
      estadoFinal(t(), c('in_progress'), p()),
      estadoFinal(t(), c('accepted'), p()),
      estadoFinal({ status: 'draft', publicationPaid: false }, [], []),
      estadoFinal(t({ status: 'pending_approval' }), [], p()),
      estadoFinal(t({ status: 'paused' }), [], p()),
      estadoFinal(t({ status: 'in_progress' }), [], p()),
      estadoFinal(t({ status: 'completed' }), [], p()),
      estadoFinal(t({ status: 'open' }), [], p()),
    ];
    for (const s of salidas) expect(claves.has(s.clave)).toBe(true);
    // y los rótulos de la lista coinciden con los que devuelve
    for (const s of salidas) expect(ESTADOS_FINALES.find((e) => e.clave === s.clave)?.rotulo).toBe(s.rotulo);
  });
});

describe('rotuloDelEstadoDeUnPago: qué dice un pago por sí mismo', () => {
  it('cada estado de pago tiene un rótulo descriptivo (ninguno dice «Pendiente» a secas)', () => {
    const estados = ['pending_verification', 'pending', 'processing', 'verified', 'approved', 'held_escrow', 'awaiting_confirmation', 'confirmed_for_payout', 'completed', 'disputed', 'refunded', 'rejected', 'failed', 'cancelled'];
    for (const e of estados) {
      const r = rotuloDelEstadoDeUnPago(e);
      expect(r.rotulo.length).toBeGreaterThan(8);
      expect(r.rotulo).not.toBe('Pendiente');
      expect(r.clave).not.toBe('desconocido');
    }
  });

  it('lo que pide acción del equipo va en tono «atender»; un estado nuevo no rompe la pantalla', () => {
    expect(rotuloDelEstadoDeUnPago('pending_verification').tono).toBe('atender');
    expect(rotuloDelEstadoDeUnPago('confirmed_for_payout').tono).toBe('atender');
    expect(rotuloDelEstadoDeUnPago('completed').tono).toBe('fin');
    expect(rotuloDelEstadoDeUnPago('algo_nuevo').rotulo).toBe('Pago: algo_nuevo');
    expect(rotuloDelEstadoDeUnPago(null).rotulo).toBe('Pago sin estado');
  });
});
