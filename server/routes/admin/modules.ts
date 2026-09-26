import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { ModuleConfig } from '../../models/sql/ModuleConfig.model.js';
import { olvidarModulos } from '../../services/moduleFlags.js';
import { logAudit, getSeverityForAction } from '../../utils/auditLog.js';
import { ACTIONS, isActionPasswordSet, verifyActionPassword } from '../../services/actionPassword.js';
import { MODULO_PAGO_AL_TERMINAR } from '../../../shared/pagos/modoDePago.js';

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

// Módulos disponibles (seed inicial)
const DEFAULT_MODULES = [
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
    const faltantes = DEFAULT_MODULES.filter((d) => !existentes.has(d.moduleId));

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
          targetId: req.params.moduleId,
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

    if (sensible && antes !== module.isActive) {
      await logAudit({
        req,
        action: module.isActive ? 'module_enabled' : 'module_disabled',
        category: 'system',
        severity: getSeverityForAction(module.isActive ? 'module_enabled' : 'module_disabled'),
        description: `${module.name}: ${antes ? 'activo' : 'inactivo'} -> ${module.isActive ? 'activo' : 'inactivo'}`,
        targetModel: 'ModuleConfig',
        targetId: req.params.moduleId,
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
