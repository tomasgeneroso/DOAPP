import { describe, it, expect } from '@jest/globals';
import {
  cubiertoPorDoapp,
  esModoValido,
  MODO_POR_DEFECTO,
  MODOS_DE_PAGO,
  avisoSinProteccion,
  puedeReclamar,
  RECLAMO_DESHABILITADO,
  REQUIERE_COTIZACION,
  COMO_FUNCIONA,
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
  const MOMENTOS = ['publicacion', 'postulacion', 'contratacion'] as const;
  const ROLES = [null, 'cliente', 'trabajador'] as const;

  it('existen, en todas las combinaciones, y ninguno esta vacio', () => {
    // Incluidas las de rol que no tienen texto propio: la funcion tiene que
    // caer en el neutro y no devolver undefined, que en pantalla es un hueco.
    for (const momento of MOMENTOS) {
      for (const rol of ROLES) {
        const aviso = avisoSinProteccion(momento, rol);
        expect(aviso.titulo.length).toBeGreaterThan(5);
        expect(aviso.cuerpo.length).toBeGreaterThan(40);
      }
    }
  });

  it('el de postularse dice quien tiene que pagar y desde cuando hay respaldo', () => {
    // Es el aviso que mas importa: el trabajador pone el trabajo antes de ver
    // un peso, y tiene que saber tres cosas -que no hay plata retenida, quien
    // es el responsable de pagar, y que el respaldo arranca cuando el pago se
    // confirma-.
    const texto = avisoSinProteccion('postulacion', 'trabajador').cuerpo;
    expect(texto).toMatch(/no hay dinero retenido/i);
    expect(texto).toMatch(/el cliente es el responsable/i);
    expect(texto).toMatch(/desde el momento en que ese pago se confirma/i);
    expect(texto).toMatch(/por fuera/i);
  });

  it('al cliente se le dice que el pago es su responsabilidad', () => {
    // El texto neutro no alcanza: "hay que pagar al terminar" no es lo mismo
    // que "vos tenes que pagar".
    const texto = avisoSinProteccion('contratacion', 'cliente');
    expect(texto.titulo).toMatch(/vos sos responsable/i);
    expect(texto.cuerpo).toMatch(/te compromet[eé]s a pagar/i);
    expect(texto.cuerpo).toMatch(/por fuera de la orden/i);
  });

  it('cliente y trabajador no leen el mismo texto al contratar', () => {
    const cliente = avisoSinProteccion('contratacion', 'cliente');
    const trabajador = avisoSinProteccion('contratacion', 'trabajador');
    expect(cliente.cuerpo).not.toBe(trabajador.cuerpo);
  });

  it('sin rol cae en el neutro, no en el de alguna de las partes', () => {
    // Una publicacion abierta la lee cualquiera; decirle "vos sos responsable
    // del pago" a un trabajador que esta mirando seria al reves.
    const neutro = avisoSinProteccion('contratacion');
    expect(neutro.cuerpo).not.toBe(avisoSinProteccion('contratacion', 'cliente').cuerpo);
    expect(neutro.cuerpo).not.toBe(avisoSinProteccion('contratacion', 'trabajador').cuerpo);
  });

  it('ninguno promete proteccion', () => {
    // Un aviso que arranca tranquilizando es peor que no avisar.
    for (const momento of MOMENTOS) {
      for (const rol of ROLES) {
        const a = avisoSinProteccion(momento, rol);
        expect(`${a.titulo} ${a.cuerpo}`).not.toMatch(/est[aá]s protegido|dinero seguro|garantizamos/i);
      }
    }
  });
});

describe('cotizacion obligatoria', () => {
  it('pagar al terminar exige cotizar; con proteccion no', () => {
    // Sin plata retenida, lo unico que respalda el acuerdo es el acuerdo. Una
    // cotizacion aceptada es ese papel, con el detalle de que incluye.
    expect(REQUIERE_COTIZACION.on_completion).toBe(true);
    expect(REQUIERE_COTIZACION.escrow).toBe(false);
  });
});

