import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  DIAS_MAXIMOS_PARA_DEVOLVER,
  DEVOLUCIONES_QUE_PIDEN_REVISION,
  ErrorDeDinero,
  avisosParaElUsuario,
  controlarPagoOriginal,
  quienConfirmoElPago,
  respuestaDeErrorDeDinero,
  type DatosParaControlar,
  type PagoParaControlar,
} from '../server/services/controlesDeDinero.js';
import { CATALOGO_DE_PROBLEMAS, problemaDelCatalogo, rutaDeLaGuia } from '../shared/errores/catalogoDeProblemas.js';

/**
 * Comprobaciones previas a mover dinero: el pago que justifica una devolución o un saldo a favor tiene que existir, ser del cliente y de
 * esa publicación, estar confirmado (solo o por un administrador) y cerrar en monto, moneda y fecha.
 *
 * El caso base es un pago de publicación real: precio 36.000 + comisión 3.600 + IVA 756 + procesamiento 1.781,22 + su IVA 374,05.
 */
const AHORA = new Date('2026-10-17T12:00:00Z');
const JOB = { id: 'job-1', clientId: 'cliente-1', price: 36000, publicationPaymentId: 'pago-1', publicationPaid: true };

const pagoOk = (over: Partial<PagoParaControlar> = {}): PagoParaControlar => ({
  id: 'pago-1',
  payerId: 'cliente-1',
  amount: 42511.27,
  currency: 'ARS',
  status: 'held_escrow',
  paymentType: 'job_publication',
  paymentMethod: 'mercadopago',
  platformFee: 3600,
  processingCharge: 1781.22,
  mercadopagoPaymentId: '123456789',
  mercadopagoStatus: 'approved',
  createdAt: new Date('2026-10-10T12:00:00Z'),
  refundedAmount: 0,
  ...over,
});

const datos = (over: Partial<DatosParaControlar> = {}): DatosParaControlar => ({
  job: JOB,
  pago: pagoOk(),
  monto: 40356,
  destino: 'saldo',
  ahora: AHORA,
  canceladoEl: new Date('2026-10-17T11:59:00Z'),
  ...over,
});

const fallo = (r: ReturnType<typeof controlarPagoOriginal>, id: string) => r.controles.find((c) => c.id === id && !c.ok);

