import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Que las suites efectivamente corran.
 *
 * `paymentSafeguards.test.ts` usaba `require()` diez veces. El proyecto "esm"
 * de jest es ESM de verdad, asi que eso es un SyntaxError y la suite entera
 * fallaba al cargar: los 48 tests que cuidan los topes de dinero, el
 * enfriamiento del CBU y la regla del silencio no se ejecutaban. Y como jest
 * reporta "Test suite failed to run" aparte del conteo de tests, la linea
 * `Tests: 184 passed` se veia verde.
 *
 * Una guarda que no corre es peor que no tener guarda: da confianza falsa.
 * Estos dos chequeos son estaticos y cuestan milisegundos.
 */

const RAIZ = join(process.cwd(), 'tests');

/** Los proyectos CJS de jest si pueden usar require y __dirname. */
const PROYECTOS_CJS = /^(integration|routes|models)[\\/]/;

/**
 * Saca comentarios y literales de texto antes de buscar.
 *
 * Sin esto el chequeo se marca a si mismo: el mensaje de error contiene la
 * palabra que busca. Y cualquier comentario que explique el problema haria
 * fallar al archivo que lo explica, que es el peor incentivo posible.
 */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function testsDelProyectoEsm(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      testsDelProyectoEsm(ruta, acc);
    } else if (nombre.endsWith('.test.ts')) {
      // Este archivo se excluye de su propio escaneo: nombra en regex literales
      // justo las dos cosas que busca, y `soloCodigo` no puede distinguir un
      // regex de codigo real sin parsear TypeScript.
      if (nombre === 'suitesQueCorren.test.ts') continue;
      if (!PROYECTOS_CJS.test(relative(RAIZ, ruta))) acc.push(ruta);
    }
  }
  return acc;
}

describe('las suites del proyecto esm pueden cargarse', () => {
  const archivos = testsDelProyectoEsm(RAIZ);

  it('encuentra suites para revisar', () => {
    expect(archivos.length).toBeGreaterThan(3);
  });

  it('ninguna usa require()', () => {
    const malas = archivos.filter((f) =>
      /(^|[^.\w])require\s*\(/.test(soloCodigo(readFileSync(f, 'utf8'))),
    );
    if (malas.length > 0) {
      throw new Error(
        'Estas suites usan require() y no van a cargar bajo ESM ' +
          '(fallan enteras, y el conteo de tests igual sale verde):\n' +
          malas.map((f) => '  - ' + relative(process.cwd(), f)).join('\n') +
          '\n\nUsá import estático arriba del archivo.',
      );
    }
    expect(malas).toEqual([]);
  });

  it('ninguna usa __dirname', () => {
    const malas = archivos.filter((f) =>
      /__dirname/.test(soloCodigo(readFileSync(f, 'utf8'))),
    );
    if (malas.length > 0) {
      throw new Error(
        'Estas suites usan __dirname, que no existe en ESM:\n' +
          malas.map((f) => '  - ' + relative(process.cwd(), f)).join('\n') +
          '\n\nUsá process.cwd() como base.',
      );
    }
    expect(malas).toEqual([]);
  });
});
