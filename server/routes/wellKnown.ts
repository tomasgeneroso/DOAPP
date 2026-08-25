import { Router, Request, Response } from 'express';
import { BlogPost } from '../models/sql/BlogPost.model.js';
import { getPhaseInfo } from '../services/platformPhase.js';
import { termsEs } from '../../shared/legal/terms.es.js';
import { privacyEs } from '../../shared/legal/privacy.es.js';
import { TERMS_BODY_KEYS } from '../../shared/legal/terms.structure.js';
import { PRIVACY_KEYS } from '../../shared/legal/privacy.structure.js';
import { buildLegalBody } from '../../shared/legal/classify.js';
import { wantsMarkdown, sendMarkdown } from '../middleware/agentDiscovery.js';

/**
 * Machine-readable descriptions of what this site actually offers, plus
 * markdown renderings of the pages worth citing.
 *
 * Everything here describes something real. There is no OAuth server, no MCP
 * server and no agent-payable endpoint, so those well-known documents are
 * absent rather than stubbed — an agent that finds a discovery document expects
 * the thing behind it to exist.
 */
const router = Router();

const ORIGIN = process.env.CLIENT_URL || 'https://doapparg.site';

// ── RFC 9727: API catalog ───────────────────────────────────────────────────
router.get('/api-catalog', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/linkset+json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    linkset: [
      {
        anchor: `${ORIGIN}/api`,
        'service-doc': [{ href: `${ORIGIN}/llms.txt`, type: 'text/plain', title: 'Qué es DoApp y cómo funciona' }],
        status: [{ href: `${ORIGIN}/api/health`, type: 'application/json' }],
        'terms-of-service': [{ href: `${ORIGIN}/legal/terminos-y-condiciones`, type: 'text/html' }],
        'privacy-policy': [{ href: `${ORIGIN}/legal/privacidad`, type: 'text/html' }],
      },
    ],
  });
});

// ── ARD: capability manifest ────────────────────────────────────────────────
router.get('/ai-catalog.json', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const phase = await getPhaseInfo().catch(() => null);

  res.json({
    specVersion: '0.1',
    host: {
      name: 'DoApp',
      domain: 'doapparg.site',
      description:
        'Plataforma argentina que conecta clientes con trabajadores independientes (plomeros, electricistas, gasistas, limpieza, jardinería, técnicos). Los pagos quedan en custodia y se liberan cuando ambas partes confirman.',
      // Stated up front because it changes what a quote means: during the beta
      // the platform charges no commission at all.
      ...(phase ? { operatingPhase: phase.phase, betaEndsAt: phase.betaEndsAt } : {}),
    },
    entries: [
      {
        id: 'urn:air:doapparg.site:content:llms-txt',
        displayName: 'Resumen de la plataforma',
        type: 'text/plain',
        url: `${ORIGIN}/llms.txt`,
        representativeQueries: [
          '¿Qué es DoApp?',
          '¿Cómo funciona el escrow en DoApp?',
          '¿Cuánto cobra de comisión DoApp?',
        ],
      },
      {
        id: 'urn:air:doapparg.site:content:blog',
        displayName: 'Blog: guías sobre oficios y contratación',
        type: 'application/json',
        url: `${ORIGIN}/api/blogs`,
        representativeQueries: [
          '¿Cuánto sale arreglar una pérdida de agua en Argentina?',
          '¿Cómo elijo un electricista matriculado?',
          '¿Qué incluye un servicio de limpieza por hora?',
        ],
      },
      {
        id: 'urn:air:doapparg.site:data:jobs',
        displayName: 'Trabajos publicados',
        type: 'application/json',
        url: `${ORIGIN}/api/jobs`,
        representativeQueries: [
          '¿Qué trabajos hay disponibles en Buenos Aires?',
          'Buscar changas de plomería cerca',
        ],
      },
      {
        id: 'urn:air:doapparg.site:legal:terms',
        displayName: 'Términos y condiciones',
        type: 'text/markdown',
        url: `${ORIGIN}/.well-known/md/terminos`,
        representativeQueries: [
          '¿DoApp verifica las matrículas de los trabajadores?',
          '¿Qué responsabilidad asume DoApp por el trabajo?',
        ],
      },
      {
        id: 'urn:air:doapparg.site:legal:privacy',
        displayName: 'Política de privacidad',
        type: 'text/markdown',
        url: `${ORIGIN}/.well-known/md/privacidad`,
        representativeQueries: [
          '¿Qué datos guarda DoApp?',
          '¿DoApp envía datos fuera de Argentina?',
        ],
      },
    ],
  });
});

