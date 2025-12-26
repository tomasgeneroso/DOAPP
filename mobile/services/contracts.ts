import { Contract, ApiResponse } from '../types';
import { get, post, put } from './api';

/**
 * Servicio para gestión de contratos
 */

/**
 * Obtener contratos del usuario
 */
export async function getContracts(): Promise<ApiResponse<{ contracts: Contract[] }>> {
  return get<{ contracts: Contract[] }>('/contracts');
}

/**
 * Obtener detalle de un contrato
 */
export async function getContract(id: string): Promise<ApiResponse<{ contract: Contract }>> {
  return get<{ contract: Contract }>(`/contracts/${id}`);
}

/**
 * Obtener contratos por trabajo
 */
export async function getContractsByJob(jobId: string): Promise<ApiResponse<{ contracts: Contract[] }>> {
  return get<{ contracts: Contract[] }>(`/contracts/by-job/${jobId}`);
}

/**
 * Crear contrato desde propuesta aprobada
 */
export async function createContract(data: {
  proposalId: string;
  allocatedAmount?: number;
}): Promise<ApiResponse<{ contract: Contract }>> {
  return post<{ contract: Contract }>('/contracts', data);
}

/**
 * Confirmar contrato (bidireccional)
 */
export async function confirmContract(id: string): Promise<ApiResponse<{ contract: Contract }>> {
  return post<{ contract: Contract }>(`/contracts/${id}/confirm`, {});
}

/**
 * Solicitar extensión de contrato
 */
export async function requestExtension(id: string, data: {
  newEndDate: string;
  reason?: string;
  additionalAmount?: number;
}): Promise<ApiResponse<{ contract: Contract }>> {
  return post<{ contract: Contract }>(`/contracts/${id}/request-extension`, data);
}

/**
 * Aprobar extensión de contrato
 */
export async function approveExtension(id: string): Promise<ApiResponse<{ contract: Contract }>> {
  return post<{ contract: Contract }>(`/contracts/${id}/approve-extension`, {});
}

/**
 * Rechazar extensión de contrato
 */
export async function rejectExtension(id: string, reason?: string): Promise<ApiResponse<{ contract: Contract }>> {
  return post<{ contract: Contract }>(`/contracts/${id}/reject-extension`, { reason });
}

/**
 * Abrir disputa en contrato
 */
export async function disputeContract(id: string, data: {
  reason: string;
  description: string;
}): Promise<ApiResponse<{ contract: Contract }>> {
  return post<{ contract: Contract }>(`/contracts/${id}/dispute`, data);
}

/**
 * Modificar precio del contrato
 */
export async function modifyContractPrice(id: string, data: {
  newPrice: number;
  reason: string;
}): Promise<ApiResponse<{ contract: Contract }>> {
  return put<{ contract: Contract }>(`/contracts/${id}/modify-price`, data);
}
