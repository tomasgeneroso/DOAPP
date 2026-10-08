/**
 * Commission Service
 *
 * Sistema de comisiones.
 *
 * La comisión es UNA sola para todos los planes (`COMMISSION_RATES`, en
 * shared/constants/membershipPricing.ts), a cargo del cliente. La membresía PRO
 * (un solo plan pago, `MEMBERSHIP_PRICES_EUR.pro`) da visibilidad y NO la modifica.
 * Este comentario tenía la tabla vieja (8% / 3% / 1%, PRO $4,999, SUPER PRO $8,999)
 * y un mínimo de $1,000: nada de eso se cobra. Los números viven en las constantes.
 *
 * Excepciones, en el orden en que se evalúan:
 * - Beta: 0% para todos, hasta la fecha de cierre (`isBetaPhase`).
 * - Plan Familia: 0%.
 * - Contrato gratuito (`isFreeContract`, o FREE con `freeContractsRemaining`): 0%.
 *
 * Piso de la comisión: `MINIMUM_COMMISSION_EUR`, convertido a pesos con la cotización de
 * respaldo (`MINIMUM_COMMISSION_ARS`). Los Términos (7.4) prometen el cambio del día y el
 * código todavía no lo cumple del todo: es una diferencia pendiente, no un dato resuelto.
 */

import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { isBetaPhase } from './platformPhase.js';
import { MINIMUM_COMMISSION_ARS } from '../../shared/pricing/minimums.js';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR } from '../../shared/constants/membershipPricing.js';

// Las tasas viven en shared/constants/membershipPricing.ts junto con el
// precio de los planes: cambiar una sin la otra rompe el calculo del punto
// de equilibrio que se le muestra al trabajador.
//
// Los imports van todos arriba a proposito: bajo CommonJS se convierten en
// require() en el lugar donde estan, asi que un import debajo de su uso revienta
// aunque en ESM funcione por hoisting. Es el tipo de diferencia que aparece
// recien al correr los tests.
const FREE_COMMISSION_RATE = COMMISSION_RATES.free;
const PRO_COMMISSION_RATE = COMMISSION_RATES.pro;
const SUPER_PRO_COMMISSION_RATE = COMMISSION_RATES.super_pro;
const MINIMUM_COMMISSION = MINIMUM_COMMISSION_ARS;

/**
 * Cómo se le describe la comisión al usuario (`tierDescription`, que llega a la
 * pantalla de pago). Salía escrita a mano —'FREE (8% fijo)', 'PRO (3% fijo)',
 * 'SUPER PRO (1% fijo)'— mientras se cobraba el 10%, y se le mostraba a la gente.
 */
const describirTasa = (rate: number) => `Comisión del ${rate}%`;

/**
 * IVA on DOAPP's own fee.
 *
 * The taxable base is the commission, not the contract: the platform invoices
 * its intermediation service, and the work itself is a contract between client
 * and worker that DOAPP is explicitly not a party to (Terms, clause 2). A
 * registered worker invoices their own IVA separately.
 *
 * Consequence worth keeping in mind: with a zero commission the IVA on the
 * commission is zero too.
 *
 * Pero el cliente NO paga exactamente el precio del trabajo durante la beta, y
 * este comentario decia que si. Lo que no se cobra en la beta es la comision;
 * el costo de procesamiento del pago se cobra igual, porque Mercado Pago lo
 * cobra igual. Si se lo perdonara, cada operacion de la beta le costaria plata
 * a DOAPP -- y el proposito de la beta es no cobrar comision, no subsidiar a la
 * pasarela.
 *
 * Esta escrito en los terminos (clausula 7.3: "se cobra tambien durante la
 * beta") y lo fija tests/procesamientoEnBeta.test.ts.
 */
const VAT_RATE = 21;

