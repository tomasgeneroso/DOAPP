import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, Info, Smartphone } from "lucide-react";

/**
 * A dónde llega quien pagó en Mercado Pago DESDE LA APP del celular.
 *
 * Mercado Pago devuelve al navegador del teléfono, que casi nunca tiene una sesión de DOAPP iniciada: la página de éxito
 * de la web (`/payment/success`) confirma el pago con esa sesión y mostraba un error aunque el pago hubiera salido bien.
 * Esta página es pública y NO confirma nada: sólo manda a doapparg.com (el botón principal), donde se inicia sesión y se ve
 * cómo sigue el pago. Abrir la app (esquema `doapp://`) queda como enlace secundario: el esquema solo funciona si la app está
 * instalada y no lleva a ningún lado en un navegador de escritorio o sin la app, por eso ya no es el botón.
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
            ? "No se cobró nada. Entrá a DOAPP cuando quieras intentarlo de nuevo."
            : "Entrá a DOAPP para ver cómo sigue tu pago. No hace falta que pagues de nuevo."}
        </p>

        <Link
          to="/login"
          className="w-full inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-4 rounded-xl transition-colors"
        >
          Ir a DOAPP
        </Link>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
          ¿Pagaste desde la app y la tenés instalada en este teléfono?{" "}
          <a href={abrirLaApp} className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 underline">
            <Smartphone className="w-4 h-4" aria-hidden="true" />
            Abrila desde acá
          </a>
        </p>
      </div>
    </div>
  );
}
