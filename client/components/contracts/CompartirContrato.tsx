import { useState } from "react";
import { Share2, Copy, Check, X, MessageCircle } from "lucide-react";
import { textoParaCompartir, AVISO_COMPARTIR, type DatosParaCompartir } from "../../../shared/contracts/compartir";

/**
 * Compartir con alguien de confianza quién viene, a qué hora y cómo está
 * verificado. Arma el texto y deja copiarlo o mandarlo; no genera ningún link
 * público ni incluye datos de contacto de la otra parte.
 */
export default function CompartirContrato({ datos }: { datos: DatosParaCompartir }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const texto = textoParaCompartir(datos);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso de portapapeles: el textarea de abajo queda seleccionable.
      setCopiado(false);
    }
  };

  const compartirNativo = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ text: texto });
    } catch {
      /* el usuario canceló */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        aria-haspopup="dialog"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Compartir con alguien de confianza
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="compartir-titulo">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <h2 id="compartir-titulo" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                <Share2 className="h-5 w-5" aria-hidden="true" />
                Compartir con alguien de confianza
              </h2>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label htmlFor="compartir-texto" className="mt-3 block text-sm text-slate-600 dark:text-slate-300">
              Este es el mensaje. Podés editarlo antes de mandarlo.
            </label>
            <textarea
              id="compartir-texto"
              readOnly
              value={texto}
              rows={8}
              className="mt-1 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              onFocus={(e) => e.currentTarget.select()}
            />

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={copiar}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white hover:bg-sky-700"
              >
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar el mensaje"}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:text-slate-100"
              >
                <MessageCircle className="h-4 w-4" /> Mandar por WhatsApp
              </a>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={compartirNativo}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:text-slate-100"
                >
                  <Share2 className="h-4 w-4" /> Elegir otra app
                </button>
              )}
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{AVISO_COMPARTIR}</p>
          </div>
        </div>
      )}
    </>
  );
}
