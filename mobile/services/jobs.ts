import { Job, PaginatedResponse, ApiResponse } from '../types';
import { get, post, put, del } from './api';
import { JOB_CATEGORIES, getCategoryById } from '../../shared/constants/categories';

export { getCategoryById };

/**
 * Servicio para gestión de trabajos
 */

interface JobFilters {
  status?: string;
  category?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
  search?: string;
  query?: string;
  sortBy?: string;
  tags?: string;
}

/**
 * Obtener lista de trabajos con filtros
 */
export async function getJobs(filters: JobFilters = {}): Promise<PaginatedResponse<Job>> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  const queryString = params.toString();
  const endpoint = `/jobs${queryString ? `?${queryString}` : ''}`;

  const response = await get<PaginatedResponse<Job>>(endpoint, false);

  return response as any; // La respuesta ya viene en formato PaginatedResponse
}

/**
 * Obtener detalle de un trabajo
 */
export async function getJob(id: string): Promise<ApiResponse<{ job: Job }>> {
  return get<{ job: Job }>(`/jobs/${id}`, false);
}

/**
 * Obtener trabajos del usuario como cliente
 */
export async function getMyJobs(): Promise<ApiResponse<{ jobs: Job[] }>> {
  return get<{ jobs: Job[] }>('/jobs/my-jobs');
}

/**
 * Obtener trabajos donde el usuario aplicó como trabajador (via proposals)
 */
export async function getWorkerJobs(): Promise<ApiResponse<{ jobs: Job[] }>> {
  return get<{ jobs: Job[] }>('/proposals?type=sent');
}

/**
 * Crear un nuevo trabajo
 */
export async function createJob(data: Partial<Job>): Promise<ApiResponse<{ job: Job }>> {
  return post<{ job: Job }>('/jobs', data);
}

/**
 * Actualizar un trabajo
 */
export async function updateJob(id: string, data: Partial<Job>): Promise<ApiResponse<{ job: Job }>> {
  return put<{ job: Job }>(`/jobs/${id}`, data);
}

/**
 * Pausar un trabajo
 */
export async function pauseJob(id: string): Promise<ApiResponse<{ job: Job }>> {
  return post<{ job: Job }>(`/jobs/${id}/pause`, {});
}

/**
 * Reanudar un trabajo
 */
export async function resumeJob(id: string): Promise<ApiResponse<{ job: Job }>> {
  return post<{ job: Job }>(`/jobs/${id}/resume`, {});
}

/**
 * Cancelar un trabajo
 */
export async function cancelJob(id: string, reason?: string): Promise<ApiResponse<{ job: Job }>> {
  return post<{ job: Job }>(`/jobs/${id}/cancel`, { reason });
}

/**
 * Pagar publicación de trabajo (legacy)
 */
export async function payJobPublication(id: string): Promise<ApiResponse<{ preferenceId: string; initPoint: string }>> {
  return post<{ preferenceId: string; initPoint: string }>(`/jobs/${id}/pay`, {});
}

/**
 * Crear orden de pago para publicación de trabajo
 * Maneja: contratos gratis, MercadoPago, transferencia bancaria
 */
export async function createJobPaymentOrder(jobId: string, paymentMethod: 'mercadopago' | 'bank_transfer' = 'mercadopago'): Promise<ApiResponse<{
  requiresPayment?: boolean;
  approvalUrl?: string;
  paymentId?: string;
  amount?: number;
  job?: Job;
  bankDetails?: {
    accountHolder: string;
    cuit: string;
    bank: string;
    cbu: string;
    alias: string;
  };
}>> {
  return post('/payments/create-order', {
    jobId,
    paymentType: 'job_publication',
    paymentMethod,
  });
}

/**
 * Obtener categorías de trabajos (sincronizado con shared/constants/categories)
 */
export function getCategories() {
  return JOB_CATEGORIES;
}
