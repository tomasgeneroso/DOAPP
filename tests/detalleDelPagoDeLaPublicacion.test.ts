import { describe, it, expect } from '@jest/globals';
import { armarDetalleDelPagoDeLaPublicacion, rotuloDelMetodo } from '../shared/pagos/detalleDelPagoDeLaPublicacion';

/**
 * «Detalles del pago» (pedido del dueño, 2026-11-15): cuándo se aprobó el pago y el trabajo, y si fue automático o por un administrador.
 */
const T0 = new Date('2026-11-13T21:57:00Z');
const T1 = new Date('2026-11-14T22:10:00Z');

const base = (over: Record<string, any> = {}) => ({
  verNombres: true,
  pagador: 'Carla',
  trabajo: { status: 'open', price: 10560.99, publicationPaid: true, publicationPaidAt: T0, ...(over.trabajo ?? {}) },
  pago: over.pago === null ? null : { status: 'completed', amount: 10560.99, platformFee: 0, platformFeePercentage: 0, paymentMethod: 'mercadopago', createdAt: T0, ...(over.pago ?? {}) },
});

describe('pago aprobado', () => {
  it('Mercado Pago lo confirmó solo: automático, con la fecha', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({ pago: { mercadopagoVerifiedAt: T0 } }));
    expect(d.pagoAprobado).toMatchObject({ modo: 'automatico', cuando: T0.toISOString() });
  });

  it('lo aprobó el equipo: «por un administrador», con el nombre solo para el equipo', () => {
    const conNombre = armarDetalleDelPagoDeLaPublicacion(base({ pago: { approvedAt: T1, approvedByName: 'Ana Admin' } }));
    expect(conNombre.pagoAprobado).toMatchObject({ modo: 'administrador', quien: 'Ana Admin', cuando: T1.toISOString() });
    const sinNombre = armarDetalleDelPagoDeLaPublicacion({ ...base({ pago: { approvedAt: T1, approvedByName: 'Ana Admin' } }), verNombres: false });
    expect(sinNombre.pagoAprobado.quien).toBeNull();
    expect(sinNombre.pagoAprobado.texto).not.toMatch(/Ana/);
  });

  it('sin confirmar queda pendiente y sin fecha; sin pago, también', () => {
    expect(armarDetalleDelPagoDeLaPublicacion(base({ pago: { status: 'pending' } })).pagoAprobado).toMatchObject({ modo: 'pendiente', cuando: null });
    expect(armarDetalleDelPagoDeLaPublicacion(base({ pago: { status: 'pending_verification' } })).pagoAprobado.texto).toMatch(/verifique el comprobante/);
    expect(armarDetalleDelPagoDeLaPublicacion(base({ pago: null })).pagoAprobado.modo).toBe('pendiente');
  });

  it('un pago acreditado sin rastro de cómo se aprobó no inventa un modo', () => {
    expect(armarDetalleDelPagoDeLaPublicacion(base()).pagoAprobado.modo).toBe('sin_dato');
  });
});

describe('trabajo aprobado', () => {
  it('lo aprobó un administrador (módulo de aprobación encendido)', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({ trabajo: { reviewedAt: T1, reviewedByName: 'Ana Admin' } }));
    expect(d.trabajoAprobado).toMatchObject({ modo: 'administrador', quien: 'Ana Admin', cuando: T1.toISOString() });
  });

  it('quedó publicado solo al confirmarse el pago (módulo apagado): automática, con la fecha del pago', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base());
    expect(d.trabajoAprobado).toMatchObject({ modo: 'automatico', cuando: T0.toISOString() });
  });

  it('en revisión: pendiente, sin fecha', () => {
    expect(armarDetalleDelPagoDeLaPublicacion(base({ trabajo: { status: 'pending_approval' } })).trabajoAprobado).toMatchObject({ modo: 'pendiente', cuando: null });
  });

  it('rechazado por el equipo: no llegó a aprobarse', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({ trabajo: { status: 'draft', publicationPaid: false, reviewedAt: T1, rejectedReason: 'Falta información' } }));
    expect(d.trabajoAprobado.modo).toBe('no_llego');
  });

  it('cancelado sin haber pasado por la aprobación: no se dice que se aprobó solo', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({ trabajo: { status: 'cancelled' } }));
    expect(d.trabajoAprobado.modo).toBe('no_llego');
  });

  it('aprobado a mano un día después del fin y cancelado solo por fecha vencida: se ven las dos cosas', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({
      trabajo: { status: 'cancelled', reviewedAt: T1, reviewedByName: 'Ana Admin', cancelledAt: T1, cancellationReason: 'Cancelado automáticamente: Ningún trabajador se postuló antes de la fecha programada.' },
    }));
    expect(d.trabajoAprobado.modo).toBe('administrador');
    expect(d.cancelado).toEqual({ cuando: T1.toISOString(), motivo: expect.stringMatching(/Ningún trabajador/) });
  });
});

