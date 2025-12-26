import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthState, LoginCredentials, RegisterData, ApiResponse } from '../types';
import * as authService from '../services/auth';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<ApiResponse<any>>;
  register: (data: RegisterData) => Promise<ApiResponse<any>>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Cargar estado de autenticación al iniciar
  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        const { token, user } = await authService.getStoredAuth();

        if (token && user) {
          // Verificar que el token siga siendo válido
          const response = await authService.getMe();

          if (response.success && response.data) {
            setState({
              user: response.data.user,
              token,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            // Token inválido, limpiar
            await authService.logout();
            setState({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Error loading auth:', error);
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    loadStoredAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<ApiResponse<any>> => {
    const response = await authService.login(credentials);

    if (response.success && response.data) {
      setState({
        user: response.data.user,
        token: response.data.token,
        isAuthenticated: true,
        isLoading: false,
      });
    }

    return response;
  };

  const register = async (data: RegisterData): Promise<ApiResponse<any>> => {
    const response = await authService.register(data);

    if (response.success && response.data) {
      setState({
        user: response.data.user,
        token: response.data.token,
        isAuthenticated: true,
        isLoading: false,
      });
    }

    return response;
  };

  const logout = async (): Promise<void> => {
    await authService.logout();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  const refreshUser = async (): Promise<void> => {
    const response = await authService.getMe();

    if (response.success && response.data) {
      setState((prev) => ({
        ...prev,
        user: response.data!.user,
      }));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export default AuthContext;
