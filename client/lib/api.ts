const API_URL = import.meta.env.VITE_API_URL || "/api";

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;
const RETRY_BACKOFF_MULTIPLIER = 2;

// Circuit breaker configuration
const CIRCUIT_BREAKER_THRESHOLD = 5; // Number of consecutive failures to open circuit
const CIRCUIT_BREAKER_RESET_TIME = 30000; // 30 seconds

// Circuit breaker state
let consecutiveFailures = 0;
let circuitOpen = false;
let circuitOpenTime = 0;

// Request deduplication
const pendingRequests = new Map<string, Promise<any>>();

const getAuthHeaders = () => {
  return {
    "Content-Type": "application/json",
  };
};

interface RequestOptions {
  params?: Record<string, any>;
  retry?: boolean;
  deduplicate?: boolean;
  timeout?: number;
}

// Check if circuit breaker should allow request
const checkCircuitBreaker = (): boolean => {
  if (!circuitOpen) return true;

  const now = Date.now();
  if (now - circuitOpenTime >= CIRCUIT_BREAKER_RESET_TIME) {
    // Half-open state - allow one request to test
    console.log("🔄 API Circuit breaker: Testing connection...");
    return true;
  }

  console.warn("⚠️ API Circuit breaker is OPEN. Requests blocked temporarily.");
  return false;
};

// Record success/failure for circuit breaker
const recordSuccess = () => {
  consecutiveFailures = 0;
  if (circuitOpen) {
    console.log("✅ API Circuit breaker: Connection restored");
    circuitOpen = false;
  }
};

const recordFailure = () => {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !circuitOpen) {
    console.warn(`⚠️ API Circuit breaker OPENED after ${consecutiveFailures} consecutive failures`);
    circuitOpen = true;
    circuitOpenTime = Date.now();
  }
};

// Sleep utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Calculate retry delay with exponential backoff
const getRetryDelay = (attempt: number): number => {
  return Math.min(
    INITIAL_RETRY_DELAY * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt),
    MAX_RETRY_DELAY
  );
};

// Fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Core request function with retry logic
const makeRequest = async (
  url: string,
  options: RequestInit,
  requestOptions: RequestOptions = {}
): Promise<any> => {
  const { retry = true, timeout = 30000 } = requestOptions;
  const maxAttempts = retry ? MAX_RETRIES : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check circuit breaker
    if (!checkCircuitBreaker()) {
      throw new Error("Service temporarily unavailable. Please try again later.");
    }

    try {
      const res = await fetchWithTimeout(url, options, timeout);

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Request failed" }));

        // Don't retry client errors (4xx) except for rate limiting (429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(error.message || `HTTP ${res.status}`);
        }

        // For server errors and rate limiting, retry
        if (attempt < maxAttempts - 1) {
          const delay = res.status === 429
            ? parseInt(res.headers.get("Retry-After") || "5") * 1000
            : getRetryDelay(attempt);
          console.log(`🔄 API: Retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
          await sleep(delay);
          continue;
        }

        throw new Error(error.message || `HTTP ${res.status}`);
      }

      recordSuccess();
      return res.json();
    } catch (error: any) {
      // Handle abort/timeout
      if (error.name === "AbortError") {
        console.error("API request timed out");
        if (attempt < maxAttempts - 1) {
          const delay = getRetryDelay(attempt);
          console.log(`🔄 API: Retrying after timeout in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
          await sleep(delay);
          continue;
        }
        recordFailure();
        throw new Error("Request timed out. Please check your connection.");
      }

      // Handle network errors
      if (error.message === "Failed to fetch" || error.message.includes("NetworkError")) {
        recordFailure();
        if (attempt < maxAttempts - 1) {
          const delay = getRetryDelay(attempt);
          console.log(`🔄 API: Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
          await sleep(delay);
          continue;
        }
        throw new Error("Network error. Please check your connection.");
      }

      // For other errors, don't retry
      throw error;
    }
  }
};

// Generate cache key for request deduplication
const getRequestKey = (method: string, endpoint: string, data?: any): string => {
  return `${method}:${endpoint}:${data ? JSON.stringify(data) : ""}`;
};

export const apiClient = {
  async get(endpoint: string, options?: RequestOptions) {
    const url = new URL(`${API_URL}${endpoint}`, window.location.origin);
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const requestKey = getRequestKey("GET", url.toString());

    // Deduplicate identical concurrent requests
    if (options?.deduplicate !== false && pendingRequests.has(requestKey)) {
      return pendingRequests.get(requestKey);
    }

    const requestPromise = makeRequest(
      url.toString(),
      {
        method: "GET",
        headers: getAuthHeaders(),
        credentials: "include",
      },
      options
    ).finally(() => {
      pendingRequests.delete(requestKey);
    });

    if (options?.deduplicate !== false) {
      pendingRequests.set(requestKey, requestPromise);
    }

    return requestPromise;
  },

  async post(endpoint: string, data?: any, options?: RequestOptions) {
    return makeRequest(
      `${API_URL}${endpoint}`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: data ? JSON.stringify(data) : undefined,
      },
      { ...options, retry: options?.retry ?? false } // Don't retry POST by default
    );
  },

  async put(endpoint: string, data?: any, options?: RequestOptions) {
    return makeRequest(
      `${API_URL}${endpoint}`,
      {
        method: "PUT",
        headers: getAuthHeaders(),
        credentials: "include",
        body: data ? JSON.stringify(data) : undefined,
      },
      { ...options, retry: options?.retry ?? false } // Don't retry PUT by default
    );
  },

  async delete(endpoint: string, options?: RequestOptions) {
    return makeRequest(
      `${API_URL}${endpoint}`,
      {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      },
      { ...options, retry: options?.retry ?? false } // Don't retry DELETE by default
    );
  },

  // Manual circuit breaker reset (for reconnect buttons)
  resetCircuitBreaker() {
    consecutiveFailures = 0;
    circuitOpen = false;
    console.log("🔄 API Circuit breaker manually reset");
  },

  // Check if circuit is open
  isCircuitOpen() {
    return circuitOpen;
  },
};

// Export a simple API object for backwards compatibility
export const api = apiClient;
