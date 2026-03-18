import cron from "node-cron";
import { Contract } from "../models/sql/Contract.model.js";
import { User } from "../models/sql/User.model.js";
import fcmService from "./fcm.js";
import emailService from "./email.js";
import { Op } from 'sequelize';

class EscrowAutomationService {
  /**
   * Initialize automated escrow release checks
   */
  initialize() {
    // Run every hour
    cron.schedule("0 * * * *", async () => {
      await this.checkContractsForAutoRelease();
    });

    // Run every 6 hours to send reminders
    cron.schedule("0 */6 * * *", async () => {
      await this.sendApprovalReminders();
    });

    console.log("✅ Escrow automation service initialized");
  }

  /**
   * Check contracts eligible for automatic escrow release
   */
  async checkContractsForAutoRelease() {
    try {
      const now = new Date();
      const autoReleaseDelay = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

      // Find contracts awaiting_confirmation for more than 7 days without escrow release
      const eligibleContracts = await Contract.findAll({
        where: {
          status: "awaiting_confirmation",
          awaitingConfirmationAt: {
            [Op.ne]: null,
            [Op.lte]: new Date(now.getTime() - autoReleaseDelay),
          },
          escrowStatus: "held_escrow",
        },
        include: [
          { model: User, as: "client", attributes: ["id", "name", "email"] },
          { model: User, as: "doer", attributes: ["id", "name", "email"] },
        ],
      });

      console.log(`Found ${eligibleContracts.length} contracts eligible for auto-release`);

      for (const contract of eligibleContracts) {
        await this.releaseEscrowAutomatically(contract);
      }
    } catch (error) {
      console.error("Error checking contracts for auto-release:", error);
    }
  }

  /**
   * Automatically release escrow for a contract
   */
  private async releaseEscrowAutomatically(contract: any) {
    try {
      await contract.update({
        status: "completed",
        escrowStatus: "released",
        clientConfirmed: true,
        doerConfirmed: true,
      });

      console.log(`✅ Auto-released escrow for contract ${contract.id}`);

      // Notify both parties
      const clientMessage = `El pago del contrato ha sido liberado automáticamente después de 7 días sin objeciones.`;
      const doerMessage = `Has recibido el pago del contrato. El escrow fue liberado automáticamente.`;

      // Notify client
      if (contract.client) {
        await fcmService.sendToUser({
          userId: contract.client.id,
          title: "Pago liberado",
          body: clientMessage,
          data: {
            type: "contract_completed",
            contractId: contract.id,
          },
        });

        await emailService.sendToUser(
          contract.client.id,
          "Pago liberado",
          `<p>${clientMessage}</p>`
        );
      }

      // Notify doer
      if (contract.doer) {
        await fcmService.sendToUser({
          userId: contract.doer.id,
          title: "Pago recibido",
          body: doerMessage,
          data: {
            type: "payment_received",
            contractId: contract.id,
          },
        });

        await emailService.sendToUser(
          contract.doer.id,
          "Pago recibido",
          `<p>${doerMessage}</p>`
        );
      }
    } catch (error) {
      console.error(`Error releasing escrow for contract ${contract.id}:`, error);
    }
  }

  /**
   * Send reminders to clients to approve work
   */
  async sendApprovalReminders() {
    try {
      const now = new Date();
      const reminderThreshold = 5 * 24 * 60 * 60 * 1000; // 5 days
      const autoReleaseDelay = 7 * 24 * 60 * 60 * 1000; // 7 days

      // Find contracts waiting for approval between 5-7 days
      const contractsNeedingReminder = await Contract.findAll({
        where: {
          status: "awaiting_confirmation",
          awaitingConfirmationAt: {
            [Op.ne]: null,
            [Op.gte]: new Date(now.getTime() - autoReleaseDelay),
            [Op.lte]: new Date(now.getTime() - reminderThreshold),
          },
          escrowStatus: "held_escrow",
        },
        include: [
          { model: User, as: "client", attributes: ["id", "name", "email"] },
          { model: User, as: "doer", attributes: ["id", "name"] },
        ],
      });

      console.log(`Sending reminders for ${contractsNeedingReminder.length} contracts`);

      for (const contract of contractsNeedingReminder) {
        // Calculate time until auto-release
        const awaitingTime = new Date(contract.awaitingConfirmationAt!).getTime();
        const autoReleaseTime = awaitingTime + autoReleaseDelay;
        const timeRemaining = autoReleaseTime - now.getTime();
        const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));

        const message = `Tu contrato está esperando confirmación. El pago se liberará automáticamente en ${daysRemaining} días si no hay objeciones.`;

        if (contract.client) {
          // Send push notification
          await fcmService.sendToUser({
            userId: contract.client.id,
            title: "Aprobación pendiente",
            body: message,
            data: {
              type: "approval_reminder",
              contractId: contract.id,
            },
          });

          // Send email
          await emailService.sendToUser(
            contract.client.id,
            "Confirmación pendiente",
            `<p>${message}</p>`
          );
        }
      }
    } catch (error) {
      console.error("Error sending approval reminders:", error);
    }
  }

  /**
   * Check for overdue contracts
   */
  async checkOverdueContracts() {
    try {
      const now = new Date();

      const overdueContracts = await Contract.findAll({
        where: {
          status: "in_progress",
          endDate: { [Op.lt]: now },
        },
        include: [
          { model: User, as: "client", attributes: ["id", "name", "email"] },
          { model: User, as: "doer", attributes: ["id", "name", "email"] },
        ],
      });

      console.log(`Found ${overdueContracts.length} overdue contracts`);

      for (const contract of overdueContracts) {
        // Notify both parties
        const message = `Tu contrato ha excedido su fecha límite.`;

        // Notify client
        if (contract.client) {
          await fcmService.sendToUser({
            userId: contract.client.id,
            title: "Contrato vencido",
            body: message,
            data: {
              type: "contract_overdue",
              contractId: contract.id,
            },
          });
        }

        // Notify doer
        if (contract.doer) {
          await fcmService.sendToUser({
            userId: contract.doer.id,
            title: "Contrato vencido",
            body: message,
            data: {
              type: "contract_overdue",
              contractId: contract.id,
            },
          });
        }
      }
    } catch (error) {
      console.error("Error checking overdue contracts:", error);
    }
  }
}

export default new EscrowAutomationService();
