import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldOff,
  ShieldCheck,
  ExternalLink,
  Upload,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../ui/Toast";
import AvisoSinProteccion from "./AvisoSinProteccion";

/**
 * La orden de pago de un contrato sin protección.
 *
 * Qué muestra, según el momento:
 *
 *  - Contrato en curso: el aviso de que no hay dinero retenido. Nada más:
 *    todavía no hay nada que cobrar.
 *  - Trabajo terminado y sin orden: el botón para generarla. Lo puede apretar
 *    cualquiera de las dos partes, porque a las dos les conviene que exista.
 *  - Orden creada: el desglose, el link de pago o el lugar para subir el
 *    comprobante, y —lo que más importa— si la operación está cubierta.
 *
 * Ese último dato es el que no puede quedar implícito. Una orden creada no es
 * una orden pagada, y una orden pagada por fuera de la aplicación no habilita
 * reclamo. Mientras eso no se cumpla, el panel lo dice con todas las letras en
 * vez de mostrar un tilde verde que tranquilice de más.
 */

interface Desglose {
  precio: number;
  comision: number;
  iva: number;
  procesamiento: number;
  ivaProcesamiento: number;
  total: number;
  cobraElTrabajador: number;
}

interface Orden {
  id: string;
  estado: string;
  metodo: string | null;
  total: number;
  desglose: Desglose | null;
  linkDePago: string | null;
  vence: string | null;
  cubierta: boolean;
  confirmadaEn: string | null;
  confirmadaPor: string | null;
  motivoDelRechazo: string | null;
  comprobantes: Array<{ id: string; url: string; estado: string; subidoEn: string }>;
}

const pesos = (n: number) =>
  `$${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OrdenDePago({
  contractId,
  estadoDelContrato,
  esCliente,
  className = "",
}: {
  contractId: string;
  estadoDelContrato: string;
  esCliente: boolean;
  className?: string;
}) {
  const { token } = useAuth();
  const toast = useToast();

  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState<string>("escrow");
  const [orden, setOrden] = useState<Orden | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const traer = useCallback(async () => {
    try {
      const res = await fetch(`/api/payment-orders/contract/${contractId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setModo(json?.data?.paymentMode || "escrow");
      setOrden(json?.data?.orden || null);
    } catch {
      // Sin respuesta el panel no se dibuja. No puede ser el motivo por el que
      // se rompe la pantalla del contrato.
    } finally {
      setCargando(false);
    }
  }, [contractId, token]);

  useEffect(() => {
    void traer();
  }, [traer]);

  if (cargando || modo !== "on_completion") return null;

  const terminado = ["awaiting_confirmation", "completed"].includes(estadoDelContrato);

  async function crear(metodo: "mercadopago" | "comprobante") {
    setTrabajando(true);
    try {
      const res = await fetch(`/api/payment-orders/contract/${contractId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ metodo }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error("No se pudo generar la orden", json?.message);
        return;
      }
      await traer();
      // El link se abre solo: el cliente pidió pagar, no pidió un link.
      if (metodo === "mercadopago" && json?.data?.linkDePago && esCliente) {
        window.open(json.data.linkDePago, "_blank", "noopener");
      }
    } catch (e: any) {
      toast.error("No se pudo generar la orden", e?.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function subirComprobante(f: File) {
    if (!orden) return;
    setTrabajando(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append("proof", f);
      const res = await fetch(`/api/payments/${orden.id}/upload-proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: cuerpo,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error("No se pudo subir el comprobante", json?.message);
        return;
      }
      toast.success("Comprobante subido", "Un administrador lo va a revisar.");
      await traer();
    } catch (e: any) {
      toast.error("No se pudo subir el comprobante", e?.message);
    } finally {
      setTrabajando(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-6 shadow dark:border-slate-700 dark:bg-slate-800 ${className}`}
    >
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
        <ShieldOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        Pago al terminar
      </h2>

      {!orden && <AvisoSinProteccion momento="contratacion" />}

      {/* Antes de terminar no hay nada que cobrar. */}
      {!orden && !terminado && (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          Cuando el trabajo esté terminado, acá va a aparecer la orden de pago.
        </p>
      )}

      {!orden && terminado && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            El trabajo está terminado. Generá la orden para que el pago quede registrado en la
            aplicación: es la única vía por la que DOAPP puede intervenir si después hay un
            problema.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => crear("mercadopago")}
              disabled={trabajando}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {trabajando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              )}
              Generar link de pago
            </button>
            <button
              type="button"
              onClick={() => crear("comprobante")}
              disabled={trabajando}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Pagar por transferencia
            </button>
          </div>
        </div>
      )}

      {orden && (
        <>
          {/* Lo primero: si está cubierta o no. */}
          {orden.cubierta ? (
            <div className="flex gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700/60 dark:bg-emerald-900/20">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Pago verificado por DOAPP
                </p>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300/90">
                  El pago pasó por la orden de la aplicación, así que esta operación incluye el
                  servicio de mediación si hace falta.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-900/20">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  {orden.estado === "rejected"
                    ? "El comprobante fue rechazado"
                    : "Todavía sin pago verificado"}
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
                  {orden.estado === "rejected"
                    ? orden.motivoDelRechazo || "Revisá el comprobante y volvé a subirlo."
                    : "Mientras el pago no se haga por esta orden y quede confirmado, DOAPP no puede intervenir en un reclamo."}
                </p>
              </div>
            </div>
          )}

          {orden.desglose && (
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">Precio del trabajo</dt>
                <dd className="tabular-nums text-slate-900 dark:text-white">
                  {pesos(orden.desglose.precio)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">Comisión</dt>
                <dd className="tabular-nums text-slate-900 dark:text-white">
                  {pesos(orden.desglose.comision)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">Procesamiento del pago</dt>
                <dd className="tabular-nums text-slate-900 dark:text-white">
                  {pesos(orden.desglose.procesamiento)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600 dark:text-slate-400">IVA</dt>
                <dd className="tabular-nums text-slate-900 dark:text-white">
                  {pesos(orden.desglose.iva + orden.desglose.ivaProcesamiento)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold dark:border-slate-700">
                <dt className="text-slate-900 dark:text-white">Paga el cliente</dt>
                <dd className="tabular-nums text-slate-900 dark:text-white">
                  {pesos(orden.desglose.total)}
                </dd>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <dt>Cobra el trabajador</dt>
                <dd className="tabular-nums">{pesos(orden.desglose.cobraElTrabajador)}</dd>
              </div>
            </dl>
          )}

          {orden.vence && !orden.cubierta && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Vence el {new Date(orden.vence).toLocaleDateString("es-AR")}
            </p>
          )}

          {/* Cómo pagarla. Sólo para el cliente: es quien paga. */}
          {esCliente && !orden.cubierta && orden.estado !== "cancelled" && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {orden.linkDePago && (
                <a
                  href={orden.linkDePago}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Pagar {pesos(orden.total)}
                </a>
              )}

              <input
                ref={archivo}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void subirComprobante(f);
                }}
              />
              <button
                type="button"
                onClick={() => archivo.current?.click()}
                disabled={trabajando}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {trabajando ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                Subir comprobante
              </button>
            </div>
          )}

          {orden.comprobantes.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              {orden.comprobantes.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Comprobante subido el {new Date(c.subidoEn).toLocaleDateString("es-AR")} —{" "}
                  {c.estado === "pending" ? "esperando revisión" : c.estado}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
