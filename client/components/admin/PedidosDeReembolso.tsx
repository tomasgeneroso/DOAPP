import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useCambiosDeAdministracion } from "../../hooks/useSocket";
import Transicion from "../ui/Transicion";
import ReembolsoPorTransferenciaModal from "./ReembolsoPorTransferenciaModal";

/**
 * Pedidos de reembolso que hicieron los clientes sobre pagos por transferencia (lado del equipo). Cada pedido se aprueba (al saldo o al banco, con el comprobante) o se rechaza
 * con un motivo que lee el cliente. Se actualiza en vivo: un pedido nuevo aparece solo y uno resuelto por otra persona se va. Reglas y porqués:
 * `server/services/reembolsoPorTransferencia.ts`.
 */

interface Pedido {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  amount: number | null;
  reason: string;
  destination: "saldo" | "banco" | null;
  resolvedAmount: number | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  proofUrl: string | null;
  createdAt: string;
  requester: { id: string; name: string; email: string } | null;
  resolver: { id: string; name: string } | null;
  payment: { id: string; amount: number; currency: string; status: string; paymentType: string; refundedAmount: number; contractId: string | null; jobId: string | null; createdAt: string } | null;
  restante: number | null;
  bloqueo: { code: string; message: string } | null;
}

const pesos = (n: number) => `$${Number(n || 0).toLocaleString("es-AR")}`;
const ETIQUETA: Record<Pedido["status"], { texto: string; clase: string }> = {
  pending: { texto: "Pendiente", clase: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  approved: { texto: "Aprobado", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  rejected: { texto: "Rechazado", clase: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
  cancelled: { texto: "Retirado por el cliente", clase: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300" },
};

export default function PedidosDeReembolso({ onContar }: { onContar?: (pendientes: number) => void }) {
  const { token } = useAuth();
  const [vista, setVista] = useState<"pending" | "resolved">("pending");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aprobando, setAprobando] = useState<Pedido | null>(null);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorDeRechazo, setErrorDeRechazo] = useState<string | null>(null);

  const cargar = useCallback(
    async (silencioso = false) => {
      try {
        if (!silencioso) setCargando(true);
        const estados = vista === "pending" ? "pending" : "approved,rejected,cancelled";
        const res = await fetch(`/api/admin/refund-requests?status=${estados}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "No se pudieron cargar los pedidos.");
        setPedidos(data.data.pedidos);
        onContar?.(Number(data.data.pendientes) || 0);
        setError(null);
      } catch (e: any) {
        setError(e?.message || "No se pudieron cargar los pedidos.");
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onContar solo informa el contador; no debe disparar otra carga
    [token, vista],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Un pedido que llega, se aprueba o lo retira el cliente, aunque lo mueva otra persona: la lista se actualiza sola.
  useCambiosDeAdministracion(["refund", "payment"], () => void cargar(true));

  const rechazar = async (id: string) => {
    setEnviando(true);
    setErrorDeRechazo(null);
    try {
      const res = await fetch(`/api/admin/refund-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nota: nota.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorDeRechazo(data.message || "No se pudo rechazar el pedido.");
        return;
      }
      setRechazando(null);
      setNota("");
      await cargar(true);
    } catch (e: any) {
      setErrorDeRechazo(e?.message || "Error de conexión");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="pedidos-reembolso-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="pedidos-reembolso-titulo" className="text-base font-semibold text-slate-900 dark:text-white">
          Pedidos de reembolso de clientes
        </h3>
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-sm" role="tablist">
          {(["pending", "resolved"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={`px-3 py-1.5 ${vista === v ? "bg-sky-500 text-white" : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
            >
              {v === "pending" ? "Pendientes" : "Resueltos"}
            </button>
          ))}
        </div>
      </div>

      <Transicion mostrar={!!error}>
        {error && (
          <div className="flex gap-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm text-rose-800 dark:text-rose-200" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </Transicion>

      {cargando ? (
        <div className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {vista === "pending" ? "No hay pedidos de reembolso pendientes." : "Todavía no se resolvió ningún pedido."}
        </div>
      ) : (
        <ul className="space-y-3">
          {pedidos.map((p) => {
            const et = ETIQUETA[p.status];
            return (
              <li key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{p.requester?.name || "Cliente"}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{p.requester?.email}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${et.clase}`}>{et.texto}</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{new Date(p.createdAt).toLocaleString("es-AR")}</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Pide</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{p.amount ? pesos(p.amount) : "Todo lo que queda"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Pago original</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{p.payment ? pesos(p.payment.amount) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{p.status === "pending" ? "Se puede devolver" : "Se devolvió"}</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {p.status === "pending" ? (p.restante !== null ? pesos(p.restante) : "—") : p.resolvedAmount ? `${pesos(p.resolvedAmount)}${p.destination ? ` · ${p.destination === "banco" ? "al banco" : "al saldo"}` : ""}` : "—"}
                    </p>
                  </div>
                </div>

                <p className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{p.reason}</p>

                {p.payment && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {p.payment.jobId && (
                      <Link to={`/jobs/${p.payment.jobId}`} className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Publicación
                      </Link>
                    )}
                    {p.payment.contractId && (
                      <Link to={`/contracts/${p.payment.contractId}`} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Contrato
                      </Link>
                    )}
                    <span className="text-slate-400 dark:text-slate-500">Pago {p.payment.id.slice(0, 8)}</span>
                  </div>
                )}

                {p.status !== "pending" && (p.resolver || p.resolutionNote) && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.resolver ? `Lo resolvió ${p.resolver.name}` : ""}
                    {p.resolvedAt ? ` el ${new Date(p.resolvedAt).toLocaleDateString("es-AR")}` : ""}
                    {p.resolutionNote ? `: «${p.resolutionNote}»` : ""}
                    {p.proofUrl && (
                      <>
                        {" "}
                        <a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">
                          Ver comprobante
                        </a>
                      </>
                    )}
                  </p>
                )}

                {p.status === "pending" && (
                  <>
                    <Transicion mostrar={!!p.bloqueo}>
                      {p.bloqueo && (
                        <div className="flex gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{p.bloqueo.message} Mientras tanto no se puede aprobar; podés rechazarlo explicando el motivo.</span>
                        </div>
                      )}
                    </Transicion>

                    <Transicion mostrar={rechazando === p.id}>
                      <div className="space-y-2">
                        <label htmlFor={`rechazo-${p.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Por qué se rechaza (lo lee el cliente)
                        </label>
                        <textarea
                          id={`rechazo-${p.id}`}
                          value={nota}
                          onChange={(e) => setNota(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                          placeholder="Ej: El pago sostiene un contrato en marcha; cancelalo primero y lo liquidamos con los términos."
                        />
                        <Transicion mostrar={!!errorDeRechazo}>{errorDeRechazo && <p className="text-xs text-rose-600 dark:text-rose-400">{errorDeRechazo}</p>}</Transicion>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setRechazando(null);
                              setNota("");
                              setErrorDeRechazo(null);
                            }}
                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => void rechazar(p.id)}
                            disabled={enviando || nota.trim().length < 15}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                            Rechazar pedido
                          </button>
                        </div>
                      </div>
                    </Transicion>

                    {rechazando !== p.id && (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setRechazando(p.id);
                            setNota("");
                            setErrorDeRechazo(null);
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => setAprobando(p)}
                          disabled={!!p.bloqueo || !p.payment}
                          className="px-3 py-1.5 text-sm rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Aprobar…
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ReembolsoPorTransferenciaModal
        abierto={!!aprobando}
        onCerrar={() => setAprobando(null)}
        onListo={() => void cargar(true)}
        pago={
          aprobando?.payment
            ? {
                id: aprobando.payment.id,
                amount: aprobando.payment.amount,
                refundedAmount: aprobando.payment.refundedAmount,
                restante: aprobando.restante ?? undefined,
                payerName: aprobando.requester?.name,
              }
            : null
        }
        pedido={aprobando ? { id: aprobando.id, reason: aprobando.reason, amount: aprobando.amount, requesterName: aprobando.requester?.name } : null}
      />
    </section>
  );
}
