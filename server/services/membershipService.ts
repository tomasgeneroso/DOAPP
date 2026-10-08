import { Membership } from "../models/sql/Membership.model.js";
import { MEMBERSHIP_PRICES_EUR, COMMISSION_RATES } from '../../shared/constants/membershipPricing.js';
import { User } from "../models/sql/User.model.js";
import currencyExchange from './currencyExchange.js';
import { Payment } from "../models/sql/Payment.model.js";
import { Op } from 'sequelize';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un rechazo esperable (pago inexistente, sin confirmar, ya usado): la ruta lo traduce a 4xx, no a 500. */
export class MembershipError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'MembershipError';
  }
}

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

      // Priced in euros, charged in pesos at today's rate. priceARS and
      // exchangeRateAtPurchase below record exactly what was charged, so a past
      // payment is never recomputed when the rate moves.
      const priceEUR = MEMBERSHIP_PRICES_EUR.pro;
      const exchangeRate = await currencyExchange.getEURtoARSRate();
      const priceARS = await currencyExchange.convertEURtoARS(priceEUR);

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      const membership = await Membership.create({
        userId,
        status: 'pending',
        startDate,
        endDate,
        priceEUR,
        priceARS,
        exchangeRateAtPurchase: exchangeRate,
        freeContractsTotal: 5,
        freeContractsRemaining: 5,
        nextPaymentDate: endDate,
      });

      const paymentPreference = await mercadopago.createSubscription(userId, priceARS);

      // Ya NO se marca `hasMembership` acá: la membresía recién existe cuando se confirma el pago
      // (activateMembership). Antes quedaba "con membresía" desde antes de pagar, y como la preferencia
      // de pago era un stub que devuelve null, la ruta fallaba con un 500 con ese estado ya guardado.

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
      // Sin un pago confirmado no hay membresía. Esta función se llamaba con CUALQUIER `paymentId` (hasta
      // "x") y dejaba PRO a quien tuviera una fila de membresía, pagada o no, vencida o no. El pago tiene
      // que ser NUESTRO registro, del mismo usuario, de membresía y ya confirmado (por capture-order tras
      // verificarlo con MercadoPago, o por un administrador).
      const pago = typeof paymentId === 'string' && ES_UUID.test(paymentId)
        ? await Payment.findOne({ where: { id: paymentId, payerId: userId, paymentType: 'membership' } })
        : null;
      if (!pago) {
        throw new MembershipError('No encontramos un pago de membresía tuyo con ese identificador.', 404);
      }
      if (String(pago.status) !== 'completed') {
        throw new MembershipError('El pago de la membresía todavía no está confirmado.', 409);
      }

      const membership = await Membership.findOne({ where: { userId } });
      if (!membership) {
        throw new MembershipError('Membership not found', 404);
      }

      // Un pago sirve para UN período. Si ya respaldó esta membresía y hoy no está activa, reactivarla
      // con el mismo pago sería regalar otro mes.
      if (membership.lastPaymentId && String(membership.lastPaymentId) === String(pago.id) && membership.status !== 'active' && membership.status !== 'pending') {
        throw new MembershipError('Ese pago ya se usó para un período anterior.', 409);
      }

      membership.status = 'active';
      membership.lastPaymentDate = new Date();
      membership.lastPaymentId = pago.id as any;
      await membership.save();

      // Actualizar usuario con membresía PRO
      const user = await User.findByPk(userId);
      if (user) {
        // Monthly free-contract counters live on the Membership row, not User.
        user.membershipTier = 'pro';
        user.hasMembership = true;
        user.isPremiumVerified = false; // Activar después de KYC
        user.currentCommissionRate = COMMISSION_RATES.pro; // la membresía no modifica la comisión
        await user.save();
        console.log('✅ Usuario actualizado a PRO:', user.email);
      }

      return membership;
    } catch (error) {
      // Un rechazo esperable (pago inexistente o sin confirmar) no es un error del servidor.
      if (!(error instanceof MembershipError)) console.error('Error activating membership:', error);
      throw error;
    }
  }

  /**
   * Usar un contrato con la membresía
   * Retorna si es gratis y qué porcentaje de comisión aplicar
   *
   * Sin llamadores hoy: la comisión que se cobra sale de
   * commissionService.calculateCommission, no de acá.
   */
  async useContract(userId: string, contractId: string, contractAmount: number = 0): Promise<{
    isFree: boolean;
    commissionPercentage: number;
  }> {
    try {
      const membership = await Membership.findOne({ where: { userId, status: 'active' } });

      if (!membership || !membership.isActive()) {
        return { isFree: false, commissionPercentage: COMMISSION_RATES.free };
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
        user.currentCommissionRate = COMMISSION_RATES.free; // vuelve a la tasa estándar
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

      const priceARS = await currencyExchange.convertEURtoARS(MEMBERSHIP_PRICES_EUR.pro);
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
            { hasMembership: false, currentCommissionRate: COMMISSION_RATES.free }, // vuelve a la tasa estándar
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
