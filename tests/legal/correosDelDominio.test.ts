import { describe, it, expect } from '@jest/globals';
import { termsEs } from '../../shared/legal/terms.es.js';
import { termsEn } from '../../shared/legal/terms.en.js';
import { privacyEs } from '../../shared/legal/privacy.es.js';
import { privacyEn } from '../../shared/legal/privacy.en.js';
import { cookiesEs } from '../../shared/legal/cookies.es.js';
import { cookiesEn } from '../../shared/legal/cookies.en.js';
import { disputesEs } from '../../shared/legal/disputes.es.js';
import { disputesEn } from '../../shared/legal/disputes.en.js';
import { DOMINIO, SOPORTE, CORREOS, esDelDominio } from '../../shared/constants/contacto.js';

/**
 * Ninguna dirección publicada puede estar fuera del dominio de DOAPP.
 *
 * Esto no es higiene: durante meses la política de privacidad —el documento
 * que explica cómo ejercer derechos sobre datos personales— le dijo al usuario
 * que escribiera a `privacy@doapp.com` y `dpo@doapp.com`. El dominio de la
 * plataforma es doapparg.com. `doapp.com` no es de DOAPP.
 *
 * O sea: cada pedido de acceso o borrado de datos que un usuario mandara
 * siguiendo su propia política de privacidad llegaba a un tercero, con el
 * nombre de quien escribía y lo que estuviera reclamando adentro. Lo mismo con
 * las disputas (`disputes@doapp.com`) y el soporte.
 *
 * No fue una decisión: fue una dirección de ejemplo copiada veinte veces que
 * nadie volvió a mirar. Este test es lo que hace que no se pueda repetir.
 */

const DOCUMENTOS: Array<[string, Record<string, string>]> = [
  ['términos (es)', termsEs],
  ['términos (en)', termsEn],
  ['privacidad (es)', privacyEs],
  ['privacidad (en)', privacyEn],
  ['cookies (es)', cookiesEs],
  ['cookies (en)', cookiesEn],
  ['disputas (es)', disputesEs],
  ['disputas (en)', disputesEn],
];

/** Cualquier cosa con forma de correo. Deliberadamente amplio. */
const ALGO_CON_FORMA_DE_CORREO = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function correosDe(doc: Record<string, string>): string[] {
  const todos = Object.values(doc)
    .filter((v) => typeof v === 'string')
    .flatMap((v) => v.match(ALGO_CON_FORMA_DE_CORREO) || []);
  return Array.from(new Set(todos));
}

describe('los correos de los documentos legales', () => {
  for (const [nombre, doc] of DOCUMENTOS) {
    it(`${nombre}: ninguna dirección fuera de ${DOMINIO}`, () => {
      const ajenos = correosDe(doc).filter((c) => !esDelDominio(c));
      // El mensaje de error nombra las direcciones: si esto falla dentro de un
      // año, quien lo lea tiene que ver cuáles sin ir a buscarlas.
      expect({ documento: nombre, ajenos }).toEqual({ documento: nombre, ajenos: [] });
    });
  }

  it('las direcciones que aparecen son las que existen de verdad', () => {
    /**
     * Publicar `dpo@doapparg.com` cuando esa casilla no existe es peor que no
     * publicarla: el usuario escribe, le rebota, y queda con la impresión
     * —correcta— de que la plataforma puso un canal que no atiende.
     */
    const publicadas = new Set(Object.values(CORREOS));
    for (const [nombre, doc] of DOCUMENTOS) {
      for (const correo of correosDe(doc)) {
        expect({ nombre, correo, existe: publicadas.has(correo as any) }).toEqual({
          nombre,
          correo,
          existe: true,
        });
      }
    }
  });

  it('la constante de soporte es la casilla que existe', () => {
    expect(SOPORTE).toBe('support@doapparg.com');
    expect(esDelDominio(SOPORTE)).toBe(true);
  });

  it('esDelDominio no se deja engañar por un dominio parecido', () => {
    // `doapparg.com.attacker.net` termina en algo que contiene el dominio pero
    // no es el dominio. Un `includes` lo dejaría pasar.
    expect(esDelDominio('x@doapparg.com')).toBe(true);
    expect(esDelDominio('X@DOAPPARG.COM')).toBe(true);
    expect(esDelDominio('  x@doapparg.com  ')).toBe(true);
    expect(esDelDominio('x@doapp.com')).toBe(false);
    expect(esDelDominio('x@doapparg.com.attacker.net')).toBe(false);
    expect(esDelDominio('x@notdoapparg.com')).toBe(false);
    expect(esDelDominio('')).toBe(false);
  });

  it('la privacidad dice a dónde escribir para ejercer derechos', () => {
    // El documento sin dirección es tan inútil como con la dirección errónea.
    expect(privacyEs.s5contact).toContain(CORREOS.privacidad);
    expect(privacyEs.emailLine).toContain(CORREOS.privacidad);
    expect(privacyEs.dpoLine).toContain(CORREOS.dpo);
  });
});
