import { TERMS_BODY_KEYS } from '../shared/legal/terms.structure.js';
import { termsEs } from '../shared/legal/terms.es.js';
import { termsEn } from '../shared/legal/terms.en.js';

/**
 * Los terminos se arman recorriendo TERMS_BODY_KEYS y buscando cada clave en el
 * diccionario del idioma. Una clave agregada a la estructura pero no al texto
 * no rompe nada visible: la clausula simplemente no aparece. Eso es lo peor que
 * puede pasar en un documento que define que se cobra y por que.
 */

describe('terminos y condiciones', () => {
  it('cada clave de la estructura tiene texto en espanol', () => {
    const faltan = TERMS_BODY_KEYS.filter((k) => !(termsEs as any)[k]);
    expect(faltan).toEqual([]);
  });

  it('cada clave de la estructura tiene texto en ingles', () => {
    const faltan = TERMS_BODY_KEYS.filter((k) => !(termsEn as any)[k]);
    expect(faltan).toEqual([]);
  });

  it('no hay claves repetidas en la estructura', () => {
    // Una clave duplicada renderiza la clausula dos veces; una clave que se
    // repite en el diccionario hace que la segunda pise a la primera en
    // silencio, que ya paso una vez con s10p6.
    expect(new Set(TERMS_BODY_KEYS).size).toBe(TERMS_BODY_KEYS.length);
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

    it('dice que usar el saldo no cuesta y que transferirlo tampoco (salvo la media comision del 9.1)', () => {
      expect(termsEs.s7p9).toMatch(/sin costo alguno/i);
      expect(termsEs.s7p9).toMatch(/la transferencia no tiene costo/i);
      expect(termsEs.s7p9).toMatch(/9\.1/);
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
