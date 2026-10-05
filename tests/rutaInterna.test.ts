import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { rutaInternaSegura } from '../shared/auth/rutaInterna.js';

/**
 * El destino que viene de `?redirect=` en el login.
 *
 * Qué motivó esto: la pantalla de login navegaba a lo que dijera el parámetro
 * `redirect` de la URL, sin validar. `/login?redirect=//sitio-malo.com` mandaba
 * a la víctima a otro sitio justo después de iniciar sesión en el verdadero.
 *
 * Los casos se prueban con una INVARIANTE y no sólo con una lista: sea cual sea
 * la entrada, el resultado interpretado como lo haría un navegador tiene que
 * seguir en nuestro origen. `new URL` de Node implementa el mismo parser de la
 * especificación que los navegadores —borra tabulaciones y saltos de línea,
 * trata `\` como `/`—, que son justo los rodeos que importan.
 */

const ORIGEN = 'https://doapparg.com';
const mismoOrigen = (ruta: string) => new URL(ruta, ORIGEN).origin === ORIGEN;

/** Entradas hostiles: ninguna puede terminar en otro sitio. */
const ATAQUES = [
  // El clásico: "mismo esquema, otro host".
  '//sitio-malo.com',
  '///sitio-malo.com',
  '////sitio-malo.com',
  '//sitio-malo.com/doapparg.com',
  // La barra invertida, que el navegador trata como una barra.
  '/\\sitio-malo.com',
  '\\\\sitio-malo.com',
  '\\/sitio-malo.com',
  '/\\/sitio-malo.com',
  '/\\\\sitio-malo.com',
  // Los caracteres que el parser BORRA antes de interpretar: pasan cualquier
  // chequeo que mire el texto tal cual y se vuelven `//host` después.
  '/\t/sitio-malo.com',
  '/\n/sitio-malo.com',
  '/\r/sitio-malo.com',
  '/\t\t/sitio-malo.com',
  '\t//sitio-malo.com',
  '//\t/sitio-malo.com',
  '/\u0000/sitio-malo.com',
  // Invisibles de Unicode.
  '/' + String.fromCharCode(0x200b) + '/sitio-malo.com', // espacio de ancho cero
  '/' + String.fromCharCode(0x2028) + '/sitio-malo.com', // separador de línea
  '/' + String.fromCharCode(0xfeff) + '/sitio-malo.com', // marca de orden de bytes
  // Con otro esquema: no son una ruta.
  'https://sitio-malo.com',
  'http://sitio-malo.com',
  'HTTPS://SITIO-MALO.COM',
  'https:sitio-malo.com',
  'javascript:alert(document.cookie)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  // Sin barra inicial o con espacio delante.
  'sitio-malo.com',
  ' //sitio-malo.com',
  '',
  // Absurdamente largo.
  '/' + 'a'.repeat(3000),
];

describe('rutaInternaSegura: lo que no puede pasar', () => {
  it.each(ATAQUES.map((a) => [JSON.stringify(a).slice(0, 60), a]))(
    'rechaza %s',
    (_nombre, ataque) => {
      expect(rutaInternaSegura(ataque)).toBe('/');
    },
  );

  it('INVARIANTE: ninguna entrada hostil termina en otro origen', () => {
    for (const ataque of ATAQUES) {
      expect({ ataque, enNuestroOrigen: mismoOrigen(rutaInternaSegura(ataque)) }).toEqual({
        ataque,
        enNuestroOrigen: true,
      });
    }
  });

  it('lo que no es un string vuelve al valor por defecto', () => {
    for (const x of [null, undefined, 42, true, {}, [], ['//sitio-malo.com']]) {
      expect(rutaInternaSegura(x)).toBe('/');
    }
  });
});

describe('rutaInternaSegura: lo que sí tiene que pasar', () => {
  const VALIDAS = [
    '/',
    '/blog/create',
    '/disputes/create',
    '/jobs/3f2a9c1e-1111-2222-3333-444455556666',
    '/tickets/new?categoria=pago&x=1',
    '/analisis#proyeccion',
    '/search?q=plomero%20en%20corrientes',
    // Un arroba o un `//` DENTRO de la ruta no cambia el origen.
    '/@usuario',
    '/blog/a//b',
    '/%2F/sitio-malo.com',
  ];

  it.each(VALIDAS.map((v) => [v]))('deja pasar %s sin tocarla', (ruta) => {
    expect(rutaInternaSegura(ruta)).toBe(ruta);
  });

  it('y todas siguen en nuestro origen', () => {
    for (const ruta of VALIDAS) expect(mismoOrigen(rutaInternaSegura(ruta))).toBe(true);
  });

  it('usa el valor por defecto que se le pida', () => {
    expect(rutaInternaSegura('//sitio-malo.com', '/dashboard')).toBe('/dashboard');
    expect(rutaInternaSegura(undefined, '/dashboard')).toBe('/dashboard');
  });
});

describe('el login usa la validación', () => {
  it('LoginScreen pasa el destino por rutaInternaSegura', () => {
    /**
     * Es la guarda contra que alguien "simplifique" el login y vuelva a
     * navegar a lo que diga la URL: el test de arriba pasaría igual, porque
     * prueba la función, no que se la llame.
     */
    const fuente = readFileSync(join(process.cwd(), 'client/pages/LoginScreen.tsx'), 'utf8');
    expect(fuente).toContain('rutaInternaSegura(');
    expect(fuente).toMatch(/from\s*=\s*rutaInternaSegura\(/);
  });
});
