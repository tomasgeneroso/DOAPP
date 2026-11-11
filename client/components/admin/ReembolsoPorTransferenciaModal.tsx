import { useEffect, useState } from "react";
import { X, Loader2, AlertTriangle, Wallet, Landmark } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import Transicion from "../ui/Transicion";

/**
 * Reembolsar un pago hecho por TRANSFERENCIA (lo hace una persona del equipo).
 *
 * Sirve para dos cosas: devolver un pago por iniciativa propia, o aprobar el pedido que hizo el cliente (`pedido`). Un pago de Mercado Pago no pasa por acá (botón «Devolver»).
 * Sale por una de dos vías: al SALDO del cliente (en el momento, la plata ya está en DOAPP) o a su BANCO (se transfiere a mano desde la cuenta de DOAPP y se sube el comprobante).
 * Reglas y porqués: `server/services/reembolsoPorTransferencia.ts`.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Se llama cuando salió bien, para que la pantalla recargue. */
  onListo?: () => void;
  pago: { id: string; amount: number; refundedAmount?: number; payerName?: string; description?: string; restante?: number } | null;
  /** Si viene, se está aprobando este pedido del cliente (en vez de reembolsar por iniciativa propia). */
  pedido?: { id: string; reason: string; amount: number | null; requesterName?: string } | null;
}

const MINIMO_DEL_MOTIVO = 15;
const pesos = (n: number) => `$${Number(n || 0).toLocaleString("es-AR")}`;

