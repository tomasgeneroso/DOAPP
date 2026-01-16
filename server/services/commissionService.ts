/**
 * Commission Service
 *
 * Sistema de comisiones:
 *
 * 1. USUARIOS FREE (con contratos disponibles - primeros 1000 usuarios):
 *    Comisiones basadas en volumen mensual de contratos (en ARS):
 *    - $0 - $50,000:        6% comisión
 *    - $50,000 - $150,000:  4% comisión
 *    - $150,000 - $200,000: 3% comisión
 *    - +$200,000:           2% comisión
 *
 * 2. USUARIOS PRO (€5.99/mes):
 *    - 3% comisión fija (3 contratos mensuales)
 *
 * 3. USUARIOS SUPER PRO (€8.99/mes):
 *    - 2% comisión fija (3 contratos mensuales)
 *
 * Excepciones:
 * - Plan Familia: 0% comisión
 * - Contratos gratuitos (sin contratos disponibles): 0% comisión
 *
 * Mínimo de comisión: $1,000 ARS
 */

import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';

// Commission tiers based on monthly volume (in ARS)
const COMMISSION_TIERS = [
  { maxVolume: 50000, rate: 6 },      // $0 - $50,000: 6%
  { maxVolume: 150000, rate: 4 },     // $50,000 - $150,000: 4%
  { maxVolume: 200000, rate: 3 },     // $150,000 - $200,000: 3%
  { maxVolume: Infinity, rate: 2 },   // +$200,000: 2%
];

const MINIMUM_COMMISSION = 1000; // $1,000 ARS minimum

export interface CommissionResult {
  rate: number;                   // Porcentaje de comisión (ej: 6)
  commission: number;             // Monto de comisión calculado
  monthlyVolume: number;          // Volumen mensual actual del usuario
  tierDescription: string;        // Descripción del tier actual
  isFamilyPlan: boolean;          // Si tiene plan familia
  isFreeContract: boolean;        // Si es contrato gratuito
  minimumApplied: boolean;        // Si se aplicó el mínimo de $1,000
}

/**
 * Get the start of the current month
 */
function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get the end of the current month
 */
function getMonthEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Calculate the user's total contract volume for the current month
 */
export async function getUserMonthlyVolume(userId: string): Promise<number> {
  const monthStart = getMonthStart();
  const monthEnd = getMonthEnd();

  // Sum of all contract prices for this user in the current month
  // Consider contracts where the user is the client
  const result = await Contract.findAll({
    where: {
      clientId: userId,
      createdAt: {
        [Op.gte]: monthStart,
        [Op.lte]: monthEnd,
      },
      status: {
        [Op.notIn]: ['cancelled', 'rejected'],
      },
    },
    attributes: ['price'],
  });

  const totalVolume = result.reduce((sum, contract) => {
    const price = typeof contract.price === 'string'
      ? parseFloat(contract.price)
      : contract.price || 0;
    return sum + price;
  }, 0);

  return totalVolume;
}

/**
 * Get the commission rate based on monthly volume
 */
export function getCommissionRateByVolume(monthlyVolume: number): { rate: number; tierDescription: string } {
  for (const tier of COMMISSION_TIERS) {
    if (monthlyVolume < tier.maxVolume) {
      let description = '';
      if (tier.maxVolume === 50000) {
        description = '$0 - $50,000/mes';
      } else if (tier.maxVolume === 150000) {
        description = '$50,000 - $150,000/mes';
      } else if (tier.maxVolume === 200000) {
        description = '$150,000 - $200,000/mes';
      } else {
        description = '+$200,000/mes';
      }
      return { rate: tier.rate, tierDescription: description };
    }
  }

  // Default to highest tier (lowest rate)
  return { rate: 2, tierDescription: '+$200,000/mes' };
}

/**
 * Calculate commission for a contract
 *
 * @param userId - The client's user ID
 * @param contractPrice - The price of the contract
 * @param options - Additional options (isFreeContract, etc.)
 */
