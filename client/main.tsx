import { instalarFotosRotas } from './utils/imagenesRotas';
import { limpiarTokenViejo } from './utils/sesion';
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./global.css";
import "./styles/datepicker.css";
import { puedeRecargarSola, recargarPorVersionNueva } from "./utils/versionNuevaDeLaWeb";
import { instalarVigiaDeFotos, reportarFalla } from './utils/reportarFalla';
import { alFallarElBuscador } from '../shared/geo/direcciones';
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

limpiarTokenViejo(); // quedó un token real de antes del cambio: se reemplaza por el marcador (utils/sesion.ts)
instalarFotosRotas();
// Lo que falla en el navegador se le cuenta al servidor para que avise (solo el nombre de la parte).
instalarVigiaDeFotos();
alFallarElBuscador(() => reportarFalla('direcciones'));
createRoot(document.getElementById("root")!).render(<App />);
