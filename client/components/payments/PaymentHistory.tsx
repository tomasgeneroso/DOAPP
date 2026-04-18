import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { paymentApi, Payment } from "@/lib/paymentApi";
import { ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle, XCircle, ChevronRight } from "lucide-react";

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

  const getPaymentLink = (payment: Payment): string | null => {
    const contractId = payment.contract?.id || (typeof payment.contractId === 'string' ? payment.contractId : payment.contractId?.id || payment.contractId?._id);
    if (contractId) return `/contracts/${contractId}`;
    if (payment.relatedJob?.id) return `/jobs/${payment.relatedJob.id}`;
    if (payment.contract?.job?.id) return `/jobs/${(payment.contract.job as any).id}`;
    if (payment.jobId) return `/jobs/${payment.jobId}`;
    if (payment.paymentType === 'membership') return `/membership`;
    return null;
  };

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const result = await paymentApi.getMyPayments(type, page, 10);
      setPayments(result.data);
      setPagination(result.pagination);
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  }, [type, page]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

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
              key={payment._id || payment.id}
              onClick={() => link && navigate(link)}
              className={`bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition ${link ? 'cursor-pointer hover:border-sky-300 dark:hover:border-sky-600' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-1">
                    {payment.paymentType === "contract_payment" &&
                    payment.payerId._id ? (
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
            </div>
          );
        })}
      </div>

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