export async function calculateCommission(
  userId: string,
  contractPrice: number,
  options: {
    isFreeContract?: boolean;
    skipVolumeCheck?: boolean;
    currentVolume?: number;
  } = {}
): Promise<CommissionResult> {
  // Get user to check for membership, family plan, etc.
  const user = await User.findByPk(userId);
  if (!user) {
    // Default to 6% if user not found
    const calculatedCommission = contractPrice * 0.06;
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: 6,
      commission,
      monthlyVolume: 0,
      tierDescription: '$0 - $50,000/mes',
      isFamilyPlan: false,
      isFreeContract: false,
      minimumApplied: commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION,
    };
  }

  const hasFamilyPlan = user.hasFamilyPlan === true;
  const membershipType = user.membershipType || 'free';
  const freeContractsRemaining = user.freeContractsRemaining || 0;

  // 1. Family plan = 0% commission
  if (hasFamilyPlan) {
    return {
      rate: 0,
      commission: 0,
      monthlyVolume: 0,
      tierDescription: 'Plan Familia',
      isFamilyPlan: true,
      isFreeContract: false,
      minimumApplied: false,
    };
  }

  // 2. Free contract (passed as option) = 0% commission
  if (options.isFreeContract) {
    return {
      rate: 0,
      commission: 0,
      monthlyVolume: 0,
      tierDescription: 'Contrato Gratuito',
      isFamilyPlan: false,
      isFreeContract: true,
      minimumApplied: false,
    };
  }

  // 3. PRO membership = 3% fixed commission
  if (membershipType === 'pro') {
    const calculatedCommission = contractPrice * 0.03;
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: 3,
      commission,
      monthlyVolume: 0,
      tierDescription: 'PRO (3% fijo)',
      isFamilyPlan: false,
      isFreeContract: false,
      minimumApplied: commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION,
    };
  }

  // 4. SUPER PRO membership = 2% fixed commission
  if (membershipType === 'super_pro') {
    const calculatedCommission = contractPrice * 0.02;
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: 2,
      commission,
      monthlyVolume: 0,
      tierDescription: 'SUPER PRO (2% fijo)',
      isFamilyPlan: false,
      isFreeContract: false,
      minimumApplied: commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION,
    };
  }

  // 5. FREE user WITH available contracts = FREE (0% commission)
  // Los primeros 1000 usuarios tienen 3 contratos gratis
  if (membershipType === 'free' && freeContractsRemaining > 0) {
    return {
      rate: 0,
      commission: 0,
      monthlyVolume: 0,
      tierDescription: `Contrato Gratuito (${freeContractsRemaining} disponibles)`,
      isFamilyPlan: false,
      isFreeContract: true,
      minimumApplied: false,
    };
  }

  // 6. FREE user WITHOUT available contracts = volume-based commission
  // Cuando se agotan los contratos gratis, se aplica comisión por volumen
  const monthlyVolume = options.currentVolume ?? await getUserMonthlyVolume(userId);
  const { rate, tierDescription } = getCommissionRateByVolume(monthlyVolume);
  const calculatedCommission = contractPrice * (rate / 100);
  const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
  const minimumApplied = commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION;

  return {
    rate,
    commission,
    monthlyVolume,
    tierDescription: `FREE: ${tierDescription}`,
    isFamilyPlan: false,
    isFreeContract: false,
    minimumApplied,
  };
}

/**
 * Get commission rate for a user (for display purposes)
 */
export async function getUserCommissionRate(userId: string): Promise<{
  rate: number;
  monthlyVolume: number;
  tierDescription: string;
  nextTier: { volume: number; rate: number } | null;
}> {
  const user = await User.findByPk(userId);

  if (user?.hasFamilyPlan) {
    return {
      rate: 0,
      monthlyVolume: 0,
      tierDescription: 'Plan Familia',
      nextTier: null,
    };
  }

  const monthlyVolume = await getUserMonthlyVolume(userId);
  const { rate, tierDescription } = getCommissionRateByVolume(monthlyVolume);

  // Find next tier
  let nextTier: { volume: number; rate: number } | null = null;
  for (const tier of COMMISSION_TIERS) {
    if (monthlyVolume < tier.maxVolume) {
      // Current tier found, next tier is the next one
      const nextTierIndex = COMMISSION_TIERS.indexOf(tier) + 1;
      if (nextTierIndex < COMMISSION_TIERS.length) {
        const next = COMMISSION_TIERS[nextTierIndex];
        nextTier = { volume: tier.maxVolume, rate: next.rate };
      }
      break;
    }
  }

  return {
    rate,
    monthlyVolume,
    tierDescription,
    nextTier,
  };
}

/**
 * Get all commission tiers (for API/frontend display)
 */
export function getCommissionTiers() {
  return [
    { minVolume: 0, maxVolume: 50000, rate: 6, description: '$0 - $50,000/mes' },
    { minVolume: 50000, maxVolume: 150000, rate: 4, description: '$50,000 - $150,000/mes' },
    { minVolume: 150000, maxVolume: 200000, rate: 3, description: '$150,000 - $200,000/mes' },
    { minVolume: 200000, maxVolume: null, rate: 2, description: '+$200,000/mes' },
  ];
}

export default {
  calculateCommission,
  getUserCommissionRate,
  getUserMonthlyVolume,
  getCommissionRateByVolume,
  getCommissionTiers,
  MINIMUM_COMMISSION,
};
