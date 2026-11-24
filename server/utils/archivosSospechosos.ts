import path from 'path';

/** Qué archivo de `uploads/` conviene apartar (ver server/scripts/revisarArchivosSubidos.ts). */
export const EXTENSIONES_PELIGROSAS: ReadonlySet<string> = new Set(['.html', '.htm', '.xhtml', '.shtml', '.svg', '.svgz', '.xml', '.xsl', '.js', '.mjs', '.cjs', '.php', '.phtml', '.jsp', '.asp', '.aspx', '.exe', '.bat', '.cmd', '.sh', '.ps1', '.hta', '.swf']);
const PARECE_PAGINA = /<\s*(html|script|svg|iframe|body|head|\?xml|!doctype\s+html)/i;
const CON_FORMATO_DE_MEDIO = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.bin']);

export function motivoDeSospecha(ruta: string, principio: string): string | null {
  const ext = path.extname(ruta).toLowerCase();
  if (ext === '.bloqueado') return null;
  if (EXTENSIONES_PELIGROSAS.has(ext)) return `extensión ${ext}`;
  if (CON_FORMATO_DE_MEDIO.has(ext) && PARECE_PAGINA.test(principio)) return 'el contenido parece una página';
  return null;
}
