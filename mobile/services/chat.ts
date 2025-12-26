import { Conversation, Message, ApiResponse } from '../types';
import { get, post } from './api';

/**
 * Servicio para gestión de chat/mensajería
 */

/**
 * Obtener conversaciones del usuario
 */
export async function getConversations(): Promise<ApiResponse<{ conversations: Conversation[] }>> {
  return get<{ conversations: Conversation[] }>('/chat/conversations');
}

/**
 * Obtener mensajes de una conversación
 */
export async function getMessages(conversationId: string, page: number = 1): Promise<ApiResponse<{
  messages: Message[];
  pagination: {
    page: number;
    pages: number;
    total: number;
  };
}>> {
  return get<{
    messages: Message[];
    pagination: {
      page: number;
      pages: number;
      total: number;
    };
  }>(`/chat/conversations/${conversationId}/messages?page=${page}`);
}

/**
 * Enviar mensaje
 */
export async function sendMessage(conversationId: string, data: {
  content: string;
  type?: 'text' | 'image' | 'file';
  attachments?: string[];
}): Promise<ApiResponse<{ message: Message }>> {
  return post<{ message: Message }>(`/chat/conversations/${conversationId}/messages`, data);
}

/**
 * Marcar mensajes como leídos
 */
export async function markAsRead(conversationId: string): Promise<ApiResponse<{ success: boolean }>> {
  return post<{ success: boolean }>(`/chat/conversations/${conversationId}/read`, {});
}

/**
 * Iniciar conversación con usuario
 */
export async function startConversation(data: {
  participantId: string;
  jobId?: string;
  initialMessage?: string;
}): Promise<ApiResponse<{ conversation: Conversation }>> {
  return post<{ conversation: Conversation }>('/chat/conversations', data);
}
