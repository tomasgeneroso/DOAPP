import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';

const ejecutar = promisify(execFile);

/**
 * Qué instancia es esta, qué está corriendo, y cómo pasar staging a producción.
 *
 * Por qué existe este archivo.
 *
 * Casi todos los incidentes de producción de este proyecto comparten una causa
 * y no es la que uno supondría. No fueron errores de lógica: fue que el
 * artefacto de producción nunca se ejecutó en ningún lado antes de ser
 * producción.
 *
 *  - La pantalla en blanco: un refactor dejó `useTranslation()` a nivel de
 *    módulo en 18 archivos. En desarrollo andaba. Sólo rompe el build de
 *    producción.
 *  - Los cambios de front que no aparecían: nginx servía otro directorio.
 *  - Los precios con el dólar oficial: el raspado del blue se rompió en
 *    silencio y el respaldo tapó todo.
 *  - Los acentos convertidos en `Ã³`: el archivo de traducciones quedó
 *    doble-codificado.
 *
 * Ninguno lo atajaba un test unitario. Los cuatro los atajaba abrir la página
 * una vez, sobre el build real, antes de que fuera producción.
 *
 * Y de ahí sale la regla que manda acá: **promover es mover el commit exacto
 * que se probó, no volver a construir desde la rama**. Si producción se
 * reconstruye desde `master`, lo que se probó en staging y lo que quedó en
 * producción son dos artefactos distintos y estamos donde empezamos. Por eso
 * `promoverAProduccion` recibe un SHA, lo compara contra lo que esta instancia
 * está corriendo de verdad, y aborta si no coinciden.
 */

export type Entorno = 'desarrollo' | 'staging' | 'produccion';

/**
 * De dónde sale el entorno: `APP_ENV`, y si no está, `NODE_ENV`.
 *
 * Son dos variables y no una porque staging corre con `NODE_ENV=production`
 * —tiene que ser el build de producción, es todo el punto— y entonces
 * `NODE_ENV` no alcanza para distinguirlo. `APP_ENV=staging` es lo único que
 * diferencia a las dos instancias.
 */
export function entorno(): Entorno {
  const declarado = String(process.env.APP_ENV || '').toLowerCase().trim();
  if (declarado === 'staging') return 'staging';
  if (declarado === 'production' || declarado === 'produccion') return 'produccion';
  if (declarado === 'development' || declarado === 'desarrollo') return 'desarrollo';
  return process.env.NODE_ENV === 'production' ? 'produccion' : 'desarrollo';
}

export const esStaging = (): boolean => entorno() === 'staging';

const RAIZ = process.cwd();

/** Un SHA de git y nada más. Lo que entra a una línea de comandos se valida. */
const ES_SHA = /^[0-9a-f]{40}$/;

export interface InfoDeDespliegue {
  entorno: Entorno;
  /** Sólo fuera de producción: en producción el commit no es información pública. */
  commit?: string;
  commitCorto?: string;
  rama?: string;
  fechaDelCommit?: string;
  asunto?: string;
  /** Cuándo arrancó este proceso. Sirve para saber si el deploy realmente reinició. */
  arrancado: string;
}

const ARRANCADO = new Date().toISOString();

async function git(...args: string[]): Promise<string> {
  const { stdout } = await ejecutar('git', args, { cwd: RAIZ, timeout: 15_000 });
  return stdout.trim();
}

/**
 * Qué commit está corriendo esta instancia.
 *
 * Devuelve `null` en vez de lanzar: un servidor no se cae porque no pudo leer
 * su propio número de versión. Pasa de verdad —producción estuvo servida desde
 * un directorio que no era un repo git— y ahí el resultado correcto es "no sé",
 * no una excepción a mitad de una request.
 */
export async function commitActual(): Promise<{
  sha: string;
  rama: string;
  fecha: string;
  asunto: string;
} | null> {
  try {
    if (!existsSync(path.join(RAIZ, '.git'))) return null;
    const [sha, rama, fecha, asunto] = await Promise.all([
      git('rev-parse', 'HEAD'),
      git('rev-parse', '--abbrev-ref', 'HEAD'),
      git('log', '-1', '--format=%cI'),
      git('log', '-1', '--format=%s'),
    ]);
    if (!ES_SHA.test(sha)) return null;
    return { sha, rama, fecha, asunto };
  } catch {
    return null;
  }
}

