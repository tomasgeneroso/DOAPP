import express, { Response } from "express";
import { protect } from "../../middleware/auth.js";
import { checkPermission } from "../../middleware/checkPermission.js";
import type { AuthRequest } from "../../types/index.js";
import performanceMonitor from "../../services/performanceMonitor.js";

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

export default router;
