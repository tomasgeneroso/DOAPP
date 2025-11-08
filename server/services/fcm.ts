import admin from "firebase-admin";
import { config } from "../config/env";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { Op } from 'sequelize';

interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  badge?: number;
  sound?: string;
  priority?: "high" | "normal";
  clickAction?: string;
}

class FCMService {
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      // Initialize Firebase Admin SDK
      // Note: You need to set FIREBASE_SERVICE_ACCOUNT_KEY in your .env
      // as a base64 encoded JSON string of your Firebase service account key
      if (!config.firebaseServiceAccountKey) {
        console.warn("⚠️  Firebase service account key not configured. Push notifications will be disabled.");
        return;
      }

      // Validate base64 format
      if (config.firebaseServiceAccountKey.length < 10) {
        console.warn("⚠️  Firebase service account key appears invalid. Push notifications will be disabled.");
        return;
      }

      // Decode and parse service account
      const decoded = Buffer.from(config.firebaseServiceAccountKey, "base64").toString("utf-8");

      // Check if decoded string looks like JSON
      if (!decoded.startsWith("{")) {
        console.warn("⚠️  Firebase service account key is not valid JSON. Push notifications will be disabled.");
        return;
      }

      const serviceAccount = JSON.parse(decoded);

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      this.initialized = true;
      console.log("✅ Firebase Admin SDK initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Firebase Admin SDK:", error instanceof Error ? error.message : error);
      console.warn("⚠️  Push notifications will be disabled.");
    }
  }

  /**
   * Send push notification to a single user
   */
  async sendToUser(payload: NotificationPayload): Promise<boolean> {
    if (!this.initialized) {
      console.warn("FCM not initialized. Skipping push notification.");
      return false;
    }

    try {
      const user = await User.findByPk(payload.userId);

      if (!user) {
        console.error(`User ${payload.userId} not found`);
        return false;
      }

      // Check if user has push notifications enabled
      if (!user.notificationPreferences?.push) {
        console.log(`User ${payload.userId} has push notifications disabled`);
        return false;
      }

      // Get user's FCM tokens
      const tokens = user.fcmTokens || [];

      if (tokens.length === 0) {
        console.log(`User ${payload.userId} has no FCM tokens registered`);
        return false;
      }

      // Build notification message
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data || {},
        android: {
          priority: payload.priority || "high",
          notification: {
            sound: payload.sound || "default",
            clickAction: payload.clickAction,
            channelId: "default",
            badge: payload.badge,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              badge: payload.badge,
              sound: payload.sound || "default",
            },
          },
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: payload.imageUrl,
            badge: "/icons/badge.png",
          },
        },
      };

      // Send notification
      const response = await admin.messaging().sendEachForMulticast(message);

      // Handle failed tokens (remove invalid ones)
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
            console.error(`Failed to send to token ${tokens[idx]}:`, resp.error);
          }
        });

        // Remove invalid tokens from user
        if (failedTokens.length > 0) {
          await User.findByIdAndUpdate(payload.userId, {
            $pull: { fcmTokens: { [Op.in]: failedTokens } },
          });
        }
      }

      // Store notification in database
      await Notification.create({
        userId: payload.userId,
        type: "push",
        title: payload.title,
        message: payload.body,
        metadata: payload.data,
      });

      console.log(`✅ Sent push notification to user ${payload.userId}. Success: ${response.successCount}, Failed: ${response.failureCount}`);
      return response.successCount > 0;
    } catch (error) {
      console.error("Error sending push notification:", error);
      return false;
    }
  }

  /**
   * Send push notification to multiple users
   */
  async sendToMultipleUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    if (!this.initialized) {
      console.warn("FCM not initialized. Skipping push notifications.");
      return;
    }

    const promises = userIds.map((userId) =>
      this.sendToUser({ userId, title, body, data })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Send notification based on topic
   */
  async sendToTopic(
    topic: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<boolean> {
    if (!this.initialized) {
      console.warn("FCM not initialized. Skipping push notification.");
      return false;
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title,
          body,
        },
        data: data || {},
      };

      const messageId = await admin.messaging().send(message);
      console.log(`✅ Sent topic notification to ${topic}. Message ID: ${messageId}`);
      return true;
    } catch (error) {
      console.error("Error sending topic notification:", error);
      return false;
    }
  }

  /**
   * Subscribe user to a topic
   */
  async subscribeToTopic(userId: string, topic: string): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      const user = await User.findByPk(userId);
      if (!user || user.fcmTokens.length === 0) {
        return false;
      }

      await admin.messaging().subscribeToTopic(user.fcmTokens, topic);
      console.log(`✅ Subscribed user ${userId} to topic ${topic}`);
      return true;
    } catch (error) {
      console.error("Error subscribing to topic:", error);
      return false;
    }
  }

  /**
   * Unsubscribe user from a topic
   */
  async unsubscribeFromTopic(userId: string, topic: string): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      const user = await User.findByPk(userId);
      if (!user || user.fcmTokens.length === 0) {
        return false;
      }

      await admin.messaging().unsubscribeFromTopic(user.fcmTokens, topic);
      console.log(`✅ Unsubscribed user ${userId} from topic ${topic}`);
      return true;
    } catch (error) {
      console.error("Error unsubscribing from topic:", error);
      return false;
    }
  }

  /**
   * Send notification for new message
   */
  async notifyNewMessage(
    userId: string,
    senderName: string,
    messagePreview: string,
    conversationId: string
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.newMessage) {
      return;
    }

    await this.sendToUser({
      userId,
      title: `Nuevo mensaje de ${senderName}`,
      body: messagePreview,
      data: {
        type: "new_message",
        conversationId,
      },
      clickAction: `/chat/${conversationId}`,
      priority: "high",
    });
  }

  /**
   * Send notification for job update
   */
  async notifyJobUpdate(
    userId: string,
    jobTitle: string,
    updateType: string,
    jobId: string
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.jobUpdate) {
      return;
    }

    await this.sendToUser({
      userId,
      title: "Actualización de trabajo",
      body: `${updateType}: ${jobTitle}`,
      data: {
        type: "job_update",
        jobId,
      },
      clickAction: `/jobs/${jobId}`,
    });
  }

  /**
   * Send notification for contract update
   */
  async notifyContractUpdate(
    userId: string,
    contractTitle: string,
    updateType: string,
    contractId: string
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.contractUpdate) {
      return;
    }

    await this.sendToUser({
      userId,
      title: "Actualización de contrato",
      body: `${updateType}: ${contractTitle}`,
      data: {
        type: "contract_update",
        contractId,
      },
      clickAction: `/contracts/${contractId}`,
      priority: "high",
    });
  }

  /**
   * Send notification for payment update
   */
  async notifyPaymentUpdate(
    userId: string,
    amount: number,
    updateType: string,
    paymentId: string
  ): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user?.notificationPreferences?.paymentUpdate) {
      return;
    }

    await this.sendToUser({
      userId,
      title: "Actualización de pago",
      body: `${updateType}: $${amount.toFixed(2)}`,
      data: {
        type: "payment_update",
        paymentId,
      },
      clickAction: `/payments/${paymentId}`,
      priority: "high",
    });
  }
}

// Export singleton instance
export default new FCMService();
