import { Referral } from "../models/sql/Referral.model.js";
import { User } from "../models/sql/User.model.js";

/**
 * Servicio de gestión de referidos
 *
 * Sistema para los primeros 1000 usuarios:
 * 1. Usuario nuevo recibe 1 contrato gratis al registrarse con código
 * 2. Usuario que refiere obtiene beneficios por cada referido que complete un contrato:
 *    - 1er referido: 2 contratos gratis
 *    - 2do referido: 1 contrato gratis
 *    - 3er referido: 3% de comisión (en lugar de 5%)
 * 3. Máximo 3 referidos por usuario
 */

class ReferralService {
  /**
   * Registrar un nuevo usuario con código de referido
   */
  async registerWithReferralCode(newUserId: string, referralCode: string) {
    try {
      const referrer = await User.findOne({
        where: { referralCode: referralCode.toUpperCase() }
      });

      if (!referrer) {
        throw new Error('Invalid referral code');
      }

      if (referrer.totalReferrals >= 3) {
        throw new Error('Referrer has reached maximum referrals (3)');
      }

      const newUser = await User.findByPk(newUserId);
      if (!newUser) {
        throw new Error('New user not found');
      }

      // Crear registro de referido
      const referral = await Referral.create({
        referrerId: referrer.id,
        referredUserId: newUser.id,
        referralCode: referrer.referralCode,
        usedCode: referralCode.toUpperCase(),
        status: 'registered',
        registeredAt: new Date(),
      });

      // Actualizar usuario referido: dar 1 contrato gratis si es early user
      if (newUser.isEarlyUser) {
        newUser.freeContractsRemaining += 1;
      }
      newUser.referredBy = referrer.id;
      await newUser.save();

      // Actualizar contador de referidos del referidor
      referrer.totalReferrals += 1;
      await referrer.save();

      return {
        success: true,
        referral,
        referrer: {
          name: referrer.name,
          totalReferrals: referrer.totalReferrals,
        },
      };
    } catch (error) {
      console.error('Error registering with referral code:', error);
      throw error;
    }
  }

  /**
   * Marcar que un referido completó su primer contrato
   * Esto activa el beneficio para el referidor
   */
  async markReferredUserFirstContract(userId: string) {
    try {
      const referral = await Referral.findOne({
        where: {
          referredUserId: userId,
          status: 'registered',
        }
      });

      if (!referral) {
        return null;
      }

      referral.status = 'completed';
      referral.firstContractCompletedAt = new Date();
      referral.referredFirstContractFree = true;
      await referral.save();

      // Otorgar beneficio al referidor
      await this.grantReferrerReward(referral.referrerId.toString());

      return referral;
    } catch (error) {
      console.error('Error marking first contract:', error);
      throw error;
    }
  }

  /**
   * Otorgar recompensa al referidor basado en cuántos referidos completados tiene
   */
  async grantReferrerReward(referrerId: string) {
    try {
      const referrer = await User.findByPk(referrerId);
      if (!referrer) {
        throw new Error('Referrer not found');
      }

      const completedReferrals = await Referral.count({ where: {
        referrerId,
        status: 'completed',
      } });

      referrer.completedReferrals = completedReferrals;

      let rewardType: 'two_free' | 'one_free' | 'reduced_commission' | undefined;
      let freeContractsToAdd = 0;
      let newCommissionRate = referrer.currentCommissionRate;

      if (completedReferrals === 1) {
        // Primer referido: 2 contratos gratis
        rewardType = 'two_free';
        freeContractsToAdd = 2;
      } else if (completedReferrals === 2) {
        // Segundo referido: 1 contrato gratis
        rewardType = 'one_free';
        freeContractsToAdd = 1;
      } else if (completedReferrals === 3) {
        // Tercer referido: comisión reducida permanente
        rewardType = 'reduced_commission';
        newCommissionRate = 3;
      }

      if (rewardType) {
        referrer.freeContractsRemaining += freeContractsToAdd;
        referrer.currentCommissionRate = newCommissionRate;
        referrer.referralBenefitsUsed = completedReferrals;
        await referrer.save();

        // Actualizar el registro de referido
        const referral = await Referral.findOne({
          where: {
            referrerId,
            status: 'completed',
          },
          order: [['firstContractCompletedAt', 'DESC']]
        });

        if (referral) {
          referral.rewardGranted = true;
          referral.rewardType = rewardType;
          referral.rewardGrantedAt = new Date();
          await referral.save();
        }
      }

      return {
        rewardType,
        freeContractsAdded: freeContractsToAdd,
        newCommissionRate,
        completedReferrals,
      };
    } catch (error) {
      console.error('Error granting referrer reward:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de referidos de un usuario
   */
  async getReferralStats(userId: string) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const referrals = await Referral.findAll({
        where: { referrerId: userId },
        include: [{
          model: User,
          as: 'referred',
          attributes: ['name', 'email', 'createdAt']
        }],
        order: [['createdAt', 'DESC']]
      });

      const stats = {
        totalReferrals: user.totalReferrals,
        completedReferrals: user.completedReferrals,
        maxReferrals: 3,
        canReferMore: user.totalReferrals < 3,
        referralCode: user.referralCode,
        currentCommissionRate: user.currentCommissionRate,
        freeContractsRemaining: user.freeContractsRemaining,
        referrals: referrals.map(r => ({
          id: r.id,
          status: r.status,
          registeredAt: r.registeredAt,
          firstContractCompletedAt: r.firstContractCompletedAt,
          rewardGranted: r.rewardGranted,
          rewardType: r.rewardType,
          referredUser: r.referredUserId,
        })),
      };

      return stats;
    } catch (error) {
      console.error('Error getting referral stats:', error);
      throw error;
    }
  }

  /**
   * Validar código de referido
   */
  async validateReferralCode(code: string) {
    try {
      const referrer = await User.findOne({
        where: { referralCode: code.toUpperCase() },
        attributes: ['name', 'totalReferrals', 'referralCode']
      });

      if (!referrer) {
        return { valid: false, message: 'Código de referido inválido' };
      }

      if (referrer.totalReferrals >= 3) {
        return { valid: false, message: 'Este código ha alcanzado el límite de referidos' };
      }

      return {
        valid: true,
        referrer: {
          name: referrer.name,
          code: referrer.referralCode,
          remainingSlots: 3 - referrer.totalReferrals,
        },
      };
    } catch (error) {
      console.error('Error validating referral code:', error);
      throw error;
    }
  }

  /**
   * Marcar los primeros 1000 usuarios
   */
  async markEarlyUser(userId: string) {
    try {
      const earlyUserCount = await User.count({ where: { isEarlyUser: true } });

      if (earlyUserCount >= 1000) {
        return { isEarlyUser: false, message: 'Early user limit reached' };
      }

      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.isEarlyUser = true;
      user.earlyUserNumber = earlyUserCount + 1;
      user.freeContractsRemaining = 1; // 1 contrato gratis para early users
      await user.save();

      return {
        isEarlyUser: true,
        earlyUserNumber: user.earlyUserNumber,
        freeContractsRemaining: user.freeContractsRemaining,
      };
    } catch (error) {
      console.error('Error marking early user:', error);
      throw error;
    }
  }
}

export default new ReferralService();
