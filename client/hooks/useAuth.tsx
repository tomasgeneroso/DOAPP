import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import type { User, RegisterData } from "@/types";
import {
  initializeNotifications,
  shouldShowNotificationModal,
  markNotificationAsked,
} from "@/lib/firebase";
import NotificationPermissionModal from "@/components/NotificationPermissionModal";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [isRetryPrompt, setIsRetryPrompt] = useState(false);
  const [retryTimeoutId, setRetryTimeoutId] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    // Check for cookie token on mount and validate it
    const validateToken = async () => {
      console.log("🔐 Validating cookie token...");

      try {
        // El token está en la cookie httpOnly, solo necesitamos validarlo
        const response = await fetch("/api/auth/me", {
          credentials: "include", // Envía automáticamente las cookies
        });

        console.log("📡 /api/auth/me response:", response.status);

        if (response.ok) {
          const data = await response.json();
          console.log(
            "✅ User validated from cookie:",
            data.user?._id,
            data.user?.name,
          );
          // Guardar token en localStorage para Socket.io
          if (data.token) {
            localStorage.setItem("token", data.token);
          }
          setUser({ ...data.user });
          setToken(data.token || "cookie"); // Indicador de que usamos cookies

          // Mostrar modal de notificaciones si es necesario (después de 30 segundos)
          setTimeout(() => {
            if (shouldShowNotificationModal()) {
              setShowNotificationModal(true);
              setIsRetryPrompt(false);
            }
          }, 30000); // 30 segundos de delay para que el usuario explore la app primero
        } else {
          console.warn("⚠️ No valid session cookie found");
          localStorage.removeItem("token");
          setUser(null);
          setToken(null);
        }
      } catch (error) {
        console.error("❌ Error validating session:", error);
        setUser(null);
        setToken(null);
      }

      setIsLoading(false);
      console.log("✅ Auth loading complete");
    };

    validateToken();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Importante: permite enviar y recibir cookies
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Manejar errores de validación
        if (data.errors && Array.isArray(data.errors)) {
          const errorMessages = data.errors
            .map((err: any) => err.msg)
            .join(", ");
          throw new Error(errorMessages);
        }
        // Crear error con campo específico si está disponible
        const error: any = new Error(data.message || "Error al iniciar sesión");
        if (data.field) {
          error.field = data.field;
        }
        throw error;
      }

      // El token ahora está en la cookie httpOnly
      // Guardamos el token en localStorage para Socket.io
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser({ ...data.user });
      console.log("✅ Login exitoso, usuario:", data.user.name);

      // Mostrar modal de notificaciones si es necesario (después de 30 segundos)
      setTimeout(() => {
        if (shouldShowNotificationModal()) {
          setShowNotificationModal(true);
          setIsRetryPrompt(false);
        }
      }, 30000); // 30 segundos de delay para que el usuario explore la app primero

      return data.user as User;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Permite enviar y recibir cookies
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // Manejar errores de validación
        if (responseData.errors && Array.isArray(responseData.errors)) {
          const errorMessages = responseData.errors
            .map((err: any) => err.msg)
            .join(", ");
          throw new Error(errorMessages);
        }
        throw new Error(responseData.message || "Error al registrarse");
      }

      // El token ahora está en la cookie httpOnly
      // Guardamos el token en localStorage para Socket.io
      localStorage.setItem("token", responseData.token);
      setToken(responseData.token);
      setUser({ ...responseData.user });
      console.log("✅ Registro exitoso, usuario:", responseData.user.name);

      return responseData.user as User;
    } catch (error) {
      console.error("Register error:", error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Llamar al endpoint de logout para limpiar la cookie en el servidor
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      // Limpiar estado local y localStorage
      localStorage.removeItem("token");
      setUser(null);
      setToken(null);
      console.log("✅ Logout exitoso");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include", // Usa la cookie automáticamente
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Guardar token en localStorage para Socket.io
        if (data.token) {
          localStorage.setItem("token", data.token);
        }
        // Create a new object to force re-render
        setUser({ ...data.user });
        console.log("✅ User refreshed:", data.user.name);
        console.log(
          "📊 Free contracts remaining:",
          data.user.freeContractsRemaining,
        );
        console.log(
          "📊 PRO contracts used this month:",
          data.user.monthlyContractsUsed,
        );
      }
    } catch (error) {
      console.error("Error refreshing user:", error);
    }
  }, []);

  // Handle notification modal accept
  const handleNotificationAccept = async () => {
    // Clear any pending retry
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      setRetryTimeoutId(null);
    }

    setShowNotificationModal(false);
    markNotificationAsked();

    // Initialize notifications
    const success = await initializeNotifications();

    if (success) {
      console.log("✅ Notifications enabled successfully");
    } else {
      console.log("⚠️ Failed to enable notifications");
    }
  };

  // Handle notification modal decline
  const handleNotificationDecline = () => {
    setShowNotificationModal(false);
    markNotificationAsked();

    // If this is the first time (not retry), schedule a retry in 1 minute
    if (!isRetryPrompt) {
      console.log("⏰ Scheduling notification retry in 1 minute...");
      const timeoutId = setTimeout(() => {
        if (shouldShowNotificationModal()) {
          console.log("🔔 Showing notification modal again (retry)");
          setShowNotificationModal(true);
          setIsRetryPrompt(true);
        }
      }, 60000); // 1 minute

      setRetryTimeoutId(timeoutId);
    } else {
      // Second decline, don't ask again for 24 hours
      console.log(
        "⏸️ User declined notifications twice, will ask again in 24 hours",
      );
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [retryTimeoutId]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, token, isLoading, login, register, logout, refreshUser],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      <NotificationPermissionModal
        isOpen={showNotificationModal}
        onAccept={handleNotificationAccept}
        onDecline={handleNotificationDecline}
        isRetry={isRetryPrompt}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
