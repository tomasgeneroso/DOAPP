import { Router, Response, Request } from 'express';
import { ModuleConfig } from '../models/sql/ModuleConfig.model.js';

const router = Router();

/**
 * GET /api/config/modules
 * Obtener lista de módulos activos (público, sin autenticación requerida)
 * El frontend lo consulta para saber qué features renderizar
 */
router.get('/modules', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Caché en memoria simple: 5 minutos
    const cacheKey = 'config:modules';
    const now = Date.now();

    // Verificar si está en caché
    if ((global as any).moduleConfigCache && (global as any).moduleConfigCacheTime) {
      if (now - (global as any).moduleConfigCacheTime < 5 * 60 * 1000) {
        return res.json({
          success: true,
          modules: (global as any).moduleConfigCache,
          cached: true,
        });
      }
    }

    // Obtener de la BD
    const modules = await ModuleConfig.findAll({ where: { isActive: true } });
    const activeModules = modules.map((m) => ({
      moduleId: m.moduleId,
      category: m.category,
      name: m.name,
    }));

    // Guardar en caché
    (global as any).moduleConfigCache = activeModules;
    (global as any).moduleConfigCacheTime = now;

    res.json({
      success: true,
      modules: activeModules,
      cached: false,
    });
  } catch (error: any) {
    console.error('Error fetching active modules:', error);
    // Fallback: devolver todos los módulos por defecto si falla
    res.json({
      success: true,
      modules: [
        { moduleId: 'payment:mercadopago', category: 'payment', name: 'MercadoPago' },
        { moduleId: 'payment:astropay', category: 'payment', name: 'AstroPay' },
        { moduleId: 'payment:binance', category: 'payment', name: 'Binance Pay' },
        { moduleId: 'dashboard:analytics', category: 'dashboard', name: 'Analytics' },
        { moduleId: 'dashboard:performance', category: 'dashboard', name: 'Performance' },
      ],
      cached: false,
    });
  }
});

/**
 * GET /api/config/modules/:category
 * Obtener módulos activos de una categoría (ej: /api/config/modules/payment)
 */
router.get('/modules/:category', async (req: Request, res: Response): Promise<void> => {
  try {
    const modules = await ModuleConfig.findAll({
      where: { category: req.params.category, isActive: true },
    });

    res.json({
      success: true,
      category: req.params.category,
      modules: modules.map((m) => ({
        moduleId: m.moduleId,
        name: m.name,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching modules by category:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