export default function ReembolsoPorTransferenciaModal({ abierto, onCerrar, onListo, pago, pedido }: Props) {
  const { token } = useAuth();
  const [destino, setDestino] = useState<"saldo" | "banco">("saldo");
  const [monto, setMonto] = useState("");
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se limpia al abrir: lo escrito para un reembolso anterior no puede quedar cargado en el siguiente (el texto es el que lo explica en el registro).
  useEffect(() => {
    if (abierto) {
      setDestino("saldo");
      setMonto(pedido?.amount ? String(pedido.amount) : "");
      setTexto("");
      setArchivo(null);
      setError(null);
    }
  }, [abierto, pago?.id, pedido?.id, pedido?.amount]);

  if (!abierto || !pago) return null;

  const maximo = pago.restante ?? Math.round(((Number(pago.amount) || 0) - (Number(pago.refundedAmount) || 0)) * 100) / 100;
  const importe = monto.trim() === "" ? maximo : Number(monto);
  const montoInvalido = monto.trim() !== "" && (Number.isNaN(importe) || !(importe > 0) || importe > maximo);
  const esPedido = !!pedido;
  const textoCorto = !esPedido && texto.trim().length < MINIMO_DEL_MOTIVO;
  const faltaComprobante = destino === "banco" && !archivo;
  const noSePuede = enviando || montoInvalido || textoCorto || faltaComprobante;

  const confirmar = async () => {
    if (noSePuede) return;
    setEnviando(true);
    setError(null);
    try {
      let comprobanteUrl: string | undefined;
      if (destino === "banco" && archivo) {
        const fd = new FormData();
        fd.append("file", archivo);
        const subida = await fetch("/api/admin/payments/upload-proof", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const datosSubida = await subida.json();
        if (!datosSubida.success || !datosSubida.url) throw new Error(datosSubida.message || "No se pudo subir el comprobante.");
        comprobanteUrl = datosSubida.url;
      }
      const url = esPedido ? `/api/admin/refund-requests/${pedido!.id}/approve` : `/api/admin/payments/${pago.id}/refund-transfer`;
      const cuerpo = esPedido
        ? { destino, monto: monto.trim() === "" ? undefined : importe, nota: texto.trim() || undefined, comprobanteUrl }
        : { destino, monto: monto.trim() === "" ? undefined : importe, motivo: texto.trim(), comprobanteUrl };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(cuerpo) });
      const data = await res.json();
      if (!data.success) {
        const detalle = data.message || "No se pudo procesar el reembolso.";
        setError(data.requiereVerificacion ? `${detalle} Confirmá tu identidad y volvé a intentar.` : detalle);
        return;
      }
      onListo?.();
      onCerrar();
    } catch (e: any) {
      setError(e?.message || "Error de conexión");
    } finally {
      setEnviando(false);
    }
  };

  const opcion = (valor: "saldo" | "banco", titulo: string, detalle: string, icono: JSX.Element) => (
    <label
      className={`flex gap-3 items-start rounded-lg border p-3 cursor-pointer transition-colors ${
        destino === valor ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40"
      }`}
    >
      <input type="radio" name="destino-reembolso" checked={destino === valor} onChange={() => setDestino(valor)} className="mt-1 text-sky-600" />
      <span className="text-sm">
        <span className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
          {icono}
          {titulo}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{detalle}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reembolso-transferencia-titulo">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 p-5 shrink-0">
          <div>
            <h2 id="reembolso-transferencia-titulo" className="text-lg font-bold text-slate-900 dark:text-white">
              {esPedido ? "Aprobar pedido de reembolso" : "Reembolsar pago por transferencia"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {pago.description || "Pago"}
              {(pedido?.requesterName || pago.payerName) && <> · {pedido?.requesterName || pago.payerName}</>}
            </p>
          </div>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {esPedido && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">
              <p className="font-medium">Lo que pidió el cliente{pedido!.amount ? ` (${pesos(pedido!.amount)})` : " (todo lo que queda)"}:</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{pedido!.reason}</p>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <div className="flex justify-between px-3 py-2">
              <span className="text-slate-600 dark:text-slate-400">Pago original</span>
              <span className="font-medium text-slate-900 dark:text-white">{pesos(pago.amount)}</span>
            </div>
            <div className="flex justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/40">
              <span className="font-semibold text-slate-900 dark:text-white">Se puede devolver hasta</span>
              <span className="font-semibold text-slate-900 dark:text-white">{pesos(maximo)}</span>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">A dónde va</legend>
            {opcion("saldo", "Al saldo del cliente", "Queda disponible en el momento en su cuenta de DOAPP. Después puede usarlo o pedir el retiro.", <Wallet className="h-4 w-4" />)}
            {opcion("banco", "A su banco", "Hacés la transferencia a mano desde la cuenta de DOAPP y subís el comprobante acá.", <Landmark className="h-4 w-4" />)}
          </fieldset>

          <Transicion mostrar={destino === "banco"}>
            <div>
              <label htmlFor="reembolso-comprobante" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Comprobante de la transferencia
              </label>
              <input
                id="reembolso-comprobante"
                type="file"
                accept="image/jpeg,image/png,image/gif,application/pdf"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sky-700 dark:file:bg-sky-900/30 dark:file:text-sky-300"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Imagen o PDF, hasta 10 MB. Sin el comprobante no se registra la salida de plata.</p>
            </div>
          </Transicion>

          <div>
            <label htmlFor="reembolso-monto-admin" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Monto a devolver
            </label>
            <input
              id="reembolso-monto-admin"
              type="number"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={`Vacío = todo (${pesos(maximo)})`}
              min={0}
              max={maximo}
              className={`w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white ${
                montoInvalido ? "border-rose-400 dark:border-rose-600" : "border-slate-300 dark:border-slate-600"
              }`}
            />
            <Transicion mostrar={montoInvalido}>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">Tiene que ser más que cero y no pasar de {pesos(maximo)}.</p>
            </Transicion>
          </div>

          <div>
            <label htmlFor="reembolso-texto" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {esPedido ? "Mensaje para el cliente (opcional)" : "Por qué se devuelve"}
            </label>
            <textarea
              id="reembolso-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={2}
              placeholder={esPedido ? "Ej: Lo devolvimos a tu saldo porque transferiste dos veces." : "Ej: el cliente transfirió dos veces lo mismo"}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
            {!esPedido && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Es lo que va a explicar este movimiento dentro de seis meses. Mínimo {MINIMO_DEL_MOTIVO} caracteres.</p>}
          </div>

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
            <span className="text-slate-500 dark:text-slate-400">Se devuelven </span>
            <span className="font-bold text-lg text-slate-900 dark:text-white">{pesos(montoInvalido ? 0 : importe)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">
              Cancelar
            </button>
            <button
              onClick={confirmar}
              disabled={noSePuede}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              {esPedido ? "Aprobar y devolver" : "Reembolsar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
