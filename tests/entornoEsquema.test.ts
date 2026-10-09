import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * `.env.schema` (formato Varlock) declara qué variables existen y cuáles son secretas, sin valores.
 *
 * Por qué hace falta: MERCADOPAGO_WEBHOOK_SECRET se usaba en el código pero no figuraba en ningún
 * lado. Sin ella el webhook de pagos aceptaba cualquier aviso, y quien despliega no tenía forma de
 * saber que debía definirla. Este test hace que una variable nueva sin declarar rompa el build.
 */

const raiz = process.cwd();
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

/** Variables que Vite define solo; no son configuración nuestra. */
const BUILTINS_VITE = new Set(['DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL']);
const OMITIR = new Set(['node_modules', 'dist', '.git', 'build', 'mobile', 'uploads', 'superpowers', 'tests', 'coverage']);

function archivosDeCodigo(dir: string, acumulado: string[] = []): string[] {
  if (!existsSync(join(raiz, dir))) return acumulado;
  for (const e of readdirSync(join(raiz, dir), { withFileTypes: true })) {
    if (OMITIR.has(e.name)) continue;
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) archivosDeCodigo(ruta, acumulado);
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(e.name)) acumulado.push(ruta);
  }
  return acumulado;
}

function variablesUsadas(): Map<string, string> {
  const usadas = new Map<string, string>();
  for (const carpeta of ['server', 'shared', 'client', 'services']) {
    for (const archivo of archivosDeCodigo(carpeta)) {
      const texto = leer(archivo);
      const regs = [
        /process\.env\.([A-Z][A-Z0-9_]+)/g,
        /process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
        /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
      ];
      for (const re of regs) {
        for (const m of texto.matchAll(re)) {
          if (!BUILTINS_VITE.has(m[1]) && !usadas.has(m[1])) usadas.set(m[1], archivo);
        }
      }
    }
  }
  return usadas;
}

interface Declarada {
  nombre: string;
  valor: string;
  sensible: boolean;
  obligatoria: boolean;
}

function leerEsquema(): Declarada[] {
  const declaradas: Declarada[] = [];
  let anotaciones = '';
  for (const linea of leer('.env.schema').split(/\r?\n/)) {
    if (linea.startsWith('#')) {
      if (linea.includes('@')) anotaciones += ' ' + linea;
      continue;
    }
    const m = linea.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) {
      if (linea.trim() === '') anotaciones = anotaciones; // línea en blanco: se conservan las anotaciones del bloque
      continue;
    }
    declaradas.push({
      nombre: m[1],
      valor: m[2].trim(),
      sensible: !/@sensitive=false/.test(anotaciones),
      obligatoria: /@required\b/.test(anotaciones),
    });
    anotaciones = '';
  }
  return declaradas;
}

function variablesDeEjemplo(): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const linea of leer('.env.example').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) mapa.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  }
  return mapa;
}

