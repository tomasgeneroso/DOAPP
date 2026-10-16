import { User, LoginCredentials, RegisterData, ApiResponse } from '../types';
import { post, get, put, setToken, setUser, clearAuth, getToken, getUser } from './api';

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

  // Backend returns token/user at root level, not under data
  const authData = response.data || (response as any);
  if (response.success && authData.token) {
    await setToken(authData.token);
    await setUser(authData.user);
    response.data = { token: authData.token, user: authData.user };
  }

  return response;
}

/**
 * Iniciar sesión con el código de un solo uso que dejó el ingreso con Google/X (ver services/ingresoSocial.ts)
 */
export async function loginConCodigo(codigo: string): Promise<ApiResponse<AuthResponse & { needsDni?: boolean }>> {
  const response = await post<any>('/auth/app-login-code', { codigo }, false);
  const raw = response.data || (response as any);
  if (!response.success || !raw?.token) return response as any;

  await setToken(raw.token);
  const me = await getMe();
  if (!me.success || !me.data?.user) {
    await clearAuth();
    return { success: false, message: me.message || 'No se pudo cargar tu cuenta' } as any;
  }
  await setUser(me.data.user);
  return { success: true, data: { token: raw.token, user: me.data.user, needsDni: !!raw.needsDni } } as any;
}

/**
 * Registrar nuevo usuario
 */
export async function register(data: RegisterData): Promise<ApiResponse<AuthResponse>> {
  const response = await post<AuthResponse>('/auth/register', data, false);

  // Backend returns token/user at root level, not under data
  const authData = response.data || (response as any);
  if (response.success && authData.token) {
    await setToken(authData.token);
    await setUser(authData.user);
    response.data = { token: authData.token, user: authData.user };
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
  const response = await get<{ user: User }>('/auth/me');
  // Backend returns user at root level, not under data
  if (response.success && !response.data) {
    const raw = response as any;
    if (raw.user) {
      response.data = { user: raw.user };
    }
  }
  return response;
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
  const response = await put<{ user: User }>('/auth/update', data);

  const user = (response as any).user;
  if (response.success && user) {
    await setUser(user);
  }

  return response;
}

export async function updateSettings(data: Record<string, any>): Promise<ApiResponse<{ user: User }>> {
  const response = await put<{ user: User }>('/auth/settings', data);

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

/**
 * Cambiar la contraseña sin recordar la actual: el servidor envía un código de 6 números al correo (vale 5 minutos, un solo uso).
 */
export async function hasPassword(): Promise<ApiResponse<void> & { hasPassword?: boolean; isOAuth?: boolean }> {
  return get<void>('/auth/has-password') as any;
}

export async function enviarCodigoDeContrasena(): Promise<ApiResponse<void>> {
  return post<void>('/auth/password/send-code', {});
}

export async function cambiarContrasenaConCodigo(code: string, newPassword: string): Promise<ApiResponse<void> & { logout?: boolean }> {
  return post<void>('/auth/password/change-with-code', { code, newPassword }) as any;
}

/** Para quien se registró con Google o X y todavía no tiene contraseña: también exige el código que llega al correo. */
export async function establecerContrasena(code: string, newPassword: string): Promise<ApiResponse<void>> {
  return post<void>('/auth/set-password', { code, newPassword });
}

/**
 * Cuentas enlazadas: qué proveedores tiene la cuenta (Google, X).
 */
export async function obtenerVinculos(): Promise<{ google: boolean; twitter: boolean; hasPassword: boolean } | null> {
  const r: any = await get<void>('/auth/has-password');
  if (!r?.success) return null;
  return { google: !!r.linked?.google, twitter: !!r.linked?.twitter, hasPassword: !!r.hasPassword };
}

/** Empieza el enlace de Google o X: devuelve la dirección que se abre en el navegador del teléfono. */
export async function iniciarVinculo(provider: 'google' | 'twitter'): Promise<ApiResponse<void> & { url?: string }> {
  return post<void>('/auth/social/link-start', { provider, origen: 'app' }) as any;
}

/** Al volver del navegador: la app confirma el enlace con su sesión (código de un solo uso, 5 minutos). */
export async function confirmarVinculo(codigo: string): Promise<ApiResponse<void> & { proveedor?: 'google' | 'twitter' }> {
  return post<void>('/auth/social/link-confirm', { codigo }) as any;
}
