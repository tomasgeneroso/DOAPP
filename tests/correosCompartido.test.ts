import { describe, it, expect } from '@jest/globals';
import { armarCorreo, erroresDePlantilla, primerNombre, reemplazarVariables, variablesDesconocidas, type DatosDeLaPersona } from '../shared/correos/plantillas.js';
import { describirFiltros, limpiarFiltros } from '../shared/correos/grupos.js';

/**
 * Módulo de correos (2026-11-11): lo que comparten el servidor y la pantalla de administración. El texto de una plantilla es TEXTO (se escapa), las variables se reemplazan por los
 * datos de cada persona, el botón solo puede llevar a DOAPP y los filtros de un grupo se limpian: lo que viene de la red nunca se usa tal cual.
 */
const datos: DatosDeLaPersona = { nombre: 'ANA lópez', enlaceRegistro: 'https://doapparg.com/complete-registration', enlaceApp: 'https://doapparg.com', enlaceDeBaja: 'https://doapparg.com/baja-de-correos/token' };
const HOSTS = ['doapparg.com', 'www.doapparg.com'];

describe('variables', () => {
  it('el saludo usa el primer nombre bien escrito, y «Hola» a secas si todavía no se sabe', () => {
    expect(reemplazarVariables('{{saludo}}', datos)).toBe('Hola Ana');
    expect(reemplazarVariables('{{ nombre }} y {{enlaceApp}}', datos)).toBe('Ana y https://doapparg.com');
    expect(reemplazarVariables('{{saludo}}', { ...datos, nombre: 'Nuevo usuario' })).toBe('Hola'); // el nombre provisorio del registro no es un nombre
    expect(reemplazarVariables('{{saludo}}', { ...datos, nombre: '' })).toBe('Hola');
    expect(primerNombre('  maría   paz ')).toBe('María');
    expect(primerNombre(null)).toBe('');
  });

  it('una variable que no existe se detecta (y no se reemplaza)', () => {
    expect(variablesDesconocidas('Hola {{nombr}} {{saludo}} {{otra}}')).toEqual(['nombr', 'otra']);
    expect(reemplazarVariables('{{nombr}}', datos)).toBe('{{nombr}}');
  });
});

describe('armarCorreo', () => {
  const plantilla = { asunto: '{{saludo}}, terminá tu registro', cuerpo: 'Línea uno.\nMisma línea.\n\nSegundo párrafo con <b>etiqueta</b> & más.', botonTexto: 'Terminar', botonUrl: '{{enlaceRegistro}}' };

  it('arma párrafos, escapa el HTML que escriba el equipo (es texto) y pone el botón', () => {
    const c = armarCorreo(plantilla, datos);
    expect(c.asunto).toBe('Hola Ana, terminá tu registro');
    expect(c.html).toContain('Línea uno.<br>Misma línea.');
    expect(c.html).toContain('&lt;b&gt;etiqueta&lt;/b&gt; &amp; más.');
    expect(c.html).not.toContain('<b>etiqueta</b>');
    expect(c.html).toContain('href="https://doapparg.com/complete-registration"');
    expect(c.html).toContain('>Terminar</a>');
  });

  it('el pie siempre dice quién escribe y cómo darse de baja (versión web y versión texto)', () => {
    const c = armarCorreo(plantilla, datos);
    expect(c.html).toContain('href="https://doapparg.com/baja-de-correos/token"');
    expect(c.html).toMatch(/Te escribe DOAPP/);
    expect(c.texto).toContain('darte de baja: https://doapparg.com/baja-de-correos/token');
    expect(c.texto).toContain('Terminar: https://doapparg.com/complete-registration');
  });

  it('la prueba lleva la marca arriba y en el asunto; sin botón no hay botón', () => {
    const p = armarCorreo({ ...plantilla, botonTexto: null, botonUrl: null }, datos, { prueba: true });
    expect(p.asunto).toBe('[PRUEBA] Hola Ana, terminá tu registro');
    expect(p.html).toContain('Esto es una PRUEBA');
    expect(p.html).not.toContain('display:inline-block;background:#0284c7');
  });

  it('un botón que no es https no se dibuja (aunque haya pasado por error)', () => {
    expect(armarCorreo({ ...plantilla, botonUrl: 'javascript:alert(1)' }, datos).html).not.toContain('javascript:');
    expect(armarCorreo({ ...plantilla, botonUrl: 'http://doapparg.com' }, datos).html).not.toContain('>Terminar</a>');
  });
});

