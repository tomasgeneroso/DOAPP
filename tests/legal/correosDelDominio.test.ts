import { describe, it, expect } from '@jest/globals';
import { termsEs } from '../../shared/legal/terms.es.js';
import { termsEn } from '../../shared/legal/terms.en.js';
import { privacyEs } from '../../shared/legal/privacy.es.js';
import { privacyEn } from '../../shared/legal/privacy.en.js';
import { cookiesEs } from '../../shared/legal/cookies.es.js';
import { cookiesEn } from '../../shared/legal/cookies.en.js';
import { disputesEs } from '../../shared/legal/disputes.es.js';
import { disputesEn } from '../../shared/legal/disputes.en.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
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

/**
 * Lo mismo, pero sobre el código entero y no sólo los documentos.
 *
 * El test de arriba mira los ocho documentos legales. No alcanzó: al corregir
 * las direcciones con un reemplazo global quedaron cuatro escritas como
 * `support@doapparg.com.ar` — en la pantalla de usuario baneado (web y mobile)
 * y en las facturas. Venían de `support@doapp.com.ar`, y el patrón tomó el
 * `@doapp.com` y dejó el `.ar` pegado atrás, produciendo un dominio distinto
 * que tampoco es nuestro.
 *
 * Es el riesgo de un reemplazo global sobre texto: no falla, produce algo
 * plausible. Ninguna de esas cuatro estaba en un documento legal, así que el
 * test anterior no las vio — y una factura con el correo del emisor mal es un
 * documento que alguien archiva para siempre.
 */
