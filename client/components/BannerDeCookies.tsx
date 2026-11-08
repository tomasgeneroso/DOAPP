import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Transicion from "./ui/Transicion";
import { guardarEleccionDeCookies, useEleccionDeCookies } from "../utils/consentimientoDeCookies";

/**
 * Pregunta una sola vez si se puede usar la analítica de Google. Mientras no haya respuesta (o si se rechaza) Google Analytics no se carga: ver
 * `GoogleAnalytics.tsx` y `utils/consentimientoDeCookies.ts`. Las dos opciones pesan lo mismo: no es una trampa para que se acepte.
 */
export default function BannerDeCookies() {
  const { t } = useTranslation();
  const eleccion = useEleccionDeCookies();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] px-4 pb-4 sm:px-6">
      <Transicion mostrar={eleccion === null}>
        <div
          role="region"
          aria-label={t("cookieBanner.aria", "Cookies")}
          className="pointer-events-auto mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <p className="font-semibold text-slate-900 dark:text-white">{t("cookieBanner.title", "¿Podemos medir cómo se usa DOAPP?")}</p>
          <p className="mt-1">
            {t(
              "cookieBanner.body",
              "Usamos Google Analytics para contar qué pantallas se visitan y mejorar el sitio. Google recibe tu dirección de internet y la pantalla que mirás; nunca tu nombre ni tu correo. Solo se activa si aceptás. Lo necesario para que DOAPP funcione (sesión, idioma, tema) no necesita permiso.",
            )}{" "}
            <Link to="/legal/cookies" className="font-medium text-sky-700 underline hover:text-sky-800 dark:text-sky-400">
              {t("cookieBanner.more", "Política de Cookies")}
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => guardarEleccionDeCookies("rechazado")}
              className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t("cookieBanner.reject", "Rechazar")}
            </button>
            <button
              type="button"
              onClick={() => guardarEleccionDeCookies("aceptado")}
              className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700"
            >
              {t("cookieBanner.accept", "Aceptar")}
            </button>
          </div>
        </div>
      </Transicion>
    </div>
  );
}
