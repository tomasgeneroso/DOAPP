import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { ModuleConfig } from '../../models/sql/ModuleConfig.model.js';
import { olvidarModulos } from '../../services/moduleFlags.js';
import { logAudit, getSeverityForAction } from '../../utils/auditLog.js';
import { ACTIONS, isActionPasswordSet, verifyActionPassword } from '../../services/actionPassword.js';
import { MODULO_PAGO_AL_TERMINAR } from '../../../shared/pagos/modoDePago.js';
import { MODULO_APROBACION_DE_PUBLICACIONES, MODULO_VERIFICACION_DIDIT } from '../../../shared/constants/modulos.js';
import { diditConfigProblem, verificacionConDiditActiva, fijarVerificacionConDidit } from '../../services/didit.js';
import { cargarVerificacionDelPanel } from '../../services/verificacionDelPanel.js';

const router = Router();

// Protección: solo admin
router.use(protect, authorize('admin', 'owner'));

/**
 * Módulos que no se prenden y apagan como una preferencia de interfaz.
 *
 * El pago al terminar cambia quién corre el riesgo en cada trabajo que se
 * publique después, y agrega cláusulas a los términos y condiciones. Pide el
 * dueño, contraseña de acción, y deja asiento. Los otros módulos siguen como
 * estaban: encender y apagar un panel de analytics no necesita ceremonia.
 */
const MODULOS_SENSIBLES: Record<string, { accion: (typeof ACTIONS)[keyof typeof ACTIONS] }> = {
  [MODULO_PAGO_AL_TERMINAR]: { accion: ACTIONS.PAYMENT_MODE },
};

/**
 * Módulos que cambia SOLO el dueño y que dejan asiento, sin contraseña de acción (no mueven plata ni cambian los términos, pero sí cambian a quién se le exige qué).
 * La verificación con Didit: encendida, el registro pide documento y selfie (y gasta créditos de Didit); apagada, solo el número de DNI.
 */
const MODULOS_DEL_DUENO: ReadonlySet<string> = new Set([MODULO_VERIFICACION_DIDIT]);

// Módulos disponibles (seed inicial)
export const DEFAULT_MODULES = [
  {
    moduleId: MODULO_VERIFICACION_DIDIT,
    category: 'identity',
    name: 'Verificación de identidad con Didit',
    description:
      'Encendido: el registro pide documento y selfie con Didit (cada verificación gasta créditos de Didit) y solo las personas verificadas reciben el beneficio de lanzamiento. ' +
      'Apagado: el registro pide solo el número de DNI; quien lo completa puede publicar, postularse y cobrar, pero no queda «verificada». ' +
      'Lo cambia solo el dueño y queda anotado. No se puede encender si Didit no tiene sus claves en el servidor.',
    isActive: false,
  },
  {
    moduleId: 'payment:mercadopago',
    category: 'payment',
    name: 'MercadoPago',
    description: 'Pagos via MercadoPago (tarjetas, transferencia, etc.)',
    isActive: true,
  },
  {
    moduleId: 'payment:astropay',
    category: 'payment',
    name: 'AstroPay',
    description: 'Pagos via AstroPay (sin credenciales de comercio — desactivado)',
    isActive: false,
  },
  {
    moduleId: 'payment:binance',
    category: 'payment',
    name: 'Binance Pay',
    description: 'Pagos via Binance Pay (USDT, BNB, etc.)',
    isActive: true,
  },
  {
    moduleId: 'payment:bank_transfer',
    category: 'payment',
    name: 'Transferencia bancaria',
    description: 'Transferencia manual con comprobante (24-48hs)',
    isActive: true,
  },
  {
    moduleId: MODULO_PAGO_AL_TERMINAR,
    category: 'payment',
    name: 'Pago al terminar (sin protección)',
    description:
      'Permite publicar trabajos sin dinero retenido: el cliente paga cuando el trabajo está hecho, ' +
      'por una orden que genera la app. Cambia quién corre el riesgo y agrega cláusulas a los ' +
      'términos. Apagado por defecto; cambiarlo pide contraseña.',
    isActive: false,
  },
  {
    moduleId: MODULO_APROBACION_DE_PUBLICACIONES,
    category: 'feature',
    name: 'Aprobación de publicaciones pagadas',
    description:
      'Encendido: cuando el cliente paga la publicación, un administrador la tiene que aprobar antes de que se vea. ' +
      'Apagado: se publica apenas se confirma el pago. Regla de la etapa de lanzamiento.',
    isActive: true,
  },
  {
    moduleId: 'dashboard:analytics',
    category: 'dashboard',
    name: 'Analytics',
    description: 'Sección de analytics en el dashboard',
    isActive: true,
  },
  {
    moduleId: 'dashboard:performance',
    category: 'dashboard',
    name: 'Performance',
    description: 'Sección de performance/performance metrics',
    isActive: true,
  },
  {
    moduleId: 'admin:security',
    category: 'admin',
    name: 'Security Dashboard',
    description: 'Panel de seguridad admin',
    isActive: true,
  },
  {
    moduleId: 'admin:blogs',
    category: 'admin',
    name: 'Blog Management',
    description: 'Gestión de blogs',
    isActive: true,
  },
];

