import { useState, useCallback, useEffect } from "react";
import { FB_SDK_READY_EVENT } from "../components/FacebookSDK";

export function useFacebookLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Initialize states based on current SDK status
  const initialSdkReady = window.fbSDKInitialized && typeof window.FB !== "undefined";
  const [fbStatus, setFbStatus] = useState<'checking' | 'connected' | 'not_authorized' | 'unknown'>(
    initialSdkReady ? 'unknown' : 'checking'
  );
  const [sdkReady, setSdkReady] = useState(initialSdkReady);

  // Authenticate with backend using Facebook access token
  const authenticateWithBackend = useCallback((accessToken: string, userID: string) => {
    fetch("/api/auth/facebook/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessToken, userID }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.token && data.user) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("user", JSON.stringify(data.user));
          window.location.href = "/";
        } else {
          setError(data.message || "Error al autenticar con Facebook");
          setIsLoading(false);
        }
      })
      .catch((err) => {
        setError("Error de conexión con el servidor");
        setIsLoading(false);
        console.error("Facebook login error:", err);
      });
  }, []);

  // Check Facebook SDK ready on mount (without checking login status)
  // Note: If SDK is already initialized, states are set correctly at initialization
  useEffect(() => {
    // Skip if SDK was already initialized at mount time
    if (initialSdkReady) {
      return;
    }

    const handleSDKReady = () => {
      console.log('📘 Facebook SDK ready event received');
      setSdkReady(true);
      setFbStatus('unknown'); // Don't check login status automatically
    };

    // Listen for the SDK ready event
    window.addEventListener(FB_SDK_READY_EVENT, handleSDKReady);

    // Timeout after 15 seconds
    const timeout = setTimeout(() => {
      if (!window.fbSDKInitialized) {
        console.warn('⚠️ Facebook SDK initialization timeout');
        setFbStatus('unknown');
      }
    }, 15000);

    return () => {
      window.removeEventListener(FB_SDK_READY_EVENT, handleSDKReady);
      clearTimeout(timeout);
    };
  }, [initialSdkReady]); // Only depend on initialSdkReady

  const loginWithFacebook = useCallback(() => {
    setIsLoading(true);
    setError(null);

    // Wait a bit to ensure SDK is ready
    const attemptLogin = () => {
      // Check if FB exists and is initialized
      if (typeof window.FB === "undefined" || !window.fbSDKInitialized) {
        console.warn('⚠️ Facebook SDK not ready yet, waiting...');
        // Wait a bit more
        setTimeout(attemptLogin, 500);
        return;
      }

      console.log('🔵 Attempting Facebook login...');

      try {
        window.FB.login(
          (response: FBLoginStatus) => {
            console.log('📘 Facebook login response:', response.status);
            if (response.status === "connected" && response.authResponse) {
              authenticateWithBackend(response.authResponse.accessToken, response.authResponse.userID);
            } else {
              setError("Autenticación cancelada o denegada");
              setIsLoading(false);
            }
          },
          { scope: "public_profile,email" }
        );
      } catch (e) {
        console.error('Error calling FB.login:', e);
        setError("Error al iniciar sesión con Facebook");
        setIsLoading(false);
      }
    };

    // Start attempt after a small delay to ensure everything is ready
    setTimeout(attemptLogin, 100);
  }, [authenticateWithBackend]);

  return {
    loginWithFacebook,
    isLoading,
    error,
    fbStatus,
    sdkReady,
  };
}
