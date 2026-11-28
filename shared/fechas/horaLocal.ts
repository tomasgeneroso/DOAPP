/**
 * Las horas que una persona ve y escribe son las de SU reloj; las que se guardan y viajan son un instante exacto (con zona). Los formularios cargaban la hora
 * universal como si fuera la local (3 horas corridas en Argentina) y la mandaban sin zona (2026-11-28).
 */
const dos = (n: number) => String(n).padStart(2, '0');

/** `{ fecha: 'AAAA-MM-DD', hora: 'HH:mm' }` de un instante, en la hora local de quien mira. Vacíos si no hay fecha. */
export function fechaYHoraLocal(instante: string | Date | null | undefined): { fecha: string; hora: string } {
  const d = instante ? new Date(instante) : null;
  if (!d || Number.isNaN(d.getTime())) return { fecha: '', hora: '' };
  return { fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, hora: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
}

/** El valor de un campo `datetime-local`. */
export function valorDelCampoLocal(instante: string | Date | null | undefined): string {
  const { fecha, hora } = fechaYHoraLocal(instante);
  return fecha ? `${fecha}T${hora}` : '';
}

/** Lo escrito en hora local (`AAAA-MM-DDTHH:mm`) como instante exacto para mandar. Vacío si no se entiende. */
export function instanteDeLoEscrito(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
