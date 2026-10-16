/**
 * Ayudas de fechas de la pantalla de publicar (puras: se prueban sin React Native).
 */
const dos = (n: number) => String(n).padStart(2, '0');

/** «04/11/2026 09:00», o '' si no hay fecha. */
export const textoDeFecha = (d: Date | null): string =>
  d ? `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}` : '';

/** Las semanas del mes (lunes a domingo): cada celda es un Date o null para los huecos. */
export function semanasDelMes(anio: number, mes: number): (Date | null)[][] {
  const primero = new Date(anio, mes, 1);
  const hueco = (primero.getDay() + 6) % 7; // lunes = 0
  const total = new Date(anio, mes + 1, 0).getDate();
  const celdas: (Date | null)[] = [];
  for (let i = 0; i < hueco; i++) celdas.push(null);
  for (let d = 1; d <= total; d++) celdas.push(new Date(anio, mes, d));
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas: (Date | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

/** Mientras se escribe: «15062026» → «15/06/2026». */
export const formatearDia = (texto: string): string => {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length >= 5) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length >= 3) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
};

/** DD/MM/AAAA → AAAA-MM-DD (lo que lee el servidor), o '' si no es un día real y completo. */
export const diaParaElServidor = (dmy: string): string => {
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const f = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return f.getFullYear() === Number(m[3]) && f.getMonth() === Number(m[2]) - 1 && f.getDate() === Number(m[1]) ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
