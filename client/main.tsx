import { instalarFotosRotas } from './utils/imagenesRotas';
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./global.css";
import "./styles/datepicker.css";
import { puedeRecargarSola, recargarPorVersionNueva } from "./utils/versionNuevaDeLaWeb";
// Note: quill (CreatePost) and leaflet (LocationPinMap) CSS are imported inside
// those lazy components so they stay out of the critical-path bundle.

// Auto-recover from stale lazy chunks after a deploy: when a hashed chunk no
// longer exists, the dynamic import throws and shows the error boundary. Reload
// once (guarded to avoid loops) to fetch the fresh index.html + chunk hashes.
// No se llama a `preventDefault`: Vite devolvería un módulo vacío y React.lazy fallaría con otro error. El ErrorBoundary
// reconoce este caso y muestra «Actualizando…» (o el botón «Actualizar» si la recarga ya se hizo hace poco).
window.addEventListener("vite:preloadError", () => {
  if (puedeRecargarSola()) void recargarPorVersionNueva();
});

instalarFotosRotas();
createRoot(document.getElementById("root")!).render(<App />);
