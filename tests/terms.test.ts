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

    it('explica de donde sale el minimo, no solo cual es', () => {
      expect(termsEs.s7p8).toContain('18.000');
      // El pedido era que se entienda por que existe, no que se anuncie.
      expect(termsEs.s7p8).toMatch(/costo fijo/i);
    });

    it('dice que retirar el saldo devuelto tiene costo y usarlo no', () => {
      expect(termsEs.s7p9).toMatch(/se descuenta del importe transferido/i);
      expect(termsEs.s7p9).toMatch(/sin costo alguno/i);
    });
  });
});
