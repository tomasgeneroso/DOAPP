import { useState, useCallback, useEffect } from "react";

export function useFacebookLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fbStatus, setFbStatus] = useState<'checking' | 'connected' | 'not_authorized' | 'unknown'>('checking');

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

  // Handle Facebook login status response
  const statusChangeCallback = useCallback((response: FBLoginStatus) => {
    setFbStatus(response.status);

    if (response.status === "connected" && response.authResponse) {
      // User is logged into Facebook and has authorized your app
      // Check if they're already logged into your app
      const existingToken = localStorage.getItem("token");

      if (!existingToken) {
        // Auto-authenticate if not already logged in
        setIsLoading(true);
        authenticateWithBackend(response.authResponse.accessToken, response.authResponse.userID);
      }
    } else if (response.status === "not_authorized") {
      // User is logged into Facebook but hasn't authorized your app
      setFbStatus("not_authorized");
    } else {
      // User isn't logged into Facebook
      setFbStatus("unknown");
    }

    if (response.status !== "connected") {
      setIsLoading(false);
    }
  }, [authenticateWithBackend]);

  // Check Facebook login status on mount
  useEffect(() => {
    if (typeof window.FB !== "undefined") {
      window.FB.getLoginStatus(statusChangeCallback);
    } else {
      // Wait for SDK to load
      const checkFB = setInterval(() => {
        if (typeof window.FB !== "undefined") {
          clearInterval(checkFB);
          window.FB.getLoginStatus(statusChangeCallback);
        }
      }, 100);

      return () => clearInterval(checkFB);
    }
  }, [statusChangeCallback]);

  const loginWithFacebook = useCallback(() => {
    setIsLoading(true);
    setError(null);

    if (typeof window.FB === "undefined") {
      setError("Facebook SDK no está cargado");
      setIsLoading(false);
      return;
    }

    window.FB.login(
      (response: FBLoginStatus) => {
        if (response.status === "connected" && response.authResponse) {
          authenticateWithBackend(response.authResponse.accessToken, response.authResponse.userID);
        } else {
          setError("Autenticación cancelada");
          setIsLoading(false);
        }
      },
      { scope: "public_profile,email" }
    );
  }, [authenticateWithBackend]);

  return {
    loginWithFacebook,
    isLoading,
    error,
    fbStatus,
  };
}
