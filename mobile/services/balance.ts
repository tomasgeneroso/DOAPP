import { BalanceTransaction, WithdrawalRequest, ApiResponse } from '../types';
import { get, post } from './api';
import type { AFavorPendienteItem, CobroPendiente } from '../../shared/pagos/aFavorPendiente';

/**
 * Servicio para gestión de balance y retiros
 */

interface BalanceData {
  balance: number;
  pendingBalance: number;
  availableBalance: number;
  /** Lo que se puede retirar ahora (el resto ya está en el saldo de DOAPP pero Mercado Pago todavía no liberó ese pago). */
  disponibleParaRetirar?: number;
  enLiberacion?: number;
  proximaLiberacion?: string | null;
  /** A favor PENDIENTE de liquidar: todavía no está en el saldo (Mercado Pago no liberó el pago original). */
  aFavorPendiente?: number;
  proximaLiquidacion?: string | null;
  /** Cada cosa a favor pendiente, con su motivo y la fecha en que pasa al saldo. */
  aFavorPendienteDetalle?: AFavorPendienteItem[];
  /** Una tarjeta por cada cobro pendiente (a favor pendiente, en liberación o cobro de un trabajo), con su contrato y su trabajo. */
  cobrosPendientes?: CobroPendiente[];
  /** Lo que cobra de trabajos de un solo lugar (lo paga el equipo): en espera de liberación, ya liberado para pedir, y ya pedido. */
  cobroDelTrabajoEnEspera?: number;
  cobroDelTrabajoLiberado?: number;
  cobroDelTrabajoPedido?: number;
}

interface BalanceSummary {
  totalEarned: number;
  totalWithdrawn: number;
  currentBalance: number;
  pendingWithdrawals: number;
}

/**
 * Obtener balance del usuario
 */
export async function getBalance(): Promise<ApiResponse<BalanceData>> {
  return get<BalanceData>('/balance');
}

/**
 * Obtener transacciones de balance
 */
export async function getTransactions(): Promise<ApiResponse<{ transactions: BalanceTransaction[] }>> {
  return get<{ transactions: BalanceTransaction[] }>('/balance/transactions');
}

/**
 * Obtener resumen de balance
 */
export async function getBalanceSummary(): Promise<ApiResponse<BalanceSummary>> {
  return get<BalanceSummary>('/balance/summary');
}

/**
 * Solicitar retiro
 */
export async function requestWithdrawal(data: {
  amount: number;
  cbu: string;
}): Promise<ApiResponse<{ withdrawal: WithdrawalRequest }>> {
  return post<{ withdrawal: WithdrawalRequest }>('/balance/withdraw', data);
}

/**
 * El trabajador pide el cobro de un contrato terminado de un solo lugar, cuando ya se liberó. No mueve plata: el equipo de DOAPP transfiere.
 */
export async function requestPayout(contractId: string): Promise<ApiResponse<{ pedidoEl: string; monto: number }>> {
  return post<{ pedidoEl: string; monto: number }>('/balance/request-payout', { contractId });
}

/**
 * Obtener historial de retiros
 */
export async function getWithdrawals(): Promise<ApiResponse<{ withdrawals: WithdrawalRequest[] }>> {
  return get<{ withdrawals: WithdrawalRequest[] }>('/balance/withdrawals');
}
