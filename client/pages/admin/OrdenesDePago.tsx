import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldOff,
  FileText,
  Check,
  X,
  Loader2,
  ExternalLink,
  Clock,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/ui/Toast";

/**
 * Las órdenes de pago al terminar que esperan una decisión.
 *
 * Sólo llegan acá las que se pagaron por transferencia: las de Mercado Pago las
 * confirma el webhook contra la preferencia y nadie las mira. Ésta es la cola
 * del camino manual, que existe porque no todo el mundo paga con pasarela — y
 * la alternativa a tenerlo es que esos pagos ocurran por fuera, donde DOAPP no
 * cobra comisión y no puede mediar.
 *
 * Lo que está en juego en cada fila no es un trámite: aprobar es lo que hace
 * que la operación quede cubierta por DOAPP, y rechazar deja a un trabajador
 * que ya trabajó sin la vía para reclamar. Por eso el rechazo pide motivo y el
 * comprobante se abre de verdad, no se da por bueno de una lista.
 */

interface Comprobante {
  id: string;
  url: string;
  estado: string;
  subidoEn: string;
}

interface Orden {
  id: string;
  contractId: string | null;
  estado: string;
  metodo: string | null;
  total: number;
  desglose: {
    precio: number;
    comision: number;
    procesamiento: number;
    iva: number;
    ivaProcesamiento: number;
    total: number;
    cobraElTrabajador: number;
  } | null;
  vence: string | null;
  cubierta: boolean;
  cliente: string | null;
  trabajador: string | null;
  creada: string;
  comprobantes: Comprobante[];
}

const pesos = (n: number) =>
  `$${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—";

export default function OrdenesDePago() {
  const { token } = useAuth();
  const toast = useToast();

  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Record<string, string>>({});

  const traer = useCallback(async () => {
    try {
      const res = await fetch("/api/payment-orders/admin/pendientes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json?.success) setOrdenes(json.data || []);
    } catch {
      // Una lista que no carga no puede romper el panel entero.
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void traer();
  }, [traer]);

  async function decidir(orden: Orden, decision: "aprobar" | "rechazar") {
    const motivo = motivos[orden.id]?.trim() || "";

    if (decision === "rechazar" && !motivo) {
      // El servidor lo exige igual. Acá se dice antes, para no perder el viaje.
      toast.error("Falta el motivo", "Un rechazo sin motivo deja al cliente sin saber qué corregir.");
      return;
    }

    setTrabajando(orden.id);
    try {
      const res = await fetch(`/api/payment-orders/${orden.id}/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision, motivo }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        toast.error("No se pudo registrar la decisión", json?.message);
        return;
      }

      toast.success(
        decision === "aprobar" ? "Pago confirmado" : "Comprobante rechazado",
        decision === "aprobar"
          ? "La operación queda cubierta por DOAPP."
          : "Las dos partes fueron notificadas.",
      );
      setMotivos((m) => ({ ...m, [orden.id]: "" }));
      await traer();
    } catch (e: any) {
      toast.error("No se pudo registrar la decisión", e?.message);
    } finally {
      setTrabajando(null);
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <ShieldOff className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          Órdenes de pago al terminar
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Sólo las que se pagan por transferencia llegan acá: las de Mercado Pago las confirma el
          webhook. Aprobar es lo que hace que la operación quede cubierta por DOAPP.
        </p>
      </header>

      {ordenes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-800">
          <Inbox className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <p className="mt-3 font-medium text-slate-700 dark:text-slate-200">
            No hay órdenes esperando
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Si el módulo de pago al terminar está apagado, esta lista siempre va a estar vacía.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ordenes.map((orden) => {
            const comprobantes = orden.comprobantes || [];
            const sinComprobante = comprobantes.length === 0;
            const vencida = orden.vence ? new Date(orden.vence) < new Date() : false;

            return (
              <article
                key={orden.id}
                className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {orden.cliente || "Cliente"} → {orden.trabajador || "Trabajador"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Creada el {fecha(orden.creada)}
                      {orden.vence && ` · vence el ${fecha(orden.vence)}`}
                      {orden.contractId && (
                        <>
                          {" · "}
                          <Link
                            to={`/contracts/${orden.contractId}`}
                            className="underline decoration-dotted hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            ver contrato
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {pesos(orden.total)}
                  </p>
                </div>

                {orden.desglose && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    {[
                      ["Precio", orden.desglose.precio],
                      ["Comisión", orden.desglose.comision],
                      ["Procesamiento", orden.desglose.procesamiento],
                      ["Cobra el trabajador", orden.desglose.cobraElTrabajador],
                    ].map(([etiqueta, valor]) => (
                      <div key={etiqueta as string}>
                        <dt className="text-xs text-slate-500 dark:text-slate-400">{etiqueta}</dt>
                        <dd className="tabular-nums text-slate-800 dark:text-slate-200">
                          {pesos(valor as number)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {vencida && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    La orden venció. Aprobarla igual la deja cubierta, pero conviene confirmar la
                    fecha del comprobante.
                  </p>
                )}

                {/* El comprobante. Se abre de verdad: dar por buena una lista no es verificar. */}
                <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                  {sinComprobante ? (
                    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Todavía no subió ningún comprobante. No hay nada que aprobar.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {comprobantes.map((c) => (
                        <li key={c.id}>
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                          >
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            Ver comprobante del {fecha(c.subidoEn)}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {!sinComprobante && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={motivos[orden.id] || ""}
                      onChange={(e) => setMotivos((m) => ({ ...m, [orden.id]: e.target.value }))}
                      placeholder="Motivo (obligatorio para rechazar)"
                      className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => decidir(orden, "aprobar")}
                      disabled={trabajando === orden.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {trabajando === orden.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => decidir(orden, "rechazar")}
                      disabled={trabajando === orden.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      Rechazar
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
