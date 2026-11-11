import { marked } from 'marked';

/**
 * Markdown to HTML, applied when a post is saved.
 *
 * The blog stores HTML: BlogDetailScreen renders `post.content` with
 * dangerouslySetInnerHTML, and the human editor already produces HTML. The
 * content agent and the seeded articles write Markdown, which is why the beta
 * article rendered with literal `##` and `**` on screen.
 *
 * Converting on write rather than on render keeps one storage format, leaves
 * every existing post untouched, and means the admin previewing a draft sees
 * the same markup that will be published.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  // Already HTML (the human editor's output) — leave it alone. Running it
  // through the parser risks mangling markup that was never Markdown.
  if (/^\s*<(p|div|h[1-6]|ul|ol|table|section|article)\b/i.test(markdown)) {
    return markdown;
  }

  return marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string;
}

/**
 * El contenido de un artículo tal como se le entrega al lector.
 *
 * Un artículo guardado como Markdown (publicado antes de que se convirtiera al guardar, o por una vía que no convirtió) se dibujaba como texto corrido: los `##`, los `**` y
 * las tablas `| a | b |` salían literales y las líneas se juntaban en un párrafo («blog/que-incluye-la-beta-de-doapp», 2026-11-09). Se convierte al leer: no toca la base,
 * sirve para todo lo ya publicado y no hace falta volver a correr el script que publica cada artículo.
 *
 * Solo convierte si parece Markdown Y no tiene ya bloques HTML: un artículo que ya es HTML (el del editor) se entrega tal cual.
 */
export function contenidoParaMostrar(content: string | null | undefined): string {
  const texto = String(content ?? '');
  if (!texto) return '';
  if (/<(p|div|h[1-6]|ul|ol|table|section|article|blockquote|figure)\b/i.test(texto)) return texto;
  return looksLikeMarkdown(texto) ? markdownToHtml(texto) : texto;
}

/** True when the text looks like Markdown that still needs converting. */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  return /^#{1,6}\s|\n#{1,6}\s|\*\*[^*]+\*\*|^\s*[-*]\s+|\n\s*[-*]\s+|\|.*\|/.test(text);
}
