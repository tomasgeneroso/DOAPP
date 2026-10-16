import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  ESPERA_ENTRE_CONSULTAS_MS,
  estadoDeLaVerificacion,
  hayQueVolverAPreguntar,
  textoDelEstado,
  type EstadoDeLaVerificacion,
  type RespuestaDelEstado,
} from "@/utils/kycCallback";

const API_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * Adonde vuelve la persona después de verificar su identidad en Didit (`/kyc/callback`).
 *
 * Esta dirección la manda nuestro servidor a Didit al abrir la sesión (`POST /api/auth/kyc/start`), pero la
 * pantalla nunca se había escrito: al terminar, la persona caía en una página inexistente (404) aunque la
 * verificación hubiera salido bien.
 *
 * Qué hace: pregunta el resultado real a `GET /api/auth/kyc/status` (que lo consulta a Didit; no se confía en el
 * `status` de la dirección, que cualquiera puede escribir), espera unos segundos si todavía no resolvió y lo cuenta.
 * Quien empezó desde la app llega acá en el navegador del celular, sin sesión web: se le dice que vuelva a la app.
 */
export default function KycCallback() {
  const { t } = useTranslation();
  const { user, token, isLoading, refreshUser } = useAuth();
  const [estado, setEstado] = useState<EstadoDeLaVerificacion>("pendiente");
  const [consultas, setConsultas] = useState(0);
  const [fallo, setFallo] = useState(false);
  const yaAvisoAlContexto = useRef(false);

  const sinSesion = !isLoading && !token;

  useEffect(() => {
    if (isLoading || !token) return;
    let vigente = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const consultar = async (hechas: number) => {
      try {
        const res = await fetch(`${API_URL}/auth/kyc/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data: RespuestaDelEstado = await res.json();
        if (!vigente) return;
        if (!res.ok || data.success !== true) throw new Error("estado no disponible");
        const nuevo = estadoDeLaVerificacion(data.kycStatus, data.dniVerified);
        setFallo(false);
        setEstado(nuevo);
        setConsultas(hechas + 1);
        if (nuevo === "aprobada" && !yaAvisoAlContexto.current) {
          yaAvisoAlContexto.current = true;
          await refreshUser();
        }
        if (hayQueVolverAPreguntar(nuevo, hechas + 1)) {
          temporizador = setTimeout(() => consultar(hechas + 1), ESPERA_ENTRE_CONSULTAS_MS);
        }
      } catch {
        if (!vigente) return;
        setFallo(true);
      }
    };

    consultar(0);
    return () => {
      vigente = false;
      if (temporizador) clearTimeout(temporizador);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, token]);

  // Registro en pasos: al terminar con Didit sigue el último paso (revisar los datos que salieron del documento y completar lo que falta).
  const navigate = useNavigate();
  const registroPendiente = !!(user as any)?.registrationPending;
  const sigueElRegistro = registroPendiente && (estado === "aprobada" || estado === "en_revision");
  useEffect(() => {
    if (!sigueElRegistro) return;
    const t = setTimeout(() => navigate("/complete-registration", { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [sigueElRegistro, navigate]);

  const agotado = estado === "pendiente" && !hayQueVolverAPreguntar(estado, consultas) && consultas > 0;
  const texto = textoDelEstado(estado, agotado);

  const icono = fallo ? (
    <ShieldAlert className="h-14 w-14 text-amber-500 mx-auto mb-6" />
  ) : estado === "aprobada" ? (
    <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-6" />
  ) : estado === "rechazada" ? (
    <ShieldAlert className="h-14 w-14 text-red-500 mx-auto mb-6" />
  ) : estado === "en_revision" || agotado ? (
    <Clock className="h-14 w-14 text-amber-500 mx-auto mb-6" />
  ) : (
    <Loader2 className="h-14 w-14 text-sky-500 mx-auto mb-6 animate-spin" />
  );

  const boton = "inline-block px-5 py-2.5 rounded-xl font-medium transition-colors";
  const principal = `${boton} bg-sky-600 hover:bg-sky-700 text-white`;
  const secundario = `${boton} bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white`;

  return (
    <>
      <Helmet>
        <title>{t("kycCallback.title", "Verificación de identidad")} - DOAPP</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 text-center">
          {sinSesion ? (
            <>
              <CheckCircle2 className="h-14 w-14 text-sky-500 mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                {t("kycCallback.noSessionTitle", "Terminaste en Didit")}
              </h1>
              <p className="text-slate-600 dark:text-slate-300 mb-6">
                {t(
                  "kycCallback.noSessionText",
                  "Entrá a DOAPP e iniciá sesión para ver cómo salió. Si empezaste desde la app, el resultado también se actualiza solo cuando la abras."
                )}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/login?redirect=/kyc/callback" className={principal}>{t("kycCallback.login", "Iniciar sesión")}</Link>
                <Link to="/" className={secundario}>{t("kycCallback.goToSite", "Ir a DOAPP")}</Link>
              </div>
            </>
          ) : (
            <>
              {icono}
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                {fallo ? t("kycCallback.errorTitle", "No pudimos consultar el resultado") : texto.titulo}
              </h1>
              <p className="text-slate-600 dark:text-slate-300 mb-6">
                {fallo
                  ? t("kycCallback.errorText", "Revisá tu conexión y volvé a abrir esta página. Tu verificación no se pierde: queda registrada en Didit.")
                  : texto.detalle}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {sigueElRegistro ? (
                  <Link to="/complete-registration" replace className={principal}>{t("kycCallback.continueRegistration", "Continuar con tu registro")}</Link>
                ) : (
                  <Link to="/" className={estado === "aprobada" ? principal : secundario}>{t("kycCallback.home", "Ir al inicio")}</Link>
                )}
                {estado === "rechazada" && (
                  <Link to={user?.id ? `/profile/${user.id}` : "/"} className={principal}>{t("kycCallback.retry", "Volver a intentar")}</Link>
                )}
                {estado === "rechazada" && (
                  <Link to="/help" className={secundario}>{t("kycCallback.help", "Centro de ayuda")}</Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
