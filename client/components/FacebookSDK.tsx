import { useEffect } from "react";

export function FacebookSDK() {
  useEffect(() => {
    // Only load Facebook SDK on HTTPS or localhost
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

    if (!isSecure) {
      console.warn('⚠️ Facebook SDK only works on HTTPS. Skipping initialization.');
      return;
    }

    // Load Facebook SDK
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: import.meta.env.VITE_FACEBOOK_APP_ID || "1979249519578741",
        cookie: true,
        xfbml: true,
        version: "v18.0",
      });

      window.FB.AppEvents.logPageView();
    };

    // Load the SDK script
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        console.error('❌ Failed to load Facebook SDK');
      };
      document.body.appendChild(script);
    }
  }, []);

  return null;
}
