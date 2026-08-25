import cron from 'node-cron';
import { BlogPost } from '../models/sql/BlogPost.model.js';
import { generateDraft, isContentAgentConfigured } from '../services/contentAgent.js';
import { Op } from 'sequelize';

/**
 * Three blog drafts a week, Monday/Wednesday/Friday at 09:00 (America/Argentina/Buenos_Aires).
 *
 * They are drafts, not posts: each one waits for an admin in
 * /admin/blog/pending. The schedule produces a queue, a person decides what
 * becomes public.
 */

/** Do not let unreviewed drafts pile up faster than anyone reads them. */
const MAX_PENDING = 9;

async function pendingCount(): Promise<number> {
  return BlogPost.count({ where: { status: 'draft', generatedBy: 'agent' } });
}

export async function runBlogDraftGeneration(): Promise<{ created: boolean; reason?: string }> {
  if (!isContentAgentConfigured()) {
    return { created: false, reason: 'ANTHROPIC_API_KEY no configurada' };
  }

  const pending = await pendingCount();
  if (pending >= MAX_PENDING) {
    // Generating into a backlog nobody is clearing costs money and buries the
    // drafts that are actually waiting for a decision.
    return { created: false, reason: `Ya hay ${pending} borradores sin revisar (maximo ${MAX_PENDING})` };
  }

  const post = await generateDraft();
  console.log(`📝 [CRON] Borrador generado: "${post.title}" (${post.category}) — espera aprobacion`);
  return { created: true };
}

export function startBlogDraftGenerationJob(): void {
  // Mon/Wed/Fri 09:00 ART.
  cron.schedule(
    '0 9 * * 1,3,5',
    async () => {
      try {
        const result = await runBlogDraftGeneration();
        if (!result.created) console.log(`📝 [CRON] Sin borrador nuevo: ${result.reason}`);
      } catch (e: any) {
        // A failed generation is not worth crashing the process over; the next
        // run is two days away and the admin queue simply stays as it was.
        console.warn('⚠️  [CRON] No se pudo generar el borrador:', e?.message);
      }
    },
    { timezone: 'America/Argentina/Buenos_Aires' },
  );

  console.log('📝 Agente de contenido programado: lunes, miercoles y viernes 09:00 ART');
}

/** Drafts still waiting, oldest first — what the admin queue shows. */
export async function listPendingDrafts() {
  return BlogPost.findAll({
    where: { status: 'draft', generatedBy: 'agent' },
    order: [['createdAt', 'ASC']],
    limit: 50,
  });
}

/** Agent drafts rejected in the last 30 days, for the record. */
export async function listRecentlyRejected() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return BlogPost.findAll({
    where: { status: 'archived', generatedBy: 'agent', reviewedAt: { [Op.gte]: since } },
    order: [['reviewedAt', 'DESC']],
    limit: 20,
  });
}
