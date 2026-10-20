import { conTopeDeEspera, errorDeRedLegible, normalizarRespuestaDeError } from "./respuestasDeError";
import { clientPerformanceMonitor } from '../hooks/usePerformance';

/**
 * Fetch wrapper that automatically handles authentication with cookies
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const startTime = performance.now();

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Importante: envía las cookies automáticamente
  });

  // Record API call timing
  const duration = performance.now() - startTime;
  clientPerformanceMonitor.recordApiCall(url, duration, response.status);

  // If unauthorized, redirect to login
  if (response.status === 401) {
    // Only redirect if not already on login page
    if (!window.location.pathname.includes("/login")) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  return response;
}

/**
 * Setup global fetch interceptor for automatic cookie handling and performance monitoring
 */
export function setupFetchInterceptor() {
  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Only intercept API calls
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const startTime = performance.now();

    if (url.startsWith("/api/")) {
      let response: Response;
      // Un pedido que no responde nunca dejaba la pantalla en «enviando…» para siempre: pasado un tiempo se corta y se avisa.
      const espera = conTopeDeEspera({ ...init, credentials: 'include' /* Importante: envía las cookies automáticamente */ });
      try {
        response = await originalFetch(input, espera.init);
      } catch (error) {
        // «Failed to fetch» no le dice nada a nadie: se dice que no hubo conexión con el servidor.
        throw errorDeRedLegible(error, espera.vencio());
      } finally {
        espera.limpiar();
      }

      // Record API call timing
      const duration = performance.now() - startTime;
      clientPerformanceMonitor.recordApiCall(url, duration, response.status);

      // Handle token expiration
      if (response.status === 401 && !url.includes("/api/auth/login")) {
        if (!window.location.pathname.includes("/login")) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        }
      }

      // Una respuesta de error siempre vuelve con un `message` legible (nginx/Cloudflare devuelven HTML, algunas rutas no traen motivo).
      return normalizarRespuestaDeError(response);
    }

    // For non-API calls, use original fetch
    return originalFetch(input, init);
  };

  // Initialize performance monitoring
  clientPerformanceMonitor.initialize();
}