describe('controlarPagoOriginal — acreditar saldo', () => {
  it('un pago confirmado por Mercado Pago, del cliente y de la publicación, aprueba', () => {
    const r = controlarPagoOriginal(datos());
    expect(r.aprobado).toBe(true);
    expect(r.recibioElDinero).toBe(true);
    expect(r.fallidos).toEqual([]);
  });

  it('un pago confirmado A MANO por un administrador también aprueba, y se sabe quién', () => {
    const p = pagoOk({ mercadopagoStatus: null, approvedBy: 'admin-7', approvedAt: new Date('2026-10-11T10:00:00Z') });
    expect(quienConfirmoElPago(p)).toMatch(/administrador \(admin-7\)/);
    expect(controlarPagoOriginal(datos({ pago: p })).aprobado).toBe(true);
    // La verificación del escrow también cuenta como confirmación de un administrador.
    const q = pagoOk({ mercadopagoStatus: null, escrowVerifiedBy: 'admin-8' });
    expect(controlarPagoOriginal(datos({ pago: q })).aprobado).toBe(true);
  });

  it('un pago que NADIE confirmó no aprueba, aunque figure «held_escrow»: no se regala saldo', () => {
    const r = controlarPagoOriginal(datos({ pago: pagoOk({ mercadopagoStatus: null }) }));
    expect(r.aprobado).toBe(false);
    expect(r.recibioElDinero).toBe(false);
    expect(fallo(r, 'pago_confirmado')?.encontrado).toBe('nadie lo confirmó');
  });

  it.each(['pending', 'pending_verification', 'processing', 'failed', 'rejected', 'cancelled', 'disputed'])(
    'un pago en estado «%s» no es dinero recibido',
    (status) => {
      const r = controlarPagoOriginal(datos({ pago: pagoOk({ status }) }));
      expect(r.aprobado).toBe(false);
      expect(r.recibioElDinero).toBe(false);
    },
  );

  it('el pago de OTRO usuario no justifica un saldo (el cliente no puede cobrar un pago ajeno)', () => {
    const r = controlarPagoOriginal(datos({ pago: pagoOk({ payerId: 'otro' }) }));
    expect(r.aprobado).toBe(false);
    expect(fallo(r, 'pago_del_cliente')).toMatchObject({ esperado: 'cliente cliente-1', encontrado: 'pagador otro' });
  });

  it('un pago que NO es el de esta publicación, o de otro tipo, no aprueba', () => {
    expect(fallo(controlarPagoOriginal(datos({ pago: pagoOk({ id: 'pago-2' }) })), 'pago_de_esta_publicacion')).toBeTruthy();
    expect(fallo(controlarPagoOriginal(datos({ pago: pagoOk({ paymentType: 'membership' }) })), 'pago_de_esta_publicacion')).toBeTruthy();
  });

  it('no se acredita más de lo que se pagó, ni se devuelve lo ya devuelto', () => {
    const mas = controlarPagoOriginal(datos({ monto: 50000 }));
    expect(mas.aprobado).toBe(false);
    expect(fallo(mas, 'no_supera_lo_pagado')?.esperado).toMatch(/hasta \$42\.511,27/);
    const ya = controlarPagoOriginal(datos({ monto: 40356, pago: pagoOk({ refundedAmount: 10000, status: 'held_escrow' }) }));
    expect(fallo(ya, 'no_supera_lo_pagado')).toBeTruthy();
  });

  it('la fecha tiene que ser pasada y anterior a la cancelación', () => {
    const futuro = controlarPagoOriginal(datos({ pago: pagoOk({ createdAt: new Date('2026-12-01T00:00:00Z') }) }));
    expect(fallo(futuro, 'fecha_coherente')).toBeTruthy();
    const despues = controlarPagoOriginal(datos({ canceladoEl: new Date('2026-10-01T00:00:00Z') }));
    expect(fallo(despues, 'fecha_coherente')).toBeTruthy();
    const sinFecha = controlarPagoOriginal(datos({ pago: pagoOk({ createdAt: null }) }));
    expect(fallo(sinFecha, 'fecha_coherente')?.encontrado).toBe('el pago no tiene fecha');
  });

  it('un pago en disputa o con contracargo no se devuelve ni se acredita', () => {
    expect(controlarPagoOriginal(datos({ pago: pagoOk({ disputeId: 'disp-1' }) })).aprobado).toBe(false);
  });

  it('un pago en otra moneda no se acredita como pesos', () => {
    expect(fallo(controlarPagoOriginal(datos({ pago: pagoOk({ currency: 'USD' }) })), 'moneda')).toBeTruthy();
  });

  it('un monto que no cierra con el desglose solo ADVIERTE al acreditar saldo (no bloquea al cliente), pero BLOQUEA la devolución por el medio de pago', () => {
    const raro = pagoOk({ amount: 99999 });
    const saldo = controlarPagoOriginal(datos({ pago: raro, monto: 40356 }));
    expect(fallo(saldo, 'monto_cierra_con_el_desglose')?.bloqueante).toBe(false);
    expect(saldo.aprobado).toBe(true);
    const medio = controlarPagoOriginal(datos({ pago: raro, monto: 40356, destino: 'medio' }));
    expect(fallo(medio, 'monto_cierra_con_el_desglose')?.bloqueante).toBe(true);
    expect(medio.aprobado).toBe(false);
  });

  it('sin registro de pago: una publicación pagada con saldo se acepta; una que no figura como pagada, no; y si había pago pero no se lee, no', () => {
    expect(controlarPagoOriginal(datos({ pago: null, job: { ...JOB, publicationPaymentId: null } })).aprobado).toBe(true);
    expect(controlarPagoOriginal(datos({ pago: null, job: { ...JOB, publicationPaymentId: null, publicationPaid: false } })).aprobado).toBe(false);
    expect(controlarPagoOriginal(datos({ pago: null })).aprobado).toBe(false); // el trabajo apunta a un pago que no aparece
  });
});