describe('las direcciones del código, no sólo las de los documentos', () => {
  /**
   * La raíz del repo. `process.cwd()` y no `__dirname` porque este proyecto de
   * jest corre como ESM, donde `__dirname` no existe; jest siempre arranca
   * desde la raíz, así que el cwd es el mismo.
   */
  const RAIZ = process.cwd();

  /** Dónde mirar. Los seeds y los fixtures de tests quedan afuera a propósito. */
  const CARPETAS = ['client', 'server', 'shared', 'mobile'];
  const SALTEAR = /node_modules|\.test\.|[\\/]scripts[\\/]|__tests__|run-scenarios|seed/i;

  function archivos(dir: string, acc: string[] = []): string[] {
    // `Dirent<string>` explícito: sin esto TypeScript infiere la variante con
    // `Buffer` del overload de readdirSync y `e.name` deja de ser un string.
    let entradas: import('fs').Dirent<string>[];
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return acc;
    }
    for (const e of entradas) {
      const completo = join(dir, e.name);
      if (SALTEAR.test(completo)) continue;
      if (e.isDirectory()) archivos(completo, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(completo);
    }
    return acc;
  }

  it('ninguna dirección de DOAPP apunta a un dominio ajeno', () => {
    // Las que aparecen dentro de un comentario se permiten: justamente
    // explican el error que se corrigió.
    const EN_COMENTARIO = /^\s*(\*|\/\/)/;
    const CORREO = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    const malas: string[] = [];

    for (const carpeta of CARPETAS) {
      for (const archivo of archivos(join(RAIZ, carpeta))) {
        readFileSync(archivo, 'utf8')
          .split('\n')
          .forEach((linea, i) => {
            if (EN_COMENTARIO.test(linea)) return;
            // Los UID de iCalendar llevan un dominio y no son direcciones.
            if (linea.includes('UID:')) return;
            /**
             * Lo que sale por consola no lo lee un usuario de la plataforma.
             *
             * El caso concreto son las credenciales de desarrollo que
             * `server/index.ts` imprime al arrancar: usan `admin@doapp.com`
             * igual que los scripts de seed, y cambiarlas sólo en el log las
             * dejaría inconsistentes con las cuentas que esos scripts crean.
             *
             * Una dirección publicada siempre aparece en otro lado además de
             * un log —una pantalla, una plantilla de correo, un documento, un
             * valor por defecto de configuración—, así que esta excepción no
             * abre un agujero.
             */
            if (linea.includes('console.log') || linea.includes('console.warn')) return;

            for (const c of linea.match(CORREO) || []) {
              // Sólo interesan las de DOAPP: un ejemplo con gmail no es
              // nuestro problema, y una casilla de un proveedor tampoco.
              if (!/doapp/i.test(c)) continue;
              if (!esDelDominio(c)) {
                malas.push(`${archivo.slice(RAIZ.length + 1)}:${i + 1}  ${c}`);
              }
            }
          });
      }
    }

    expect(malas).toEqual([]);
  });

  /**
   * Los enlaces, que es la forma que se le escapó al test de los correos.
   *
   * El patrón de arriba busca algo con una arroba. Un enlace no tiene arroba,
   * así que `https://doapp.com` pasó entero por los dos barridos anteriores.
   * Había tres escritos a mano, y el peor no era un respaldo inerte:
   * `FRONTEND_URL` no está definida en NINGÚN archivo de entorno, así que el
   * valor por defecto era el valor de verdad y el correo de reclamo de tareas
   * mandaba al trabajador a un dominio de un tercero.
   */
  it('ningún enlace escrito a mano apunta a un dominio ajeno', () => {
    const EN_COMENTARIO = /^\s*(\*|\/\/)/;
    const URL_LITERAL = /https?:\/\/([a-zA-Z0-9.-]+)/g;
    /** doapparg.site es nuestro: nginx lo redirige con 301 a doapparg.com. */
    const NUESTROS = new Set([DOMINIO, `www.${DOMINIO}`, 'doapparg.site', 'www.doapparg.site']);

    const malos: string[] = [];

    for (const carpeta of CARPETAS) {
      for (const archivo of archivos(join(RAIZ, carpeta))) {
        readFileSync(archivo, 'utf8')
          .split('\n')
          .forEach((linea, i) => {
            if (EN_COMENTARIO.test(linea)) return;
            for (const m of linea.matchAll(URL_LITERAL)) {
              const host = m[1].toLowerCase();
              // Sólo los dominios que pretenden ser DOAPP. Un enlace a
              // mercadopago.com o a un CDN no es asunto de este test.
              if (!/doapp/i.test(host)) continue;
              if (!NUESTROS.has(host)) {
                malos.push(`${archivo.slice(RAIZ.length + 1)}:${i + 1}  ${m[0]}`);
              }
            }
          });
      }
    }

    expect(malos).toEqual([]);
  });

  it('nadie usa FRONTEND_URL, que no existe en ningún entorno', () => {
    /**
     * La variable no está definida en .env, .env.production ni .env.example.
     * Leerla siempre devuelve undefined, así que lo que se publica es el
     * respaldo: en un caso doapp.com, en el otro localhost:5173 dentro de un
     * correo que recibe un usuario. La URL del frontend es `config.clientUrl`.
     *
     * Si algún día se define FRONTEND_URL de verdad, borrar este test — pero
     * entonces hay que definirla en los tres archivos, no en uno.
     */
    const usos: string[] = [];

    for (const carpeta of CARPETAS) {
      for (const archivo of archivos(join(RAIZ, carpeta))) {
        readFileSync(archivo, 'utf8')
          .split('\n')
          .forEach((linea, i) => {
            if (/^\s*(\*|\/\/)/.test(linea)) return;
            if (linea.includes('FRONTEND_URL')) {
              usos.push(`${archivo.slice(RAIZ.length + 1)}:${i + 1}`);
            }
          });
      }
    }

    expect(usos).toEqual([]);
  });

  it('el barrido encuentra archivos de verdad', () => {
    // Un recorrido que no lee nada pasa el test de arriba sin probar nada. Es
    // la forma más fácil de que una verificación se vuelva decorativa.
    const total = CARPETAS.reduce((n, c) => n + archivos(join(RAIZ, c)).length, 0);
    expect(total).toBeGreaterThan(200);
  });
});
