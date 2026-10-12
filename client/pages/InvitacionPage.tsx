import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Gift, CheckCircle, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

/**
 * Enlace de invitación de un creador de contenido: /invitacion/<código>.
 *
 * Es de un solo uso: quien lo canjea (al crear la cuenta o desde su sesión) no paga la comisión de DOAPP por sus contratos
 * como Cliente durante el plazo de la invitación (Términos 7.11). Esta página sólo cuenta si el enlace sirve y manda a
 * registrarse o a canjearlo; el servidor valida y canjea. No se indexa (SeoDeRuta: lo que no está en la lista, noindex).
 */

interface Consulta {
  valida: boolean;
  estado: string;
  mensaje: string;
  dias?: number;
  influencer?: string;
}

export default function InvitacionPage() {
  const { codigo = "" } = useParams<{ codigo: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [canjeando, setCanjeando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const res = await fetch(`/api/invitaciones/${encodeURIComponent(codigo)}`);
        const data = await res.json().catch(() => null);
        if (vigente) setConsulta(data?.success ? data : { valida: false, estado: "error", mensaje: data?.message || "No pudimos revisar la invitación. Probá de nuevo." });
      } catch {
        if (vigente) setConsulta({ valida: false, estado: "error", mensaje: "No pudimos revisar la invitación. Probá de nuevo." });
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [codigo]);

  const crearCuenta = () => {
    try {
      sessionStorage.setItem("doapp:invitacion", codigo.toUpperCase());
    } catch {
      /* sin almacenamiento: igual va en la dirección */
    }
    navigate(`/register?invitacion=${encodeURIComponent(codigo.toUpperCase())}`);
  };

  const canjear = async () => {
    setCanjeando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/invitaciones/canjear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ codigo }),
      });
      const data = await res.json().catch(() => ({}));
      setResultado({ ok: !!data.success, mensaje: data.message || (data.success ? "Listo." : "No se pudo canjear la invitación.") });
    } catch {
      setResultado({ ok: false, mensaje: "No se pudo canjear la invitación. Probá de nuevo." });
    } finally {
      setCanjeando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Helmet>
        <title>Invitación · DOAPP</title>
      </Helmet>
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
        {cargando ? (
          <div className="flex justify-center py-8" role="status" aria-label="Revisando la invitación">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : consulta?.valida ? (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <Gift className="h-8 w-8 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
              {consulta.influencer ? `${consulta.influencer} te invitó a DOAPP` : "Te invitaron a DOAPP"}
            </h1>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-5">
              Contratá servicios <strong>sin pagar la comisión de DOAPP</strong> durante <strong>{consulta.dias} días</strong> desde que activás la invitación.
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-6">
              <li className="flex gap-2"><ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" aria-hidden="true" /> El pago queda protegido hasta que el trabajo se termina.</li>
              <li className="flex gap-2"><CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" aria-hidden="true" /> Vale para tus contratos como Cliente. No incluye el costo de procesamiento del pago ni los impuestos.</li>
              <li className="flex gap-2"><CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" aria-hidden="true" /> Esta invitación es de un solo uso y cada cuenta puede activar una.</li>
            </ul>

            {resultado ? (
              <div
                role="status"
                className={`rounded-lg px-4 py-3 text-sm mb-4 ${resultado.ok ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300" : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"}`}
              >
                {resultado.mensaje}
              </div>
            ) : null}

            {user ? (
              <button
                onClick={canjear}
                disabled={canjeando || resultado?.ok === true}
                className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {canjeando ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                Activar en mi cuenta
              </button>
            ) : (
              <>
                <button
                  onClick={crearCuenta}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors mb-3"
                >
                  Crear mi cuenta con la invitación
                </button>
                <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                  ¿Ya tenés cuenta?{" "}
                  <Link to={`/login?redirect=${encodeURIComponent(`/invitacion/${codigo}`)}`} className="text-sky-600 dark:text-sky-400 underline">
                    Iniciá sesión para activarla
                  </Link>
                </p>
              </>
            )}
            <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-5">
              Condiciones en los{" "}
              <Link to="/legal/terminos-y-condiciones" className="underline">
                Términos y condiciones (punto 7.11)
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">Esta invitación no se puede usar</h1>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-6">{consulta?.mensaje || "Revisá el enlace."}</p>
            <Link to="/register" className="block w-full text-center bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
              Crear mi cuenta igual
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
