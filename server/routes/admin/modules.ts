import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { ModuleConfig } from '../../models/sql/ModuleConfig.model.js';

const router = Router();

// Protección: solo admin
router.use(protect, authorize('admin', 'owner'));

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
    description: 'Pagos via AstroPay',
    isActive: true,
  },
  {
    moduleId: 'payment:binance',
    category: 'payment',
    name: 'Binance Pay',
    description: 'Pagos via Binance Pay (USDT, BNB, etc.)',
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

    // Si la tabla está vacía, crear los módulos por defecto
    if (modules.length === 0) {
      modules = await ModuleConfig.bulkCreate(DEFAULT_MODULES);
      console.log(`✅ Initialized ${modules.length} default modules`);
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
    const { isActive, config } = req.body;

    const module = await ModuleConfig.findByPk(req.params.moduleId);
    if (!module) {
      res.status(404).json({ success: false, message: 'Module not found' });
      return;
    }

    if (isActive !== undefined) module.isActive = isActive;
    if (config !== undefined) module.config = config;

    await module.save();

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
