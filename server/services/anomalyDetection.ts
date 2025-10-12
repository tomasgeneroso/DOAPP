import { LoginDevice } from "../models/LoginDevice.js";
import User from "../models/User.js";
import emailService from "./email.js";
import mongoose from "mongoose";

export interface LoginAttempt {
  userId: mongoose.Types.ObjectId;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint?: string;
  country?: string;
  city?: string;
  timestamp: Date;
  success: boolean;
}

export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  reasons: string[];
  shouldBlock: boolean;
  shouldNotify: boolean;
}

class AnomalyDetectionService {
  /**
   * Detectar login anómalo
   */
  async detectAnomalousLogin(
    attempt: LoginAttempt
  ): Promise<AnomalyDetectionResult> {
    const reasons: string[] = [];
    let riskScore = 0;

    // 1. Verificar si es un dispositivo nuevo
    const isNewDevice = await this.isNewDevice(
      attempt.userId,
      attempt.deviceFingerprint
    );
    if (isNewDevice) {
      reasons.push("Dispositivo no reconocido");
      riskScore += 30;
    }

    // 2. Verificar si es una IP nueva
    const isNewIP = await this.isNewIP(attempt.userId, attempt.ipAddress);
    if (isNewIP) {
      reasons.push("IP no reconocida");
      riskScore += 20;
    }

    // 3. Verificar cambio de ubicación geográfica
    const locationChange = await this.detectLocationChange(
      attempt.userId,
      attempt.country,
      attempt.city
    );
    if (locationChange.isSignificant) {
      reasons.push(`Cambio de ubicación: ${locationChange.message}`);
      riskScore += locationChange.riskIncrease;
    }

    // 4. Verificar múltiples intentos fallidos recientes
    const failedAttempts = await this.getRecentFailedAttempts(attempt.userId);
    if (failedAttempts > 3) {
      reasons.push(`${failedAttempts} intentos fallidos recientes`);
      riskScore += 40;
    }

    // 5. Verificar login en hora inusual
    const isUnusualTime = this.isUnusualLoginTime(attempt.timestamp);
    if (isUnusualTime) {
      reasons.push("Login en hora inusual");
      riskScore += 10;
    }

    // 6. Verificar múltiples logins desde diferentes ubicaciones en corto tiempo
    const isImpossibleTravel = await this.detectImpossibleTravel(
      attempt.userId
    );
    if (isImpossibleTravel) {
      reasons.push("Viaje imposible detectado (logins desde ubicaciones distantes en poco tiempo)");
      riskScore += 50;
    }

    // Determinar nivel de riesgo
    let riskLevel: "low" | "medium" | "high" | "critical";
    if (riskScore >= 80) {
      riskLevel = "critical";
    } else if (riskScore >= 50) {
      riskLevel = "high";
    } else if (riskScore >= 30) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    const result: AnomalyDetectionResult = {
      isAnomalous: riskScore >= 30,
      riskLevel,
      reasons,
      shouldBlock: riskScore >= 80,
      shouldNotify: riskScore >= 30,
    };

    // Si es anómalo, registrar y notificar
    if (result.isAnomalous && attempt.success) {
      await this.handleAnomalousLogin(attempt, result);
    }

    return result;
  }

  /**
   * Verificar si es un dispositivo nuevo
   */
  private async isNewDevice(
    userId: mongoose.Types.ObjectId,
    deviceFingerprint?: string
  ): Promise<boolean> {
    if (!deviceFingerprint) return true;

    const device = await LoginDevice.findOne({
      userId,
      deviceFingerprint,
    });

    return !device;
  }

  /**
   * Verificar si es una IP nueva
   */
  private async isNewIP(
    userId: mongoose.Types.ObjectId,
    ipAddress: string
  ): Promise<boolean> {
    const device = await LoginDevice.findOne({
      userId,
      ipAddress,
    });

    return !device;
  }

  /**
   * Detectar cambio significativo de ubicación
   */
  private async detectLocationChange(
    userId: mongoose.Types.ObjectId,
    country?: string,
    city?: string
  ): Promise<{
    isSignificant: boolean;
    message: string;
    riskIncrease: number;
  }> {
    if (!country) {
      return { isSignificant: false, message: "", riskIncrease: 0 };
    }

    // Obtener último login del usuario
    const lastDevice = await LoginDevice.findOne({ userId })
      .sort({ lastLoginAt: -1 })
      .limit(1);

    if (!lastDevice || !lastDevice.country) {
      return { isSignificant: false, message: "", riskIncrease: 0 };
    }

    // Si el país cambió
    if (lastDevice.country !== country) {
      return {
        isSignificant: true,
        message: `${lastDevice.country} → ${country}`,
        riskIncrease: 40,
      };
    }

    // Si la ciudad cambió pero el país es el mismo
    if (lastDevice.city && city && lastDevice.city !== city) {
      return {
        isSignificant: true,
        message: `${lastDevice.city} → ${city}`,
        riskIncrease: 20,
      };
    }

    return { isSignificant: false, message: "", riskIncrease: 0 };
  }

