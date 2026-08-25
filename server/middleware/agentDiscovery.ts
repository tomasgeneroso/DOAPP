import type { Request, Response, NextFunction } from 'express';

/**
 * Discovery surface for AI agents.
 *
 * Two pieces: RFC 8288 Link headers pointing at resources that actually exist,
 * and content negotiation so an agent asking for `text/markdown` gets prose
 * instead of an SPA shell.
 *
 * What is deliberately NOT advertised: OAuth/OIDC discovery, an MCP server
 * card, agent-payment protocols. There is no OAuth server, no MCP server and no
 * agent-payable endpoint here, and a well-known document describing one would
 * send agents to something that does not exist. Advertising capabilities the
 * backend cannot deliver is the same failure that took AstroPay and the
 * WhatsApp OTP down; a discovery document is a promise like any other.
 */

/** Only these relations are published, and each points at a live resource. */
const LINKS: Array<{ href: string; rel: string; type?: string }> = [
  { href: '/llms.txt', rel: 'llms-txt', type: 'text/plain' },
  { href: '/.well-known/api-catalog', rel: 'api-catalog', type: 'application/linkset+json' },
  { href: '/.well-known/ai-catalog.json', rel: 'service-desc', type: 'application/json' },
  { href: '/sitemap.xml', rel: 'sitemap', type: 'application/xml' },
  { href: '/legal/terminos-y-condiciones', rel: 'terms-of-service', type: 'text/html' },
  { href: '/legal/privacidad', rel: 'privacy-policy', type: 'text/html' },
];

export function agentLinkHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Link',
    LINKS.map((l) => `<${l.href}>; rel="${l.rel}"${l.type ? `; type="${l.type}"` : ''}`).join(', '),
  );
  next();
}

/** True when the caller prefers markdown over HTML. */
export function wantsMarkdown(req: Request): boolean {
  const accept = String(req.headers.accept || '');
  if (!accept.includes('text/markdown')) return false;
  // An explicit q=0 is a refusal, not a preference.
  return !/text\/markdown\s*;\s*q=0(\.0+)?\b/.test(accept);
}

/**
 * Send a markdown body with the headers agent tooling looks for.
 *
 * `x-markdown-tokens` is a rough estimate, not a tokenizer: it exists so a
 * crawler can budget before fetching the rest, and being approximate is fine
 * for that. Roughly four characters per token for Spanish prose.
 */
export function sendMarkdown(res: Response, markdown: string): void {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('x-markdown-tokens', String(Math.ceil(markdown.length / 4)));
  res.setHeader('Vary', 'Accept');
  res.send(markdown);
}