describe('historia (de lo más reciente a lo más viejo)', () => {
  const claves = (d: ReturnType<typeof armarDetalleDelPagoDeLaPublicacion>) => d.historia.map((h) => h.clave);

  it('pago aprobado solo, trabajo aprobado por un administrador y cancelado: la cancelación arriba y el inicio del pago abajo', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({
      pago: { mercadopagoVerifiedAt: T0 },
      trabajo: { status: 'cancelled', reviewedAt: T1, reviewedByName: 'Ana Admin', cancelledAt: new Date('2026-11-14T22:11:00Z'), cancellationReason: 'Cancelado automáticamente: la fecha ya pasó.' },
    }));
    expect(claves(d)).toEqual(['trabajo_cancelado', 'trabajo_aprobado', 'pago_aprobado', 'pago_iniciado']);
    const fechas = d.historia.map((h) => new Date(h.cuando as string).getTime());
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas);
    expect(d.historia[0].texto).toMatch(/la fecha ya pasó/);
    expect(d.historia[1]).toMatchObject({ modo: 'administrador' });
    expect(d.historia[2]).toMatchObject({ modo: 'automatico' });
  });

  it('lo que todavía falta va arriba de todo, sin fecha', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({ pago: { status: 'pending_verification' }, trabajo: { status: 'pending_payment', publicationPaid: false } }));
    expect(d.historia[0]).toMatchObject({ clave: 'pendiente_pago', pendiente: true, cuando: null });
    expect(d.historia.some((h) => h.clave === 'pendiente_trabajo')).toBe(true);
    expect(d.historia[d.historia.length - 1].clave).toBe('pago_iniciado');
  });

  it('los comprobantes entran en su lugar, con quién los subió', () => {
    const d = armarDetalleDelPagoDeLaPublicacion({ ...base({ pago: { mercadopagoVerifiedAt: T1 } }), comprobantes: [{ cuando: T0, porElEquipo: false }, { cuando: new Date('2026-11-14T10:00:00Z'), porElEquipo: true }] });
    // a igual fecha (T0) manda el orden de la cadena: el trabajo publicado, después el comprobante, después el inicio del pago
    expect(claves(d)).toEqual(['pago_aprobado', 'comprobante', 'trabajo_aprobado', 'comprobante', 'pago_iniciado']);
    const comprobantes = d.historia.filter((h) => h.clave === 'comprobante');
    expect(comprobantes.map((c) => c.titulo)).toEqual(['Comprobante subido por el equipo', 'Comprobante subido']);
  });

  it('un trabajo rechazado o cancelado sin aprobación no dice que se aprobó solo', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({ trabajo: { status: 'cancelled', cancelledAt: T1 } }));
    expect(claves(d)).not.toContain('trabajo_aprobado');
    expect(claves(d)).toContain('trabajo_cancelado');
  });
});

describe('importes y método', () => {
  it('la comisión es el importe y la tasa es el porcentaje (dos datos distintos)', () => {
    const d = armarDetalleDelPagoDeLaPublicacion(base({ pago: { platformFee: 1056.1, platformFeePercentage: 10 } }));
    expect(d.comision).toBe(1056.1);
    expect(d.tasaDeComision).toBe(10);
    expect(d.monto).toBe(10560.99);
  });

  it('el método sale con nombre legible', () => {
    expect(rotuloDelMetodo('mercadopago')).toBe('Mercado Pago');
    expect(rotuloDelMetodo('bank_transfer')).toBe('Transferencia bancaria');
    expect(rotuloDelMetodo('Transferencia Bancaria')).toBe('Transferencia bancaria');
    expect(rotuloDelMetodo(null)).toBeNull();
    expect(armarDetalleDelPagoDeLaPublicacion(base()).metodo).toBe('Mercado Pago');
  });
});
