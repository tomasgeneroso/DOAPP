import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./global.css";
import "./styles/datepicker.css";
// Note: quill (CreatePost) and leaflet (LocationPinMap) CSS are imported inside
// those lazy components so they stay out of the critical-path bundle.

// Auto-recover from stale lazy chunks after a deploy: when a hashed chunk no
// longer exists, the dynamic import throws and shows the error boundary. Reload
// once (guarded to avoid loops) to fetch the fresh index.html + chunk hashes.
window.addEventListener("vite:preloadError", () => {
  const key = "vite-preload-reload-ts";
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
