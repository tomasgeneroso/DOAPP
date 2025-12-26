import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ApiResponse, PaginatedResponse } from '../types';

// Configuración de la API
// En desarrollo web, usa el servidor local para evitar CORS
// En producción o mobile, usa la URL de producción
const getApiUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // En web development, usar servidor local
  if (Platform.OS === 'web' && __DEV__) {
    return 'http://localhost:3001/api';
  }
  return 'https://doapparg.site/api';
};

const API_URL = getApiUrl();

// Keys para almacenamiento seguro
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// Helper para detectar si SecureStore está disponible
const isSecureStoreAvailable = Platform.OS !== 'web';

/**
 * Obtiene el token de autenticación almacenado
 */
export async function getToken(): Promise<string | null> {
  try {
    if (isSecureStoreAvailable) {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    }
    // Fallback a AsyncStorage para web
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
}

/**
 * Guarda el token de autenticación
 */
export async function setToken(token: string): Promise<void> {
  try {
    if (isSecureStoreAvailable) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      // Fallback a AsyncStorage para web
      await AsyncStorage.setItem(TOKEN_KEY, token);
    }
  } catch (error) {
    console.error('Error saving token:', error);
  }
}

/**
 * Elimina el token de autenticación
 */
export async function removeToken(): Promise<void> {
  try {
    if (isSecureStoreAvailable) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch (error) {
    console.error('Error removing token:', error);
  }
}

/**
 * Guarda los datos del usuario
 */
export async function setUser(user: any): Promise<void> {
  try {
    const userData = JSON.stringify(user);
    if (isSecureStoreAvailable) {
      await SecureStore.setItemAsync(USER_KEY, userData);
    } else {
      await AsyncStorage.setItem(USER_KEY, userData);
    }
  } catch (error) {
    console.error('Error saving user:', error);
  }
}

/**
 * Obtiene los datos del usuario almacenados
 */
export async function getUser(): Promise<any | null> {
  try {
    let userData: string | null;
    if (isSecureStoreAvailable) {
      userData = await SecureStore.getItemAsync(USER_KEY);
    } else {
      userData = await AsyncStorage.getItem(USER_KEY);
    }
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

/**
 * Elimina los datos del usuario
 */
export async function removeUser(): Promise<void> {
  try {
    if (isSecureStoreAvailable) {
      await SecureStore.deleteItemAsync(USER_KEY);
    } else {
      await AsyncStorage.removeItem(USER_KEY);
    }
  } catch (error) {
    console.error('Error removing user:', error);
  }
}

/**
 * Limpia todos los datos de autenticación
 */
export async function clearAuth(): Promise<void> {
  await Promise.all([removeToken(), removeUser()]);
}

/**
 * Headers por defecto para las peticiones
 */
async function getHeaders(includeAuth: boolean = true): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (includeAuth) {
    const token = await getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

/**
 * Función base para hacer peticiones a la API
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  includeAuth: boolean = true
): Promise<ApiResponse<T>> {
  try {
    const headers = await getHeaders(includeAuth);

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Error en la petición',
        error: data.error,
      };
    }

    return data;
  } catch (error: any) {
    console.error('API Error:', error);
    return {
      success: false,
      message: error.message || 'Error de conexión',
      error: 'NETWORK_ERROR',
    };
  }
}

/**
 * GET request
 */
export async function get<T>(endpoint: string, includeAuth: boolean = true): Promise<ApiResponse<T>> {
  return request<T>(endpoint, { method: 'GET' }, includeAuth);
}

/**
 * POST request
 */
export async function post<T>(
  endpoint: string,
  body: any,
  includeAuth: boolean = true
): Promise<ApiResponse<T>> {
  return request<T>(
    endpoint,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    includeAuth
  );
}

/**
 * PUT request
 */
export async function put<T>(
  endpoint: string,
  body: any,
  includeAuth: boolean = true
): Promise<ApiResponse<T>> {
  return request<T>(
    endpoint,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    includeAuth
  );
}

/**
 * DELETE request
 */
export async function del<T>(endpoint: string, includeAuth: boolean = true): Promise<ApiResponse<T>> {
  return request<T>(endpoint, { method: 'DELETE' }, includeAuth);
}

/**
 * Upload file with multipart form data
 */
export async function upload<T>(
  endpoint: string,
  formData: FormData,
  includeAuth: boolean = true
): Promise<ApiResponse<T>> {
  try {
    const token = await getToken();
    const headers: HeadersInit = {
      'Accept': 'application/json',
    };

    if (includeAuth && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Error al subir archivo',
        error: data.error,
      };
    }

    return data;
  } catch (error: any) {
    console.error('Upload Error:', error);
    return {
      success: false,
      message: error.message || 'Error de conexión',
      error: 'NETWORK_ERROR',
    };
  }
}

// Export API URL for use in other services
export { API_URL };
