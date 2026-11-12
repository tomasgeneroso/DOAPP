/**
 * Un solo campo «Tengo un código» (pedido del dueño, 2026-11-12: «debo ingresar el código de invitación que me enviaron desde Códigos de invitación en el menú»,
 * y «verificar que los códigos sirvan con o sin FAM-, etc.»). Según cómo se ve lo que se pegó, se sabe a qué canje va: invitación de un creador de contenido
 * (`INF-` + 12), código de familia (`FAM-` + 8) o código de un referido (8 letras y números). Todo vale con o sin el prefijo, con guiones o espacios de más y en
 * minúsculas; también acepta el ENLACE completo de la invitación (`…/invitacion/INF-…`).
 *
 * Un código de 8 caracteres SIN prefijo puede ser de un referido o de familia: `candidatosDeCodigo` devuelve los dos, en el orden en que hay que probarlos.
 */
export type TipoDeCodigo = 'invitacion' | 'familia' | 'referido';

export interface CodigoReconocido {
  tipo: TipoDeCodigo;
  codigo: string;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITACION_EN_ENLACE = new RegExp(`(?:^|[/\\s=])INF-?([${ALFABETO}]{12})(?:[/?#\\s]|$)`, 'i');
const INVITACION = new RegExp(`^(?:INF)?([${ALFABETO}]{12})$`);
const FAMILIA = new RegExp(`^FAM([${ALFABETO}]{8})$`);
const FAMILIA_SIN_PREFIJO = new RegExp(`^[${ALFABETO}]{8}$`);

export function candidatosDeCodigo(entrada: unknown): CodigoReconocido[] {
  const texto = String(entrada ?? '').trim();
  if (!texto) return [];

  const enEnlace = texto.match(INVITACION_EN_ENLACE);
  if (enEnlace) return [{ tipo: 'invitacion', codigo: `INF-${enEnlace[1].toUpperCase()}` }];

  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const inv = limpio.match(INVITACION);
  if (inv) return [{ tipo: 'invitacion', codigo: `INF-${inv[1]}` }];
  const fam = limpio.match(FAMILIA);
  if (fam) return [{ tipo: 'familia', codigo: `FAM-${fam[1]}` }];
  if (/^[A-Z0-9]{8}$/.test(limpio)) {
    const lista: CodigoReconocido[] = [{ tipo: 'referido', codigo: limpio }];
    if (FAMILIA_SIN_PREFIJO.test(limpio)) lista.push({ tipo: 'familia', codigo: `FAM-${limpio}` });
    return lista;
  }
  return [];
}

/** El primer candidato (el más probable), o null si no tiene la forma de ningún código. */
export function clasificarCodigo(entrada: unknown): CodigoReconocido | null {
  return candidatosDeCodigo(entrada)[0] ?? null;
}