/**
 * GET /api/admin/modules
 * Listar todos los módulos y su estado
 */
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    let modules = await ModuleConfig.findAll({ order: [['category', 'ASC']] });

    /**
     * Sembrar los que falten, no sólo cuando la tabla está vacía.
     *
     * Antes se sembraba únicamente con la tabla en cero, así que un módulo
     * agregado después de la primera corrida no aparecía nunca en el panel: la
     * tabla ya tenía filas, la condición no se cumplía, y el módulo existía en
     * el código y en ningún lado más. Se crea sólo lo que falta, para no pisar
     * el estado de los que ya están.
     */
    const existentes = new Set(modules.map((m) => m.moduleId));
    // La verificación con Didit se siembra con lo que HOY está rigiendo (la variable de entorno de partida): abrir el panel por primera vez no puede cambiar el comportamiento.
    const faltantes = DEFAULT_MODULES.filter((d) => !existentes.has(d.moduleId)).map((d) => (d.moduleId === MODULO_VERIFICACION_DIDIT ? { ...d, isActive: verificacionConDiditActiva() } : d));

    if (faltantes.length > 0) {
      await ModuleConfig.bulkCreate(faltantes);
      console.log(`✅ ${faltantes.length} módulo(s) nuevo(s): ${faltantes.map((f) => f.moduleId).join(', ')}`);
      modules = await ModuleConfig.findAll({ order: [['category', 'ASC']] });
    }

    res.json({
      success: true,
      modules: modules.map((m) => ({
        moduleId: m.moduleId,
        category: m.category,
        name: m.name,
        description: m.description,
        isActive: m.isActive,
        config: m.config,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/admin/modules/:moduleId
 * Obtener detalle de un módulo
 */
router.get('/:moduleId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const module = await ModuleConfig.findByPk(req.params.moduleId);

    if (!module) {
      res.status(404).json({ success: false, message: 'Module not found' });
      return;
    }

    res.json({
      success: true,
      module: {
        moduleId: module.moduleId,
        category: module.category,
        name: module.name,
        description: module.description,
        isActive: module.isActive,
        config: module.config,
      },
    });
  } catch (error: any) {
    console.error('Error fetching module:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/admin/modules/:moduleId
 * Actualizar estado / config de un módulo
 */
router.patch('/:moduleId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { isActive, config, password } = req.body;

    const module = await ModuleConfig.findByPk(req.params.moduleId);
    if (!module) {
      res.status(404).json({ success: false, message: 'Module not found' });
      return;
    }

    const delDueno = MODULOS_DEL_DUENO.has(req.params.moduleId);
    if (delDueno) {
      if (req.user?.adminRole !== 'owner' && req.user?.role !== 'owner') {
        res.status(403).json({ success: false, message: 'Este módulo lo cambia sólo el dueño.' });
        return;
      }
      if (isActive !== undefined && typeof isActive !== 'boolean') {
        res.status(400).json({ success: false, message: 'isActive tiene que ser verdadero o falso.' });
        return;
      }
      // Encender sin las claves de Didit dejaría el registro pidiendo un documento que nadie puede verificar.
      if (isActive === true && diditConfigProblem()) {
        res.status(409).json({
          success: false,
          code: 'DIDIT_SIN_CLAVES',
          message: 'No se puede encender: Didit no tiene sus claves en el servidor (falta DIDIT_API_KEY en el .env). Cargalas, reiniciá la app y probá de nuevo.',
        });
        return;
      }
    }

    const sensible = MODULOS_SENSIBLES[req.params.moduleId];
    if (sensible) {
      if (req.user?.adminRole !== 'owner' && req.user?.role !== 'owner') {
        res.status(403).json({ success: false, message: 'Este módulo lo cambia sólo el dueño.' });
        return;
      }

      if (!(await isActionPasswordSet(sensible.accion))) {
        res.status(400).json({
          success: false,
          code: 'SIN_PASSWORD',
          message:
            'Este módulo necesita una contraseña propia y todavía no existe. Creala antes de cambiarlo.',
        });
        return;
      }

      if (!(await verifyActionPassword(sensible.accion, String(password || '')))) {
        await logAudit({
          req,
          action: 'module_change_denied',
          category: 'system',
          severity: getSeverityForAction('module_change_denied'),
          description: `Intento de cambiar ${req.params.moduleId} con contrasena incorrecta`,
          targetModel: 'ModuleConfig',
          // `targetId` es una columna UUID y el id de un módulo es texto («payment:on_completion»): ahí el INSERT fallaba y `logAudit` lo tragaba en silencio,
          // así que estos asientos nunca se guardaron. El id del módulo va en `targetIdentifier` (texto).
          targetIdentifier: req.params.moduleId,
        });
        res.status(401).json({ success: false, message: 'Contraseña incorrecta.' });
        return;
      }
    }

    const antes = module.isActive;

    if (isActive !== undefined) module.isActive = isActive;
    if (config !== undefined) module.config = config;

    await module.save();

    // La caché del servidor tiene 30 segundos de vida; apagar un módulo por un
    // problema no puede esperar medio minuto mientras sigue entrando trabajo.
    olvidarModulos(req.params.moduleId);
    // La verificación con Didit la leen puertas y pantallas de forma síncrona: se actualiza en este proceso ya mismo (los demás la toman con el refresco periódico).
    if (req.params.moduleId === MODULO_VERIFICACION_DIDIT) fijarVerificacionConDidit(module.isActive);

    if ((sensible || delDueno) && antes !== module.isActive) {
      await logAudit({
        req,
        action: module.isActive ? 'module_enabled' : 'module_disabled',
        category: 'system',
        severity: getSeverityForAction(module.isActive ? 'module_enabled' : 'module_disabled'),
        description: `${module.name}: ${antes ? 'activo' : 'inactivo'} -> ${module.isActive ? 'activo' : 'inactivo'}`,
        targetModel: 'ModuleConfig',
        targetIdentifier: req.params.moduleId, // no `targetId`: es UUID (ver arriba)
        changes: [{ field: 'isActive', oldValue: antes, newValue: module.isActive }],
      });
    }

    console.log(
      `✅ Module ${req.params.moduleId} updated: isActive=${module.isActive}`,
    );

    res.json({
      success: true,
      message: `Module ${req.params.moduleId} updated`,
      module: {
        moduleId: module.moduleId,
        category: module.category,
        name: module.name,
        description: module.description,
        isActive: module.isActive,
        config: module.config,
      },
    });
  } catch (error: any) {
    console.error('Error updating module:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/admin/modules/reset
 * Resetear todos los módulos a su estado por defecto
 */
router.post('/reset', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ModuleConfig.destroy({ where: {} });
    const modules = await ModuleConfig.bulkCreate(DEFAULT_MODULES);
    // Volver a los valores de fábrica también apaga la verificación con Didit: el proceso tiene que enterarse ya.
    await cargarVerificacionDelPanel().catch(() => null);

    console.log(`✅ Reset ${modules.length} modules to defaults`);

    res.json({
      success: true,
      message: 'All modules reset to default',
      modules: modules.map((m) => ({
        moduleId: m.moduleId,
        category: m.category,
        name: m.name,
        description: m.description,
        isActive: m.isActive,
      })),
    });
  } catch (error: any) {
    console.error('Error resetting modules:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
