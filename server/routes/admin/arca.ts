import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { logAudit, getSeverityForAction } from '../../utils/auditLog.js';
import {
  isArcaEnabled,
  isArcaConfigured,
  setArcaEnabled,
  consultarPadron,
} from '../../services/arcaPadron.js';

/**
 * Verificación fiscal contra ARCA.
 *
 * Va apagada por defecto y se enciende desde acá. Dos motivos para que sea un
 * interruptor y no una constante: sin certificado digital no hay nada que
 * consultar, y si ARCA se cae conviene poder apagarla sin desplegar.
 */
const router = Router();
router.use(protect, authorize('admin', 'super_admin', 'owner'));

// @route GET /api/admin/arca/status
router.get('/status', async (_req: AuthRequest, res: Response) => {
  try {
    const enabled = await isArcaEnabled();
    const configured = isArcaConfigured();
    res.json({
      success: true,
      data: {
        enabled,
        configured,
        ambiente: process.env.ARCA_ENV === 'production' ? 'produccion' : 'homologacion',
        // Se dice qué falta, no sólo que falta: el trámite es lento y conviene
        // que quien lea esto sepa exactamente qué pedir.
        faltante: configured
          ? null
          : 'Falta el certificado digital de ARCA. Se tramita con clave fiscal y se carga en ARCA_CUIT, ARCA_CERT y ARCA_KEY.',
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/arca/toggle
router.post('/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;

    if (enabled && !isArcaConfigured()) {
      res.status(400).json({
        success: false,
        message: 'No se puede activar sin el certificado digital cargado.',
      });
      return;
    }

    await setArcaEnabled(enabled, req.user!.id);
    await logAudit({
      req,
      action: enabled ? 'arca_enabled' : 'arca_disabled',
      category: 'system',
      severity: getSeverityForAction(enabled ? 'arca_enabled' : 'arca_disabled'),
      description: enabled
        ? 'Se activo la verificacion fiscal con ARCA'
        : 'Se desactivo la verificacion fiscal con ARCA',
      targetModel: 'AppSetting',
      targetId: 'arca_padron',
    });

    res.json({
      success: true,
      message: enabled ? 'Verificación con ARCA activada' : 'Verificación con ARCA desactivada',
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route POST /api/admin/arca/consultar
// @desc  Probar la consulta con un CUIT, sin tocar ningún usuario.
router.post('/consultar', async (req: AuthRequest, res: Response) => {
  try {
    const result = await consultarPadron(String(req.body?.cuit || ''));
    res.status(result.ok ? 200 : 422).json({
      success: result.ok,
      message: result.message,
      reason: result.reason,
      data: result.data,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
