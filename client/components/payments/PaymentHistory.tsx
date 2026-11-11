import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { paymentApi, Payment } from "@/lib/paymentApi";
import { ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle, XCircle, ChevronRight, Loader2 } from "lucide-react";
import { useEventoEnVivo, useRecargaJuntada } from "../../hooks/useSocket";
import Transicion from "../ui/Transicion";
import PedirReembolso from "./PedirReembolso";

interface PaymentHistoryProps {
  type?: "all" | "sent" | "received";
}

export function PaymentHistory({ type = "all" }: PaymentHistoryProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const [pidiendo, setPidiendo] = useState<Payment | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);
  const [errorDeReembolso, setErrorDeReembolso] = useState<string | null>(null);

  const getPaymentLink = (payment: Payment): string | null => {
    const contractId = payment.contract?.id || (typeof payment.contractId === 'string' ? payment.contractId : payment.contractId?.id);
    if (contractId) return `/contracts/${contractId}`;
    if (payment.relatedJob?.id) return `/jobs/${payment.relatedJob.id}`;
    if (payment.contract?.job?.id) return `/jobs/${(payment.contract.job as any).id}`;
    if (payment.jobId) return `/jobs/${payment.jobId}`;
    if (payment.paymentType === 'membership') return `/membership`;
    return null;
  };

  // `silencioso`: recarga por un aviso en vivo, sin tapar la lista con el indicador de carga.
  const loadPayments = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) setLoading(true);
      const result = await paymentApi.getMyPayments(type, page, 10);
      setPayments(result.data);
      setPagination(result.pagination);
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [type, page]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Un pago o un pedido de reembolso que cambia (lo aprueba el equipo, entra la plata) se ve al instante.
  const recargaEnVivo = useRecargaJuntada(() => void loadPayments(true));
  useEventoEnVivo(["payment:updated", "balance:updated", "socket:reconectado"], recargaEnVivo);

  const retirarPedido = async (id: string) => {
    setRetirando(id);
    setErrorDeReembolso(null);
    try {
      await paymentApi.retirarPedidoDeReembolso(id);
      await loadPayments(true);
    } catch (e: any) {
      setErrorDeReembolso(e?.message || "No pudimos retirar el pedido. Probá de nuevo.");
    } finally {
      setRetirando(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "held_escrow":
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case "pending":
      case "processing":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "failed":
      case "refunded":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: t('payments.status.pending'),
      pending_verification: t('payments.status.pending_verification'),
      processing: t('payments.status.processing'),
      completed: t('payments.status.completed'),
      failed: t('payments.status.failed'),
      refunded: t('payments.status.refunded'),
      held_escrow: t('payments.status.held_escrow'),
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "held_escrow":
        return "bg-yellow-100 text-yellow-800";
      case "pending":
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "failed":
      case "refunded":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <p className="text-gray-600">{t('payments.noPayments')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4">
        {payments.map((payment) => {
          const link = getPaymentLink(payment);
          return (
            <div
              key={payment.id || payment.id}
              onClick={() => link && navigate(link)}
              className={`bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition ${link ? 'cursor-pointer hover:border-sky-300 dark:hover:border-sky-600' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-1">
                    {payment.paymentType === "contract_payment" &&
                    payment.payerId.id ? (
                      <ArrowUpCircle className="h-6 w-6 text-red-500" />
                    ) : (
                      <ArrowDownCircle className="h-6 w-6 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {payment.description || payment.contract?.job?.title || payment.contractId?.title || "Pago"}
                      </h3>
                      {payment.isEscrow && (
                        <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded">
                          {t('payments.escrow')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-slate-400">
                      {payment.paymentType === "job_publication" ? (
                        <>{t('payments.platform')}</>
                      ) : payment.paymentType === "membership" ? (
                        <>{t('payments.membership')}</>
                      ) : payment.payerId?.name && payment.recipientId?.name ? (
                        <>
                          De <span className="font-medium">{payment.payerId.name}</span> a{" "}
                          <span className="font-medium">{payment.recipientId.name}</span>
                        </>
                      ) : payment.payerId?.name ? (
                        <>
                          Pago de <span className="font-medium">{payment.payerId.name}</span>
                        </>
                      ) : payment.recipientId?.name ? (
                        <>
                          Recibido de <span className="font-medium">{payment.recipientId.name}</span>
                        </>
                      ) : (
                        t('payments.paymentInfo')
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(payment.status)}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(
                          payment.status
                        )}`}
                      >
                        {getStatusText(payment.status)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-500">
                        {new Date(payment.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <div className="text-right">
                    <p className={`text-lg font-bold ${payment.paymentType === 'contract_payment' && payment.recipientId ? 'text-green-600' : 'text-red-500'}`}>
                      {payment.paymentType === 'contract_payment' && payment.recipientId ? '+' : '-'}${Number(payment.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                    {payment.platformFee > 0 && (
                      <p className="text-xs text-gray-500 dark:text-slate-500">
                        +${Number(payment.platformFee).toLocaleString('es-AR', { minimumFractionDigits: 2 })} {t('payments.fee')}
                      </p>
                    )}
                  </div>
                  {link && <ChevronRight className="h-5 w-5 text-gray-400 dark:text-slate-500" />}
                </div>
              </div>
              <FilaDeReembolso
                pago={payment}
                retirando={retirando === payment.reembolso?.solicitud?.id}
                onPedir={() => {
                  setErrorDeReembolso(null);
                  setPidiendo(payment);
                }}
                onRetirar={(id) => void retirarPedido(id)}
              />
            </div>
          );
        })}
      </div>

      <Transicion mostrar={!!errorDeReembolso}>
        {errorDeReembolso && (
          <p className="mt-3 text-sm text-rose-700 dark:text-rose-300" role="alert">
            {errorDeReembolso}
          </p>
        )}
      </Transicion>

      <PedirReembolso
        abierto={!!pidiendo}
        onCerrar={() => setPidiendo(null)}
        onListo={() => void loadPayments(true)}
        pago={pidiendo ? { id: pidiendo.id, amount: Number(pidiendo.amount) || 0, description: pidiendo.description, restante: pidiendo.reembolso?.restante ?? (Number(pidiendo.amount) || 0) } : null}
      />

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            {t('common.previous')}
          </button>
          <span className="px-4 py-2 text-gray-700">
            {t('common.page')} {page} {t('common.of')} {pagination.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Debajo de un pago por transferencia: cómo va el pedido de reembolso, o el botón para pedirlo. Aparece y se va con transición (se actualiza en vivo cuando lo resuelve el equipo).
 * Los clics no suben a la tarjeta, que lleva al contrato o al trabajo.
 */
function FilaDeReembolso({ pago, retirando, onPedir, onRetirar }: { pago: Payment; retirando: boolean; onPedir: () => void; onRetirar: (id: string) => void }) {
  const r = pago.reembolso;
  const s = r?.solicitud ?? null;
  const hayFila = !!r && (s?.status === "pending" || s?.status === "approved" || s?.status === "rejected" || r.puede);
  const parar = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <Transicion mostrar={hayFila}>
      {r && (
        <div className="mt-3 border-t border-gray-100 dark:border-slate-700 pt-3 text-sm" onClick={parar}>
          {s?.status === "pending" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-amber-900 dark:text-amber-200">
              <span>Pediste el reembolso. Lo está revisando una persona del equipo; te avisamos acá.</span>
              <button
                onClick={() => onRetirar(s.id)}
                disabled={retirando}
                className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 disabled:opacity-60"
              >
                {retirando && <Loader2 className="h-3 w-3 animate-spin" />}
                Retirar pedido
              </button>
            </div>
          ) : s?.status === "approved" ? (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-green-900 dark:text-green-200">
              {s.destination === "banco" ? "Te devolvimos la plata: la transferimos a tu banco." : "Te devolvimos la plata: ya está en tu saldo."}
              {s.resolutionNote ? ` ${s.resolutionNote}` : ""}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {s?.status === "rejected" ? (
                <span className="text-rose-700 dark:text-rose-300">Tu pedido no se aprobó{s.resolutionNote ? `: ${s.resolutionNote}` : "."}</span>
              ) : (
                <span className="text-gray-600 dark:text-slate-400">¿Pagaste de más o te equivocaste? Podés pedir que te devolvamos la plata.</span>
              )}
              {r.puede && (
                <button onClick={onPedir} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20">
                  {s?.status === "rejected" ? "Pedir de nuevo" : "Pedir reembolso"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Transicion>
  );
}