describe('controlarPagoOriginal — devolver por el medio de pago (Mercado Pago)', () => {
  const medio = (over: Partial<DatosParaControlar> = {}) => datos({ destino: 'medio', monto: 40356, ...over });
  const mpOk = { status: 'approved', transaction_amount: 42511.27, currency_id: 'ARS', transaction_amount_refunded: 0 };

  it('con todo en orden y Mercado Pago confirmando ahora mismo, aprueba', () => {
    const r = controlarPagoOriginal(medio({ mpEnVivo: mpOk }));
    expect(r.aprobado).toBe(true);
    expect(r.controles.find((c) => c.id === 'mercado_pago_confirma')?.ok).toBe(true);
  });

  it('si Mercado Pago dice otro estado, otro importe, otra moneda o que ya devolvió, frena', () => {
    for (const mp of [
      { ...mpOk, status: 'refunded' },
      { ...mpOk, transaction_amount: 100 },
      { ...mpOk, currency_id: 'USD' },
      { ...mpOk, transaction_amount_refunded: 500 },
    ]) {
      const r = controlarPagoOriginal(medio({ mpEnVivo: mp }));
      expect([JSON.stringify(mp), r.aprobado]).toEqual([JSON.stringify(mp), false]);
      // El dinero SÍ llegó: la devolución se frena pero el cliente puede recuperarlo como saldo.
      expect(r.recibioElDinero).toBe(true);
    }
  });

  it('si no se pudo consultar a Mercado Pago, queda como advertencia y no inventa un bloqueo', () => {
    const r = controlarPagoOriginal(medio({ mpEnVivo: null }));
    const c = r.controles.find((x) => x.id === 'mercado_pago_confirma')!;
    expect(c.ok).toBe(false);
    expect(c.bloqueante).toBe(false);
    expect(r.aprobado).toBe(true);
  });

  it(`un pago de más de ${DIAS_MAXIMOS_PARA_DEVOLVER} días está fuera del plazo de devolución`, () => {
    const viejo = pagoOk({ createdAt: new Date(AHORA.getTime() - (DIAS_MAXIMOS_PARA_DEVOLVER + 1) * 86_400_000) });
    const r = controlarPagoOriginal(medio({ pago: viejo, mpEnVivo: mpOk }));
    expect(fallo(r, 'dentro_del_plazo')).toBeTruthy();
    expect(r.aprobado).toBe(false);
    expect(r.recibioElDinero).toBe(true);
    // Un día antes del límite pasa.
    const justo = pagoOk({ createdAt: new Date(AHORA.getTime() - (DIAS_MAXIMOS_PARA_DEVOLVER - 1) * 86_400_000) });
    expect(controlarPagoOriginal(medio({ pago: justo, mpEnVivo: mpOk })).aprobado).toBe(true);
  });

  it('sin número de operación de Mercado Pago, o pagado por otro medio, no se devuelve por Mercado Pago', () => {
    expect(fallo(controlarPagoOriginal(medio({ pago: pagoOk({ mercadopagoPaymentId: null }), mpEnVivo: mpOk })), 'medio_es_mercado_pago')).toBeTruthy();
    expect(fallo(controlarPagoOriginal(medio({ pago: pagoOk({ paymentMethod: 'bank_transfer' }), mpEnVivo: mpOk })), 'medio_es_mercado_pago')).toBeTruthy();
  });

  it('una devolución por más de $200.000 no sale sola al medio de pago (la aprueba el dueño); hasta $200.000 sí', () => {
    const grande_ = { pago: pagoOk({ amount: 280_250, platformFee: 25_000, processingCharge: 0 }), job: { ...JOB, price: 250_000 }, mpEnVivo: { ...mpOk, transaction_amount: 280_250 } };
    const justo = controlarPagoOriginal(medio({ ...grande_, monto: 200_000 }));
    expect(justo.controles.find((c) => c.id === 'monto_no_pide_al_dueno')?.ok).toBe(true);
    const grande = controlarPagoOriginal(medio({ ...grande_, monto: 200_001 }));
    const c = grande.controles.find((x) => x.id === 'monto_no_pide_al_dueno')!;
    expect(c.ok).toBe(false);
    expect(c.bloqueante).toBe(true);
    expect(grande.aprobado).toBe(false);
    // el dinero SÍ llegó: puede quedar como saldo, que no sale de la plataforma
    expect(grande.recibioElDinero).toBe(true);
    // acreditar como saldo no pasa por este tope
    expect(controlarPagoOriginal(datos({ monto: 200_001, destino: 'saldo' })).controles.some((x) => x.id === 'monto_no_pide_al_dueno')).toBe(false);
  });

  it(`un cliente con ${DEVOLUCIONES_QUE_PIDEN_REVISION} devoluciones en 30 días pasa a revisión de una persona`, () => {
    const justo = controlarPagoOriginal(medio({ mpEnVivo: mpOk, devolucionesRecientesDelCliente: DEVOLUCIONES_QUE_PIDEN_REVISION - 1 }));
    expect(justo.aprobado).toBe(true);
    const seguidas = controlarPagoOriginal(medio({ mpEnVivo: mpOk, devolucionesRecientesDelCliente: DEVOLUCIONES_QUE_PIDEN_REVISION }));
    expect(seguidas.aprobado).toBe(false);
    expect(fallo(seguidas, 'ritmo_de_devoluciones')?.encontrado).toMatch(/3 en los últimos 30 días/);
  });

  it('todo control fallido trae lo esperado y lo encontrado, para que el admin entienda cuál es y por qué', () => {
    const r = controlarPagoOriginal(medio({ pago: pagoOk({ payerId: 'otro' }), mpEnVivo: mpOk }));
    for (const c of r.fallidos) {
      expect(c.titulo.length).toBeGreaterThan(5);
      expect(c.esperado).toBeTruthy();
      expect(c.encontrado).toBeTruthy();
    }
  });
});

