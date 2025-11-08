import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import { ContractNegotiation } from "../models/sql/ContractNegotiation.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { body, validationResult } from "express-validator";

const router = Router();

/**
 * Start negotiation for a contract
 * POST /api/negotiation/start
 */
router.post(
  "/start",
  protect,
  [
    body("contractId").notEmpty().withMessage("Contract ID es requerido"),
    body("message").isString().isLength({ min: 10, max: 1000 }),
    body("proposedPrice").optional().isNumeric(),
    body("proposedStartDate").optional().isISO8601(),
    body("proposedEndDate").optional().isISO8601(),
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

      const { contractId, message, proposedPrice, proposedStartDate, proposedEndDate, proposedTerms } = req.body;
      const userId = req.user.id;

      // Get contract
      const contract = await Contract.findByPk(contractId);
      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      // Verify user is part of contract
      if (
        contract.clientId !== userId &&
        contract.doerId !== userId
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para negociar este contrato",
        });
        return;
      }

      // Check if negotiation already exists
      let negotiation = await ContractNegotiation.findOne({ where: { contractId } });

      if (negotiation) {
        // Add message to existing negotiation
        const updatedMessages = [
          ...negotiation.messages,
          {
            userId,
            message,
            proposedPrice,
            proposedStartDate: proposedStartDate ? new Date(proposedStartDate) : undefined,
            proposedEndDate: proposedEndDate ? new Date(proposedEndDate) : undefined,
            proposedTerms,
            status: "pending",
          }
        ];

        const updatedProposal = {
          price: proposedPrice,
          startDate: proposedStartDate ? new Date(proposedStartDate) : undefined,
          endDate: proposedEndDate ? new Date(proposedEndDate) : undefined,
          terms: proposedTerms,
          proposedBy: userId,
        };

        await negotiation.update({
          messages: updatedMessages,
          currentProposal: updatedProposal,
        });
      } else {
        // Create new negotiation
        negotiation = await ContractNegotiation.create({
          contractId,
          clientId: contract.clientId,
          doerId: contract.doerId,
          messages: [{
            userId,
            message,
            proposedPrice,
            proposedStartDate: proposedStartDate ? new Date(proposedStartDate) : undefined,
            proposedEndDate: proposedEndDate ? new Date(proposedEndDate) : undefined,
            proposedTerms,
            status: "pending",
          }],
          currentProposal: {
            price: proposedPrice,
            startDate: proposedStartDate ? new Date(proposedStartDate) : undefined,
            endDate: proposedEndDate ? new Date(proposedEndDate) : undefined,
            terms: proposedTerms,
            proposedBy: userId,
          },
        });
      }

      // Notify other party
      const otherParty = contract.clientId === userId
        ? contract.doerId
        : contract.clientId;

      await Notification.create({
        userId: otherParty,
        type: "negotiation_message",
        title: "Nueva propuesta de negociación",
        message: `Has recibido una nueva propuesta en la negociación del contrato`,
        metadata: { contractId, negotiationId: negotiation.id },
      });

      res.json({
        success: true,
        data: negotiation,
      });
    } catch (error: any) {
      console.error("Start negotiation error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Accept negotiation proposal
 * POST /api/negotiation/:id/accept
 */
router.post(
  "/:id/accept",
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const negotiation = await ContractNegotiation.findByPk(id);
      if (!negotiation) {
        res.status(404).json({
          success: false,
          message: "Negociación no encontrada",
        });
        return;
      }

      // Verify user is part of negotiation
      if (
        negotiation.clientId !== userId &&
        negotiation.doerId !== userId
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para aceptar esta negociación",
        });
        return;
      }

      // Verify user is not the one who proposed
      if (negotiation.currentProposal?.proposedBy === userId) {
        res.status(400).json({
          success: false,
          message: "No puedes aceptar tu propia propuesta",
        });
        return;
      }

      // Update negotiation
      await negotiation.update({
        status: "agreed",
        agreedAt: new Date(),
      });

      // Update contract with agreed terms
      const contract = await Contract.findByPk(negotiation.contractId);
      if (contract && negotiation.currentProposal) {
        const updateData: any = { status: "accepted" };

        if (negotiation.currentProposal.price) {
          updateData.price = negotiation.currentProposal.price;
          updateData.totalPrice = negotiation.currentProposal.price + contract.commission;
        }
        if (negotiation.currentProposal.startDate) {
          updateData.startDate = negotiation.currentProposal.startDate;
        }
        if (negotiation.currentProposal.endDate) {
          updateData.endDate = negotiation.currentProposal.endDate;
        }
        if (negotiation.currentProposal.terms) {
          updateData.notes = negotiation.currentProposal.terms;
        }

        await contract.update(updateData);
      }

      // Notify other party
      const otherParty = negotiation.clientId === userId
        ? negotiation.doerId
        : negotiation.clientId;

      await Notification.create({
        userId: otherParty,
        type: "negotiation_accepted",
        title: "Propuesta aceptada",
        message: "Tu propuesta de negociación ha sido aceptada",
        metadata: { contractId: negotiation.contractId, negotiationId: negotiation.id },
      });

      res.json({
        success: true,
        data: negotiation,
      });
    } catch (error: any) {
      console.error("Accept negotiation error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Reject negotiation proposal
 * POST /api/negotiation/:id/reject
 */
router.post(
  "/:id/reject",
  protect,
  [body("message").optional().isString()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const userId = req.user.id;

      const negotiation = await ContractNegotiation.findByPk(id);
      if (!negotiation) {
        res.status(404).json({
          success: false,
          message: "Negociación no encontrada",
        });
        return;
      }

      // Verify user is part of negotiation
      if (
        negotiation.clientId !== userId &&
        negotiation.doerId !== userId
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso",
        });
        return;
      }

      // Add rejection message
      if (message) {
        const updatedMessages = [
          ...negotiation.messages,
          {
            userId,
            message,
            status: "rejected",
          }
        ];
        await negotiation.update({ messages: updatedMessages });
      }

      // Notify other party
      const otherParty = negotiation.clientId === userId
        ? negotiation.doerId
        : negotiation.clientId;

      await Notification.create({
        userId: otherParty,
        type: "negotiation_rejected",
        title: "Propuesta rechazada",
        message: "Tu propuesta de negociación ha sido rechazada",
        metadata: { contractId: negotiation.contractId, negotiationId: negotiation.id },
      });

      res.json({
        success: true,
        data: negotiation,
      });
    } catch (error: any) {
      console.error("Reject negotiation error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Get negotiation by contract ID
 * GET /api/negotiation/contract/:contractId
 */
router.get(
  "/contract/:contractId",
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { contractId } = req.params;
      const userId = req.user.id;

      const contract = await Contract.findByPk(contractId);
      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      // Verify user is part of contract
      if (
        contract.clientId !== userId &&
        contract.doerId !== userId
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso",
        });
        return;
      }

      const negotiation = await ContractNegotiation.findOne({
        where: { contractId },
        include: [
          {
            association: "client",
            attributes: ["name", "avatar"],
          },
          {
            association: "doer",
            attributes: ["name", "avatar"],
          },
        ],
      });

      res.json({
        success: true,
        data: negotiation,
      });
    } catch (error: any) {
      console.error("Get negotiation error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

export default router;
