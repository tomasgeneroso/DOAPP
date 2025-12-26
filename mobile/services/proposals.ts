import { Proposal, ApiResponse } from '../types';
import { get, post } from './api';

/**
 * Servicio para gestión de propuestas
 */

/**
 * Obtener propuestas de un trabajo
 */
export async function getProposalsByJob(jobId: string): Promise<ApiResponse<{ proposals: Proposal[] }>> {
  return get<{ proposals: Proposal[] }>(`/proposals/job/${jobId}`);
}

/**
 * Obtener mis propuestas
 */
export async function getMyProposals(): Promise<ApiResponse<{ proposals: Proposal[] }>> {
  return get<{ proposals: Proposal[] }>('/proposals/my-proposals');
}

/**
 * Crear propuesta para un trabajo
 */
export async function createProposal(data: {
  jobId: string;
  message?: string;
  proposedPrice?: number;
}): Promise<ApiResponse<{ proposal: Proposal }>> {
  return post<{ proposal: Proposal }>('/proposals', data);
}

/**
 * Aprobar propuesta (como cliente)
 */
export async function approveProposal(id: string): Promise<ApiResponse<{ proposal: Proposal }>> {
  return post<{ proposal: Proposal }>(`/proposals/${id}/approve`, {});
}

/**
 * Rechazar propuesta (como cliente)
 */
export async function rejectProposal(id: string, reason?: string): Promise<ApiResponse<{ proposal: Proposal }>> {
  return post<{ proposal: Proposal }>(`/proposals/${id}/reject`, { reason });
}

/**
 * Retirar propuesta (como doer)
 */
export async function withdrawProposal(id: string): Promise<ApiResponse<{ proposal: Proposal }>> {
  return post<{ proposal: Proposal }>(`/proposals/${id}/withdraw`, {});
}