describe('erroresDePlantilla', () => {
  const buena = { nombre: 'Ok', asunto: 'Asunto', cuerpo: 'Texto', botonTexto: 'Ir', botonUrl: 'https://doapparg.com/x' };

  it('una plantilla bien armada no tiene errores, con el botón a DOAPP o a una variable de enlace', () => {
    expect(erroresDePlantilla(buena, HOSTS)).toEqual([]);
    expect(erroresDePlantilla({ ...buena, botonUrl: '{{enlaceRegistro}}' }, HOSTS)).toEqual([]);
    expect(erroresDePlantilla({ ...buena, botonUrl: 'https://www.doapparg.com/' }, HOSTS)).toEqual([]);
  });

  it('el botón solo puede llevar a DOAPP: otro sitio, http, un parecido o una dirección rota se rechazan', () => {
    for (const mal of ['https://estafa.example/login', 'http://doapparg.com', 'https://doapparg.com.estafa.example', 'https://doapparg.com@estafa.example', 'doapparg.com', 'javascript:alert(1)']) {
      expect({ mal, campos: erroresDePlantilla({ ...buena, botonUrl: mal }, HOSTS).map((e) => e.campo) }).toEqual({ mal, campos: ['botonUrl'] });
    }
  });

  it('pide lo que falta y el botón va con su texto y su dirección juntos', () => {
    expect(erroresDePlantilla({ ...buena, asunto: ' ' }, HOSTS).map((e) => e.campo)).toEqual(['asunto']);
    expect(erroresDePlantilla({ ...buena, cuerpo: '' }, HOSTS).map((e) => e.campo)).toEqual(['cuerpo']);
    expect(erroresDePlantilla({ ...buena, botonUrl: '' }, HOSTS).map((e) => e.campo)).toEqual(['botonUrl']);
    expect(erroresDePlantilla({ ...buena, botonTexto: '' }, HOSTS).map((e) => e.campo)).toEqual(['botonTexto']);
    expect(erroresDePlantilla({ ...buena, asunto: 'a'.repeat(151) }, HOSTS).map((e) => e.campo)).toEqual(['asunto']);
  });
});

describe('filtros de un grupo', () => {
  it('deja solo lo conocido y bien formado, y dice qué estaba mal', () => {
    expect(limpiarFiltros({ registro: 'incompleto', creadosHaceMasDeHoras: 24, rol: ['client', 'doer'], correoVerificado: false })).toEqual({
      filtros: { registro: 'incompleto', creadosHaceMasDeHoras: 24, rol: ['client', 'doer'], correoVerificado: false },
      errores: [],
    });
    expect(limpiarFiltros(undefined)).toEqual({ filtros: {}, errores: [] });
    for (const mal of [{ hackear: 1 }, { registro: 'a medias' }, { creadosHaceMasDeHoras: -1 }, { creadosHaceMasDeHoras: 1.5 }, { sinIngresarHaceDias: 'mucho' }, { rol: ['rey'] }, { correoVerificado: 'si' }]) {
      expect({ mal, hayError: limpiarFiltros(mal).errores.length > 0 }).toEqual({ mal, hayError: true });
    }
    expect(limpiarFiltros({ registro: 'incompleto', hackear: 1 }).filtros).toEqual({ registro: 'incompleto' }); // lo desconocido no pasa
  });

  it('el grupo se describe con palabras', () => {
    expect(describirFiltros({})).toBe('Todas las personas con cuenta');
    expect(describirFiltros({ registro: 'incompleto', creadosHaceMasDeHoras: 24 })).toBe('Personas con el registro sin terminar, cuenta creada hace más de 24 h');
    expect(describirFiltros({ identidad: 'sin_verificar', membresia: 'gratis' })).toBe('Personas sin verificar, con plan gratuito');
  });
});
