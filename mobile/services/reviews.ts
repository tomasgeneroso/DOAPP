import { ApiResponse } from '../types';
import { get, post } from './api';

export interface ReviewData {
  contractId: string;
  rating: number;
  comment: string;
  communication?: number;
  professionalism?: number;
  quality?: number;
  timeliness?: number;
}

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string;
  communication?: number;
  professionalism?: number;
  quality?: number;
  timeliness?: number;
  reviewerRole?: 'client' | 'doer';
  createdAt: string;
  reviewer?: { id: string; name: string; avatar?: string };
  contract?: {
    id: string;
    clientId: string;
    doerId: string;
    startDate: string;
    endDate: string;
    actualStartDate?: string;
    actualEndDate?: string;
    job?: { id: string; title: string; category: string };
  };
  response?: string;
}

/**
 * Verificar si ya se dejó opinión en un contrato
 */
export async function checkReview(contractId: string): Promise<ApiResponse<{ hasReviewed: boolean }>> {
  return get<{ hasReviewed: boolean }>(`/reviews/check/${contractId}`);
}

/**
 * Enviar opinión
 */
export async function submitReview(data: ReviewData): Promise<ApiResponse<any>> {
  return post('/reviews', data);
}

/**
 * Obtener opiniones de un usuario
 */
export async function getUserReviews(userId: string, limit = 50): Promise<ApiResponse<ReviewItem[]>> {
  return get<ReviewItem[]>(`/reviews/user/${userId}?limit=${limit}`);
}

/**
 * Responder a una opinión
 */
export async function respondToReview(reviewId: string, response: string): Promise<ApiResponse<any>> {
  return post(`/reviews/${reviewId}/respond`, { response });
}
