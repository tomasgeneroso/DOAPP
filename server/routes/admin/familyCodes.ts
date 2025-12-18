import express, { Response } from 'express';
import { Op } from 'sequelize';
import { FamilyCode } from '../../models/sql/FamilyCode.model.js';
import { User } from '../../models/sql/User.model.js';
import { protect, requireAdminRole } from '../../middleware/auth.js';
import type { AuthRequest } from '../../types/index.js';

const router = express.Router();

// Middleware: Solo el owner puede acceder a estas rutas
const ownerOnly = requireAdminRole('owner');

/**
 * @route   GET /api/admin/family-codes
 * @desc    Obtener todos los códigos familia
 * @access  Owner only
 */
router.get('/', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const where: any = {};

    // Filtrar por estado
    if (status === 'active') {
      where.isActive = true;
      where.usedById = null;
      where[Op.or] = [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } }
      ];
    } else if (status === 'used') {
      where.usedById = { [Op.ne]: null };
    } else if (status === 'expired') {
      where.expiresAt = { [Op.lt]: new Date() };
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    // Buscar por nombre o código
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { code: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows: familyCodes } = await FamilyCode.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'usedBy',
          attributes: ['id', 'name', 'email', 'avatar'],
        },
        {
          model: User,
          as: 'createdBy',
          attributes: ['id', 'name'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      data: familyCodes,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error('Error fetching family codes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

/**
 * @route   POST /api/admin/family-codes
 * @desc    Crear un nuevo código familia
 * @access  Owner only
 */
router.post('/', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, notes, expiresAt } = req.body;

    if (!firstName || !lastName) {
      res.status(400).json({
        success: false,
        message: 'Nombre y apellido son requeridos',
      });
      return;
    }

    // Generar código único
    let code = FamilyCode.generateCode();
    let attempts = 0;
    while (await FamilyCode.findOne({ where: { code } }) && attempts < 10) {
      code = FamilyCode.generateCode();
      attempts++;
    }

    const familyCode = await FamilyCode.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      code,
      notes: notes?.trim() || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdById: req.user.id,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'Código familia creado exitosamente',
      data: familyCode,
    });
  } catch (error: any) {
    console.error('Error creating family code:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

/**
 * @route   PUT /api/admin/family-codes/:id
 * @desc    Actualizar un código familia
 * @access  Owner only
 */
router.put('/:id', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { firstName, lastName, notes, expiresAt, isActive } = req.body;

    const familyCode = await FamilyCode.findByPk(id);

    if (!familyCode) {
      res.status(404).json({
        success: false,
        message: 'Código familia no encontrado',
      });
      return;
    }

    await familyCode.update({
      firstName: firstName?.trim() || familyCode.firstName,
      lastName: lastName?.trim() || familyCode.lastName,
      notes: notes !== undefined ? notes?.trim() || null : familyCode.notes,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : familyCode.expiresAt,
      isActive: isActive !== undefined ? isActive : familyCode.isActive,
    });

    res.json({
      success: true,
      message: 'Código familia actualizado',
      data: familyCode,
    });
  } catch (error: any) {
    console.error('Error updating family code:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

/**
 * @route   DELETE /api/admin/family-codes/:id
 * @desc    Eliminar un código familia
 * @access  Owner only
 */
router.delete('/:id', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const familyCode = await FamilyCode.findByPk(id);

    if (!familyCode) {
      res.status(404).json({
        success: false,
        message: 'Código familia no encontrado',
      });
      return;
    }

    // Si el código ya fue usado, quitar el plan familia del usuario
    if (familyCode.usedById) {
      await User.update(
        { familyCodeId: null, hasFamilyPlan: false },
        { where: { id: familyCode.usedById } }
      );
    }

    await familyCode.destroy();

    res.json({
      success: true,
      message: 'Código familia eliminado',
    });
  } catch (error: any) {
    console.error('Error deleting family code:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

/**
 * @route   POST /api/admin/family-codes/:id/revoke
 * @desc    Revocar un código familia (quitar del usuario)
 * @access  Owner only
 */
router.post('/:id/revoke', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const familyCode = await FamilyCode.findByPk(id, {
      include: [{ model: User, as: 'usedBy' }],
    });

    if (!familyCode) {
      res.status(404).json({
        success: false,
        message: 'Código familia no encontrado',
      });
      return;
    }

    if (!familyCode.usedById) {
      res.status(400).json({
        success: false,
        message: 'Este código no ha sido usado',
      });
      return;
    }

    // Quitar el plan familia del usuario
    await User.update(
      { familyCodeId: null, hasFamilyPlan: false },
      { where: { id: familyCode.usedById } }
    );

    // Marcar el código como revocado (inactivo pero manteniendo el historial)
    await familyCode.update({
      isActive: false,
    });

    res.json({
      success: true,
      message: 'Plan familia revocado del usuario',
    });
  } catch (error: any) {
    console.error('Error revoking family code:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

/**
 * @route   GET /api/admin/family-codes/stats
 * @desc    Obtener estadísticas de códigos familia
 * @access  Owner only
 */
router.get('/stats', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();

    const [total, active, used, expired] = await Promise.all([
      FamilyCode.count(),
      FamilyCode.count({
        where: {
          isActive: true,
          usedById: null,
          [Op.or]: [
            { expiresAt: null },
            { expiresAt: { [Op.gt]: now } }
          ]
        }
      }),
      FamilyCode.count({ where: { usedById: { [Op.ne]: null } } }),
      FamilyCode.count({ where: { expiresAt: { [Op.lt]: now } } }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        active,
        used,
        expired,
        inactive: total - active - used,
      },
    });
  } catch (error: any) {
    console.error('Error fetching family codes stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

export default router;
