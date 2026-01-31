import express, { Response } from "express";
import { protect } from "../../middleware/auth.js";
import { checkPermission } from "../../middleware/checkPermission.js";
import type { AuthRequest } from "../../types/index.js";
import performanceMonitor from "../../services/performanceMonitor.js";
import cacheService from "../../services/cacheService.js";
import { getWafStats, getBlockedIPs, getSuspiciousBots } from "../../middleware/waf.js";
import imageOptimization from "../../services/imageOptimization.js";

const router = express.Router();

// All routes require admin access
router.use(protect);
router.use(checkPermission(['owner', 'super_admin', 'admin']));

/**
 * @route   GET /api/admin/performance/summary
 * @desc    Get performance summary
 * @access  Admin
 */
router.get("/summary", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const summary = performanceMonitor.getSummary();
    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error("Error getting performance summary:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * @route   GET /api/admin/performance/routes
 * @desc    Get route-by-route breakdown
 * @access  Admin
 */
router.get("/routes", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const breakdown = performanceMonitor.getRouteBreakdown();
    res.json({
      success: true,
      data: breakdown,
    });
  } catch (error: any) {
    console.error("Error getting route breakdown:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * @route   GET /api/admin/performance/slow-requests
 * @desc    Get slow requests list
 * @access  Admin
 */
router.get("/slow-requests", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const slowRequests = performanceMonitor.getSlowRequests();
    res.json({
      success: true,
      data: slowRequests,
    });
  } catch (error: any) {
    console.error("Error getting slow requests:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * @route   GET /api/admin/performance/timeline
 * @desc    Get requests over time for charts
 * @access  Admin
 */
router.get("/timeline", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { interval = "1", periods = "60" } = req.query;
    const timeline = performanceMonitor.getRequestsOverTime(
      parseInt(interval as string, 10),
      parseInt(periods as string, 10)
    );
    res.json({
      success: true,
      data: timeline,
    });
  } catch (error: any) {
    console.error("Error getting timeline:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * @route   GET /api/admin/performance/report
 * @desc    Get full performance report with recommendations
 * @access  Admin
 */
router.get("/report", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const report = performanceMonitor.generateReport();
    res.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    console.error("Error generating report:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * @route   POST /api/admin/performance/reset
 * @desc    Reset performance metrics (owner only)
 * @access  Owner
 */
router.post("/reset", checkPermission(['owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    performanceMonitor.reset();
    res.json({
      success: true,
      message: "Performance metrics reset successfully",
    });
  } catch (error: any) {
    console.error("Error resetting metrics:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// ============================================
// CACHE ANALYTICS
// ============================================

/**
 * @route   GET /api/admin/performance/cache
 * @desc    Get cache analytics
 * @access  Admin
 */
router.get("/cache", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const analytics = cacheService.getAnalytics();
    res.json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    console.error("Error getting cache analytics:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * @route   POST /api/admin/performance/cache/clear
 * @desc    Clear cache (owner only)
 * @access  Owner
 */
router.post("/cache/clear", checkPermission(['owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pattern } = req.body;
    let cleared = 0;

    if (pattern) {
      cleared = cacheService.delPattern(pattern);
    } else {
      const stats = cacheService.getStats();
      cleared = stats.size;
      cacheService.clear();
    }

    res.json({
      success: true,
      message: `Cache cleared: ${cleared} entries removed`,
      cleared,
    });
  } catch (error: any) {
    console.error("Error clearing cache:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// ============================================
// WAF STATISTICS
// ============================================

/**
 * @route   GET /api/admin/performance/waf
 * @desc    Get WAF statistics
 * @access  Admin
 */
router.get("/waf", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = getWafStats();
    const blockedIPs = getBlockedIPs();
    const suspiciousBots = getSuspiciousBots();

    res.json({
      success: true,
      data: {
        stats,
        blockedIPs,
        suspiciousBots,
      },
    });
  } catch (error: any) {
    console.error("Error getting WAF stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// ============================================
// IMAGE OPTIMIZATION
// ============================================

/**
 * @route   GET /api/admin/performance/images
 * @desc    Get image optimization stats and storage
 * @access  Admin
 */
router.get("/images", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const optimizationStats = imageOptimization.getOptimizationStats();
    const storageStats = await imageOptimization.getStorageStats();

    res.json({
      success: true,
      data: {
        optimization: optimizationStats,
        storage: {
          ...storageStats,
          totalSizeFormatted: imageOptimization.formatBytes(storageStats.totalSize),
        },
      },
    });
  } catch (error: any) {
    console.error("Error getting image stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * @route   POST /api/admin/performance/images/optimize-all
 * @desc    Optimize all uploaded images (one-click)
 * @access  Owner
 */
router.post("/images/optimize-all", checkPermission(['owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { mode = 'lossy' } = req.body;

    if (!['lossless', 'lossy', 'aggressive'].includes(mode)) {
      res.status(400).json({
        success: false,
        message: "Invalid mode. Use: lossless, lossy, or aggressive",
      });
      return;
    }

    const result = await imageOptimization.optimizeAllUploads(mode as any);

    res.json({
      success: true,
      message: `Optimized ${result.processed} images, saved ${result.totalSavedFormatted}`,
      data: result,
    });
  } catch (error: any) {
    console.error("Error optimizing images:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * @route   POST /api/admin/performance/images/cleanup
 * @desc    Clean up orphaned/temp files
 * @access  Admin
 */
router.post("/images/cleanup", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { maxAgeDays = 7 } = req.body;
    const result = await imageOptimization.cleanupOrphanedFiles(maxAgeDays);

    res.json({
      success: true,
      message: `Deleted ${result.deleted} files, freed ${imageOptimization.formatBytes(result.freedSpace)}`,
      data: result,
    });
  } catch (error: any) {
    console.error("Error cleaning up files:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// ============================================
// FULL SYSTEM OVERVIEW
// ============================================

/**
 * @route   GET /api/admin/performance/overview
 * @desc    Get complete system overview (all metrics)
 * @access  Admin
 */
router.get("/overview", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      performanceSummary,
      cacheAnalytics,
      wafStats,
      imageStats,
      storageStats,
    ] = await Promise.all([
      Promise.resolve(performanceMonitor.getSummary()),
      Promise.resolve(cacheService.getAnalytics()),
      Promise.resolve(getWafStats()),
      Promise.resolve(imageOptimization.getOptimizationStats()),
      imageOptimization.getStorageStats(),
    ]);

    res.json({
      success: true,
      data: {
        performance: performanceSummary,
        cache: {
          hitRate: cacheAnalytics.summary.hitRate,
          entries: cacheAnalytics.memory.entriesCount,
          size: cacheAnalytics.memory.estimatedSize,
        },
        waf: {
          totalRequests: wafStats.totalRequests,
          blockedRequests: wafStats.blockedRequests,
          blockRate: wafStats.blockRate,
          blacklistedIPs: wafStats.blacklistedIPs,
        },
        images: {
          totalOptimized: imageStats.totalOptimized,
          bytesSaved: imageStats.totalBytesSavedFormatted,
          storageUsed: imageOptimization.formatBytes(storageStats.totalSize),
          fileCount: storageStats.fileCount,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error getting system overview:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