describe('errores de dinero con código', () => {
  it('ErrorDeDinero lleva el código y el detalle con los números', () => {
    const e = new ErrorDeDinero('RETIRO-CUENTA-NO-CIERRA', 'saldo antes $5.000 − debita $5.000 = $0');
    expect(e.codigo).toBe('RETIRO-CUENTA-NO-CIERRA');
    expect(e.message).toContain('[RETIRO-CUENTA-NO-CIERRA]');
    expect(e.message).toContain('$5.000');
  });

  it('al usuario: qué le pasó a su plata, con el código; al admin: título, números y enlace a la guía', () => {
    const e = new ErrorDeDinero('SALDO-NO-CIERRA-LIBRO', 'saldo $9.000, movimientos $5.000');
    const u = respuestaDeErrorDeDinero(e, false)!;
    expect(u.status).toBe(409);
    expect(u.body.message).toContain('(código SALDO-NO-CIERRA-LIBRO)');
    expect(u.body.message).not.toContain('$9.000');
    expect(u.body.guia).toBeUndefined();
    const a = respuestaDeErrorDeDinero(e, true)!;
    expect(a.body.message).toContain('$9.000');
    expect(a.body.guia).toBe('/admin/guia-de-errores#SALDO-NO-CIERRA-LIBRO');
    expect(respuestaDeErrorDeDinero(new Error('otra cosa'), true)).toBeNull();
  });

  it('el aviso al usuario sale del catálogo, sin repetir y sin números internos', () => {
    const avisos = avisosParaElUsuario([
      { codigo: 'DEV-SIN-ID-DE-PAGO', detalle: 'pago 7f3a… sin id de operación' },
      { codigo: 'DEV-SIN-ID-DE-PAGO', detalle: 'otra vez' },
      { codigo: 'DEV-MP-RECHAZADA', detalle: 'cuenta sin saldo disponible' },
    ]);
    expect(avisos.map((a) => a.codigo)).toEqual(['DEV-SIN-ID-DE-PAGO', 'DEV-MP-RECHAZADA']);
    for (const a of avisos) expect(a.mensaje).not.toMatch(/7f3a|sin id de operación|cuenta sin saldo/);
  });
});

describe('catálogo de problemas', () => {
  const codigos = Object.keys(CATALOGO_DE_PROBLEMAS);
  const rutasDeAdmin = new Set(
    [...readFileSync(join(process.cwd(), 'client/App.tsx'), 'utf8').matchAll(/path="([^"*:]+)"/g)].map((m) => `/admin/${m[1]}`),
  );

  it.each(codigos)('%s está completo: título, texto para el usuario, qué significa, causas y pasos', (codigo) => {
    const p = problemaDelCatalogo(codigo)!;
    expect(p.codigo).toBe(codigo);
    expect(p.titulo.length).toBeGreaterThan(10);
    expect(p.paraElUsuario.length).toBeGreaterThan(30);
    expect(p.queSignifica.length).toBeGreaterThan(30);
    expect(p.causas.length).toBeGreaterThan(0);
    expect(p.queHacer.length).toBeGreaterThan(0);
    // El texto del usuario no lleva jerga ni nombres internos.
    expect(p.paraElUsuario).not.toMatch(/\b(libro|asiento|payload|webhook|escrow|BalanceTransaction)\b/i);
  });

  it('cada paso que apunta a una pantalla del admin apunta a una que existe', () => {
    for (const codigo of codigos) {
      for (const paso of problemaDelCatalogo(codigo)!.queHacer) {
        if (paso.ruta) expect([codigo, paso.ruta, rutasDeAdmin.has(paso.ruta)]).toEqual([codigo, paso.ruta, true]);
      }
    }
  });

  it('todo código que el servidor emite existe en el catálogo (y la guía de errores es una pantalla del admin)', () => {
    const emitidos = new Set<string>();
    const recorrer = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const ruta = join(dir, n);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/\.ts$/.test(n)) {
          const src = readFileSync(ruta, 'utf8');
          for (const m of src.matchAll(/new ErrorDeDinero\(\s*'([A-Z0-9-]+)'/g)) emitidos.add(m[1]);
          for (const m of src.matchAll(/(?:anotar|problemaDesdeControles)\(\s*'([A-Z0-9-]+)'/g)) emitidos.add(m[1]);
          for (const m of src.matchAll(/codigo:\s*'([A-Z]+-[A-Z0-9-]+)'/g)) emitidos.add(m[1]);
        }
      }
    };
    recorrer(join(process.cwd(), 'server'));
    expect(emitidos.size).toBeGreaterThan(8);
    for (const c of emitidos) expect([c, codigos.includes(c)]).toEqual([c, true]);
    expect(rutasDeAdmin.has('/admin/guia-de-errores')).toBe(true);
    expect(rutaDeLaGuia('X Y')).toBe('/admin/guia-de-errores#X%20Y');
  });
});
