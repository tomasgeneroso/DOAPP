/**
 * Commission Service
 *
 * Sistema de comisiones:
 *
 * 1. USUARIOS FREE:
 *    - 8% comisión fija
 *    - Contratos gratuitos (primeros 1000 usuarios): 0% comisión
 *
 * 2. USUARIOS PRO ($4,999 ARS/mes):
 *    - 3% comisión fija (3 contratos mensuales)
 *
 * 3. USUARIOS SUPER PRO ($8,999 ARS/mes):
 *    - 1% comisión fija (3 contratos mensuales)
 *
 * Excepciones:
 * - Plan Familia: 0% comisión
 * - Contratos gratuitos: 0% comisión
 *
 * Mínimo de comisión: $1,000 ARS
 */

import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';

// Fixed commission rates
const FREE_COMMISSION_RATE = 8;       // 8% for free users
const PRO_COMMISSION_RATE = 3;        // 3% for PRO
const SUPER_PRO_COMMISSION_RATE = 1;  // 1% for SUPER PRO

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
 * Get the commission rate for free users (flat 8%)
 */
export function getCommissionRateByVolume(_monthlyVolume: number): { rate: number; tierDescription: string } {
  return { rate: FREE_COMMISSION_RATE, tierDescription: 'FREE (8% fijo)' };
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
    // Default to 8% if user not found
    const calculatedCommission = contractPrice * (FREE_COMMISSION_RATE / 100);
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: FREE_COMMISSION_RATE,
      commission,
      monthlyVolume: 0,
      tierDescription: 'FREE (8% fijo)',
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
    const calculatedCommission = contractPrice * (PRO_COMMISSION_RATE / 100);
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: PRO_COMMISSION_RATE,
      commission,
      monthlyVolume: 0,
      tierDescription: 'PRO (3% fijo)',
      isFamilyPlan: false,
      isFreeContract: false,
      minimumApplied: commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION,
    };
  }

  // 4. SUPER PRO membership = 1% fixed commission
  if (membershipType === 'super_pro') {
    const calculatedCommission = contractPrice * (SUPER_PRO_COMMISSION_RATE / 100);
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: SUPER_PRO_COMMISSION_RATE,
      commission,
      monthlyVolume: 0,
      tierDescription: 'SUPER PRO (1% fijo)',
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

  // 6. FREE user WITHOUT available contracts = flat 8% commission
  const monthlyVolume = options.currentVolume ?? await getUserMonthlyVolume(userId);
  const calculatedCommission = contractPrice * (FREE_COMMISSION_RATE / 100);
  const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
  const minimumApplied = commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION;

  return {
    rate: FREE_COMMISSION_RATE,
    commission,
    monthlyVolume,
    tierDescription: 'FREE (8% fijo)',
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

  const membershipType = user?.membershipType || 'free';
  const monthlyVolume = await getUserMonthlyVolume(userId);

  if (membershipType === 'super_pro') {
    return {
      rate: SUPER_PRO_COMMISSION_RATE,
      monthlyVolume,
      tierDescription: 'SUPER PRO (1% fijo)',
      nextTier: null,
    };
  }

  if (membershipType === 'pro') {
    return {
      rate: PRO_COMMISSION_RATE,
      monthlyVolume,
      tierDescription: 'PRO (3% fijo)',
      nextTier: { volume: 0, rate: SUPER_PRO_COMMISSION_RATE }, // Suggest SUPER PRO
    };
  }

  // Free user
  return {
    rate: FREE_COMMISSION_RATE,
    monthlyVolume,
    tierDescription: 'FREE (8% fijo)',
    nextTier: { volume: 0, rate: PRO_COMMISSION_RATE }, // Suggest PRO
  };
}

/**
 * Get all commission plans (for API/frontend display)
 */
export function getCommissionTiers() {
  return [
    { plan: 'free', rate: FREE_COMMISSION_RATE, price: 0, description: 'FREE - 8% fijo' },
    { plan: 'pro', rate: PRO_COMMISSION_RATE, price: 4999, description: 'PRO - 3% fijo ($4,999/mes)' },
    { plan: 'super_pro', rate: SUPER_PRO_COMMISSION_RATE, price: 8999, description: 'SUPER PRO - 1% fijo ($8,999/mes)' },
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