  /**
   * Obtener número de intentos fallidos recientes (últimas 24 horas)
   */
  private async getRecentFailedAttempts(
    userId: mongoose.Types.ObjectId
  ): Promise<number> {
    // Esto requeriría un modelo de LoginAttempts que aún no tenemos
    // Por ahora retornamos 0
    // TODO: Implementar modelo LoginAttempts
    return 0;
  }

  /**
   * Verificar si el login es en hora inusual (entre 2am y 6am)
   */
  private isUnusualLoginTime(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    return hour >= 2 && hour <= 6;
  }

  /**
   * Detectar viaje imposible (logins desde ubicaciones distantes en poco tiempo)
   */
  private async detectImpossibleTravel(
    userId: mongoose.Types.ObjectId
  ): Promise<boolean> {
    // Obtener últimos 2 logins
    const recentDevices = await LoginDevice.find({ userId })
      .sort({ lastLoginAt: -1 })
      .limit(2);

    if (recentDevices.length < 2) {
      return false;
    }

    const [latest, previous] = recentDevices;

    // Si no hay información de país, no podemos detectar
    if (!latest.country || !previous.country) {
      return false;
    }

    // Si los países son diferentes
    if (latest.country !== previous.country) {
      // Verificar tiempo entre logins
      const timeDiff =
        latest.lastLoginAt.getTime() - previous.lastLoginAt.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      // Si los logins fueron en menos de 2 horas desde países diferentes
      if (hoursDiff < 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Manejar login anómalo
   */
  private async handleAnomalousLogin(
    attempt: LoginAttempt,
    result: AnomalyDetectionResult
  ): Promise<void> {
    try {
      // Obtener usuario
      const user = await User.findById(attempt.userId);
      if (!user) return;

      // Enviar notificación de email
      if (result.shouldNotify) {
        await this.sendAnomalyAlert(user, attempt, result);
      }

      // Registrar en audit log
      console.log(
        `[ANOMALY] Suspicious login detected for user ${user.email}:`,
        {
          riskLevel: result.riskLevel,
          reasons: result.reasons,
          ipAddress: attempt.ipAddress,
          userAgent: attempt.userAgent,
        }
      );
    } catch (error) {
      console.error("Error handling anomalous login:", error);
    }
  }

  /**
   * Enviar alerta de login anómalo
   */
  private async sendAnomalyAlert(
    user: any,
    attempt: LoginAttempt,
    result: AnomalyDetectionResult
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .alert { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
            .info-box { background: white; border: 1px solid #e5e7eb; border-radius: 5px; padding: 15px; margin: 15px 0; }
            .button { display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Actividad sospechosa detectada</h1>
            </div>
            <div class="content">
              <p>Hola ${user.name},</p>
              <p>Hemos detectado un inicio de sesión sospechoso en tu cuenta de DoApp.</p>

              <div class="alert">
                <strong>Nivel de riesgo: ${result.riskLevel.toUpperCase()}</strong>
              </div>

              <div class="info-box">
                <h3>Detalles del inicio de sesión:</h3>
                <ul>
                  <li><strong>Fecha:</strong> ${attempt.timestamp.toLocaleString()}</li>
                  <li><strong>IP:</strong> ${attempt.ipAddress}</li>
                  <li><strong>Ubicación:</strong> ${attempt.city || "Desconocida"}, ${attempt.country || "Desconocido"}</li>
                  <li><strong>Dispositivo:</strong> ${attempt.userAgent}</li>
                </ul>
              </div>

              <div class="info-box">
                <h3>Razones de la alerta:</h3>
                <ul>
                  ${result.reasons.map((reason) => `<li>${reason}</li>`).join("")}
                </ul>
              </div>

              <p><strong>¿Fuiste tú?</strong></p>
              <p>Si reconoces esta actividad, puedes ignorar este mensaje.</p>
              <p>Si NO fuiste tú, te recomendamos cambiar tu contraseña inmediatamente y revisar tu actividad reciente.</p>

              <a href="${process.env.CLIENT_URL}/reset-password" class="button">Cambiar contraseña</a>

              <p>Si necesitas ayuda, contacta con nuestro equipo de soporte.</p>
              <p>El equipo de DoApp</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await emailService.sendEmail({
      to: user.email,
      subject: "⚠️ Actividad sospechosa en tu cuenta - DoApp",
      html,
    });
  }
}

// Export singleton instance
export default new AnomalyDetectionService();