export async function infoDeDespliegue(): Promise<InfoDeDespliegue> {
  const e = entorno();
  const base: InfoDeDespliegue = { entorno: e, arrancado: ARRANCADO };

  // En producción no se publica el commit: quien mira desde afuera no tiene por
  // qué saber exactamente qué versión del código está expuesta.
  if (e === 'produccion') return base;

  const c = await commitActual();
  if (!c) return base;

  return {
    ...base,
    commit: c.sha,
    commitCorto: c.sha.slice(0, 7),
    rama: c.rama,
    fechaDelCommit: c.fecha,
    asunto: c.asunto,
  };
}

export class PromocionInvalida extends Error {}

/** Una promoción a la vez. Dos deploys pisándose dejan producción a medio construir. */
let enCurso: Promise<ResultadoDePromocion> | null = null;

export interface ResultadoDePromocion {
  sha: string;
  salida: string;
  duracionMs: number;
}

/**
 * Mueve producción al commit que esta instancia está corriendo.
 *
 * El script es fijo y versionado (`scripts/promote-to-prod.sh`): lo único que
 * viaja desde afuera es un SHA de 40 hexadecimales, validado contra una
 * expresión regular Y contra lo que `git rev-parse HEAD` dice acá. No se
 * interpola nada en una shell —`execFile` con lista de argumentos, sin
 * `shell: true`— porque un endpoint que ejecuta comandos en el servidor es
 * exactamente el lugar donde no se improvisa.
 *
 * @param shaEsperado El commit que el humano dice estar promoviendo. Si no es
 *   el que corre esta instancia, se aborta: significa que staging se actualizó
 *   entre que miró la pantalla y apretó el botón, y entonces no probó lo que
 *   está por publicar.
 */
export async function promoverAProduccion(shaEsperado: string): Promise<ResultadoDePromocion> {
  if (!esStaging()) {
    // Guarda de fondo. La de verdad es que el router no se monta en producción,
    // pero esta función no puede depender de quién la llame.
    throw new PromocionInvalida('Promover sólo se puede desde staging.');
  }

  if (enCurso) {
    throw new PromocionInvalida('Ya hay una promoción en curso. Esperá a que termine.');
  }

  const sha = String(shaEsperado || '').trim().toLowerCase();
  if (!ES_SHA.test(sha)) {
    throw new PromocionInvalida('El commit a promover no es un SHA de git válido.');
  }

  const actual = await commitActual();
  if (!actual) {
    throw new PromocionInvalida(
      'Esta instancia no puede leer su propio commit, así que no hay nada verificable que promover.',
    );
  }
  if (actual.sha !== sha) {
    // 12 caracteres y no 7: dos commits pueden compartir el prefijo corto, y un
    // mensaje donde los dos números se leen iguales no explica nada.
    throw new PromocionInvalida(
      `Staging está corriendo ${actual.sha.slice(0, 12)} y pediste promover ${sha.slice(0, 12)}. ` +
        'Recargá la pantalla y revisá qué estás por publicar.',
    );
  }

  const script = path.join(RAIZ, 'scripts', 'promote-to-prod.sh');
  if (!existsSync(script)) {
    throw new PromocionInvalida(
      'Falta scripts/promote-to-prod.sh en el servidor. Sin el script no hay promoción.',
    );
  }

  const arranque = Date.now();
  enCurso = (async () => {
    try {
      const { stdout, stderr } = await ejecutar('bash', [script, sha], {
        cwd: RAIZ,
        // Un build de producción con migraciones tarda. 15 minutos es holgado y
        // sigue siendo un techo: si se cuelga, se corta y queda el registro.
        timeout: 15 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, PROMOTED_BY_APP: '1' },
      });
      return { sha, salida: [stdout, stderr].filter(Boolean).join('\n').trim(), duracionMs: Date.now() - arranque };
    } catch (e: any) {
      // La salida del script importa más que el mensaje del error: ahí está en
      // qué paso murió el deploy.
      const detalle = [e?.stdout, e?.stderr, e?.message].filter(Boolean).join('\n').trim();
      throw new Error(detalle || 'La promoción falló sin dejar salida.');
    } finally {
      enCurso = null;
    }
  })();

  return enCurso;
}
