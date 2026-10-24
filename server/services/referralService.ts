import { Referral } from "../models/sql/Referral.model.js";
import { User } from "../models/sql/User.model.js";
import { otorgarContratosLibres, contratosLibresDisponibles } from "./exencionDeComision.js";
import { POLITICAS } from "../../shared/constants/policies.js";

/**
 * Servicio de gestión de referidos
 *
 * Sistema para las primeras cuentas (POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES, las mismas que reciben los contratos libres de lanzamiento):
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

      if (referrer.totalReferrals >= POLITICAS.REFERIDOS_MAXIMOS) {
        throw new Error(`Referrer has reached maximum referrals (${POLITICAS.REFERIDOS_MAXIMOS})`);
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

      // Actualizar usuario referido: contrato libre de comisión al registrarse con un código, si está entre las primeras cuentas
      if (newUser.isEarlyUser) {
        newUser.freeContractsRemaining += POLITICAS.REFERIDOS_CONTRATOS_AL_REGISTRARSE;
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
        // Primer referido: contratos libres de comisión
        rewardType = 'two_free';
        freeContractsToAdd = POLITICAS.REFERIDOS_PREMIO_PRIMERO_CONTRATOS;
      } else if (completedReferrals === 2) {
        // Segundo referido: contratos libres de comisión
        rewardType = 'one_free';
        freeContractsToAdd = POLITICAS.REFERIDOS_PREMIO_SEGUNDO_CONTRATOS;
      } else if (completedReferrals === POLITICAS.REFERIDOS_MAXIMOS) {
        // Tercer referido: comisión reducida por un tiempo (no permanente); `calculateCommission` la lee mientras no venza
        rewardType = 'reduced_commission';
        newCommissionRate = POLITICAS.COMISION_PREMIO_DE_REFERIDOS;
      }

      if (rewardType) {
        referrer.freeContractsRemaining += freeContractsToAdd;
        referrer.currentCommissionRate = newCommissionRate;
        referrer.referralBenefitsUsed = completedReferrals;

        // Si es el tercer referido, establecer fecha de expiración del descuento
        if (completedReferrals === POLITICAS.REFERIDOS_MAXIMOS) {
          const expirationDate = new Date(Date.now() + POLITICAS.DIAS_PREMIO_DE_REFERIDOS * 86_400_000);
          referrer.hasReferralDiscount = true;
          referrer.referralDiscountExpiresAt = expirationDate;
        }

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
        maxReferrals: POLITICAS.REFERIDOS_MAXIMOS,
        canReferMore: user.totalReferrals < POLITICAS.REFERIDOS_MAXIMOS,
        referralCode: user.referralCode,
        currentCommissionRate: user.currentCommissionRate,
        freeContractsRemaining: contratosLibresDisponibles(user).total,
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

      if (referrer.totalReferrals >= POLITICAS.REFERIDOS_MAXIMOS) {
        return { valid: false, message: 'Este código ha alcanzado el límite de referidos' };
      }

      return {
        valid: true,
        referrer: {
          name: referrer.name,
          code: referrer.referralCode,
          remainingSlots: POLITICAS.REFERIDOS_MAXIMOS - referrer.totalReferrals,
        },
      };
    } catch (error) {
      console.error('Error validating referral code:', error);
      throw error;
    }
  }

  /**
   * Marca a la cuenta como una de las primeras y le da sus contratos libres de comisión de lanzamiento, si todavía hay lugar. Es el mismo otorgamiento
   * que se hace al crear la cuenta (`otorgarContratosLibres`): llamarlo de nuevo no da dos veces.
   */
  async markEarlyUser(userId: string) {
    const r = await otorgarContratosLibres(userId);
    if (!r.otorgado) return { isEarlyUser: false, message: 'Early user limit reached or already marked' };
    const user = await User.findByPk(userId);
    return { isEarlyUser: true, earlyUserNumber: r.numero, freeContractsRemaining: user?.freeContractsRemaining };
  }
}

export default new ReferralService();
