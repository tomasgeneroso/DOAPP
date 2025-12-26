import { User, LoginCredentials, RegisterData, ApiResponse } from '../types';
import { post, get, setToken, setUser, clearAuth, getToken, getUser } from './api';

/**
 * Servicio de autenticación
 */

interface AuthResponse {
  token: string;
  user: User;
}

/**
 * Iniciar sesión con email y contraseña
 */
export async function login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
  const response = await post<AuthResponse>('/auth/login', credentials, false);

  if (response.success && response.data) {
    await setToken(response.data.token);
    await setUser(response.data.user);
  }

  return response;
}

/**
 * Registrar nuevo usuario
 */
export async function register(data: RegisterData): Promise<ApiResponse<AuthResponse>> {
  const response = await post<AuthResponse>('/auth/register', data, false);

  if (response.success && response.data) {
    await setToken(response.data.token);
    await setUser(response.data.user);
  }

  return response;
}

/**
 * Cerrar sesión
 */
export async function logout(): Promise<void> {
  try {
    // Llamar al endpoint de logout (opcional, para invalidar token en servidor)
    await post('/auth/logout', {});
  } catch (error) {
    console.error('Error calling logout endpoint:', error);
  } finally {
    // Siempre limpiar datos locales
    await clearAuth();
  }
}

/**
 * Obtener perfil del usuario actual
 */
export async function getMe(): Promise<ApiResponse<{ user: User }>> {
  return get<{ user: User }>('/auth/me');
}

/**
 * Verificar si el usuario está autenticado
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;

  // Verificar que el token sea válido
  const response = await getMe();
  return response.success;
}

/**
 * Obtener datos de autenticación almacenados
 */
export async function getStoredAuth(): Promise<{ token: string | null; user: User | null }> {
  const [token, user] = await Promise.all([getToken(), getUser()]);
  return { token, user };
}

/**
 * Solicitar recuperación de contraseña
 */
export async function forgotPassword(email: string): Promise<ApiResponse<void>> {
  return post<void>('/auth/forgot-password', { email }, false);
}

/**
 * Restablecer contraseña con token
 */
export async function resetPassword(token: string, password: string): Promise<ApiResponse<void>> {
  return post<void>('/auth/reset-password', { token, password }, false);
}

/**
 * Actualizar perfil del usuario
 */
export async function updateProfile(data: Partial<User>): Promise<ApiResponse<{ user: User }>> {
  const response = await post<{ user: User }>('/auth/profile', data);

  if (response.success && response.data) {
    await setUser(response.data.user);
  }

  return response;
}

/**
 * Cambiar contraseña
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ApiResponse<void>> {
  return post<void>('/auth/change-password', { currentPassword, newPassword });
}

/**
 * Verificar email con token
 */
export async function verifyEmail(token: string): Promise<ApiResponse<void>> {
  return get<void>(`/auth/verify-email/${token}`, false);
}

/**
 * Reenviar email de verificación
 */
export async function resendVerificationEmail(): Promise<ApiResponse<void>> {
  return post<void>('/auth/resend-verification', {});
}
