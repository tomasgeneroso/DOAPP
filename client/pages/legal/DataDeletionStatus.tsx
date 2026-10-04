import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, CheckCircle2 } from "lucide-react";

/**
 * Página que Facebook/Meta muestra al usuario después de pedir que se
 * borren sus datos ("Data Deletion Callback").
 *
 * Por qué existe: Meta exige una URL pública que confirme el estado del
 * pedido, y hasta ahora `server/routes/auth.ts` devolvía
 * `${CLIENT_URL}/data-deletion?code=...` sin que esa ruta existiera en el
 * cliente — un usuario que siguiera el enlace se encontraba con un 404.
 *
 * El borrado ya ocurrió cuando esta página carga: el endpoint de Meta
 * (`POST /api/auth/facebook/data-deletion`) desvincula el `facebookId` de
 * forma síncrona, antes de responderle a Facebook con esta URL. Por eso no
 * hace falta consultar nada contra el servidor acá — sólo mostrar el código
 * que viene en la URL, que es lo que Meta exige poder exhibirle al usuario.
 *
 * Pública a propósito: a quien llega acá puede no tener sesión iniciada en
 * DOAPP (Facebook lo redirige desde fuera de la app).
 */
export default function DataDeletionStatus() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");

  return (
    <>
      <Helmet>
        <title>Eliminación de datos - DOAPP</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="flex items-center justify-between mb-8">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Home className="h-4 w-4" />
              Inicio
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 md:p-12 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-6" />

            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Tu solicitud de eliminación de datos fue procesada
            </h1>

            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Desvinculamos tu cuenta de Facebook de DOAPP. Si además querés
              eliminar tu cuenta por completo, escribinos a{" "}
              <a
                href="mailto:support@doapparg.com"
                className="text-sky-600 dark:text-sky-400 hover:underline"
              >
                support@doapparg.com
              </a>
              .
            </p>

            {code && (
              <div className="inline-block bg-slate-100 dark:bg-slate-700 rounded-lg px-4 py-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Código de confirmación
                </p>
                <p className="font-mono text-sm text-slate-900 dark:text-white break-all">
                  {code}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
