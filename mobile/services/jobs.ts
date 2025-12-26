import { Job, PaginatedResponse, ApiResponse } from '../types';
import { get, post, put, del } from './api';

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
 * Obtener trabajos del usuario como trabajador
 */
export async function getWorkerJobs(): Promise<ApiResponse<{ jobs: Job[] }>> {
  return get<{ jobs: Job[] }>('/jobs/worker-jobs');
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
 * Pagar publicación de trabajo
 */
export async function payJobPublication(id: string): Promise<ApiResponse<{ preferenceId: string; initPoint: string }>> {
  return post<{ preferenceId: string; initPoint: string }>(`/jobs/${id}/pay`, {});
}

/**
 * Obtener categorías de trabajos
 */
export function getCategories(): string[] {
  // Las categorías están definidas localmente para evitar una llamada API
  return [
    'Limpieza',
    'Jardinería',
    'Plomería',
    'Electricidad',
    'Carpintería',
    'Pintura',
    'Mudanzas',
    'Reparaciones',
    'Cuidado de mascotas',
    'Cuidado de niños',
    'Cuidado de adultos mayores',
    'Clases particulares',
    'Diseño gráfico',
    'Programación',
    'Marketing digital',
    'Fotografía',
    'Video',
    'Música',
    'Traducción',
    'Redacción',
    'Otro'
  ];
}
