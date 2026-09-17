import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Siren, Phone, Loader2, X } from "lucide-react";

/**
 * Botón de emergencia del contrato en curso, para las dos partes.
 *
 * Qué hace, en orden: registra el evento con hora y ubicación (queda aunque se
 * cancele), avisa a los administradores con máxima prioridad, y acerca el
 * marcador con el 911. Lo que NO hace, y se dice en el propio botón: llamar por
 * vos, ni garantizar que alguien de DOAPP llegue. Es una herramienta de ayuda
 * (T&C 11.3), no un servicio de seguridad.
 *
 * Pide confirmación para que no salte por error, pero la confirmación es UN
 * toque, no un formulario: en una emergencia no se completa nada.
 */
export default function EmergencyButton({ contractId }: { contractId: string }) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const obtenerUbicacion = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      // Tres segundos como mucho: la emergencia no espera al GPS.
      const timer = setTimeout(() => resolve(null), 3000);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => { clearTimeout(timer); resolve(null); },
        { enableHighAccuracy: true, timeout: 3000, maximumAge: 60000 },
      );
    });

  const activar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const ubicacion = await obtenerUbicacion();
      const token = localStorage.getItem("token");
      const base = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
      const res = await fetch(`${base}/contracts/${contractId}/emergencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify(ubicacion || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "No se pudo avisar");
      setListo(data.telefonoEmergencias || "911");
    } catch (e: any) {
      // Aunque falle el aviso, el 911 tiene que quedar a un toque.
      setError(e?.message || "No se pudo avisar al equipo");
      setListo("911");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-500"
        aria-haspopup="dialog"
      >
        <Siren className="h-5 w-5" aria-hidden="true" />
        {t("emergency.button", "Botón de emergencia")}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="emergencia-titulo">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 id="emergencia-titulo" className="text-lg font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
                <Siren className="h-5 w-5" aria-hidden="true" />
                {listo ? t("emergency.sentTitle", "Avisamos al equipo") : t("emergency.confirmTitle", "¿Estás en una emergencia?")}
              </h2>
              <button onClick={() => { setAbierto(false); setListo(null); }} aria-label={t("common.close", "Cerrar")} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!listo ? (
              <>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                  {t(
                    "emergency.confirmBody",
                    "Al confirmar, DOAPP registra la hora y tu ubicación, avisa al equipo con máxima prioridad y te acerca el 911. La llamada la hacés vos: esto es una herramienta de ayuda, no reemplaza a los servicios de emergencia.",
                  )}
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <button
                    onClick={activar}
                    disabled={enviando}
                    className="w-full rounded-xl bg-red-600 px-4 py-3 text-base font-bold text-white hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Siren className="h-5 w-5" />}
                    {t("emergency.confirm", "Sí, avisar ahora")}
                  </button>
                  <a
                    href="tel:911"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 text-center flex items-center justify-center gap-2"
                  >
                    <Phone className="h-4 w-4" /> {t("emergency.callDirect", "Llamar al 911 sin avisar")}
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                  {error
                    ? t("emergency.sentError", "No pudimos avisar al equipo ({{error}}). Llamá al 911 ahora.", { error })
                    : t("emergency.sentBody", "El equipo de DOAPP fue avisado con tu ubicación. Si estás en peligro, llamá ya al 911.")}
                </p>
                <a
                  href={`tel:${listo}`}
                  className="mt-5 w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white text-center flex items-center justify-center gap-2 hover:bg-red-700"
                >
                  <Phone className="h-5 w-5" /> {t("emergency.call", "Llamar al {{n}}", { n: listo })}
                </a>
              </>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
              {t(
                "emergency.disclaimer",
                "Herramienta gratuita de ayuda. DOAPP no es un servicio de seguridad ni de respuesta y no garantiza disponibilidad ni resultado (T&C 11.3).",
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