// ── Markdown renderings ─────────────────────────────────────────────────────

/** Turn a legal document's shared source into markdown. */
function legalToMarkdown(copy: Record<string, string>, keys: string[], title: string): string {
  const out: string[] = [`# ${title}`, ''];
  if (copy.lastUpdated) out.push(`_${copy.lastUpdated}_`, '');

  for (const { key, kind } of buildLegalBody(keys)) {
    const text = (copy[key] || '').replace(/<\/?b>/g, '**');
    if (!text) continue;
    if (kind === 'title') out.push('', `## ${text}`, '');
    else if (kind === 'listItem') out.push(`- ${text}`);
    else if (kind === 'note') out.push('', `> ${text}`, '');
    else out.push(text, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

router.get('/md/terminos', (_req: Request, res: Response) => {
  sendMarkdown(res, legalToMarkdown(termsEs, TERMS_BODY_KEYS, 'Términos y Condiciones de DoApp'));
});

router.get('/md/privacidad', (_req: Request, res: Response) => {
  sendMarkdown(res, legalToMarkdown(privacyEs, PRIVACY_KEYS, 'Política de Privacidad de DoApp'));
});

/**
 * A blog post as markdown, answer blocks first.
 *
 * Takeaways and FAQ lead because answer engines lift the first self-contained
 * passage that matches; burying them under the article is how a piece gets read
 * but not cited.
 */
router.get('/md/blog/:slug', async (req: Request, res: Response) => {
  try {
    const post: any = await BlogPost.findOne({ where: { slug: req.params.slug, status: 'published' } });
    if (!post) { res.status(404).type('text/plain').send('No encontrado'); return; }

    const md: string[] = [`# ${post.title}`, ''];
    if (post.subtitle) md.push(`_${post.subtitle}_`, '');
    if (post.excerpt) md.push(post.excerpt, '');

    if (post.keyTakeaways?.length) {
      md.push('## En resumen', '');
      for (const k of post.keyTakeaways) md.push(`- ${k}`);
      md.push('');
    }

    if (post.faq?.length) {
      md.push('## Preguntas frecuentes', '');
      for (const f of post.faq) md.push(`### ${f.question}`, '', f.answer, '');
    }

    md.push('---', '', post.content, '');
    md.push(`_Publicado por DoApp — ${ORIGIN}/blog/${post.slug}_`);
    sendMarkdown(res, md.join('\n'));
  } catch (e: any) {
    res.status(500).type('text/plain').send(e.message);
  }
});

export default router;

/** Mounted separately: content routes that answer markdown when asked. */
export const markdownNegotiation = Router();

markdownNegotiation.get('/legal/terminos-y-condiciones', (req, res, next) => {
  if (!wantsMarkdown(req)) return next();
  sendMarkdown(res, legalToMarkdown(termsEs, TERMS_BODY_KEYS, 'Términos y Condiciones de DoApp'));
});

markdownNegotiation.get('/legal/privacidad', (req, res, next) => {
  if (!wantsMarkdown(req)) return next();
  sendMarkdown(res, legalToMarkdown(privacyEs, PRIVACY_KEYS, 'Política de Privacidad de DoApp'));
});
