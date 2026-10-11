import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, Info, Smartphone } from "lucide-react";

/**
 * A dónde llega quien pagó en Mercado Pago DESDE LA APP del celular.
 *
 * Mercado Pago devuelve al navegador del teléfono, que casi nunca tiene una sesión de DOAPP iniciada: la página de éxito
 * de la web (`/payment/success`) confirma el pago con esa sesión y mostraba un error aunque el pago hubiera salido bien.
 * Esta página es pública y NO confirma nada: sólo dice «volvé a la app», que es donde se confirma el pago y se ve cómo
 * sigue. El botón abre la app en la pantalla de seguimiento del pago (esquema `doapp://`).
 */

/** Cómo se llama cada tipo de pago en la pantalla de seguimiento de la app. */
const TIPO_EN_LA_APP: Record<string, string> = {
  publicacion: "publicacion",
  aumento: "aumento",
  cotizacion: "cotizacion",
  contrato: "contrato",
  orden: "contrato",
};

export default function PagoDesdeApp() {
  const [params] = useSearchParams();
  const tipo = params.get("tipo") || "";
  const cancelado = params.get("estado") === "cancelado";

  // La dirección para abrir la app lleva lo que Mercado Pago y DOAPP dejaron en la dirección (ids y preferencia).
  const paraLaApp = new URLSearchParams();
  paraLaApp.set("tipo", TIPO_EN_LA_APP[tipo] || "publicacion");
  for (const [de, a] of [
    ["jobId", "jobId"],
    ["proposalId", "proposalId"],
    ["contractId", "contractId"],
    ["preference_id", "preferenceId"],
  ] as const) {
    const valor = params.get(de);
    if (valor) paraLaApp.set(a, valor);
  }
  const abrirLaApp = `doapp://pago-en-curso?${paraLaApp.toString()}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-5 ${
            cancelado ? "bg-slate-100 dark:bg-slate-700" : "bg-green-100 dark:bg-green-900"
          }`}
        >
          {cancelado ? (
            <Info className="w-9 h-9 text-slate-600 dark:text-slate-300" aria-hidden="true" />
          ) : (
            <CheckCircle className="w-9 h-9 text-green-600 dark:text-green-400" aria-hidden="true" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          {cancelado ? "Cancelaste el pago" : "Volviste de Mercado Pago"}
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          {cancelado
            ? "No se cobró nada. Volvé a la app de DOAPP cuando quieras intentarlo de nuevo."
            : "Abrí la app de DOAPP: ahí confirmamos tu pago y ves cómo sigue. No hace falta que pagues de nuevo."}
        </p>

        <a
          href={abrirLaApp}
          className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-4 rounded-xl transition-colors"
        >
          <Smartphone className="w-5 h-5" aria-hidden="true" />
          Abrir la app de DOAPP
        </a>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
          ¿No tenés la app instalada en este teléfono?{" "}
          <Link to="/login" className="text-sky-600 dark:text-sky-400 underline">
            Iniciá sesión acá
          </Link>{" "}
          para ver el estado de tu pago.
        </p>
      </div>
    </div>
  );
}
