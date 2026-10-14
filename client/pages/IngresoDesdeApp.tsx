import { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Smartphone, Info } from "lucide-react";

/**
 * A dónde llega quien entró con Google o X DESDE LA APP del celular.
 *
 * El ingreso social se hace en el navegador del teléfono. Al terminar, el servidor deja acá un código de un solo uso (vale
 * 2 minutos) y esta página abre la app con él (esquema `doapp://`); la app lo canjea por la sesión. Es pública y no guarda
 * nada: el código no es la sesión. Si la app no se abre sola (algunos navegadores lo impiden sin un toque), el botón la abre.
 */
export default function IngresoDesdeApp() {
  const [params] = useSearchParams();
  const codigo = params.get("codigo") || "";
  const valido = /^[0-9a-f]{64}$/.test(codigo);
  const abrirLaApp = `doapp://auth-callback?codigo=${codigo}`;

  useEffect(() => {
    if (!valido) return;
    const t = setTimeout(() => {
      window.location.href = abrirLaApp;
    }, 400);
    return () => clearTimeout(t);
  }, [valido, abrirLaApp]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5 bg-sky-100 dark:bg-sky-900">
          {valido ? (
            <Smartphone className="w-9 h-9 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          ) : (
            <Info className="w-9 h-9 text-slate-600 dark:text-slate-300" aria-hidden="true" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          {valido ? "Volvé a la app de DOAPP" : "Este enlace no sirve"}
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          {valido
            ? "Ya iniciaste sesión. Tocá el botón para seguir en la app (el enlace vale 2 minutos y se usa una sola vez)."
            : "Venció o ya se usó. Volvé a la app y tocá otra vez «Ingresar con Google» o «Ingresar con X»."}
        </p>

        {valido && (
          <a
            href={abrirLaApp}
            className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-4 rounded-xl transition-colors"
          >
            <Smartphone className="w-5 h-5" aria-hidden="true" />
            Abrir la app
          </a>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
          ¿No tenés la app instalada?{" "}
          <Link to="/login" className="text-sky-600 dark:text-sky-400 underline">
            Entrá desde la web
          </Link>
          . Si algo no sale, <Link to="/contact" className="text-sky-600 dark:text-sky-400 underline">contactá a soporte</Link>.
        </p>
      </div>
    </div>
  );
}
