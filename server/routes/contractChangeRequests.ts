import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { ContractChangeRequest } from "../models/sql/ContractChangeRequest.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Ticket } from "../models/sql/Ticket.model.js";
import { User } from "../models/sql/User.model.js";
import { Job } from "../models/sql/Job.model.js";
import { protect } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import emailService from '../services/email.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * POST /api/contract-change-requests
 * Crear solicitud de cambio o cancelación de contrato
 */
router.post(
  '/',
  protect,
  [
    body('contractId').notEmpty().withMessage('El ID del contrato es requerido'),
    body('type').isIn(['cancel', 'modify']).withMessage('Tipo inválido'),
    body('reason').notEmpty().withMessage('La razón es requerida'),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { contractId, type, reason, newTerms } = req.body;
      const userId = req.user.id;

      // Verificar que el contrato existe
      const contract = await Contract.findByPk(contractId, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
          { model: Job, as: 'job', attributes: ['id', 'title'] }
        ]
      });

      if (!contract) {
        res.status(404).json({
          success: false,
          message: 'Contrato no encontrado',
        });
        return;
      }

      // Verificar que el usuario es parte del contrato
      const isClient = contract.clientId === userId;
      const isDoer = contract.doerId === userId;

      if (!isClient && !isDoer) {
        res.status(403).json({
          success: false,
          message: 'No tienes permiso para solicitar cambios en este contrato',
        });
        return;
      }

      // Verificar que no haya otra solicitud pendiente
      const existingRequest = await ContractChangeRequest.findOne({
        where: {
          contractId: contractId,
          status: 'pending',
        }
      });

      if (existingRequest) {
        res.status(400).json({
          success: false,
          message: 'Ya existe una solicitud pendiente para este contrato',
        });
        return;
      }

      // Crear la solicitud
      const changeRequest = await ContractChangeRequest.create({
        contractId: contractId,
        requestedById: userId,
        type,
        reason,
        newTerms: type === 'modify' ? newTerms : undefined,
      });

      // Enviar email a la otra parte
      const otherParty = isClient ? contract.doer : contract.client;
      const requester = isClient ? contract.client : contract.doer;
      const jobTitle = (contract.job as any)?.title || 'Contrato';

      await emailService.sendEmail({
        to: (otherParty as any).email,
        subject: type === 'cancel'
          ? `Solicitud de cancelación de contrato - ${jobTitle}`
          : `Solicitud de modificación de contrato - ${jobTitle}`,
        html: `
          <h2>Solicitud de ${type === 'cancel' ? 'cancelación' : 'modificación'} de contrato</h2>
          <p><strong>${(requester as any).name}</strong> ha solicitado ${
          type === 'cancel' ? 'cancelar' : 'modificar'
        } el contrato para <strong>${jobTitle}</strong>.</p>

          <p><strong>Razón:</strong></p>
          <p>${reason}</p>

          ${
            type === 'modify' && newTerms
              ? `
          <p><strong>Nuevos términos propuestos:</strong></p>
          <ul>
            ${newTerms.price ? `<li>Precio: $${newTerms.price}</li>` : ''}
            ${newTerms.startDate ? `<li>Fecha de inicio: ${new Date(newTerms.startDate).toLocaleDateString('es-AR')}</li>` : ''}
            ${newTerms.endDate ? `<li>Fecha de fin: ${new Date(newTerms.endDate).toLocaleDateString('es-AR')}</li>` : ''}
            ${newTerms.description ? `<li>Descripción: ${newTerms.description}</li>` : ''}
          </ul>
          `
              : ''
          }

          <p style="color: #d97706; font-weight: bold;">⏰ Tienes 2 días para responder. Si no respondes, la solicitud se escalará automáticamente a soporte.</p>

          <p>
            <a href="${process.env.CLIENT_URL}/contracts/${contractId}/change-requests/${changeRequest.id}"
               style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Ver solicitud y responder
            </a>
          </p>
        `,
      });

      res.status(201).json({
        success: true,
        message: 'Solicitud enviada exitosamente',
        changeRequest,
      });
    } catch (error: any) {
      console.error('Error creating contract change request:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error del servidor',
      });
    }
  }
);

/**
 * GET /api/contract-change-requests/contract/:contractId
 * Obtener solicitudes de cambio de un contrato
 */
