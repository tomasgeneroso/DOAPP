import express, { Response } from 'express';
import { protect } from '../../middleware/auth.js';
import { requireAdminRole } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../types/index.js';
import { Job } from '../../models/sql/Job.model.js';
import { User } from '../../models/sql/User.model.js';
import { Payment } from '../../models/sql/Payment.model.js';
import { PaymentProof } from '../../models/sql/PaymentProof.model.js';
import { Op } from 'sequelize';
import { socketService } from '../../index.js';

const router = express.Router();

/**
 * GET /api/admin/jobs
 * Obtener lista de trabajos con filtros
 */
router.get(
  '/',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { status, search, page = 1, limit = 50 } = req.query;

      const where: any = {};

      // Filtro por estado
      if (status && status !== 'all') {
        where.status = status;
      }

      // Búsqueda por título o descripción
      if (search) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
          { summary: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const offset = (Number(page) - 1) * Number(limit);

      const { count, rows: jobs } = await Job.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email', 'avatar'],
          },
          {
            model: User,
            as: 'reviewer',
            attributes: ['id', 'name', 'email'],
            required: false,
          },
        ],
        order: [['createdAt', 'DESC']],
        limit: Number(limit),
        offset,
      });

      // Obtener los PaymentProofs para los jobs que tienen publicationPaymentId
      const jobsWithPaymentIds = jobs.filter(job => job.publicationPaymentId);
      const paymentIds = jobsWithPaymentIds.map(job => job.publicationPaymentId);

      // Buscar PaymentProofs asociados a estos pagos
      const paymentProofs = paymentIds.length > 0 ? await PaymentProof.findAll({
        where: {
          paymentId: { [Op.in]: paymentIds },
          isActive: true,
        },
        attributes: ['id', 'paymentId', 'fileUrl', 'fileType', 'fileName', 'status', 'uploadedAt'],
      }) : [];

      // Crear mapa de paymentId -> paymentProof
      const proofsByPaymentId = new Map();
      for (const proof of paymentProofs) {
        proofsByPaymentId.set(proof.paymentId, proof);
      }

      // Agregar paymentProof a cada job
      const jobsWithProofs = jobs.map(job => {
        const jobData = job.toJSON();
        if (job.publicationPaymentId) {
          const proof = proofsByPaymentId.get(job.publicationPaymentId);
          if (proof) {
            jobData.paymentProof = {
              id: proof.id,
              fileUrl: proof.fileUrl,
              fileType: proof.fileType,
              fileName: proof.fileName,
              status: proof.status,
              uploadedAt: proof.uploadedAt,
            };
          }
        }
        return jobData;
      });

      res.json({
        success: true,
        data: jobsWithProofs,
        pagination: {
          total: count,
          page: Number(page),
          pages: Math.ceil(count / Number(limit)),
          limit: Number(limit),
        },
      });
    } catch (error: any) {
      console.error('Error fetching jobs:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al obtener publicaciones',
      });
    }
  }
);

/**
 * GET /api/admin/jobs/stats
 * Obtener estadísticas de publicaciones
 */
router.get(
  '/stats',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [total, pending, approved, rejected] = await Promise.all([
        Job.count(),
        Job.count({ where: { status: 'pending_approval' } }),
        Job.count({ where: { status: 'open' } }),
        Job.count({ where: { status: 'cancelled' } }),
      ]);

      res.json({
        success: true,
        data: {
          total,
          pending,
          approved,
          rejected,
        },
      });
    } catch (error: any) {
      console.error('Error fetching job stats:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al obtener estadísticas',
      });
    }
  }
);

/**
 * PUT /api/admin/jobs/:id/status
 * Actualizar estado de una publicación (aprobar/rechazar)
 */
router.put(
  '/:id/status',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { status, rejectedReason } = req.body;

      if (!status || !['approved', 'rejected'].includes(status)) {
        res.status(400).json({
          success: false,
          message: "Estado inválido. Debe ser 'approved' o 'rejected'",
        });
        return;
      }

      const job = await Job.findByPk(id, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (!job) {
        res.status(404).json({
          success: false,
          message: 'Publicación no encontrada',
        });
        return;
      }

      // Mapear status de admin a status de Job
      let newStatus: any;
      if (status === 'approved') {
        newStatus = 'open'; // Publicación aprobada y abierta
      } else {
        newStatus = 'cancelled'; // Publicación rechazada
      }

      const previousStatus = job.status;

      // Actualizar job
      await job.update({
        status: newStatus,
        rejectedReason: status === 'rejected' ? rejectedReason : null,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      });

      // Refetch job with associations for socket notification
      const updatedJob = await Job.findByPk(id, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'reviewer', attributes: ['id', 'name', 'email'], required: false },
        ],
      });

      // Send real-time notifications
      if (updatedJob) {
        // Notify job owner
        socketService.notifyJobUpdate(job.id, job.clientId, {
          action: status === 'approved' ? 'approved' : 'rejected',
          job: updatedJob.toJSON(),
        });

        // Notify admin panel and all job listings
        socketService.notifyJobStatusChanged(updatedJob.toJSON(), previousStatus);
      }

      // Create notification for job owner
      const { Notification } = await import('../../models/sql/Notification.model.js');
      const notification = await Notification.create({
        recipientId: job.clientId,
        title: status === 'approved' ? 'Publicación aprobada' : 'Publicación rechazada',
        message: status === 'approved'
          ? `Tu publicación "${job.title}" ha sido aprobada y ya está visible.`
          : `Tu publicación "${job.title}" ha sido rechazada.${rejectedReason ? ` Razón: ${rejectedReason}` : ''}`,
        type: status === 'approved' ? 'success' : 'warning',
        category: 'jobs',
        relatedId: job.id,
        relatedModel: 'Job',
        actionText: 'Ver trabajo',
        data: { jobId: job.id },
      });

      // Send real-time notification
      socketService.notifyUser(job.clientId, notification.toJSON());

      res.json({
        success: true,
        message: `Publicación ${status === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`,
        data: updatedJob,
      });
    } catch (error: any) {
      console.error('Error updating job status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al actualizar estado',
      });
    }
  }
);

