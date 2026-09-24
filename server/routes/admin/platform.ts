import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { User } from '../../models/sql/User.model.js';
import emailService from '../../services/email.js';
import { config } from '../../config/env.js';
import { logAudit, getSeverityForAction } from '../../utils/auditLog.js';
import {
  getPhaseInfo,
  setPlatformPhase,
  setFechasDeFase,
  fechasDeFase,
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
/**
 * Topes diarios de egreso por rol.
 * GET  /api/admin/platform/daily-caps
 * PUT  /api/admin/platform/daily-caps
 *
 * Solo el dueño. Un tope que puede subirse a sí mismo el que está limitado por
 * él no es un tope, es una sugerencia.
 */
router.get('/daily-caps', async (_req: AuthRequest, res: Response) => {
  try {
    const { topesVigentes, TOPE_DIARIO_POR_ROL_ARS, egresoDelDia } = await import(
      '../../services/paymentSafeguards.js'
    );
    const vigentes = await topesVigentes();

    // Infinity no sobrevive a JSON.stringify: se convierte en null, que es
    // justamente como se guarda "sin tope".
    const serializable = Object.fromEntries(
      Object.entries(vigentes).map(([r, v]) => [r, Number.isFinite(v) ? v : null]),
    );

    res.json({
      success: true,
      topes: serializable,
      porDefecto: Object.fromEntries(
        Object.entries(TOPE_DIARIO_POR_ROL_ARS).map(([r, v]) => [r, Number.isFinite(v) ? v : null]),
      ),
      // Cuánto lleva usado hoy quien consulta, para que el número tenga contexto.
      usadoHoy: await egresoDelDia(_req.user.id),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/daily-caps', async (req: AuthRequest, res: Response) => {
  try {
    const { topes } = req.body;
    if (!topes || typeof topes !== 'object') {
      res.status(400).json({ success: false, message: 'Mandá los topes por rol.' });
      return;
    }

    const { AppSetting } = await import('../../models/sql/AppSetting.model.js');
    const { CLAVE_TOPES, topesVigentes } = await import('../../services/paymentSafeguards.js');
    const { logMoneyEvent } = await import('../../utils/auditLog.js');

    const previos = await topesVigentes();
    const limpios: Record<string, number | null> = {};

    for (const [rol, valor] of Object.entries(topes)) {
      if (valor === null) {
        limpios[rol] = null; // sin tope
        continue;
      }
      const n = Number(valor);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({
          success: false,
          message: `El tope de "${rol}" tiene que ser un número mayor o igual a cero, o null para sin tope.`,
        });
        return;
      }
      limpios[rol] = n;
    }

    await AppSetting.upsert({
      key: CLAVE_TOPES,
      value: limpios,
      updatedBy: req.user.id,
    } as any);

    // Cambiar un tope es cambiar cuánta plata puede salir sin que nadie más
    // intervenga. Queda asentado con los valores viejos y los nuevos: es el
    // registro que explica por qué un día salió más de lo habitual.
    await logMoneyEvent({
      action: 'DAILY_CAPS_UPDATED',
      actor: `owner:${req.user.id}`,
      severity: 'critical',
      description: 'El dueño cambió los topes diarios de egreso por rol.',
      metadata: {
        anteriores: Object.fromEntries(
          Object.entries(previos).map(([r, v]) => [r, Number.isFinite(v) ? v : null]),
        ),
        nuevos: limpios,
        ownerId: req.user.id,
      },
    });

    res.json({ success: true, message: 'Topes actualizados.', topes: limpios });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

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
    const url = `${config.clientUrl || 'https://doapparg.com'}/admin/platform/reset?token=${token}`;
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

/**
 * Fechas de la beta y de la fase estable.
 * POST /api/admin/platform/phase-dates
 *
 * Mover estas fechas cambia cuándo empieza a cobrarse comisión, así que pasa
 * por la misma contraseña de acción y el mismo registro que el cambio de fase:
 * adelantar el cierre cobra comisión antes de lo anunciado, y atrasarlo
 * regala comisión. Las dos direcciones importan.
 */
router.post('/phase-dates', async (req: AuthRequest, res: Response) => {
  try {
    const { betaEndsAt, liveStartsAt, password } = req.body || {};

    if (!(await isActionPasswordSet(ACTIONS.PLATFORM_PHASE))) {
      res.status(400).json({ success: false, message: 'Primero creá la contraseña de cambio de fase', needsSetup: true });
      return;
    }
    if (!(await verifyActionPassword(ACTIONS.PLATFORM_PHASE, String(password || '')))) {
      await logAudit({
        req, action: 'platform_phase_change_denied', category: 'system',
        severity: getSeverityForAction('platform_phase_change_denied'),
        description: 'Intento fallido de cambiar las fechas de fase: contraseña incorrecta',
        targetModel: 'AppSetting', targetId: ACTIONS.PLATFORM_PHASE,
      });
      res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
      return;
    }

    const antes = fechasDeFase();
    const despues = await setFechasDeFase({ betaEndsAt, liveStartsAt }, req.user!.id);

    await logAudit({
      req, action: 'platform_phase_changed', category: 'system',
      severity: getSeverityForAction('platform_phase_changed'),
      description: `Fechas de fase: beta termina ${despues.betaEndsAt.toISOString()}, estable empieza ${despues.liveStartsAt.toISOString()}`,
      targetModel: 'AppSetting', targetId: ACTIONS.PLATFORM_PHASE,
      changes: [
        { field: 'betaEndsAt', oldValue: antes.betaEndsAt.toISOString(), newValue: despues.betaEndsAt.toISOString() },
        { field: 'liveStartsAt', oldValue: antes.liveStartsAt.toISOString(), newValue: despues.liveStartsAt.toISOString() },
      ],
    });

    res.json({ success: true, data: await getPhaseInfo() });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
});

/**
 * Tasas y alícuotas: procesamiento de la pasarela y IIBB.
 * GET  /api/admin/platform/fiscal
 * PUT  /api/admin/platform/fiscal
 *
 * No piden contraseña de acción como la fase: no cambian lo que ya se cobró
 * ni encienden la comisión, y el contador puede necesitar corregirlos el
 * mismo día que los recibe. Sí quedan auditados con el valor viejo y el nuevo.
 */
router.get('/fiscal', async (_req: AuthRequest, res: Response) => {
  try {
    const { ajustesVigentes } = await import('../../services/fiscalSettings.js');
    res.json({ success: true, data: ajustesVigentes() });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/fiscal', async (req: AuthRequest, res: Response) => {
  try {
    const { ajustesVigentes, guardarAjustesFiscales, AjusteInvalido } = await import(
      '../../services/fiscalSettings.js'
    );
    const antes = ajustesVigentes();

    try {
      const despues = await guardarAjustesFiscales(
        {
          tasaProcesamiento: req.body?.tasaProcesamiento,
          iibbRetencion: req.body?.iibbRetencion,
          iibbPropia: req.body?.iibbPropia,
        },
        req.user!.id,
      );

      await logAudit({
        req, action: 'platform_fiscal_changed', category: 'system',
        severity: 'high',
        description:
          `Tasas actualizadas: procesamiento ${antes.vigente.tasaProcesamiento} -> ${despues.vigente.tasaProcesamiento}, ` +
          `retención IIBB ${antes.vigente.iibbRetencion} -> ${despues.vigente.iibbRetencion}, ` +
          `IIBB propio ${antes.vigente.iibbPropia} -> ${despues.vigente.iibbPropia}`,
        targetModel: 'AppSetting', targetId: 'platform:fiscal',
        changes: [
          { field: 'tasaProcesamiento', oldValue: antes.vigente.tasaProcesamiento, newValue: despues.vigente.tasaProcesamiento },
          { field: 'iibbRetencion', oldValue: antes.vigente.iibbRetencion, newValue: despues.vigente.iibbRetencion },
          { field: 'iibbPropia', oldValue: antes.vigente.iibbPropia, newValue: despues.vigente.iibbPropia },
        ],
      });

      res.json({ success: true, data: despues });
    } catch (e: any) {
      // Un número fuera de rango es culpa de quien lo escribió, no del
      // servidor: 400 con el motivo, no 500.
      if (e instanceof AjusteInvalido) {
        res.status(400).json({ success: false, message: e.message });
        return;
      }
      throw e;
    }
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
