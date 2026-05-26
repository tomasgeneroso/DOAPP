import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { protect, AuthRequest } from '../../middleware/auth.js';
import { authorize } from '../../middleware/auth.js';
import { BlacklistEntry } from '../../models/sql/BlacklistEntry.model.js';
import { User } from '../../models/sql/User.model.js';
import { body, validationResult } from 'express-validator';

const router = Router();
router.use(protect, authorize('admin', 'super_admin', 'owner'));

const INFRACTION_AUTO_BAN_THRESHOLD = 5;

/**
 * GET /admin/blacklist
 * List blacklisted users and high-infraction users
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, status = 'active' } = req.query;

    const where: any = {};
    if (status === 'active') where.isActive = true;
    else if (status === 'resolved') where.isActive = false;

    const entries = await BlacklistEntry.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar', 'infractions', 'trustScore', 'isBanned'],
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'name'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    // Also list users close to the threshold (3+ infractions) who aren't yet banned
    const highRiskUsers = await User.findAll({
      where: {
        infractions: { [Op.gte]: 3 },
        isBanned: false,
      },
      attributes: ['id', 'name', 'email', 'avatar', 'infractions', 'trustScore'],
      order: [['infractions', 'DESC']],
      limit: 20,
    });

    res.json({
      success: true,
      data: entries.rows,
      total: entries.count,
      highRiskUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(entries.count / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error('Get blacklist error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /admin/blacklist/:userId/add
 * Add user to blacklist (ban + create audit entry)
 */
router.post(
  '/:userId/add',
  [
    body('type').isIn(['fraud', 'repeated_violations', 'payment_issues', 'abuse', 'spam', 'other']),
    body('severity').isIn(['low', 'medium', 'high']),
    body('reason').isString().isLength({ min: 10, max: 500 }),
    body('expiresAt').optional().isISO8601(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const { userId } = req.params;
      const { type, severity, reason, expiresAt } = req.body;
      const adminId = req.user.id;

      const user = await User.findByPk(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        return;
      }

      // Prevent blacklisting another admin
      if (user.adminRole) {
        res.status(403).json({ success: false, message: 'No se puede agregar a la lista negra a un administrador' });
        return;
      }

      const entry = await BlacklistEntry.create({
        userId,
        addedBy: adminId,
        type,
        severity,
        reason,
        isActive: true,
        autoAdded: false,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      // Ban the user
      await user.ban(adminId, `[BLACKLIST] ${reason}`);

      res.status(201).json({
        success: true,
        message: 'Usuario agregado a la lista negra y baneado',
        data: entry,
      });
    } catch (error: any) {
      console.error('Add to blacklist error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * POST /admin/blacklist/:userId/remove
 * Remove user from active blacklist entries and unban
 */
router.post(
  '/:userId/remove',
  [body('notes').optional().isString().isLength({ max: 500 })],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { notes } = req.body;
      const adminId = req.user.id;

      const user = await User.findByPk(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        return;
      }

      // Resolve all active entries for this user
      await BlacklistEntry.update(
        {
          isActive: false,
          resolvedAt: new Date(),
          resolvedBy: adminId,
          resolutionNotes: notes || 'Removed by admin',
        },
        { where: { userId, isActive: true } }
      );

      // Unban the user
      await user.unban();

      res.json({
        success: true,
        message: 'Usuario eliminado de la lista negra y desbaneado',
      });
    } catch (error: any) {
      console.error('Remove from blacklist error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * POST /admin/blacklist/:userId/infraction
 * Add an infraction to a user. Auto-blacklists when threshold reached.
 */
router.post(
  '/:userId/infraction',
  [
    body('reason').isString().isLength({ min: 5, max: 300 }),
    body('trustScorePenalty').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    try {
      const { userId } = req.params;
      const { reason, trustScorePenalty = 10 } = req.body;
      const adminId = req.user.id;

      const user = await User.findByPk(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        return;
      }

      user.infractions = (user.infractions || 0) + 1;
      await user.decreaseTrustScore(trustScorePenalty);
      await user.save();

      let autoBlacklisted = false;

      // Auto-blacklist when threshold exceeded
      if (user.infractions >= INFRACTION_AUTO_BAN_THRESHOLD && !user.isBanned) {
        const autoEntry = await BlacklistEntry.create({
          userId,
          addedBy: adminId,
          type: 'repeated_violations',
          severity: 'high',
          reason: `Auto-blacklisted: superó el umbral de ${INFRACTION_AUTO_BAN_THRESHOLD} infracciones. Última: ${reason}`,
          isActive: true,
          autoAdded: true,
        });
        await user.ban(adminId, `Auto-baneado tras ${user.infractions} infracciones`);
        autoBlacklisted = true;
      }

      res.json({
        success: true,
        message: autoBlacklisted
          ? `Infracción registrada. Usuario auto-baneado por superar ${INFRACTION_AUTO_BAN_THRESHOLD} infracciones.`
          : `Infracción registrada. Total: ${user.infractions}/${INFRACTION_AUTO_BAN_THRESHOLD}`,
        infractions: user.infractions,
        trustScore: user.trustScore,
        autoBlacklisted,
      });
    } catch (error: any) {
      console.error('Add infraction error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * GET /admin/blacklist/:userId/history
 * Get full blacklist history for a user
 */
router.get('/:userId/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const entries = await BlacklistEntry.findAll({
      where: { userId },
      include: [
        { model: User, as: 'addedByUser', attributes: ['id', 'name'] },
        { model: User, as: 'resolvedByUser', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'infractions', 'trustScore', 'isBanned', 'banReason'],
    });

    res.json({ success: true, data: entries, user });
  } catch (error: any) {
    console.error('Get blacklist history error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