router.get('/contract/:contractId', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const userId = req.user.id;

    // Verificar que el contrato existe y el usuario es parte
    const contract = await Contract.findByPk(contractId);
    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contrato no encontrado',
      });
      return;
    }

    const isClient = contract.clientId === userId;
    const isDoer = contract.doerId === userId;

    if (!isClient && !isDoer) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver estas solicitudes',
      });
      return;
    }

    const changeRequests = await ContractChangeRequest.findAll({
      where: {
        contractId: contractId,
      },
      include: [
        { model: User, as: 'requestedBy', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'respondedBy', attributes: ['id', 'name', 'email', 'avatar'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      changeRequests,
    });
  } catch (error: any) {
    console.error('Error fetching contract change requests:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

/**
 * GET /api/contract-change-requests/:id
 * Obtener una solicitud de cambio específica
 */
router.get('/:id', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const changeRequest = await ContractChangeRequest.findByPk(id, {
      include: [
        { model: User, as: 'requestedBy', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'respondedBy', attributes: ['id', 'name', 'email', 'avatar'] },
        {
          model: Contract,
          as: 'contract',
          include: [
            { model: User, as: 'client', attributes: ['id', 'name', 'email', 'avatar'] },
            { model: User, as: 'doer', attributes: ['id', 'name', 'email', 'avatar'] },
            { model: Job, as: 'job', attributes: ['id', 'title'] }
          ]
        }
      ]
    });

    if (!changeRequest) {
      res.status(404).json({
        success: false,
        message: 'Solicitud no encontrada',
      });
      return;
    }

    // Verificar permisos
    const contract = changeRequest.contract as any;
    const isClient = contract.client.id === userId;
    const isDoer = contract.doer.id === userId;

    if (!isClient && !isDoer) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver esta solicitud',
      });
      return;
    }

    res.json({
      success: true,
      changeRequest,
    });
  } catch (error: any) {
    console.error('Error fetching contract change request:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

/**
 * PUT /api/contract-change-requests/:id/respond
 * Responder a una solicitud de cambio (aceptar o rechazar)
 */
router.put(
  '/:id/respond',
  protect,
  [body('accept').isBoolean().withMessage('La respuesta debe ser verdadero o falso')],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { id } = req.params;
      const { accept } = req.body;
      const userId = req.user.id;

      const changeRequest = await ContractChangeRequest.findByPk(id, {
        include: [
          {
            model: Contract,
            as: 'contract',
            include: [
              { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
              { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
              { model: Job, as: 'job', attributes: ['id', 'title'] }
            ]
          }
        ]
      });

      if (!changeRequest) {
        res.status(404).json({
          success: false,
          message: 'Solicitud no encontrada',
        });
        return;
      }

      if (changeRequest.status !== 'pending') {
        res.status(400).json({
          success: false,
          message: 'Esta solicitud ya ha sido procesada',
        });
        return;
      }

      const contract = changeRequest.contract as any;
      const requester = changeRequest.requestedById;

      // Verificar que quien responde NO es quien solicitó
      if (requester === userId) {
        res.status(400).json({
          success: false,
          message: 'No puedes responder a tu propia solicitud',
        });
        return;
      }

      // Verificar que quien responde es parte del contrato
      const isClient = contract.client.id === userId;
      const isDoer = contract.doer.id === userId;

      if (!isClient && !isDoer) {
        res.status(403).json({
          success: false,
          message: 'No tienes permiso para responder esta solicitud',
        });
        return;
      }

      // Actualizar solicitud
      changeRequest.status = accept ? 'accepted' : 'rejected';
      changeRequest.respondedById = req.user.id;
      changeRequest.respondedAt = new Date();
      await changeRequest.save();

      // Si se aceptó
      if (accept) {
        if (changeRequest.type === 'cancel') {
          // Cancelar el contrato
          contract.status = 'cancelled';
          await contract.save();
        } else if (changeRequest.type === 'modify' && changeRequest.newTerms) {
          // Aplicar los nuevos términos
          if (changeRequest.newTerms.price !== undefined) {
            contract.price = changeRequest.newTerms.price;
            contract.totalPrice = changeRequest.newTerms.price * 1.1; // Recalcular con comisión
          }
          if (changeRequest.newTerms.startDate) {
            contract.startDate = changeRequest.newTerms.startDate;
          }
          if (changeRequest.newTerms.endDate) {
            contract.endDate = changeRequest.newTerms.endDate;
          }
          await contract.save();
        }
      }

      // Enviar email al solicitante
      const requesterUser = isClient ? contract.doer : contract.client;
      const responderUser = isClient ? contract.client : contract.doer;
      const jobTitle = contract.job?.title || 'Contrato';

      await emailService.sendEmail({
        to: requesterUser.email,
        subject: accept
          ? `Solicitud de ${changeRequest.type === 'cancel' ? 'cancelación' : 'modificación'} aceptada - ${jobTitle}`
          : `Solicitud de ${changeRequest.type === 'cancel' ? 'cancelación' : 'modificación'} rechazada - ${jobTitle}`,
        html: accept
          ? `
          <h2>✅ Tu solicitud ha sido aceptada</h2>
          <p><strong>${responderUser.name}</strong> ha aceptado tu solicitud de ${
              changeRequest.type === 'cancel' ? 'cancelación' : 'modificación'
            } para <strong>${jobTitle}</strong>.</p>

          ${
            changeRequest.type === 'cancel'
              ? '<p>El contrato ha sido cancelado.</p>'
              : '<p>Los nuevos términos han sido aplicados al contrato.</p>'
          }

          <p>
            <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
               style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Ver contrato
            </a>
          </p>
        `
          : `
          <h2>❌ Tu solicitud ha sido rechazada</h2>
          <p><strong>${responderUser.name}</strong> ha rechazado tu solicitud de ${
              changeRequest.type === 'cancel' ? 'cancelación' : 'modificación'
            } para <strong>${jobTitle}</strong>.</p>

          <p>Si tienes alguna duda o necesitas asistencia, puedes contactar a soporte.</p>

          <p>
            <a href="${process.env.CLIENT_URL}/contracts/${contract.id}"
               style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Ver contrato
            </a>
          </p>
        `,
      });

      res.json({
        success: true,
        message: accept ? 'Solicitud aceptada' : 'Solicitud rechazada',
        changeRequest,
      });
    } catch (error: any) {
      console.error('Error responding to contract change request:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error del servidor',
      });
    }
  }
);

/**
 * POST /api/contract-change-requests/escalate-expired
 * Job automático: Escalar solicitudes sin respuesta después de 2 días
 * (Este endpoint debe ser llamado por un cron job)
 */
router.post('/escalate-expired', async (req, res: Response): Promise<void> => {
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    // Buscar solicitudes pendientes creadas hace más de 2 días
    const expiredRequests = await ContractChangeRequest.findAll({
      where: {
        status: 'pending',
        createdAt: { [Op.lte]: twoDaysAgo },
      },
      include: [
        {
          model: Contract,
          as: 'contract',
          include: [
            { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
            { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
            { model: Job, as: 'job', attributes: ['id', 'title'] }
          ]
        }
      ]
    });

    for (const request of expiredRequests) {
      const contract = request.contract as any;
      const requesterUser =
        request.requestedById === contract.client.id
          ? contract.client
          : contract.doer;
      const jobTitle = contract.job?.title || 'Contrato';

      // Crear ticket de soporte
      const ticket = await Ticket.create({
        userId: request.requestedById,
        subject: `Solicitud de ${request.type === 'cancel' ? 'cancelación' : 'modificación'} sin respuesta - ${jobTitle}`,
        message: `
          Solicitud automáticamente escalada después de 2 días sin respuesta.

          Tipo: ${request.type === 'cancel' ? 'Cancelación' : 'Modificación'}
          Razón: ${request.reason}

          Contrato: ${contract.id}
          Cliente: ${contract.client.name}
          Doer: ${contract.doer.name}
        `,
        category: 'contract_issue',
        priority: 'high',
        status: 'open',
      });

      // Actualizar solicitud
      request.status = 'escalated_to_support';
      request.escalatedAt = new Date();
      request.supportTicketId = ticket.id;
      await request.save();

      // Enviar emails a ambas partes
      await emailService.sendEmail({
        to: requesterUser.email,
        subject: `Tu solicitud ha sido escalada a soporte - ${jobTitle}`,
        html: `
          <h2>Tu solicitud ha sido escalada a soporte</h2>
          <p>No recibimos respuesta de la otra parte en 2 días, por lo que tu solicitud de ${
            request.type === 'cancel' ? 'cancelación' : 'modificación'
          } para <strong>${jobTitle}</strong> ha sido escalada a nuestro equipo de soporte.</p>

          <p>Nuestro equipo revisará el caso y se pondrá en contacto contigo pronto.</p>

          <p>Número de ticket: <strong>#${ticket.id}</strong></p>

          <p>
            <a href="${process.env.CLIENT_URL}/support/tickets/${ticket.id}"
               style="display: inline-block; padding: 12px 24px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Ver ticket de soporte
            </a>
          </p>
        `,
      });

      console.log(`Escalated change request ${request.id} to support ticket ${ticket.id}`);
    }

    res.json({
      success: true,
      message: `Escaladas ${expiredRequests.length} solicitudes expiradas`,
      count: expiredRequests.length,
    });
  } catch (error: any) {
    console.error('Error escalating expired requests:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

export default router;
