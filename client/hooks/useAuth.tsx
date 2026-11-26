import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { MARCADOR_DE_SESION, guardarMarcadorDeSesion } from "../utils/sesion";
import type { User, RegisterData } from "@/types";
import {
  initializeNotifications,
  shouldShowNotificationModal,
  markNotificationAsked,
} from "@/lib/firebase";
import NotificationPermissionModal from "@/components/NotificationPermissionModal";
import { useLatidoDeUso } from "./useLatidoDeUso";
import { EVENTO_PARA_PEDIR_AVISOS } from "../utils/momentoDeAvisos";

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


/**
 * Applies the beta's SUPER PRO to the user object the app reads.
 *
 * There are ~59 places in the client that compare `membershipTier` to decide
 * whether to show a feature. Rewriting all of them was the wrong trade: one
 * missed call site is a feature the beta promised and does not deliver, and the
 * diff would be impossible to review. So the substitution happens once, here,
 * where the user object is built.
 *
 * The stored tier survives as `realMembershipTier` for the screens that must
 * show what the person actually pays for — subscription checkout and the
 * membership panel — so "what you have now" and "what you pay for" stay
 * distinguishable.
 */
function withBetaTier(u: any) {
  if (!u) return u;
  // The server already resolved this (beta OR owner); trust it and fall
  // back to the beta flag only for payloads that predate the field.
  const entitled = u.effectiveMembershipTier === 'super_pro' || u.platform?.isBeta;
  if (!entitled) return u;
  return {
    ...u,
    realMembershipTier: u.membershipTier ?? 'free',
    membershipTier: 'super_pro',
    // Says WHY, so the UI can explain it: the beta gives it to everyone, the
    // owner has it permanently.
    membershipIsFromBeta: !!u.platform?.isBeta,
    membershipIsFromOwner: u.adminRole === 'owner',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
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

      try {
        // El token está en la cookie httpOnly, solo necesitamos validarlo
        const response = await fetch("/api/auth/me", {
          credentials: "include", // Envía automáticamente las cookies
        });


        if (response.ok) {
          const data = await response.json();
          // La sesión está en la cookie httpOnly: en el navegador solo queda un marcador, nunca el token (ver utils/sesion.ts).
          guardarMarcadorDeSesion();
          setUser(withBetaTier({ ...data.user }));
          setToken(MARCADOR_DE_SESION); // Indicador de que usamos cookies

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
        const error: any = new Error(data.message || t('auth.loginError', 'Error logging in'));
        if (data.field) {
          error.field = data.field;
        }
        // Propagar el flag de email no verificado para mostrar el flujo de reenvío
        if (data.emailNotVerified) {
          error.emailNotVerified = true;
          error.email = data.email;
        }
        throw error;
      }

      // La sesión está en la cookie httpOnly: el token del cuerpo NO se guarda en el navegador (solo el marcador; ver utils/sesion.ts).
      guardarMarcadorDeSesion();
      setToken(MARCADOR_DE_SESION);
      setUser(withBetaTier({ ...data.user }));


      return data.user as User;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }, [t]);

  const register = useCallback(async (data: RegisterData) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Permite enviar y recibir cookies
        // `sinSesion`: registrarse no abre la sesión; primero hay que verificar el correo (igual que para ingresar).
        // El registro en pasos SÍ deja la sesión abierta: la verificación de identidad con Didit la necesita.
        body: JSON.stringify(data.pasos ? data : { ...data, sinSesion: true }),
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
        const errorDeRegistro: any = new Error(responseData.message || t('auth.registerError', 'Error registering'));
        errorDeRegistro.field = responseData.field;
        errorDeRegistro.code = responseData.code;
        throw errorDeRegistro;
      }

      // Sin token (correo por verificar) no hay sesión: la pantalla pide revisar el correo y se ingresa recién al verificarlo.
      if (responseData.token) {
        // La sesión está en la cookie httpOnly: solo el marcador queda en el navegador.
        guardarMarcadorDeSesion();
        setToken(MARCADOR_DE_SESION);
        setUser({ ...responseData.user });
      }

      // `invitacion` (si el registro llevaba un enlace de invitación) cuenta si se aplicó o por qué no.
      return { ...responseData.user, invitacion: responseData.invitacion } as User;
    } catch (error) {
      console.error("Register error:", error);
      throw error;
    }
  }, [t]);

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
        // Create a new object to force re-render
        setUser(withBetaTier({ ...data.user }));
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

  };

  // El permiso se pide cuando sirve: después de postularse o de publicar (utils/momentoDeAvisos.ts).
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null;
    const preguntar = () => {
      // Un momento después, para que primero se vea que lo que hizo salió bien.
      espera = setTimeout(() => {
        if (shouldShowNotificationModal()) {
          setShowNotificationModal(true);
          setIsRetryPrompt(false);
        }
      }, 1500);
    };
    window.addEventListener(EVENTO_PARA_PEDIR_AVISOS, preguntar);
    return () => {
      window.removeEventListener(EVENTO_PARA_PEDIR_AVISOS, preguntar);
      if (espera) clearTimeout(espera);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [retryTimeoutId]);

  // Registro de uso propio (índices del panel): el equipo no cuenta.
  useLatidoDeUso(!!user && !(user as { adminRole?: string }).adminRole);

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