describe('cuando se puede reclamar', () => {
  it('con proteccion de pago, siempre', () => {
    // Hay fondos retenidos: un administrador siempre tiene algo que repartir.
    for (const estado of ['pending', 'held', 'completed', undefined]) {
      expect(puedeReclamar({ paymentMode: 'escrow', paymentStatus: estado })).toBe(true);
    }
    // Y tambien cuando el modo no vino: el default es el que protege.
    expect(puedeReclamar({})).toBe(true);
    expect(puedeReclamar({ paymentMode: null })).toBe(true);
  });

  it('sin proteccion y sin pago confirmado, no', () => {
    expect(puedeReclamar({ paymentMode: 'on_completion' })).toBe(false);
    expect(puedeReclamar({ paymentMode: 'on_completion', paymentStatus: 'pending' })).toBe(false);
    expect(puedeReclamar({ paymentMode: 'on_completion', orden: { estado: 'pending', confirmadoPorLaApp: true } })).toBe(false);
  });

  it('sin proteccion y con el pago confirmado, si', () => {
    expect(puedeReclamar({ paymentMode: 'on_completion', paymentStatus: 'completed' })).toBe(true);
    expect(puedeReclamar({ paymentMode: 'on_completion', orden: { estado: 'completed', confirmadoPorLaApp: true } })).toBe(true);
    expect(puedeReclamar({ paymentMode: 'on_completion', orden: { estado: 'verified', confirmadoPorLaApp: true } })).toBe(true);
  });

  it('con la orden a mano, manda la orden y no el reflejo del contrato', () => {
    /**
     * El reflejo puede quedar viejo -se escribe despues de confirmar la orden,
     * y esa escritura puede fallar-. Cuando las dos fuentes estan disponibles
     * gana la orden, que es la que tiene el dinero.
     */
    expect(
      puedeReclamar({
        paymentMode: 'on_completion',
        paymentStatus: 'completed',
        orden: { estado: 'pending', confirmadoPorLaApp: false },
      }),
    ).toBe(false);
  });

  it('el motivo que se le muestra al usuario explica que falta, no solo que no se puede', () => {
    expect(RECLAMO_DESHABILITADO.motivo).toMatch(/se habilita/i);
    expect(RECLAMO_DESHABILITADO.motivo).toMatch(/paga la orden/i);
    expect(RECLAMO_DESHABILITADO.accionCliente).toMatch(/pagar/i);
  });
});

describe('como se le explica cada modo al usuario', () => {
  it('los dos modos estan explicados, con pasos', () => {
    for (const modo of MODOS_DE_PAGO) {
      const info = COMO_FUNCIONA[modo];
      expect(info.nombre.length).toBeGreaterThan(3);
      expect(info.pasos.length).toBeGreaterThanOrEqual(4);
      expect(info.riesgo.length).toBeGreaterThan(30);
      expect(info.reclamo.length).toBeGreaterThan(20);
    }
  });

  it('el de pagar al terminar menciona la cotizacion, porque es obligatoria', () => {
    const pasos = COMO_FUNCIONA.on_completion.pasos.join(' ');
    expect(pasos).toMatch(/cotiza/i);
    expect(pasos).toMatch(/orden de pago/i);
  });

  it('cada modo dice quien corre el riesgo, que es la diferencia real', () => {
    expect(COMO_FUNCIONA.escrow.riesgo).toMatch(/se puede devolver/i);
    expect(COMO_FUNCIONA.on_completion.riesgo).toMatch(/lo corre el trabajador/i);
  });
});

describe('el plazo de la orden', () => {
  it('es un plazo razonable y no un número suelto', () => {
    expect(Number.isInteger(DIAS_PARA_PAGAR_LA_ORDEN)).toBe(true);
    expect(DIAS_PARA_PAGAR_LA_ORDEN).toBeGreaterThanOrEqual(1);
    expect(DIAS_PARA_PAGAR_LA_ORDEN).toBeLessThanOrEqual(30);
  });
});
