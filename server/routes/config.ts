import { Router, Response, Request } from 'express';
import { ModuleConfig } from '../models/sql/ModuleConfig.model.js';
import astropayService from '../services/astropay.js';
import { getPhaseInfo } from '../services/platformPhase.js';

const router = Router();

/**
 * Runtime availability checks for modules whose usefulness depends on
 * credentials rather than on the admin toggle.
 *
 * The `module_configs` row says what an admin *wants* enabled; this says what
 * the deployment can actually deliver. AstroPay was flagged active in the DB
 * with no merchant credentials, so checkout advertised it and then failed with
 * "AstroPay no está configurado" the moment anyone chose it. A module must
 * clear both gates to be published.
 *
 * Default is permissive: a module with no entry here is governed by its DB flag
 * alone, so adding a provider never silently hides it.
 */
const PROVIDER_AVAILABLE: Record<string, () => boolean> = {
  'payment:astropay': () => astropayService.isAvailable(),
};

function isDeliverable(moduleId: string): boolean {
  const check = PROVIDER_AVAILABLE[moduleId];
  return check ? check() : true;
}

/**
 * GET /api/config/phase
 *
 * Public because the phase has to be visible before login: the registration
 * confirmation and onboarding both announce the beta, and neither has a user
 * to read it from yet. Nothing here is sensitive — it is the same thing the
 * banner says to everyone.
 */
router.get('/phase', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getPhaseInfo() });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});
/**
 * GET /api/config/modules
 * Obtener lista de módulos activos (público, sin autenticación requerida)
 * El frontend lo consulta para saber qué features renderizar
 */
router.get('/modules', async (_req: Request, res: Response) => {
  try {
    // Caché en memoria simple: 5 minutos
    const cacheKey = 'config:modules';
    const now = Date.now();

    // Verificar si está en caché
    if ((global as any).moduleConfigCache && (global as any).moduleConfigCacheTime) {
      if (now - (global as any).moduleConfigCacheTime < 5 * 60 * 1000) {
        res.json({
          success: true,
          modules: (global as any).moduleConfigCache,
          cached: true,
        });
        // Without this the handler carried on to query the DB and respond a
        // second time (ERR_HTTP_HEADERS_SENT on every cache hit).
        return;
      }
    }

    // Obtener de la BD
    const modules = await ModuleConfig.findAll({ where: { isActive: true } });
    const activeModules = modules
      .filter((m) => isDeliverable(m.moduleId))
      .map((m) => ({
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
        // AstroPay intentionally absent: this fallback runs when the DB lookup
        // fails, and advertising a provider without credentials is what caused
        // the "AstroPay no está configurado" crash at checkout.
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
