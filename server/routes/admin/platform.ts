import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { User } from '../../models/sql/User.model.js';
import emailService from '../../services/email.js';
import { config } from '../../config/env.js';
import { logAudit, getSeverityForAction } from '../../utils/auditLog.js';
import {
  getPhaseInfo,
  setPlatformPhase,
  BETA_ENDS_AT,
  type PlatformPhase,
} from '../../services/platformPhase.js';
import {
  ACTIONS,
  isActionPasswordSet,
  createActionPassword,
  verifyActionPassword,
  startActionPasswordReset,
  completeActionPasswordReset,
} from '../../services/actionPassword.js';

/**
 * Owner-only control of the platform phase.
 *
 * Switching out of beta turns commission on for every future contract, so it is
 * gated by a password separate from the login session and every attempt —
 * successful or not — is audited.
 */
const router = Router();
router.use(protect, authorize('owner'));

// @route GET /api/admin/platform/phase
router.get('/phase', async (_req: AuthRequest, res: Response) => {
  try {
    const info = await getPhaseInfo();
    res.json({ success: true, data: { ...info, passwordSet: await isActionPasswordSet(ACTIONS.PLATFORM_PHASE) } });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/platform/phase-password
// @desc  Create the phase password. Only when none exists yet.
router.post('/phase-password', async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body || {};
    const result = await createActionPassword(ACTIONS.PLATFORM_PHASE, String(password || ''), req.user!.id);
    if (!result.ok) { res.status(400).json({ success: false, message: result.message }); return; }

    await logAudit({
      req, action: 'platform_phase_password_created', category: 'system',
      severity: getSeverityForAction('platform_phase_password_created'),
      description: 'Se creo la contrasena de cambio de fase de la plataforma',
      targetModel: 'AppSetting', targetId: ACTIONS.PLATFORM_PHASE,
    });
    res.json({ success: true, message: 'Contrasena guardada' });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/platform/phase-password/forgot
// @desc  Email the owner a single-use reset link.
router.post('/phase-password/forgot', async (req: AuthRequest, res: Response) => {
  try {
    const token = await startActionPasswordReset(ACTIONS.PLATFORM_PHASE);
    if (!token) { res.status(400).json({ success: false, message: 'Todavia no hay una contrasena para recuperar' }); return; }

    const owner = await User.findByPk(req.user!.id);
    const url = `${config.clientUrl || 'https://doapparg.site'}/admin/platform/reset?token=${token}`;
    await emailService.sendEmail({
      to: owner!.email,
      subject: 'DOAPP — recuperar la contrasena de cambio de fase',
      html: `<p>Hola ${owner!.name},</p>
        <p>Pediste cambiar la contrasena que protege el cambio de fase de la plataforma
        (beta / real). El enlace sirve una sola vez y vence en 30 minutos:</p>
        <p><a href="${url}">${url}</a></p>
        <p>Si no fuiste vos, ignora este correo: la contrasena actual sigue funcionando.</p>`,
    });

    await logAudit({
      req, action: 'platform_phase_password_reset_requested', category: 'system',
      severity: getSeverityForAction('platform_phase_password_reset_requested'),
      description: 'Se pidio recuperar la contrasena de cambio de fase',
      targetModel: 'AppSetting', targetId: ACTIONS.PLATFORM_PHASE,
    });
    res.json({ success: true, message: 'Te enviamos un enlace por correo' });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/platform/phase-password/reset
router.post('/phase-password/reset', async (req: AuthRequest, res: Response) => {
  try {
    const { token, password } = req.body || {};
    const result = await completeActionPasswordReset(ACTIONS.PLATFORM_PHASE, String(token || ''), String(password || ''));
    if (!result.ok) { res.status(400).json({ success: false, message: result.message }); return; }

    await logAudit({
      req, action: 'platform_phase_password_reset', category: 'system',
      severity: getSeverityForAction('platform_phase_password_reset'),
      description: 'Se cambio la contrasena de cambio de fase',
      targetModel: 'AppSetting', targetId: ACTIONS.PLATFORM_PHASE,
    });
    res.json({ success: true, message: 'Contrasena actualizada' });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/platform/phase
// @desc  Switch between beta and live. Requires the action password.
router.post('/phase', async (req: AuthRequest, res: Response) => {
  try {
    const { phase, password } = req.body || {};
    if (phase !== 'beta' && phase !== 'live') {
      res.status(400).json({ success: false, message: 'Fase invalida' });
      return;
    }

    if (!(await isActionPasswordSet(ACTIONS.PLATFORM_PHASE))) {
      res.status(400).json({ success: false, message: 'Primero crea la contrasena de cambio de fase', needsSetup: true });
      return;
    }

    if (!(await verifyActionPassword(ACTIONS.PLATFORM_PHASE, String(password || '')))) {
      // A failed attempt at the switch that turns commission on is worth a
      // record of its own, not just a 401 the caller sees and forgets.
      await logAudit({
        req, action: 'platform_phase_change_denied', category: 'system',
        severity: getSeverityForAction('platform_phase_change_denied'),
        description: `Intento fallido de cambiar la fase a ${phase}: contrasena incorrecta`,
        targetModel: 'AppSetting', targetId: ACTIONS.PLATFORM_PHASE,
      });
      res.status(401).json({ success: false, message: 'Contrasena incorrecta' });
      return;
    }

    const before = (await getPhaseInfo()).phase;
    await setPlatformPhase(phase as PlatformPhase, req.user!.id);

    await logAudit({
      req, action: 'platform_phase_changed', category: 'system',
      severity: getSeverityForAction('platform_phase_changed'),
      description: `Fase de la plataforma: ${before} -> ${phase}`,
      targetModel: 'AppSetting', targetId: ACTIONS.PLATFORM_PHASE,
      changes: [{ field: 'phase', oldValue: before, newValue: phase }],
    });

    res.json({ success: true, data: await getPhaseInfo(), betaEndsAt: BETA_ENDS_AT.toISOString() });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
