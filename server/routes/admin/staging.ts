import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { logAudit, getSeverityForAction } from '../../utils/auditLog.js';
import {
  esStaging,
  infoDeDespliegue,
  promoverAProduccion,
  PromocionInvalida,
} from '../../services/deployInfo.js';
import { ACTIONS, isActionPasswordSet, verifyActionPassword } from '../../services/actionPassword.js';

/**
 * Promover staging a producción, desde staging.
 *
 * Cuatro cosas tienen que ser ciertas para que este endpoint haga algo:
 *
 *  1. La instancia es staging. En producción el router ni siquiera se monta
 *     —ver server/index.ts—, así que ahí la ruta devuelve 404 y no hay
 *     superficie que auditar. Es la garantía fuerte; las otras tres son
 *     defensa en profundidad.
 *  2. Quien pide es el dueño.
 *  3. Puso la contraseña de acción, que es distinta de la de la sesión. Una
 *     sesión abierta en una computadora prestada no alcanza para publicar.
 *  4. El commit que dice promover es el que staging está corriendo. Si staging
 *     se actualizó entre que miró la pantalla y apretó el botón, no probó lo
 *     que está por publicar.
 *
 * Todo intento queda auditado, el que sale bien y el que no. Un deploy a
 * producción sin registro de quién y cuándo es la clase de dato que se
 * necesita justo el día que algo se rompió.
 */
const router = Router();

/**
 * Estado, para pintar la barra. Sin contraseña: es lectura, y el dueño necesita
 * ver qué está corriendo ANTES de decidir si promueve.
 */
router.get('/status', protect, authorize('owner'), async (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        ...(await infoDeDespliegue()),
        passwordSet: await isActionPasswordSet(ACTIONS.PROMOTE_TO_PROD),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/promote', protect, authorize('owner'), async (req: AuthRequest, res: Response) => {
  const { commit, password } = req.body || {};

  try {
    if (!esStaging()) {
      res.status(403).json({ success: false, message: 'Promover sólo se puede desde staging.' });
      return;
    }

    if (!(await isActionPasswordSet(ACTIONS.PROMOTE_TO_PROD))) {
      res.status(400).json({
        success: false,
        message:
          'Todavía no hay contraseña para promover a producción. Creala antes de usar el botón.',
        code: 'SIN_PASSWORD',
      });
      return;
    }

    if (!(await verifyActionPassword(ACTIONS.PROMOTE_TO_PROD, String(password || '')))) {
      // Se audita el intento fallido: es la única forma de enterarse de que
      // alguien está probando contraseñas contra el botón que publica.
      await logAudit({
        req,
        action: 'staging_promote_denied',
        category: 'system',
        severity: getSeverityForAction('staging_promote_denied'),
        description: 'Intento de promover a produccion con contrasena incorrecta',
        targetModel: 'Deploy',
        targetId: String(commit || '').slice(0, 40),
      });
      res.status(401).json({ success: false, message: 'Contraseña incorrecta.' });
      return;
    }

    await logAudit({
      req,
      action: 'staging_promote_start',
      category: 'system',
      severity: getSeverityForAction('staging_promote_start'),
      description: `Empieza la promocion de ${String(commit || '').slice(0, 7)} a produccion`,
      targetModel: 'Deploy',
      targetId: String(commit || '').slice(0, 40),
    });

    const resultado = await promoverAProduccion(String(commit || ''));

    await logAudit({
      req,
      action: 'staging_promote_ok',
      category: 'system',
      severity: getSeverityForAction('staging_promote_ok'),
      description: `Produccion quedo en ${resultado.sha.slice(0, 7)}`,
      targetModel: 'Deploy',
      targetId: resultado.sha,
      metadata: { duracionMs: resultado.duracionMs },
    });

    res.json({
      success: true,
      message: `Producción quedó en ${resultado.sha.slice(0, 7)}.`,
      data: resultado,
    });
  } catch (error: any) {
    const invalida = error instanceof PromocionInvalida;

    await logAudit({
      req,
      action: 'staging_promote_fail',
      category: 'system',
      severity: getSeverityForAction('staging_promote_fail'),
      description: 'Fallo la promocion a produccion',
      targetModel: 'Deploy',
      targetId: String(commit || '').slice(0, 40),
      // El mensaje completo importa: ahi esta en que paso murio el deploy.
      metadata: { error: String(error?.message || '').slice(0, 4000) },
    }).catch(() => {
      /* si ni el registro se puede escribir, igual hay que responderle al usuario */
    });

    res.status(invalida ? 409 : 500).json({
      success: false,
      message: error.message || 'La promoción falló.',
    });
  }
});

export default router;
