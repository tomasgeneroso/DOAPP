import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, Copy, ShieldAlert } from "lucide-react";

/**
 * Destino del botón «Copiar código» del correo.
 *
 * Los correos no pueden copiar al portapapeles (no corren código). El botón abre esta página con el código en el fragmento de la
 * dirección (`#123456`), que el navegador nunca envía al servidor ni queda en sus registros. Acá se muestra en grande con un botón
 * que lo copia, y se borra de la dirección para que no quede en el historial a la vista.
 */
const ES_UN_CODIGO = /^\d{6}$/;

export default function CopiarCodigo() {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [noSePudo, setNoSePudo] = useState(false);

  useEffect(() => {
    // Al abrir la página y también si se abre otro correo en la misma pestaña (cambia solo el fragmento: no se vuelve a montar).
    const leer = () => {
      if (!window.location.hash) return;
      let crudo = "";
      try {
        crudo = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
      } catch {
        /* fragmento mal formado: se trata como sin código */
      }
      setCodigo(ES_UN_CODIGO.test(crudo) ? crudo : null);
      setCopiado(false);
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        /* sin historial: el código queda en la barra, nada más */
      }
    };
    leer();
    window.addEventListener("hashchange", leer);
    return () => window.removeEventListener("hashchange", leer);
  }, []);

  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(false), 2500);
    return () => window.clearTimeout(t);
  }, [copiado]);

  const copiar = async () => {
    if (!codigo) return;
    setNoSePudo(false);
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
    } catch {
      setNoSePudo(true);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <Helmet>
        <title>Copiar código | DoApp</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 p-6 text-center animate-fadeIn">
        {codigo ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">Tu código para cambiar la contraseña</p>
            <p className="mt-3 select-all font-mono text-4xl font-bold tracking-[0.35em] text-slate-900 dark:text-white" aria-label={`Código ${codigo.split("").join(" ")}`}>
              {codigo}
            </p>
            <button
              type="button"
              onClick={copiar}
              className={`mt-5 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-semibold text-white transition-colors duration-200 ${copiado ? "bg-green-600" : "bg-sky-500 hover:bg-sky-600"}`}
            >
              {copiado ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
              {copiado ? "¡Copiado!" : "Copiar código"}
            </button>
            {noSePudo && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300 animate-fadeIn" role="alert">No pudimos copiarlo solos: mantené apretado el código y copialo a mano.</p>}
            <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">
              Volvé a <strong>Configuración → Seguridad</strong> y pegalo ahí. Vale 15 minutos.
            </p>
            <Link to="/settings" className="mt-3 inline-block text-sm font-semibold text-sky-600 dark:text-sky-400 underline underline-offset-2">
              Ir a Configuración
            </Link>
          </>
        ) : (
          <>
            <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-900 dark:text-white">No encontramos un código en este enlace</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Abrí otra vez el botón del correo. Si ya lo usaste, el código se quita de la dirección: pedí uno nuevo en Configuración → Seguridad.
            </p>
            <Link to="/settings" className="mt-4 inline-block text-sm font-semibold text-sky-600 dark:text-sky-400 underline underline-offset-2">
              Ir a Configuración
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
