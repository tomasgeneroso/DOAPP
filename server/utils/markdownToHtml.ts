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

/** True when the text looks like Markdown that still needs converting. */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  return /^#{1,6}\s|\n#{1,6}\s|\*\*[^*]+\*\*|^\s*[-*]\s+|\n\s*[-*]\s+|\|.*\|/.test(text);
}
