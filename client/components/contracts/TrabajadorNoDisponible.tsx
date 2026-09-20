import { useState } from "react";
import { UserX, Loader2, RotateCcw, Wallet, TrendingDown } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "/api";

interface Props {
  contractId: string;
  rol: "cliente" | "trabajador";
  precio: number;
  /** Si el trabajador ya avisó, con qué motivo. */
  aviso: { motivo: string; avisadoEl: string } | null;
  onDone: () => void;
}

const $ = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

/**
 * El trabajador avisa que no puede; el cliente decide qué hacer con su plata.
 *
 * Al trabajador le muestra un solo botón: avisar. Le corre la escalera de
 * cancelaciones, pero avisar a tiempo es lo que le permite al cliente decidir
 * con calma; desaparecer es peor para los dos.
 *
 * Al cliente, cuando hay un aviso registrado, le muestra las tres salidas
 * juntas, con lo que pasa con la plata en cada una. Sin aviso registrado no
 * puede usar este camino: sería cancelar él y cargarle la penalidad al otro.
 */
export default function TrabajadorNoDisponible({ contractId, rol, precio, aviso, onDone }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const llamar = async (body: Record<string, unknown>, etiqueta: string) => {
    setEnviando(etiqueta);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/contracts/${contractId}/worker-unavailable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "No se pudo");
      setAbierto(false);
      onDone();
    } catch (e: any) {
      setError(e?.message || "No se pudo");
    } finally {
      setEnviando(null);
    }
  };

  if (rol === "trabajador") {
    if (aviso) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          Avisaste que no podés hacer este trabajo. El cliente está decidiendo qué hacer con su pago.
        </div>
      );
    }
    return (
      <div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          aria-expanded={abierto}
        >
          <UserX className="h-4 w-4" aria-hidden="true" /> No puedo hacer este trabajo
        </button>
        {abierto && (
          <form
            className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            onSubmit={(e) => {
              e.preventDefault();
              if (motivo.trim().length < 5) { setError("Contá brevemente por qué no podés."); return; }
              llamar({ motivo: motivo.trim() }, "avisar");
            }}
          >
            <label htmlFor="nodisp-motivo" className="block text-sm font-medium text-slate-800 dark:text-slate-100">Contale al cliente qué pasó</label>
            <textarea
              id="nodisp-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cancelar un trabajo aceptado cuenta en tu historial (aviso, después marca visible, después días sin postularte). Avisar a tiempo le permite al cliente decidir con calma; desaparecer es peor para los dos.
            </p>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={!!enviando} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 dark:bg-slate-200 dark:text-slate-900">
              {enviando ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Avisar al cliente"}
            </button>
          </form>
        )}
      </div>
    );
  }

  // Cliente
  if (!aviso) return null;

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-100">
        <UserX className="h-5 w-5" aria-hidden="true" /> El trabajador avisó que no puede hacer el trabajo
      </div>
      <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
        Dijo: "{aviso.motivo}" ({new Date(aviso.avisadoEl).toLocaleString("es-AR")}). Ya pagaste {$(precio)} de precio. Vos decidís qué pasa con esa plata; a él le corre la penalidad por cancelar.
      </p>

      <div className="mt-3 grid gap-2">
        <button
          onClick={() => llamar({ opcion: "liberar", motivo: "El trabajador avisó que no puede" }, "liberar")}
          disabled={!!enviando}
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-white p-3 text-left hover:bg-amber-100/50 disabled:opacity-60 dark:border-amber-700 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" aria-hidden="true" />
          <span>
            <span className="block font-medium text-slate-900 dark:text-white">Dejarlo publicado con la plata que ya está</span>
            <span className="block text-xs text-slate-600 dark:text-slate-300">Otro trabajador puede tomarlo por {$(precio)} sin que pagues nada más ni vuelvas a pasar por la pasarela. Es la salida barata para los dos.</span>
          </span>
        </button>

        <div className="rounded-lg border border-amber-300 bg-white p-3 dark:border-amber-700 dark:bg-slate-800">
          <div className="flex items-start gap-3">
            <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" aria-hidden="true" />
            <span>
              <span className="block font-medium text-slate-900 dark:text-white">Republicarlo por menos</span>
              <span className="block text-xs text-slate-600 dark:text-slate-300">La diferencia queda como saldo a favor. Útil si aprendiste que el trabajo se consigue por menos.</span>
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={1}
              max={Math.max(1, precio - 1)}
              value={nuevoPrecio}
              onChange={(e) => setNuevoPrecio(e.target.value)}
              placeholder={`menos de ${$(precio)}`}
              aria-label="Nuevo precio"
              className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            <button
              onClick={() => llamar({ opcion: "parcial", nuevoPrecio: Number(nuevoPrecio), motivo: "El trabajador avisó que no puede" }, "parcial")}
              disabled={!!enviando || !(Number(nuevoPrecio) > 0 && Number(nuevoPrecio) < precio)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
            >
              Republicar
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            if (window.confirm(`¿Pasar ${$(precio)} a tu saldo a favor? La comisión de publicación no se devuelve porque ya había un trabajador seleccionado. El saldo se usa sin costo en la app; si lo retirás al banco se descuenta la pasarela.`)) {
              llamar({ opcion: "saldo", motivo: "El trabajador avisó que no puede" }, "saldo");
            }
          }}
          disabled={!!enviando}
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-white p-3 text-left hover:bg-amber-100/50 disabled:opacity-60 dark:border-amber-700 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" aria-hidden="true" />
          <span>
            <span className="block font-medium text-slate-900 dark:text-white">Pasar el precio a mi saldo a favor</span>
            <span className="block text-xs text-slate-600 dark:text-slate-300">{$(precio)} a tu saldo, para usar en otra publicación sin costo o retirar (con la pasarela descontada). La comisión de publicación no se devuelve.</span>
          </span>
        </button>
      </div>
      {enviando && <p className="mt-2 text-xs text-slate-500"><Loader2 className="inline h-3 w-3 animate-spin" /> Aplicando…</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}
