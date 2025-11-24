import { useEffect } from "react";

// Global flag to track if FB SDK is fully initialized
declare global {
  interface Window {
    fbSDKInitialized?: boolean;
  }
}

// Custom event name for SDK ready
export const FB_SDK_READY_EVENT = "fbSDKReady";

function initializeFB() {
  if (window.fbSDKInitialized) return;

  try {
    window.FB.init({
      appId: import.meta.env.FACEBOOK_APP_ID,
      cookie: true,
      xfbml: true,
      version: "v18.0",
    });

    window.fbSDKInitialized = true;
    console.log("✅ Facebook SDK initialized");

    // Dispatch custom event to notify listeners
    window.dispatchEvent(new CustomEvent(FB_SDK_READY_EVENT));
  } catch (error) {
    console.error("❌ Error initializing Facebook SDK:", error);
  }
}

export function FacebookSDK() {
  useEffect(() => {
    // Skip if already initialized
    if (window.fbSDKInitialized) {
      return;
    }

    // Only load Facebook SDK on HTTPS or localhost
    const isSecure =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost";

    if (!isSecure) {
      console.warn(
        "⚠️ Facebook SDK only works on HTTPS. Skipping initialization.",
      );
      return;
    }

    // If FB is already loaded but not initialized, initialize it
    if (typeof window.FB !== "undefined" && !window.fbSDKInitialized) {
      initializeFB();
      return;
    }

    // Set up the async init callback BEFORE loading the script
    window.fbAsyncInit = initializeFB;

    // Load the SDK script if not already loaded
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.onerror = () => {
        console.error("❌ Failed to load Facebook SDK");
      };

      // Insert before first script for faster loading
      const firstScript = document.getElementsByTagName("script")[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        document.head.appendChild(script);
      }
    }
  }, []);

  return null;
}
