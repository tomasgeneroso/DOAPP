import { Membership } from "../models/sql/Membership.model.js";
import { User } from "../models/sql/User.model.js";
import vexorService from './vexor.js';
import currencyExchange from './currencyExchange.js';
import { Op } from 'sequelize';

class MembershipService {
  /**
   * Crear una nueva membresía para un usuario
   */
  async createMembership(userId: string) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.hasMembership) {
        throw new Error('User already has an active membership');
      }

      const priceUSD = 6;
      const exchangeRate = await currencyExchange.getUSDtoARSRate();
      const priceARS = await currencyExchange.convertUSDtoARS(priceUSD);

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      const membership = new Membership({
        userId,
        status: 'pending',
        startDate,
        endDate,
        priceUSD,
        priceARS,
        exchangeRateAtPurchase: exchangeRate,
        freeContractsTotal: 5,
        freeContractsRemaining: 5,
        nextPaymentDate: endDate,
      });

      await membership.save();

      const paymentPreference = await mercadopago.createSubscription(userId, priceARS);

      user.hasMembership = true;
      user.membershipId = membership._id as mongoose.Types.ObjectId;
      user.membershipStartDate = startDate;
      user.membershipEndDate = endDate;
      await user.save();

      return {
        membership,
        paymentPreference,
      };
    } catch (error) {
      console.error('Error creating membership:', error);
      throw error;
    }
  }

  /**
   * Activar membresía después del pago exitoso
   */
  async activateMembership(userId: string, paymentId: string) {
    try {
      const membership = await Membership.findOne({ userId });
      if (!membership) {
        throw new Error('Membership not found');
      }

      membership.status = 'active';
      membership.lastPaymentDate = new Date();
      await membership.save();

      // Actualizar usuario con membresía PRO
      const user = await User.findByPk(userId);
      if (user) {
        user.membershipTier = 'pro';
        user.hasMembership = true;
        user.isPremiumVerified = false; // Activar después de KYC
        user.monthlyContractsUsed = 0;
        user.monthlyFreeContractsLimit = 3;
        user.earnedBonusContract = false;
        user.lastMonthlyReset = new Date();
        user.currentCommissionRate = 2; // 2% para PRO
        await user.save();
        console.log('✅ Usuario actualizado a PRO:', user.email);
      }

      return membership;
    } catch (error) {
      console.error('Error activating membership:', error);
      throw error;
    }
  }

  /**
   * Usar un contrato con la membresía
   * Retorna si es gratis y qué porcentaje de comisión aplicar
   */
  async useContract(userId: string, contractId: string): Promise<{
    isFree: boolean;
    commissionPercentage: number;
  }> {
    try {
      const membership = await Membership.findOne({ userId, status: 'active' });

      if (!membership || !membership.isActive()) {
        return { isFree: false, commissionPercentage: 5 };
      }

      const result = membership.useContract(contractId as any);
      await membership.save();

      const user = await User.findByPk(userId);
      if (user) {
        user.currentCommissionRate = result.commissionPercentage;
        await user.save();
      }

      return result;
    } catch (error) {
      console.error('Error using contract:', error);
      throw error;
    }
  }

  /**
   * Cancelar membresía
   */
  async cancelMembership(userId: string, reason?: string) {
    try {
      const membership = await Membership.findOne({ userId });
      if (!membership) {
        throw new Error('Membership not found');
      }

      membership.status = 'cancelled';
      membership.cancelledAt = new Date();
      membership.cancellationReason = reason;
      membership.willExpireAt = membership.endDate;
      membership.autoRenew = false;

      await membership.save();

      if (membership.mercadopagoSubscriptionId) {
        await mercadopago.cancelSubscription(membership.mercadopagoSubscriptionId);
      }

      const user = await User.findByPk(userId);
      if (user) {
        user.hasMembership = false;
        user.currentCommissionRate = 5;
        await user.save();
      }

      return membership;
    } catch (error) {
      console.error('Error cancelling membership:', error);
      throw error;
    }
  }

  /**
   * Renovar membresía automáticamente
   */
  async renewMembership(userId: string) {
    try {
      const membership = await Membership.findOne({ userId });
      if (!membership) {
        throw new Error('Membership not found');
      }

      if (!membership.autoRenew) {
        return null;
      }

      const priceARS = await currencyExchange.convertUSDtoARS(6);
      const newEndDate = new Date(membership.endDate);
      newEndDate.setMonth(newEndDate.getMonth() + 1);

      membership.endDate = newEndDate;
      membership.nextPaymentDate = newEndDate;
      membership.lastPaymentDate = new Date();

      await membership.save();

      const user = await User.findByPk(userId);
      if (user) {
        user.membershipEndDate = newEndDate;
        await user.save();
      }

      return membership;
    } catch (error) {
      console.error('Error renewing membership:', error);
      throw error;
    }
  }

  /**
   * Obtener información de membresía de un usuario
   */
  async getMembershipInfo(userId: string) {
    try {
      const membership = await Membership.findOne({ userId }).lean();
      if (!membership) {
        return null;
      }

      return {
        ...membership,
        isActive: membership.status === 'active' && new Date(membership.endDate) > new Date(),
        daysRemaining: Math.ceil((new Date(membership.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      };
    } catch (error) {
      console.error('Error getting membership info:', error);
      throw error;
    }
  }

  /**
   * Verificar membresías expiradas y actualizarlas
   */
  async checkExpiredMemberships() {
    try {
      const expiredMemberships = await Membership.find({
        status: 'active',
        endDate: { [Op.lt]: new Date() },
      });

      for (const membership of expiredMemberships) {
        if (membership.autoRenew) {
          await this.renewMembership(membership.userId.toString());
        } else {
          membership.status = 'expired';
          await membership.save();

          await User.findByIdAndUpdate(membership.userId, {
            hasMembership: false,
            currentCommissionRate: 5,
          });
        }
      }

      return expiredMemberships.length;
    } catch (error) {
      console.error('Error checking expired memberships:', error);
      throw error;
    }
  }
}

export default new MembershipService();
