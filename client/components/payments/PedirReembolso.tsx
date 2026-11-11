import { useEffect, useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { paymentApi } from "@/lib/paymentApi";
import Transicion from "../ui/Transicion";

/**
 * El cliente pide que le devuelvan un pago suyo hecho por TRANSFERENCIA.
 *
 * Un pago de Mercado Pago no pasa por acá (se devuelve por la pasarela). Acá lo revisa una persona del equipo y, si lo aprueba, la plata vuelve a tu saldo (disponible en el
 * momento) o a tu banco. No se elige el destino: lo decide quien revisa, según el caso. Reglas y porqués: `server/services/reembolsoPorTransferencia.ts`.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Se llama cuando el pedido salió bien, para que la pantalla recargue. */
  onListo?: () => void;
  pago: { id: string; amount: number; description?: string; restante: number } | null;
}

const MINIMO_DEL_MOTIVO = 15;
const pesos = (n: number) => `$${Number(n || 0).toLocaleString("es-AR")}`;

export default function PedirReembolso({ abierto, onCerrar, onListo, pago }: Props) {
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se limpia al abrir: el motivo de un pedido anterior no puede quedar cargado en el siguiente.
  useEffect(() => {
    if (abierto) {
      setMonto("");
      setMotivo("");
      setError(null);
    }
  }, [abierto, pago?.id]);

  if (!abierto || !pago) return null;

  const disponible = pago.restante;
  const importe = monto.trim() === "" ? disponible : Number(monto);
  const montoInvalido = monto.trim() !== "" && (Number.isNaN(importe) || !(importe > 0) || importe > disponible);
  const motivoCorto = motivo.trim().length < MINIMO_DEL_MOTIVO;

  const enviar = async () => {
    if (montoInvalido || motivoCorto) return;
    setEnviando(true);
    setError(null);
    try {
      await paymentApi.pedirReembolso({ paymentId: pago.id, amount: monto.trim() === "" ? undefined : importe, reason: motivo.trim() });
      onListo?.();
      onCerrar();
    } catch (e: any) {
      setError(e?.message || "No pudimos enviar tu pedido. Probá de nuevo en un rato.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pedir-reembolso-titulo">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 p-5 shrink-0">
          <div>
            <h2 id="pedir-reembolso-titulo" className="text-lg font-bold text-slate-900 dark:text-white">
              Pedir reembolso
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{pago.description || "Pago por transferencia"}</p>
          </div>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-slate-600 dark:text-slate-400">Lo que pagaste</span>
              <span className="font-medium text-slate-900 dark:text-white">{pesos(pago.amount)}</span>
            </div>
            <div className="flex justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/40">
              <span className="font-semibold text-slate-900 dark:text-white">Podés pedir hasta</span>
              <span className="font-semibold text-slate-900 dark:text-white">{pesos(disponible)}</span>
            </div>
          </div>

          <div>
            <label htmlFor="reembolso-monto" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Cuánto querés que te devolvamos
            </label>
            <input
              id="reembolso-monto"
              type="number"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={`Vacío = todo (${pesos(disponible)})`}
              min={0}
              max={disponible}
              className={`w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white ${
                montoInvalido ? "border-rose-400 dark:border-rose-600" : "border-slate-300 dark:border-slate-600"
              }`}
            />
            <Transicion mostrar={montoInvalido}>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">Tiene que ser más que cero y no pasar de {pesos(disponible)}.</p>
            </Transicion>
          </div>

          <div>
            <label htmlFor="reembolso-motivo" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Por qué lo pedís
            </label>
            <textarea
              id="reembolso-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej: transferí dos veces lo mismo / me equivoqué de monto / ya no voy a publicar"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Mínimo {MINIMO_DEL_MOTIVO} caracteres. Es lo primero que lee quien revisa tu pedido.</p>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Una persona del equipo revisa tu pedido. Si lo aprueba, la plata vuelve a tu saldo (la podés usar al instante) o te la transferimos a tu banco. Si tu pago sostiene una
            publicación o un contrato en marcha, primero hay que cancelarlo: así se liquida con la regla de los términos.
          </p>

          <Transicion mostrar={!!error}>
            {error && (
              <div className="flex gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm text-rose-800 dark:text-rose-200" role="alert">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </Transicion>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 p-5 shrink-0">
          <div className="text-sm">
            <span className="text-slate-500 dark:text-slate-400">Pedís </span>
            <span className="font-bold text-lg text-slate-900 dark:text-white">{pesos(montoInvalido ? 0 : importe)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={enviando || montoInvalido || motivoCorto}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
