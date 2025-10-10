import cron from "node-cron";
import Contract from "../models/Contract";
import fcmService from "./fcm";
import emailService from "./email";

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

      // Find contracts waiting for approval for more than 7 days
      const eligibleContracts = await Contract.find({
        status: "waiting_approval",
        workCompletedAt: {
          $exists: true,
          $lte: new Date(now.getTime() - autoReleaseDelay),
        },
        escrowReleased: false,
      })
        .populate("client", "name email")
        .populate("doer", "name email");

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
      contract.status = "completed";
      contract.escrowReleased = true;
      contract.escrowReleasedAt = new Date();
      contract.escrowAutoReleased = true; // Flag to indicate it was auto-released
      await contract.save();

      console.log(`✅ Auto-released escrow for contract ${contract._id}`);

      // Notify both parties
      const clientMessage = `El pago del contrato "${contract.title}" ha sido liberado automáticamente después de 7 días sin objeciones.`;
      const doerMessage = `Has recibido el pago del contrato "${contract.title}". El escrow fue liberado automáticamente.`;

      // Notify client
      await fcmService.sendToUser({
        userId: contract.client._id.toString(),
        title: "Pago liberado",
        body: clientMessage,
        data: {
          type: "contract_completed",
          contractId: contract._id.toString(),
        },
      });

      await emailService.sendToUser(
        contract.client._id.toString(),
        "Pago liberado - " + contract.title,
        `<p>${clientMessage}</p>`
      );

      // Notify doer
      await fcmService.sendToUser({
        userId: contract.doer._id.toString(),
        title: "Pago recibido",
        body: doerMessage,
        data: {
          type: "payment_received",
          contractId: contract._id.toString(),
        },
      });

      await emailService.sendToUser(
        contract.doer._id.toString(),
        "Pago recibido - " + contract.title,
        `<p>${doerMessage}</p>`
      );
    } catch (error) {
      console.error(`Error releasing escrow for contract ${contract._id}:`, error);
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
      const contractsNeedingReminder = await Contract.find({
        status: "waiting_approval",
        workCompletedAt: {
          $exists: true,
          $gte: new Date(now.getTime() - autoReleaseDelay),
          $lte: new Date(now.getTime() - reminderThreshold),
        },
        escrowReleased: false,
      })
        .populate("client", "name email")
        .populate("doer", "name");

      console.log(`Sending reminders for ${contractsNeedingReminder.length} contracts`);

      for (const contract of contractsNeedingReminder) {
        // Calculate time until auto-release
        const workCompletedTime = new Date(contract.workCompletedAt!).getTime();
        const autoReleaseTime = workCompletedTime + autoReleaseDelay;
        const timeRemaining = autoReleaseTime - now.getTime();
        const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));

        const message = `El trabajo para "${contract.title}" está esperando tu aprobación. El pago se liberará automáticamente en ${daysRemaining} días si no hay objeciones.`;

        // Send push notification
        await fcmService.sendToUser({
          userId: contract.client._id.toString(),
          title: "Aprobación pendiente",
          body: message,
          data: {
            type: "approval_reminder",
            contractId: contract._id.toString(),
          },
        });

        // Send email
        await emailService.sendToUser(
          contract.client._id.toString(),
          "Aprobación pendiente - " + contract.title,
          `<p>${message}</p>`
        );
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

      const overdueContracts = await Contract.find({
        status: "in_progress",
        endDate: { $lt: now },
      })
        .populate("client", "name email")
        .populate("doer", "name email");

      console.log(`Found ${overdueContracts.length} overdue contracts`);

      for (const contract of overdueContracts) {
        // Notify both parties
        const message = `El contrato "${contract.title}" ha excedido su fecha límite.`;

        // Notify client
        await fcmService.sendToUser({
          userId: contract.client._id.toString(),
          title: "Contrato vencido",
          body: message,
          data: {
            type: "contract_overdue",
            contractId: contract._id.toString(),
          },
        });

        // Notify doer
        await fcmService.sendToUser({
          userId: contract.doer._id.toString(),
          title: "Contrato vencido",
          body: message,
          data: {
            type: "contract_overdue",
            contractId: contract._id.toString(),
          },
        });
      }
    } catch (error) {
      console.error("Error checking overdue contracts:", error);
    }
  }
}

export default new EscrowAutomationService();