export interface CommissionResult {
  rate: number;                   // Porcentaje de comisión (ej: 6)
  commission: number;             // Monto de comisión calculado
  monthlyVolume: number;          // Volumen mensual actual del usuario
  tierDescription: string;        // Descripción del tier actual
  isFamilyPlan: boolean;          // Si tiene plan familia
  isFreeContract: boolean;        // Si es contrato gratuito
  minimumApplied: boolean;        // Si se aplicó el piso de la comisión (MINIMUM_COMMISSION_EUR)
  vatRate: number;                // Alícuota de IVA aplicada a la comisión
  vat: number;                    // IVA sobre la comisión
  totalFee: number;               // Lo que cobra la plataforma: comisión + IVA
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
 * Get the commission rate (flat, the same for every plan)
 */
export function getCommissionRateByVolume(_monthlyVolume: number): { rate: number; tierDescription: string } {
  // El porcentaje sale de la constante, no del texto: decia 8% mientras el
  // codigo cobraba 10%, y ese texto se le muestra al usuario.
  return { rate: FREE_COMMISSION_RATE, tierDescription: describirTasa(FREE_COMMISSION_RATE) };
}

/**
 * Calculate commission for a contract
 *
 * @param userId - The client's user ID
 * @param contractPrice - The price of the contract
 * @param options - Additional options (isFreeContract, etc.)
 */
/** Everything except the tax, which the wrapper below adds in one place. */
type CommissionBase = Omit<CommissionResult, 'vatRate' | 'vat' | 'totalFee'>;

/**
 * Commission plus IVA.
 *
 * The tax is applied here rather than inside each branch of the calculation:
 * that function returns from half a dozen places (family plan, free contract,
 * beta, each tier, and a "user not found" fallback), and adding the same three
 * lines to every one of them is how one branch quietly ends up untaxed.
 */
export async function calculateCommission(
  userId: string,
  contractPrice: number,
  options: {
    isFreeContract?: boolean;
    skipVolumeCheck?: boolean;
    currentVolume?: number;
  } = {},
): Promise<CommissionResult> {
  const base = await computeCommissionBase(userId, contractPrice, options);
  // Rounded to cents: this figure ends up on an invoice.
  const vat = Math.round(base.commission * (VAT_RATE / 100) * 100) / 100;
  return {
    ...base,
    vatRate: VAT_RATE,
    vat,
    totalFee: Math.round((base.commission + vat) * 100) / 100,
  };
}

async function computeCommissionBase(
  userId: string,
  contractPrice: number,
  options: {
    isFreeContract?: boolean;
    skipVolumeCheck?: boolean;
    currentVolume?: number;
  } = {}
): Promise<CommissionBase> {
  // 0. Beta phase = no commission for anybody.
  //
  // Checked before anything else, including the user lookup: during the beta
  // the plan is irrelevant, and the "user not found" path below defaults to the flat rate,
  // which would silently charge a commission the platform has publicly said it
  // is not charging. This is the single funnel every caller goes through
  // (contracts, jobs, admin, price changes), so one branch covers all of them.
  if (await isBetaPhase()) {
    return {
      rate: 0,
      commission: 0,
      monthlyVolume: 0,
      tierDescription: 'Beta (sin comision)',
      isFamilyPlan: false,
      isFreeContract: false,
      minimumApplied: false,
    };
  }

  // Get user to check for membership, family plan, etc.
  const user = await User.findByPk(userId);
  if (!user) {
    // Sin usuario, la tasa del plan FREE. No es un numero suelto: sale de
    // COMMISSION_RATES, asi que no puede quedar atras si la comision cambia.
    const calculatedCommission = contractPrice * (FREE_COMMISSION_RATE / 100);
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: FREE_COMMISSION_RATE,
      commission,
      monthlyVolume: 0,
      tierDescription: describirTasa(FREE_COMMISSION_RATE),
      isFamilyPlan: false,
      isFreeContract: false,
      minimumApplied: commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION,
    };
  }

  const hasFamilyPlan = user.hasFamilyPlan === true;
  const membershipType = user.membershipTier || 'free';
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

  // 3. PRO membership: la misma tasa (la membresía no modifica la comisión)
  if (membershipType === 'pro') {
    const calculatedCommission = contractPrice * (PRO_COMMISSION_RATE / 100);
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: PRO_COMMISSION_RATE,
      commission,
      monthlyVolume: 0,
      tierDescription: describirTasa(PRO_COMMISSION_RATE),
      isFamilyPlan: false,
      isFreeContract: false,
      minimumApplied: commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION,
    };
  }

  // 4. SUPER PRO (cuentas heredadas; ya no se vende): la misma tasa
  if (membershipType === 'super_pro') {
    const calculatedCommission = contractPrice * (SUPER_PRO_COMMISSION_RATE / 100);
    const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
    return {
      rate: SUPER_PRO_COMMISSION_RATE,
      commission,
      monthlyVolume: 0,
      tierDescription: describirTasa(SUPER_PRO_COMMISSION_RATE),
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

  // 6. FREE user WITHOUT available contracts: la tasa fija
  const monthlyVolume = options.currentVolume ?? await getUserMonthlyVolume(userId);
  const calculatedCommission = contractPrice * (FREE_COMMISSION_RATE / 100);
  const commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
  const minimumApplied = commission === MINIMUM_COMMISSION && calculatedCommission < MINIMUM_COMMISSION;

  return {
    rate: FREE_COMMISSION_RATE,
    commission,
    monthlyVolume,
    tierDescription: describirTasa(FREE_COMMISSION_RATE),
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

  const membershipType = user?.membershipTier || 'free';
  const monthlyVolume = await getUserMonthlyVolume(userId);

  // `nextTier` es siempre null: subir de plan NO baja la comisión (la membresía da
  // visibilidad). Sugerir "pasate a PRO" o "a SUPER PRO" con una tasa menor era
  // mostrar un ahorro que no existe. Nadie consume este campo hoy.
  if (membershipType === 'super_pro') {
    return {
      rate: SUPER_PRO_COMMISSION_RATE,
      monthlyVolume,
      tierDescription: describirTasa(SUPER_PRO_COMMISSION_RATE),
      nextTier: null,
    };
  }

  if (membershipType === 'pro') {
    return {
      rate: PRO_COMMISSION_RATE,
      monthlyVolume,
      tierDescription: describirTasa(PRO_COMMISSION_RATE),
      nextTier: null,
    };
  }

  // Free user
  return {
    rate: FREE_COMMISSION_RATE,
    monthlyVolume,
    tierDescription: describirTasa(FREE_COMMISSION_RATE),
    nextTier: null,
  };
}

/**
 * Get all commission plans (for API/frontend display)
 */
export function getCommissionTiers() {
  return [
    { plan: 'free', rate: FREE_COMMISSION_RATE, priceEUR: 0, description: `FREE - ${FREE_COMMISSION_RATE}% de comisión` },
    { plan: 'pro', rate: PRO_COMMISSION_RATE, priceEUR: MEMBERSHIP_PRICES_EUR.pro, description: `PRO - ${PRO_COMMISSION_RATE}% de comisión (€${MEMBERSHIP_PRICES_EUR.pro}/mes)` },
    // SUPER PRO no se ofrece mas; se lista aparte para las cuentas que ya lo tienen.
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
