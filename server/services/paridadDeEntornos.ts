/**
 * Paridad entre producción y staging (regla del dueño, 2026-11-09: «hacer el staging con paridad desde ahora»).
 *
 * Paridad NO es copiar secretos ni datos: staging usa claves de prueba (Mercado Pago `TEST-`), su propia base y su propio puerto. Es que corra el MISMO código por el MISMO
 * camino —mismas puertas antes de desplegar, mismos comandos, misma configuración de PM2— y que no le falte ninguna variable de entorno que producción sí tiene (una variable que
 * falta en staging hace que una función ande distinto ahí y no se vea hasta producción: es de donde salen los incidentes «en staging andaba»).
 *
 * Este archivo solo compara NOMBRES de variables. Nunca lee ni devuelve valores: un valor puede ser una clave, y lo que sale de un script de diagnóstico termina en un chat.
 */

/** Variables que DEBEN ser distintas en staging (otra base, otro puerto, otras URLs): su valor distinto es lo correcto, no una diferencia a corregir. */
export const VARIABLES_QUE_DIFIEREN_POR_DISENO = [
  'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DATABASE_URL', 'TEST_DATABASE_URL',
  'PORT', 'APP_ENV', 'NODE_ENV',
  // Las URLs que el código lee de verdad (staging tiene su propio dominio): CLIENT_URL es la de la web; no hay otras con otro nombre.
  'CLIENT_URL', 'SERVER_URL', 'APP_URL', 'CORS_ORIGINS', 'CORS_ORIGIN',
] as const;

/** Los NOMBRES de variables de un texto estilo `.env` (ignora comentarios y líneas vacías). Nunca devuelve los valores. */
export function nombresDeVariables(texto: string): string[] {
  const nombres = new Set<string>();
  for (const linea of String(texto || '').split(/\r?\n/)) {
    const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) nombres.add(m[1]);
  }
  return [...nombres].sort();
}

export interface DiferenciaDeVariables {
  /** Están en producción y NO en staging: staging se comporta distinto (o no anda esa función). Es lo que hay que arreglar. */
  faltanEnStaging: string[];
  /** Están en staging y no en producción: sobran, o producción se quedó atrás. Se anota, no bloquea. */
  soloEnStaging: string[];
  /** Iguales en nombre, no se comparan los valores. */
  enComun: number;
}

export function compararVariables(produccion: string[], staging: string[]): DiferenciaDeVariables {
  const p = new Set(produccion);
  const s = new Set(staging);
  return {
    faltanEnStaging: produccion.filter((n) => !s.has(n)).sort(),
    soloEnStaging: staging.filter((n) => !p.has(n)).sort(),
    enComun: produccion.filter((n) => s.has(n)).length,
  };
}

/**
 * Los NOMBRES de las migraciones que una base aplicó y la otra no. `produccion` y `staging` son los `name` de la tabla `SequelizeMeta`.
 * Staging detrás de producción = lo que se probó ahí no incluye lo último que ya corre en vivo; staging adelante = lo que viene en la próxima promoción.
 */
export function compararMigraciones(produccion: string[], staging: string[]): { soloEnProduccion: string[]; soloEnStaging: string[] } {
  const p = new Set(produccion);
  const s = new Set(staging);
  return {
    soloEnProduccion: produccion.filter((n) => !s.has(n)).sort(),
    soloEnStaging: staging.filter((n) => !p.has(n)).sort(),
  };
}

/** Qué hay que corregir, en palabras, a partir de las diferencias. Vacío = hay paridad. */
export function pendientesDeParidad(
  variables: DiferenciaDeVariables,
  migraciones: { soloEnProduccion: string[]; soloEnStaging: string[] } | null,
  commits: { produccion: string | null; staging: string | null },
): string[] {
  const pendientes: string[] = [];
  const faltan = variables.faltanEnStaging.filter((n) => !(VARIABLES_QUE_DIFIEREN_POR_DISENO as readonly string[]).includes(n));
  if (faltan.length) pendientes.push(`Faltan en el .env de staging ${faltan.length} variable(s) que producción sí tiene: ${faltan.join(', ')}. Agregalas con un valor de PRUEBA (nunca el de producción).`);
  if (migraciones?.soloEnProduccion.length) pendientes.push(`Staging no aplicó ${migraciones.soloEnProduccion.length} migración(es) que producción ya tiene: ${migraciones.soloEnProduccion.join(', ')}. Desplegá staging de nuevo.`);
  if (commits.produccion && commits.staging && commits.produccion !== commits.staging) {
    pendientes.push(`Staging corre ${commits.staging.slice(0, 7)} y producción ${commits.produccion.slice(0, 7)}: no están en el mismo commit. Si no es una prueba en curso, desplegá staging con la rama de producción.`);
  }
  return pendientes;
}
