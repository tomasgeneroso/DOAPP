import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import disputeAnalytics from '../../services/disputeAnalytics.js';

const router = Router();

/**
 * GET /api/analytics/disputes/metrics
 * Get comprehensive dispute metrics
 */
router.get(
  '/metrics',
  protect,
  authorize('owner', 'super_admin', 'moderator'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const metrics = await disputeAnalytics.getDisputeMetrics(start, end);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo métricas',
      });
    }
  }
);

/**
 * GET /api/analytics/disputes/performance
 * Get dispute performance analytics
 */
router.get(
  '/performance',
  protect,
  authorize('owner', 'super_admin', 'moderator'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const performance = await disputeAnalytics.getDisputePerformance();

      res.json({
        success: true,
        data: performance,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo performance',
      });
    }
  }
);

/**
 * GET /api/analytics/disputes/health
 * Get dispute system health score
 */
router.get(
  '/health',
  protect,
  authorize('owner', 'super_admin', 'moderator'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const healthScore = await disputeAnalytics.getDisputeHealthScore();

      let status: 'excellent' | 'good' | 'fair' | 'poor';
      if (healthScore >= 80) status = 'excellent';
      else if (healthScore >= 60) status = 'good';
      else if (healthScore >= 40) status = 'fair';
      else status = 'poor';

      res.json({
        success: true,
        data: {
          score: healthScore,
          status,
          description: getHealthDescription(status),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo health score',
      });
    }
  }
);

/**
 * GET /api/analytics/disputes/trends
 * Get dispute trends over time
 */
router.get(
  '/trends',
  protect,
  authorize('owner', 'super_admin', 'moderator'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { days = 30 } = req.query;
      const daysNum = parseInt(days as string, 10);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);

      const metrics = await disputeAnalytics.getDisputeMetrics(startDate, new Date());

      res.json({
        success: true,
        data: {
          period: `${daysNum} days`,
          trends: metrics.trendData,
          summary: {
            totalCreated: metrics.trendData.reduce((sum, d) => sum + d.created, 0),
            totalResolved: metrics.trendData.reduce((sum, d) => sum + d.resolved, 0),
            averageCreatedPerDay: Math.round(
              (metrics.trendData.reduce((sum, d) => sum + d.created, 0) / daysNum) * 100
            ) / 100,
            averageResolvedPerDay: Math.round(
              (metrics.trendData.reduce((sum, d) => sum + d.resolved, 0) / daysNum) * 100
            ) / 100,
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo tendencias',
      });
    }
  }
);

/**
 * GET /api/analytics/disputes/categories
 * Get dispute category breakdown
 */
router.get(
  '/categories',
  protect,
  authorize('owner', 'super_admin', 'moderator'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const performance = await disputeAnalytics.getDisputePerformance();

      res.json({
        success: true,
        data: {
          topCategories: performance.topCategories,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo categorías',
      });
    }
  }
);

/**
 * Helper: Get health description
 */
function getHealthDescription(status: string): string {
  switch (status) {
    case 'excellent':
      return 'El sistema de disputas funciona excelentemente. Buen ratio de resolución y tiempos óptimos.';
    case 'good':
      return 'El sistema de disputas funciona bien. Hay margen de mejora en tiempos de resolución.';
    case 'fair':
      return 'El sistema de disputas requiere atención. Considere revisar procesos de resolución.';
    case 'poor':
      return 'El sistema de disputas tiene problemas significativos. Acción inmediata requerida.';
    default:
      return 'Estado desconocido';
  }
}

export default router;
