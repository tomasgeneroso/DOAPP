import {
  TERMS_BODY_KEYS,
  TERMS_PAGO_AL_TERMINAR_KEYS,
  termsBodyKeys,
} from '../shared/legal/terms.structure.js';
import { termsEs } from '../shared/legal/terms.es.js';
import { termsEn } from '../shared/legal/terms.en.js';
import { DIAS_PARA_PAGAR_LA_ORDEN } from '../shared/pagos/modoDePago.js';

/**
 * Los terminos se arman recorriendo TERMS_BODY_KEYS y buscando cada clave en el
 * diccionario del idioma. Una clave agregada a la estructura pero no al texto
 * no rompe nada visible: la clausula simplemente no aparece. Eso es lo peor que
 * puede pasar en un documento que define que se cobra y por que.
 */

describe('terminos y condiciones', () => {
  it('cada clave de la estructura tiene texto en espanol', () => {
    // Las condicionales tambien: una clausula que no se muestra hoy se va a
    // mostrar el dia que alguien encienda el modulo, y ese no es el momento de
    // descubrir que falta el texto.
    const todas = [...TERMS_BODY_KEYS, ...TERMS_PAGO_AL_TERMINAR_KEYS];
    const faltan = todas.filter((k) => !(termsEs as any)[k]);
    expect(faltan).toEqual([]);
  });

  it('cada clave de la estructura tiene texto en ingles', () => {
    const todas = [...TERMS_BODY_KEYS, ...TERMS_PAGO_AL_TERMINAR_KEYS];
    const faltan = todas.filter((k) => !(termsEn as any)[k]);
    expect(faltan).toEqual([]);
  });

  it('no hay claves repetidas en la estructura', () => {
    // Una clave duplicada renderiza la clausula dos veces; una clave que se
    // repite en el diccionario hace que la segunda pise a la primera en
    // silencio, que ya paso una vez con s10p6.
    expect(new Set(TERMS_BODY_KEYS).size).toBe(TERMS_BODY_KEYS.length);
  });

  describe('la seccion que aparece y desaparece con el modulo', () => {
    it('con el modulo apagado, el documento es el de siempre', () => {
      expect(termsBodyKeys()).toEqual(TERMS_BODY_KEYS);
      expect(termsBodyKeys({ pagoAlTerminar: false })).toEqual(TERMS_BODY_KEYS);
    });

    it('con el modulo encendido entra la seccion 19, entera y sin repetir nada', () => {
      const con = termsBodyKeys({ pagoAlTerminar: true });
      for (const k of TERMS_PAGO_AL_TERMINAR_KEYS) expect(con).toContain(k);
      expect(new Set(con).size).toBe(con.length);
      expect(con.length).toBe(TERMS_BODY_KEYS.length + TERMS_PAGO_AL_TERMINAR_KEYS.length);
    });

    it('la aceptacion sigue siendo lo ultimo que se lee', () => {
      // Si la seccion 19 quedara despues de la 18, el documento terminaria
      // explicando una modalidad de pago en vez de con la declaracion de que
      // el usuario leyo y acepto.
      const con = termsBodyKeys({ pagoAlTerminar: true });
      expect(con.indexOf('s19Title')).toBeLessThan(con.indexOf('s18Title'));
      expect(con[con.length - 1]).toBe('importantNote');
    });

    it('dice cuando interviene DOAPP y cuando no puede', () => {
      // Es la clausula entera del modulo. Tiene que decir las dos cosas: que
      // la mediacion esta incluida cuando se paga por la orden, y que fuera de
      // la orden no hay con que intervenir -sin sonar a que se lava las manos,
      // porque la razon es que no cobro comision ni tiene fondos-.
      expect(termsEs.s19p4).toMatch(/orden de pago de la Plataforma/i);
      expect(termsEs.s19p4).toMatch(/no percibe comisi[oó]n/i);
      expect(termsEs.s19p4).toMatch(/conservan [ií]ntegramente sus derechos/i);
      expect(termsEn.s19p4).toMatch(/payment order/i);
      expect(termsEn.s19p4).toMatch(/no commission/i);
      expect(termsEn.s19p4).toMatch(/fully retain their rights/i);
    });

    it('dice que no hay fondos retenidos, que es lo que distingue esta modalidad', () => {
      expect(termsEs.s19p2).toMatch(/no retiene fondos/i);
      expect(termsEn.s19p2).toMatch(/holds no funds/i);
    });

    it('el plazo de la orden sale del codigo, no esta escrito a mano', () => {
      // La tabla de comisiones estuvo meses diciendo un numero que el codigo
      // no cobraba. Este plazo se interpola para que no pueda pasar de nuevo.
      expect(termsEs.s19p7).toContain(String(DIAS_PARA_PAGAR_LA_ORDEN));
      expect(termsEn.s19p7).toContain(String(DIAS_PARA_PAGAR_LA_ORDEN));
    });
  });

  describe('lo que el usuario tiene que poder leer antes de pagar', () => {
    it('dice que el precio publicado es el precio', () => {
      expect(termsEs.s6p4).toMatch(/precio publicado es el precio/i);
    });

    it('dice que hay que pagar antes de que el trabajador quede seleccionado', () => {
      expect(termsEs.s6p5).toMatch(/despu[ée]s de que el pago se acredite/i);
    });

    it('dice que un trabajo pagado no se pausa', () => {
      expect(termsEs.s6p6).toMatch(/no se pausan/i);
    });

    it('no promete un monto minimo de trabajo: solo existe el de ampliacion, sin numero', () => {
      // El minimo de trabajo se elimino (la comision minima es lo unico que
      // se valida). El de ampliacion sigue, y su importe no va en los
      // terminos: se deriva del costo de pasarela y del costo fijo, asi que
      // cambia solo. Un numero escrito quedaria mintiendo.
      expect(termsEs.s7p8).not.toMatch(/\d{2}\.\d{3}/);
      expect(termsEs.s7p8).not.toMatch(/m[ií]nimo de contrataci[oó]n/i);
      expect(termsEs.s7p8).toMatch(/ampliaci[oó]n/i);
      expect(termsEs.s7p8).toMatch(/costo fijo/i);
      expect(termsEs.s7p8).toMatch(/se informa/i);
      expect(termsEs.s7p4).toMatch(/no existe un monto m[ií]nimo de trabajo/i);
    });

    it('el cliente elige entre saldo y devolucion al medio de pago, y las dos salidas cuestan lo mismo', () => {
      // Son los dos botones que ve al cancelar (CancelJobModal). El texto tiene
      // que ofrecer las dos vias, no solo el saldo.
      for (const t of [termsEs.s7p9, termsEn.s7p9]) {
        expect(t).toMatch(/elige entre dos vías|chooses between two routes/i);
        expect(t).toMatch(/medio de pago|payment method/i);
        expect(t).toMatch(/9\.1/);
      }
      expect(termsEs.s7p9).toMatch(/sin costo alguno/i);
      expect(termsEs.s7p9).toMatch(/ninguna de las dos tiene costo/i);
      // Ya no se le descuenta la pasarela al retirar: la pago el cliente al pagar.
      expect(termsEs.s7p9).not.toMatch(/se descuentan el costo de procesamiento/i);
    });

    it('el procesamiento lo paga el cliente, con una tasa unica, no se devuelve, y el trabajador cobra el precio entero', () => {
      for (const t of [termsEs.s7p10, termsEn.s7p10]) {
        expect(t).toMatch(/a cargo del Cliente|borne by the Client/);
        expect(t).toMatch(/única tasa|single rate/i);
        expect(t).toMatch(/igual para todos los medios|same for every payment method/i);
        expect(t).toMatch(/no es reembolsable|non-refundable/i);
        expect(t).toMatch(/precio del trabajo íntegro|full job price/i);
      }
      // Y en la beta se cobra igual: la comision es 0, el procesamiento no.
      expect(termsEs.s7p3).toMatch(/se cobra también durante la beta/i);
    });

    it('sin trabajador seleccionado vuelve todo (menos el procesamiento) como saldo; con trabajador la comision se retiene', () => {
      expect(termsEs.s9p1).toMatch(/totalidad de lo abonado, comisi[oó]n incluida/i);
      expect(termsEs.s9p1).toMatch(/excepci[oó]n del costo de procesamiento/i);
      expect(termsEs.s9p1).toMatch(/rechazo de una publicaci[oó]n/i);
      expect(termsEs.s9p1).toMatch(/indicar el motivo/i);
      expect(termsEs.s9p2).toMatch(/comisi[oó]n de publicaci[oó]n no se reembolsa/i);
      expect(termsEs.s9p3).toMatch(/íntegro/i);
      expect(termsEs.s7p5).toMatch(/una vez que hubo un Trabajador seleccionado/i);
    });

    it('ninguna disputa ni acuerdo mueve plata sin un administrador', () => {
      // El codigo lo hace asi (disputeSilence marca en revision; aceptar un
      // acuerdo no mueve plata; ejecutarAcuerdo es del admin). El texto tiene
      // que decir lo mismo.
      for (const t of [termsEs.s10p10, termsEn.s10p10]) {
        expect(t).not.toMatch(/autom[aá]ticamente|automatically resolved/i);
        expect(t).toMatch(/Administrador|Administrator/);
      }
      for (const t of [termsEs.s10p11, termsEn.s10p11]) {
        expect(t).not.toMatch(/se aplica de inmediato|applied immediately/i);
        expect(t).toMatch(/la ejecuta un Administrador|an Administrator executes it/);
      }
    });
  });
});
