import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { BlogPost } from '../../models/sql/BlogPost.model.js';
import { logAudit, getSeverityForAction } from '../../utils/auditLog.js';
import { isContentAgentConfigured, isContentAgentEnabled, setContentAgentEnabled } from '../../services/contentAgent.js';
import { markdownToHtml } from '../../utils/markdownToHtml.js';
import { runBlogDraftGeneration, listPendingDrafts, listRecentlyRejected } from '../../jobs/generateBlogDrafts.js';

/**
 * Review queue for the content agent.
 *
 * The agent writes drafts; publishing is a human action taken here. Approve and
 * reject are both audited — a post carries the platform's name, so who let it
 * out is part of the record.
 */
const router = Router();
router.use(protect, authorize('admin', 'super_admin', 'owner', 'marketing'));

// @route GET /api/admin/content-agent/queue
router.get('/queue', async (_req: AuthRequest, res: Response) => {
  try {
    const [pending, rejected] = await Promise.all([listPendingDrafts(), listRecentlyRejected()]);
    res.json({
      success: true,
      data: {
        configured: isContentAgentConfigured(),
        enabled: await isContentAgentEnabled(),
        pending: pending.map((p: any) => ({
          id: p.id, title: p.title, subtitle: p.subtitle, excerpt: p.excerpt,
          content: p.content, category: p.category, tags: p.tags,
          metaTitle: p.metaTitle, metaDescription: p.metaDescription,
          keyTakeaways: p.keyTakeaways, faq: p.faq, createdAt: p.createdAt,
        })),
        rejected: rejected.map((p: any) => ({
          id: p.id, title: p.title, rejectionReason: p.rejectionReason, reviewedAt: p.reviewedAt,
        })),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/content-agent/toggle
// @desc  Turn the scheduled agent on or off.
router.post('/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;
    await setContentAgentEnabled(enabled, req.user!.id);
    await logAudit({
      req, action: enabled ? 'content_agent_enabled' : 'content_agent_disabled', category: 'system',
      severity: getSeverityForAction(enabled ? 'content_agent_enabled' : 'content_agent_disabled'),
      description: enabled ? 'Se activo el agente de contenido' : 'Se desactivo el agente de contenido',
      targetModel: 'AppSetting', targetId: 'content-agent:enabled',
    });
    res.json({ success: true, message: enabled ? 'Agente activado' : 'Agente desactivado' });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/content-agent/generate
// @desc  Generate one draft now, without waiting for the schedule.
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    if (!isContentAgentConfigured()) {
      res.status(503).json({ success: false, message: 'Falta ANTHROPIC_API_KEY en el servidor' });
      return;
    }
    const result = await runBlogDraftGeneration({ scheduled: false });
    if (!result.created) { res.status(400).json({ success: false, message: result.reason }); return; }
    res.json({ success: true, message: 'Borrador generado, quedo en la cola de revision' });
  } catch (e: any) {
    res.status(502).json({ success: false, message: `No se pudo generar: ${e.message}` });
  }
});

// @route POST /api/admin/content-agent/:id/approve
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const post = await BlogPost.findByPk(req.params.id);
    if (!post) { res.status(404).json({ success: false, message: 'Borrador no encontrado' }); return; }

    // Whatever the admin edited in the review screen is what gets published:
    // approving a draft you corrected should publish the correction.
    const { title, subtitle, excerpt, content, metaTitle, metaDescription, tags, keyTakeaways, faq } = req.body || {};
    await post.update({
      ...(title !== undefined ? { title } : {}),
      ...(subtitle !== undefined ? { subtitle } : {}),
      ...(excerpt !== undefined ? { excerpt } : {}),
      // The admin edits the draft as Markdown in the review screen.
      ...(content !== undefined ? { content: markdownToHtml(String(content)) } : {}),
      ...(metaTitle !== undefined ? { metaTitle: String(metaTitle).slice(0, 70) } : {}),
      ...(metaDescription !== undefined ? { metaDescription: String(metaDescription).slice(0, 160) } : {}),
      ...(Array.isArray(tags) ? { tags } : {}),
      ...(Array.isArray(keyTakeaways) ? { keyTakeaways } : {}),
      ...(Array.isArray(faq) ? { faq } : {}),
      status: 'published',
      publishedAt: new Date(),
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      rejectionReason: null,
    } as any);

    await logAudit({
      req, action: 'blog_agent_draft_approved', category: 'system',
      severity: getSeverityForAction('blog_agent_draft_approved'),
      description: `Publicada la nota generada por el agente: "${post.title}"`,
      targetModel: 'BlogPost', targetId: post.id, targetIdentifier: post.slug,
    });

    res.json({ success: true, message: 'Publicada' });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/content-agent/:id/reject
router.post('/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body || {};
    if (!reason || String(reason).trim().length < 3) {
      // The reason is the only signal for tuning the agent's prompt; a rejection
      // without one teaches nothing.
      res.status(400).json({ success: false, message: 'Indica por que se rechaza' });
      return;
    }

    const post = await BlogPost.findByPk(req.params.id);
    if (!post) { res.status(404).json({ success: false, message: 'Borrador no encontrado' }); return; }

    await post.update({
      status: 'archived',
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      rejectionReason: String(reason).trim(),
    } as any);

    await logAudit({
      req, action: 'blog_agent_draft_rejected', category: 'system',
      severity: getSeverityForAction('blog_agent_draft_rejected'),
      description: `Rechazada la nota "${post.title}": ${String(reason).trim()}`,
      targetModel: 'BlogPost', targetId: post.id, targetIdentifier: post.slug,
    });

    res.json({ success: true, message: 'Rechazada' });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
