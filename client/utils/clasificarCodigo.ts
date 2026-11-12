/**
 * Un solo campo «Tengo un código» (pedido del dueño, 2026-11-12: «debo ingresar el código de invitación que me enviaron desde Códigos de invitación en el menú»).
 * Según cómo se ve lo que se pegó, se sabe a qué canje va: invitación de un creador de contenido (`INF-` + 12), código de familia (`FAM-` + 8) o código de un
 * referido (8 letras y números). También acepta el ENLACE completo de la invitación (`…/invitacion/INF-…`).
 */
export type TipoDeCodigo = 'invitacion' | 'familia' | 'referido';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITACION = new RegExp(`(?:^|[/\\s=])INF-?([${ALFABETO}]{12})(?:[/?#\\s]|$)`, 'i');
const FAMILIA = new RegExp(`^FAM([${ALFABETO}]{8})$`);

export function clasificarCodigo(entrada: unknown): { tipo: TipoDeCodigo; codigo: string } | null {
  const texto = String(entrada ?? '').trim();
  if (!texto) return null;

  const inv = texto.match(INVITACION);
  if (inv) return { tipo: 'invitacion', codigo: `INF-${inv[1].toUpperCase()}` };

  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const fam = limpio.match(FAMILIA);
  if (fam) return { tipo: 'familia', codigo: `FAM-${fam[1]}` };
  if (/^[A-Z0-9]{8}$/.test(limpio)) return { tipo: 'referido', codigo: limpio };
  return null;
}
