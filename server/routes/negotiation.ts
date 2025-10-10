import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import ContractNegotiation from "../models/ContractNegotiation";
import Contract from "../models/Contract";
import Notification from "../models/Notification";
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
      const userId = req.user._id;

      // Get contract
      const contract = await Contract.findById(contractId);
      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      // Verify user is part of contract
      if (
        contract.clientId.toString() !== userId.toString() &&
        contract.doerId.toString() !== userId.toString()
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para negociar este contrato",
        });
        return;
      }

      // Check if negotiation already exists
      let negotiation = await ContractNegotiation.findOne({ contractId });

      if (negotiation) {
        // Add message to existing negotiation
        negotiation.messages.push({
          userId,
          message,
          proposedPrice,
          proposedStartDate: proposedStartDate ? new Date(proposedStartDate) : undefined,
          proposedEndDate: proposedEndDate ? new Date(proposedEndDate) : undefined,
          proposedTerms,
          status: "pending",
        } as any);

        negotiation.currentProposal = {
          price: proposedPrice,
          startDate: proposedStartDate ? new Date(proposedStartDate) : undefined,
          endDate: proposedEndDate ? new Date(proposedEndDate) : undefined,
          terms: proposedTerms,
          proposedBy: userId,
        };

        await negotiation.save();
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
      const otherParty = contract.clientId.toString() === userId.toString()
        ? contract.doerId
        : contract.clientId;

      await Notification.create({
        userId: otherParty,
        type: "negotiation_message",
        title: "Nueva propuesta de negociación",
        message: `Has recibido una nueva propuesta en la negociación del contrato`,
        metadata: { contractId, negotiationId: negotiation._id },
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
      const userId = req.user._id;

      const negotiation = await ContractNegotiation.findById(id);
      if (!negotiation) {
        res.status(404).json({
          success: false,
          message: "Negociación no encontrada",
        });
        return;
      }

      // Verify user is part of negotiation
      if (
        negotiation.clientId.toString() !== userId.toString() &&
        negotiation.doerId.toString() !== userId.toString()
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para aceptar esta negociación",
        });
        return;
      }

      // Verify user is not the one who proposed
      if (negotiation.currentProposal?.proposedBy?.toString() === userId.toString()) {
        res.status(400).json({
          success: false,
          message: "No puedes aceptar tu propia propuesta",
        });
        return;
      }

      // Update negotiation
      negotiation.status = "agreed";
      negotiation.agreedAt = new Date();
      await negotiation.save();

      // Update contract with agreed terms
      const contract = await Contract.findById(negotiation.contractId);
      if (contract && negotiation.currentProposal) {
        if (negotiation.currentProposal.price) {
          contract.price = negotiation.currentProposal.price;
          contract.totalPrice = contract.price + contract.commission;
        }
        if (negotiation.currentProposal.startDate) {
          contract.startDate = negotiation.currentProposal.startDate;
        }
        if (negotiation.currentProposal.endDate) {
          contract.endDate = negotiation.currentProposal.endDate;
        }
        if (negotiation.currentProposal.terms) {
          contract.notes = negotiation.currentProposal.terms;
        }

        contract.status = "accepted";
        await contract.save();
      }

      // Notify other party
      const otherParty = negotiation.clientId.toString() === userId.toString()
        ? negotiation.doerId
        : negotiation.clientId;

      await Notification.create({
        userId: otherParty,
        type: "negotiation_accepted",
        title: "Propuesta aceptada",
        message: "Tu propuesta de negociación ha sido aceptada",
        metadata: { contractId: negotiation.contractId, negotiationId: negotiation._id },
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
      const userId = req.user._id;

      const negotiation = await ContractNegotiation.findById(id);
      if (!negotiation) {
        res.status(404).json({
          success: false,
          message: "Negociación no encontrada",
        });
        return;
      }

      // Verify user is part of negotiation
      if (
        negotiation.clientId.toString() !== userId.toString() &&
        negotiation.doerId.toString() !== userId.toString()
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso",
        });
        return;
      }

      // Add rejection message
      if (message) {
        negotiation.messages.push({
          userId,
          message,
          status: "rejected",
        } as any);
      }

      await negotiation.save();

      // Notify other party
      const otherParty = negotiation.clientId.toString() === userId.toString()
        ? negotiation.doerId
        : negotiation.clientId;

      await Notification.create({
        userId: otherParty,
        type: "negotiation_rejected",
        title: "Propuesta rechazada",
        message: "Tu propuesta de negociación ha sido rechazada",
        metadata: { contractId: negotiation.contractId, negotiationId: negotiation._id },
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
      const userId = req.user._id;

      const contract = await Contract.findById(contractId);
      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      // Verify user is part of contract
      if (
        contract.clientId.toString() !== userId.toString() &&
        contract.doerId.toString() !== userId.toString()
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso",
        });
        return;
      }

      const negotiation = await ContractNegotiation.findOne({ contractId })
        .populate("clientId", "name avatar")
        .populate("doerId", "name avatar")
        .populate("messages.userId", "name avatar");

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