/**
 * PUT /api/admin/jobs/:id/action
 * Ejecutar acción sobre una publicación (pausar/reanudar/cancelar)
 */
router.put(
  '/:id/action',
  protect,
  requireAdminRole,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { action, reason, permanent } = req.body;

      if (!action || !['pause', 'resume', 'cancel'].includes(action)) {
        res.status(400).json({
          success: false,
          message: "Acción inválida. Debe ser 'pause', 'resume' o 'cancel'",
        });
        return;
      }

      const job = await Job.findByPk(id, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (!job) {
        res.status(404).json({
          success: false,
          message: 'Publicación no encontrada',
        });
        return;
      }

      let newStatus: string;
      let message: string;
      let notificationMessage: string;

      switch (action) {
        case 'pause':
          if (job.status === 'suspended') {
            res.status(400).json({ success: false, message: 'La publicación ya está pausada' });
            return;
          }
          newStatus = 'suspended';
          message = 'Publicación pausada exitosamente';
          notificationMessage = reason
            ? `Tu publicación "${job.title}" ha sido pausada por el administrador. Razón: ${reason}`
            : `Tu publicación "${job.title}" ha sido pausada por el administrador.`;
          // Guardar estado anterior para poder reanudar
          await job.update({
            status: newStatus,
            previousStatus: job.status,
            rejectedReason: reason || null,
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
          });
          break;

        case 'resume':
          if (job.status !== 'suspended') {
            res.status(400).json({ success: false, message: 'Solo se pueden reanudar publicaciones pausadas' });
            return;
          }
          newStatus = job.previousStatus || 'open';
          message = 'Publicación reanudada exitosamente';
          notificationMessage = `Tu publicación "${job.title}" ha sido reanudada por el administrador.`;
          await job.update({
            status: newStatus,
            previousStatus: null,
            rejectedReason: null,
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
          });
          break;

        case 'cancel':
          if (job.status === 'cancelled') {
            res.status(400).json({ success: false, message: 'La publicación ya está cancelada' });
            return;
          }
          if (!reason) {
            res.status(400).json({ success: false, message: 'Debe proporcionar una razón para cancelar' });
            return;
          }
          newStatus = 'cancelled';
          message = permanent
            ? 'Publicación cancelada definitivamente'
            : 'Publicación cancelada exitosamente';
          notificationMessage = permanent
            ? `Tu publicación "${job.title}" ha sido cancelada definitivamente por el administrador y no podrá ser editada. Razón: ${reason}`
            : `Tu publicación "${job.title}" ha sido cancelada por el administrador. Puedes editarla y reenviarla para aprobación. Razón: ${reason}`;
          await job.update({
            status: newStatus,
            cancellationReason: reason,
            cancelledAt: new Date(),
            permanentlyCancelled: permanent === true,
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
          });
          break;

        default:
          res.status(400).json({ success: false, message: 'Acción no válida' });
          return;
      }

      // Crear notificación para el usuario
      const { Notification } = await import('../../models/sql/Notification.model.js');
      await Notification.create({
        recipientId: job.clientId,
        title: action === 'cancel' ? 'Publicación cancelada' : action === 'pause' ? 'Publicación pausada' : 'Publicación reanudada',
        message: notificationMessage,
        type: action === 'cancel' ? 'warning' : 'info',
        category: 'system',
        relatedId: job.id,
        relatedModel: 'Job',
      });

      // Refetch job with associations for socket notification
      const updatedJob = await Job.findByPk(id, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'reviewer', attributes: ['id', 'name', 'email'], required: false },
        ],
      });

      // Send real-time notifications
      if (updatedJob) {
        const previousStatus = action === 'resume' ? 'paused' : job.status;

        // Notify job owner
        socketService.notifyJobUpdate(job.id, job.clientId, {
          action: action,
          job: updatedJob.toJSON(),
        });

        // Notify admin panel and all job listings
        socketService.notifyJobStatusChanged(updatedJob.toJSON(), previousStatus);
      }

      res.json({
        success: true,
        message,
        data: updatedJob || job,
      });
    } catch (error: any) {
      console.error('Error executing job action:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al ejecutar acción',
      });
    }
  }
);

export default router;
