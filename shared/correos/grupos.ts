/**
 * Grupos de destinatarios (módulo de correos, 2026-11-11): un grupo es un conjunto de FILTROS guardado con un nombre. Se evalúa en el momento de armar la campaña, así «Registro sin
 * terminar» siempre trae a quienes lo tienen sin terminar HOY. Lo comparten el servidor (que lo convierte en una consulta) y la pantalla (que arma el formulario y lo describe).
 *
 * Las personas que NUNCA reciben correos (cuentas suspendidas, unidas a otra, sin correo, del equipo, o que se dieron de baja) las saca el servidor siempre, sin importar los filtros.
 */

export interface FiltrosDeGrupo {
  /** Registro: `incompleto` = creó la cuenta pero no terminó (paso 2); `completo` = ya lo terminó. */
  registro?: 'incompleto' | 'completo';
  /** Identidad: verificada por Didit (o aprobada por un administrador) o no. */
  identidad?: 'verificada' | 'sin_verificar';
  /** DNI cargado o no. */
  dni?: 'con' | 'sin';
  correoVerificado?: boolean;
  rol?: Array<'client' | 'doer' | 'both' | 'user'>;
  membresia?: 'pro' | 'gratis';
  /** Recibió el beneficio de lanzamiento. */
  beneficioDeLanzamiento?: boolean;
  /** Creó la cuenta hace MÁS de estas horas (para no escribirle a quien está registrándose en este momento). */
  creadosHaceMasDeHoras?: number;
  /** Creó la cuenta hace MENOS de estos días. */
  creadosHaceMenosDeDias?: number;
  /** No entró hace más de estos días (o nunca entró). */
  sinIngresarHaceDias?: number;
}

export const CLAVES_DE_FILTROS: ReadonlyArray<keyof FiltrosDeGrupo> = [
  'registro', 'identidad', 'dni', 'correoVerificado', 'rol', 'membresia', 'beneficioDeLanzamiento', 'creadosHaceMasDeHoras', 'creadosHaceMenosDeDias', 'sinIngresarHaceDias',
];

const ROLES = ['client', 'doer', 'both', 'user'] as const;

export interface ResultadoDeLimpieza {
  filtros: FiltrosDeGrupo;
  errores: string[];
}

/** Deja solo los filtros conocidos y bien formados, y dice qué estaba mal. Lo que viene de la red nunca se usa tal cual. */
export function limpiarFiltros(entrada: unknown): ResultadoDeLimpieza {
  const errores: string[] = [];
  const f: FiltrosDeGrupo = {};
  const x = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>;
  const desconocidos = Object.keys(x).filter((k) => !(CLAVES_DE_FILTROS as readonly string[]).includes(k));
  if (desconocidos.length) errores.push(`Filtro desconocido: ${desconocidos.join(', ')}.`);

  const opcion = <K extends 'registro' | 'identidad' | 'dni' | 'membresia'>(clave: K, validas: readonly string[]) => {
    if (x[clave] === undefined || x[clave] === null || x[clave] === '') return;
    if (typeof x[clave] === 'string' && validas.includes(x[clave] as string)) (f as Record<string, unknown>)[clave] = x[clave];
    else errores.push(`El filtro «${clave}» tiene un valor que no existe.`);
  };
  opcion('registro', ['incompleto', 'completo']);
  opcion('identidad', ['verificada', 'sin_verificar']);
  opcion('dni', ['con', 'sin']);
  opcion('membresia', ['pro', 'gratis']);

  for (const clave of ['correoVerificado', 'beneficioDeLanzamiento'] as const) {
    if (x[clave] === undefined || x[clave] === null || x[clave] === '') continue;
    if (typeof x[clave] === 'boolean') f[clave] = x[clave] as boolean;
    else errores.push(`El filtro «${clave}» tiene que ser sí o no.`);
  }

  if (x.rol !== undefined && x.rol !== null) {
    if (Array.isArray(x.rol) && x.rol.every((r) => (ROLES as readonly string[]).includes(String(r)))) {
      if (x.rol.length) f.rol = [...new Set(x.rol.map(String))] as FiltrosDeGrupo['rol'];
    } else errores.push('El filtro «rol» tiene un valor que no existe.');
  }

  const numero = (clave: 'creadosHaceMasDeHoras' | 'creadosHaceMenosDeDias' | 'sinIngresarHaceDias', max: number) => {
    if (x[clave] === undefined || x[clave] === null || x[clave] === '') return;
    const n = Number(x[clave]);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= max) f[clave] = n;
    else errores.push(`El filtro «${clave}» tiene que ser un número entero entre 0 y ${max}.`);
  };
  numero('creadosHaceMasDeHoras', 24 * 365);
  numero('creadosHaceMenosDeDias', 3650);
  numero('sinIngresarHaceDias', 3650);

  return { filtros: f, errores };
}

/** El grupo dicho con palabras, para la lista y para el resumen de una campaña. */
export function describirFiltros(f: FiltrosDeGrupo): string {
  const partes: string[] = [];
  if (f.registro === 'incompleto') partes.push('con el registro sin terminar');
  if (f.registro === 'completo') partes.push('con el registro completo');
  if (f.identidad === 'verificada') partes.push('con la identidad verificada');
  if (f.identidad === 'sin_verificar') partes.push('sin verificar');
  if (f.dni === 'con') partes.push('con DNI cargado');
  if (f.dni === 'sin') partes.push('sin DNI cargado');
  if (f.correoVerificado === true) partes.push('con el correo confirmado');
  if (f.correoVerificado === false) partes.push('con el correo sin confirmar');
  if (f.rol?.length) partes.push(`rol: ${f.rol.join(' / ')}`);
  if (f.membresia === 'pro') partes.push('con membresía PRO');
  if (f.membresia === 'gratis') partes.push('con plan gratuito');
  if (f.beneficioDeLanzamiento === true) partes.push('con el beneficio de lanzamiento');
  if (f.beneficioDeLanzamiento === false) partes.push('sin el beneficio de lanzamiento');
  if (f.creadosHaceMasDeHoras !== undefined) partes.push(`cuenta creada hace más de ${f.creadosHaceMasDeHoras} h`);
  if (f.creadosHaceMenosDeDias !== undefined) partes.push(`cuenta creada hace menos de ${f.creadosHaceMenosDeDias} días`);
  if (f.sinIngresarHaceDias !== undefined) partes.push(`sin entrar hace más de ${f.sinIngresarHaceDias} días`);
  return partes.length ? `Personas ${partes.join(', ')}` : 'Todas las personas con cuenta';
}

/** Los grupos que se crean solos la primera vez, para no empezar de cero. */
export const GRUPOS_DE_PARTIDA: Array<{ nombre: string; descripcion: string; filtros: FiltrosDeGrupo }> = [
  {
    nombre: 'Registro sin terminar',
    descripcion: 'Crearon la cuenta pero no terminaron el registro, y la crearon hace más de un día (para no escribirle a quien lo está haciendo ahora).',
    filtros: { registro: 'incompleto', creadosHaceMasDeHoras: 24 },
  },
  {
    nombre: 'Cuentas completas sin verificar',
    descripcion: 'Terminaron el registro y todavía no tienen la identidad verificada.',
    filtros: { registro: 'completo', identidad: 'sin_verificar' },
  },
  {
    nombre: 'Todas las personas con cuenta',
    descripcion: 'Sin filtros: cualquier persona que no se haya dado de baja de los correos.',
    filtros: {},
  },
];
