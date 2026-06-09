import { Membership } from "../models/sql/Membership.model.js";
import { User } from "../models/sql/User.model.js";
import currencyExchange from './currencyExchange.js';
import { Op } from 'sequelize';

// Stub for legacy code — MP subscription methods not yet migrated to Sequelize
const mercadopago: any = {
  createSubscription: async () => null,
  cancelSubscription: async () => null,
};

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

      const membership = await Membership.create({
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

      const paymentPreference = await mercadopago.createSubscription(userId, priceARS);

      user.hasMembership = true;
      user.membershipExpiresAt = endDate;
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
      const membership = await Membership.findOne({ where: { userId } });
      if (!membership) {
        throw new Error('Membership not found');
      }

      membership.status = 'active';
      membership.lastPaymentDate = new Date();
      await membership.save();

      // Actualizar usuario con membresía PRO
      const user = await User.findByPk(userId);
      if (user) {
        // Monthly free-contract counters live on the Membership row, not User.
        user.membershipTier = 'pro';
        user.hasMembership = true;
        user.isPremiumVerified = false; // Activar después de KYC
        user.currentCommissionRate = 3; // 3% para PRO
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
  async useContract(userId: string, contractId: string, contractAmount: number = 0): Promise<{
    isFree: boolean;
    commissionPercentage: number;
  }> {
    try {
      const membership = await Membership.findOne({ where: { userId, status: 'active' } });

      if (!membership || !membership.isActive()) {
        return { isFree: false, commissionPercentage: 8 }; // FREE = 8%
      }

      // useContract persists the change itself (no extra save needed).
      const result = await membership.useContract(contractId, contractAmount);

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
      const membership = await Membership.findOne({ where: { userId } });
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
        user.currentCommissionRate = 8; // vuelve a FREE = 8%
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
      const membership = await Membership.findOne({ where: { userId } });
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
        user.membershipExpiresAt = newEndDate;
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
      const membership = await Membership.findOne({ where: { userId } });
      if (!membership) {
        return null;
      }

      return {
        ...membership.toJSON(),
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
      const expiredMemberships = await Membership.findAll({
        where: {
          status: 'active',
          endDate: { [Op.lt]: new Date() },
        },
      });

      for (const membership of expiredMemberships) {
        if (membership.autoRenew) {
          await this.renewMembership(membership.userId.toString());
        } else {
          membership.status = 'expired';
          await membership.save();

          await User.update(
            { hasMembership: false, currentCommissionRate: 8 }, // vuelve a FREE = 8%
            { where: { id: membership.userId } }
          );
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
