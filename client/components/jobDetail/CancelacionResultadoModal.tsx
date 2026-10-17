import { useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, Wallet, Undo2, AlertTriangle, Info, Landmark } from "lucide-react";
import Modal from "../ui/Modal";

export interface AvisoDeDinero {
  codigo: string;
  mensaje: string;
  gravedad: "alta" | "media" | "baja";
}

/** Lo que devuelve `PATCH /jobs/:id/cancel`. Solo los campos que esta pantalla muestra. */
export interface ResultadoDeCancelacion {
  titulo: string;
  salida?: "saldo" | "devolucion";
  /** false = el dinero quedó para revisión y todavía NO está en la cuenta del cliente. */
  plataMovida?: boolean;
  devueltoPorMp?: number;
  refund?: {
    toClient: number;
    toWorker: number;
    commissionWithheld: number;
    processingNotRefunded: number;
    onWithdrawal?: { comision?: number };
  };
  avisos: AvisoDeDinero[];
}

interface Props {
  resultado: ResultadoDeCancelacion | null;
  onClose: () => void;
}

const pesos = (n: number) => `$${Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

/**
 * Qué pasó con el dinero al cancelar una publicación, ordenado: un estado arriba (acreditado / en camino / en revisión), el desglose en
 * filas, lo que cada aviso significa y los dos pasos que siguen. Antes todo esto era un único párrafo de texto plano en un cartel.
 */
export default function CancelacionResultadoModal({ resultado: actual, onClose }: Props) {
  const { t } = useTranslation();
  // Se conserva el último resultado mientras la ventana se va, para que no se vacíe a mitad de la transición de salida.
  const ultimo = useRef(actual);
  if (actual) ultimo.current = actual;
  const resultado = actual ?? ultimo.current;
  if (!resultado) return null;

  const { refund, avisos } = resultado;
  const enRevision = resultado.plataMovida === false && (refund?.toClient ?? 0) > 0;
  const porMp = resultado.salida === "devolucion" && !enRevision;

  const estado = enRevision
    ? {
        icono: <Clock className="h-6 w-6 text-amber-400" aria-hidden="true" />,
        caja: "border-amber-600/50 bg-amber-900/20",
        titulo: t("jobs.cancelResult.reviewTitle", "Tu dinero está en revisión"),
        texto: t(
          "jobs.cancelResult.reviewText",
          "Cancelamos la publicación, pero todavía no pudimos acreditar tu dinero. Administración ya fue avisada: lo revisa y te avisamos apenas esté.",
        ),
      }
    : porMp
      ? {
          icono: <Undo2 className="h-6 w-6 text-sky-400" aria-hidden="true" />,
          caja: "border-sky-600/50 bg-sky-900/20",
          titulo: t("jobs.cancelResult.refundTitle", "Devolución en camino"),
          texto: t("jobs.cancelResult.refundText", "Te devolvemos el dinero al medio con que pagaste. Según el banco o la tarjeta puede tardar unos días en verse."),
        }
      : {
          icono: <CheckCircle2 className="h-6 w-6 text-emerald-400" aria-hidden="true" />,
          caja: "border-emerald-600/50 bg-emerald-900/20",
          titulo: t("jobs.cancelResult.creditTitle", "Saldo a favor acreditado"),
          texto: t("jobs.cancelResult.creditText", "Tu dinero ya está en tu cuenta de DOAPP. Lo usás para volver a publicar sin pagar de nuevo, o lo retirás a tu banco."),
        };

  const retencionAlRetirar = refund?.onWithdrawal?.comision ?? 0;
  const filas: Array<{ etiqueta: string; valor: string; destacada?: boolean; nota?: string }> = [];
  if (refund && !enRevision) {
    if (porMp) {
      filas.push({ etiqueta: t("jobs.cancelResult.rowRefunded", "Devuelto a tu medio de pago"), valor: pesos(resultado.devueltoPorMp ?? 0), destacada: true });
    } else if (refund.toClient > 0) {
      filas.push({ etiqueta: t("jobs.cancelResult.rowCredit", "Saldo a favor"), valor: pesos(refund.toClient), destacada: true });
    }
    if (refund.toWorker > 0) {
      filas.push({
        etiqueta: t("jobs.cancelResult.rowWorker", "Para el trabajador (cancelación tardía)"),
        valor: pesos(refund.toWorker),
        nota: t("jobs.cancelResult.rowWorkerNote", "Por el día que reservó y perdió."),
      });
    }
    if (refund.commissionWithheld > 0) {
      filas.push({ etiqueta: t("jobs.cancelResult.rowCommission", "Comisión que no se devuelve"), valor: pesos(refund.commissionWithheld) });
    }
    if (refund.processingNotRefunded > 0) {
      filas.push({
        etiqueta: t("jobs.cancelResult.rowProcessing", "Costo de procesamiento del pago"),
        valor: pesos(refund.processingNotRefunded),
        nota: t("jobs.cancelResult.rowProcessingNote", "No se devuelve: la pasarela ya lo cobró."),
      });
    }
  }

  const alRetirar = !porMp && !enRevision && refund && retencionAlRetirar > 0 ? Math.max(0, refund.toClient - retencionAlRetirar) : null;

  return (
    <Modal
      open={!!actual}
      onClose={onClose}
      title={t("jobs.cancelResult.title", "Cancelaste «{{title}}»", { title: resultado.titulo })}
      tone="neutral"
      footer={
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Link
          to="/balance"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          {t("jobs.cancelResult.goBalance", "Ir a mi balance")}
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700"
        >
          {t("common.understood", "Entendido")}
        </button>
      </div>
      }
    >
      <div className="space-y-4">
        <div className={`flex gap-3 rounded-xl border p-4 ${estado.caja}`}>
          <div className="mt-0.5 shrink-0">{estado.icono}</div>
          <div>
            <p className="font-semibold text-white">{estado.titulo}</p>
            <p className="mt-1 text-sm text-slate-300">{estado.texto}</p>
          </div>
        </div>

        {filas.length > 0 && (
          <section aria-label={t("jobs.cancelResult.moneyTitle", "Tu dinero")}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("jobs.cancelResult.moneyTitle", "Tu dinero")}</h3>
            <dl className="divide-y divide-slate-700 rounded-xl border border-slate-700 bg-slate-800/60">
              {filas.map((f) => (
                <div key={f.etiqueta} className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-slate-300">
                    {f.etiqueta}
                    {f.nota && <span className="mt-0.5 block text-xs text-slate-500">{f.nota}</span>}
                  </dt>
                  <dd className={`shrink-0 tabular-nums ${f.destacada ? "text-lg font-bold text-white" : "text-sm font-medium text-slate-200"}`}>{f.valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {alRetirar !== null && (
          <div className="flex gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
            <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
            <p>
              {t("jobs.cancelResult.withdrawNote", "Si en cambio lo retirás a tu cuenta bancaria, recibís")}{" "}
              <strong className="text-white">{pesos(alRetirar)}</strong>
              {": "}
              {t("jobs.cancelResult.withdrawNote2", "se descuentan {{monto}} de la comisión por la revisión que ya se hizo. Dentro de la app no se descuenta nada.", { monto: pesos(retencionAlRetirar) })}
            </p>
          </div>
        )}

        {avisos.length > 0 && (
          <section aria-label={t("jobs.cancelResult.noticesTitle", "Qué pasó")}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("jobs.cancelResult.noticesTitle", "Qué pasó")}</h3>
            <ul className="space-y-2">
              {avisos.map((a) => (
                <li
                  key={a.codigo}
                  className={`flex gap-3 rounded-xl border p-3 text-sm ${
                    a.gravedad === "baja" ? "border-slate-700 bg-slate-800/60 text-slate-300" : "border-amber-600/50 bg-amber-900/20 text-amber-100"
                  }`}
                >
                  {a.gravedad === "baja" ? (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                  )}
                  <div>
                    <p>{a.mensaje}</p>
                    {/* El código es para citarlo si escribís a soporte: el admin lo encuentra en su guía. */}
                    <p className="mt-1 text-xs text-slate-500">
                      {t("jobs.cancelResult.reference", "Referencia")}: {a.codigo}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
