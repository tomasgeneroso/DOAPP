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
      const response = await originalFetch(input, {
        ...init,
        credentials: 'include', // Importante: envía las cookies automáticamente
      });

      // Record API call timing
      const duration = performance.now() - startTime;
      clientPerformanceMonitor.recordApiCall(url, duration, response.status);

      // Handle token expiration
      if (response.status === 401 && !url.includes("/api/auth/login")) {
        if (!window.location.pathname.includes("/login")) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        }
      }

      return response;
    }

    // For non-API calls, use original fetch
    return originalFetch(input, init);
  };

  // Initialize performance monitoring
  clientPerformanceMonitor.initialize();
}
