import { describe, it, expect } from '@jest/globals';
import {
  cubiertoPorDoapp,
  esModoValido,
  MODO_POR_DEFECTO,
  MODOS_DE_PAGO,
  AVISOS_SIN_PROTECCION,
  DIAS_PARA_PAGAR_LA_ORDEN,
  MODULO_PAGO_AL_TERMINAR,
} from '../shared/pagos/modoDePago.js';

/**
 * La regla de hasta dónde responde DOAPP en el modo sin protección.
 *
 * Es una función de cuatro líneas y tiene su propio archivo de tests porque es
 * la que decide, en un reclamo, si la plataforma interviene o no. Todo lo demás
 * del módulo —órdenes, links, comprobantes— existe para producir las dos
 * condiciones que esta función mira.
 */

describe('quién está cubierto y quién no', () => {
  it('una orden pagada por la app y confirmada, sí', () => {
    expect(cubiertoPorDoapp({ estado: 'completed', confirmadoPorLaApp: true })).toBe(true);
    // 'verified' es el camino del comprobante: un admin lo miró y lo dio por bueno.
    expect(cubiertoPorDoapp({ estado: 'verified', confirmadoPorLaApp: true })).toBe(true);
  });

  it('una orden confirmada que todavía no cobró, no', () => {
    // El caso de todos los días: la orden existe, el link está generado, y
    // nadie pagó. Que exista la orden no es que haya entrado la plata.
    for (const estado of ['pending', 'pending_verification', 'processing']) {
      expect(cubiertoPorDoapp({ estado, confirmadoPorLaApp: true })).toBe(false);
    }
  });

  it('plata que entró pero no por la orden de la app, no', () => {
    /**
     * Es el caso que justifica el módulo entero. El cliente pagó —en efectivo,
     * por transferencia directa, por lo que sea— y el trabajo se dio por
     * pagado. DOAPP no cobró comisión, no tiene constancia de nada y no tiene
     * fondos sobre los que actuar, así que no puede mediar.
     *
     * Que el estado diga 'completed' no alcanza: sin `confirmadoPorLaApp` no
     * hubo un pago verificado contra ESTA orden.
     */
    expect(cubiertoPorDoapp({ estado: 'completed', confirmadoPorLaApp: false })).toBe(false);
    expect(cubiertoPorDoapp({ estado: 'verified', confirmadoPorLaApp: null })).toBe(false);
    expect(cubiertoPorDoapp({ estado: 'completed' })).toBe(false);
  });

  it('una orden rechazada o vencida, no', () => {
    for (const estado of ['rejected', 'cancelled', 'failed', 'refunded']) {
      expect(cubiertoPorDoapp({ estado, confirmadoPorLaApp: true })).toBe(false);
    }
  });

  it('basura de entrada no cubre a nadie', () => {
    // Un `undefined` que se cuela no puede terminar en "sí, está cubierto".
    expect(cubiertoPorDoapp({} as any)).toBe(false);
    expect(cubiertoPorDoapp(null as any)).toBe(false);
    expect(cubiertoPorDoapp(undefined as any)).toBe(false);
    expect(cubiertoPorDoapp({ estado: null, confirmadoPorLaApp: true })).toBe(false);
    expect(cubiertoPorDoapp({ estado: 'COMPLETED', confirmadoPorLaApp: true })).toBe(false);
  });
});

describe('el modo de pago', () => {
  it('el modo por defecto es el que protege', () => {
    // Si alguna vez esto cambia, cambia en silencio el riesgo de cada trabajo
    // publicado sin elegir modo.
    expect(MODO_POR_DEFECTO).toBe('escrow');
  });

  it('sólo hay dos modos y ninguna variante suelta vale', () => {
    expect(MODOS_DE_PAGO).toEqual(['escrow', 'on_completion']);
    for (const v of ['', ' ', 'ESCROW', 'onCompletion', 'on-completion', 'sin_proteccion', null, 0, {}, []]) {
      expect(esModoValido(v)).toBe(false);
    }
    expect(esModoValido('escrow')).toBe(true);
    expect(esModoValido('on_completion')).toBe(true);
  });

  it('el módulo se llama igual en todos lados', () => {
    // Un dedazo acá deja el módulo apagado para siempre sin ningún error: el
    // panel escribiría una fila y el servidor buscaría otra.
    expect(MODULO_PAGO_AL_TERMINAR).toBe('payment:on_completion');
  });
});

describe('los tres avisos', () => {
  it('existen los tres y ninguno está vacío', () => {
    for (const clave of ['publicacion', 'postulacion', 'contratacion'] as const) {
      const aviso = AVISOS_SIN_PROTECCION[clave];
      expect(aviso.titulo.length).toBeGreaterThan(5);
      expect(aviso.cuerpo.length).toBeGreaterThan(40);
    }
  });

  it('el de postularse dice lo que le pasa al trabajador si el cliente no paga', () => {
    // Es el aviso que más importa: el trabajador es el que pone el trabajo
    // antes de ver un peso.
    expect(AVISOS_SIN_PROTECCION.postulacion.cuerpo).toMatch(/no hay pago retenido/i);
    expect(AVISOS_SIN_PROTECCION.postulacion.cuerpo).toMatch(/no tiene fondos para liberarte/i);
    expect(AVISOS_SIN_PROTECCION.postulacion.cuerpo).toMatch(/orden de la aplicaci[oó]n/i);
  });

  it('el de contratar dice que pagar por fuera deja a DOAPP afuera', () => {
    expect(AVISOS_SIN_PROTECCION.contratacion.cuerpo).toMatch(/por fuera de la orden/i);
  });

  it('ninguno promete protección', () => {
    // Un aviso que arranca tranquilizando es peor que no avisar.
    for (const clave of ['publicacion', 'postulacion', 'contratacion'] as const) {
      const texto = `${AVISOS_SIN_PROTECCION[clave].titulo} ${AVISOS_SIN_PROTECCION[clave].cuerpo}`;
      expect(texto).not.toMatch(/est[áa]s protegido|dinero seguro|garantizamos/i);
    }
  });
});

describe('el plazo de la orden', () => {
  it('es un plazo razonable y no un número suelto', () => {
    expect(Number.isInteger(DIAS_PARA_PAGAR_LA_ORDEN)).toBe(true);
    expect(DIAS_PARA_PAGAR_LA_ORDEN).toBeGreaterThanOrEqual(1);
    expect(DIAS_PARA_PAGAR_LA_ORDEN).toBeLessThanOrEqual(30);
  });
});