const PARECE_PLACEHOLDER = /(your|^tu[ ._-]|service-account|xxx|change|example|ejemplo|dummy|placeholder|<[^>]+>|\.\.\.|\$\{|\{\{|^[0-]+$|^$)/i;
const ES_RUTA_DE_ARCHIVO = /^(\.{0,2}\/)?[\w./-]+\.(json|pem|crt|key)$/i;

describe('.env.schema', () => {
  const esquema = leerEsquema();
  const nombresEsquema = new Set(esquema.map((d) => d.nombre));

  it('existe, tiene variables y no repite ninguna', () => {
    expect(esquema.length).toBeGreaterThan(50);
    expect(nombresEsquema.size).toBe(esquema.length);
  });

  it('toda variable que lee el código está declarada en el esquema', () => {
    const faltan = [...variablesUsadas()].filter(([n]) => !nombresEsquema.has(n)).map(([n, f]) => `${n} (usada en ${f})`);
    expect(faltan).toEqual([]);
  });

  it('no declara variables que el código ya no usa (el esquema no acumula basura)', () => {
    // Excepción: las que se documentan a propósito aunque hoy nada las lea (marcadas en su nota).
    const documentadasSinUso = new Set(['COOKIE_SAME_SITE', 'COOKIE_SECURE', 'SESSION_SECRET', 'RATE_LIMIT_MAX_REQUESTS', 'RATE_LIMIT_WINDOW_MS']);
    const usadas = variablesUsadas();
    const sobran = esquema
      .map((d) => d.nombre)
      .filter((n) => !usadas.has(n) && !documentadasSinUso.has(n) && !variablesDeEjemplo().has(n));
    expect(sobran).toEqual([]);
  });

  it('no contiene ningún valor: es una declaración, no una copia de .env', () => {
    const conValor = esquema.filter((d) => d.valor !== '').map((d) => d.nombre);
    expect(conValor).toEqual([]);
  });

  it('las variables que van al navegador (VITE_*) no se declaran como secretas por error ni al revés', () => {
    // Todo VITE_* termina en el bundle público: una variable así NUNCA puede ser un secreto.
    const secretasEnBundle = esquema.filter((d) => d.nombre.startsWith('VITE_') && d.sensible).map((d) => d.nombre);
    expect(secretasEnBundle).toEqual([]);
  });

  it('las claves y secretos de servidor están marcados como sensibles', () => {
    const deberianSerSensibles = esquema
      .filter((d) => /(SECRET|PASSWORD|_PASS$|PRIVATE|API_KEY|ACCESS_TOKEN|WHATSAPP_TOKEN|ENCRYPTION_KEY|WEBHOOK_SECRET|DATABASE_URL|REDIS_URL)/.test(d.nombre) && !d.nombre.startsWith('VITE_'))
      .filter((d) => !d.sensible)
      .map((d) => d.nombre);
    expect(deberianSerSensibles).toEqual([]);
  });

  it('las que protegen el dinero y las sesiones son obligatorias', () => {
    const obligatorias = new Set(esquema.filter((d) => d.obligatoria).map((d) => d.nombre));
    for (const n of ['JWT_SECRET', 'ENCRYPTION_KEY', 'MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET', 'DB_PASSWORD']) {
      expect(obligatorias.has(n)).toBe(true);
    }
  });
});

describe('.env.example (el único .env que se versiona)', () => {
  const esquema = leerEsquema();
  const sensibles = new Set(esquema.filter((d) => d.sensible).map((d) => d.nombre));
  const ejemplo = variablesDeEjemplo();

  it('toda variable del ejemplo está declarada en el esquema', () => {
    const nombres = new Set(esquema.map((d) => d.nombre));
    expect([...ejemplo.keys()].filter((n) => !nombres.has(n))).toEqual([]);
  });

  it('las variables sensibles van vacías o con un valor de relleno, nunca con un secreto real', () => {
    const sospechosas = [...ejemplo]
      .filter(([n]) => sensibles.has(n))
      .filter(([, v]) => !(PARECE_PLACEHOLDER.test(v) || ES_RUTA_DE_ARCHIVO.test(v)))
      .map(([n]) => n);
    expect(sospechosas).toEqual([]);
  });

  it('ningún secreto con forma de credencial conocida quedó en el ejemplo', () => {
    const texto = leer('.env.example');
    expect(texto).not.toMatch(/APP_USR-[0-9a-f]{8,}-/);
    expect(texto).not.toMatch(/\bAKIA[0-9A-Z]{16}\b/);
    expect(texto).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(texto).not.toMatch(/\bgh[pousr]_[A-Za-z0-9]{30,}\b/);
    expect(texto).not.toMatch(/\b(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/[^\s:@]+:[^\s@]{4,}@(?!localhost|127\.0\.0\.1)/);
  });

  it('la cabecera del esquema no usa anotaciones como texto (el CLI de varlock las toma como decoradores y falla)', () => {
    // Lo encontró el CLI real de varlock (1.20.0): "@required" y "@type" escritos en un comentario de la cabecera son un
    // error ("Item decorator cannot be used in the file header"). Sólo se admiten las del propio archivo.
    const lineas = leer('.env.schema').split(/\r?\n/);
    const finCabecera = lineas.findIndex((l) => l.trim() === '');
    const cabecera = lineas.slice(0, finCabecera);
    const conArroba = cabecera.filter((l) => /@\w/.test(l) && !/^#\s*@(defaultSensitive|defaultRequired)\b/.test(l));
    expect(conArroba).toEqual([]);
  });
});
