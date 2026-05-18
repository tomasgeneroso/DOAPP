import express, { Response } from "express";
import { protect } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  getWafStats,
  getBlockedIPs,
  getTemporarilyBlockedIPs,
  getSuspiciousBots,
  blacklistIP,
  unblacklistIP,
} from "../../middleware/waf.js";
import { sequelize } from "../../config/database.js";
import { QueryTypes } from "sequelize";
import type { AuthRequest } from "../../types/index.js";

const router = express.Router();
router.use(protect, requirePermission("admin"));

// GET /api/admin/security/overview
router.get("/overview", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wafStats = getWafStats();
    const temporarilyBlocked = getTemporarilyBlockedIPs();
    const permanentlyBlocked = getBlockedIPs();
    const suspiciousBots = getSuspiciousBots();

    // Rate limit records from PostgreSQL (table is created lazily on first auth request)
    let rateLimitBlocks: { key: string; expiresAt: string }[] = [];
    try {
      const rateLimitRecords = await sequelize.query<{
        key: string;
        points: number;
        expire: number;
      }>(
        `SELECT key, points, expire FROM rate_limits
         WHERE key LIKE 'rl:auth%' AND points <= 0 AND expire > $1
         ORDER BY expire DESC LIMIT 50`,
        { type: QueryTypes.SELECT, bind: [Date.now()] }
      );
      rateLimitBlocks = rateLimitRecords.map(r => ({
        key: r.key,
        expiresAt: new Date(Number(r.expire)).toISOString(),
      }));
    } catch {
      // Table doesn't exist yet — no auth requests have been made
    }

    res.json({
      success: true,
      data: {
        waf: wafStats,
        temporarilyBlocked,
        permanentlyBlocked: permanentlyBlocked.map(ip => ({ ip })),
        suspiciousBots,
        rateLimitBlocks,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/security/blacklist
router.post("/blacklist", async (req: AuthRequest, res: Response): Promise<void> => {
  const { ip } = req.body;
  if (!ip) { res.status(400).json({ success: false, message: "IP requerida" }); return; }
  blacklistIP(ip);
  res.json({ success: true, message: `IP ${ip} bloqueada permanentemente` });
});

// DELETE /api/admin/security/blacklist/:ip
router.delete("/blacklist/:ip", async (req: AuthRequest, res: Response): Promise<void> => {
  unblacklistIP(req.params.ip);
  res.json({ success: true, message: `IP ${req.params.ip} desbloqueada` });
});

export default router;
