import { BalanceTransaction, WithdrawalRequest, ApiResponse } from '../types';
import { get, post } from './api';

/**
 * Servicio para gestión de balance y retiros
 */

interface BalanceData {
  balance: number;
  pendingBalance: number;
  availableBalance: number;
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
 * Obtener historial de retiros
 */
export async function getWithdrawals(): Promise<ApiResponse<{ withdrawals: WithdrawalRequest[] }>> {
  return get<{ withdrawals: WithdrawalRequest[] }>('/balance/withdrawals');
}
