import { useTranslation } from "react-i18next";
import { DollarSign } from "lucide-react";

interface BudgetPaymentBreakdown {
  message?: string;
  oldPrice: number;
  newPrice: number;
  priceDifference?: number;
  commissionRate?: number;
  commission?: number;
  total?: number;
  amountRequired?: number;
}

interface BudgetPaymentConfirmModalProps {
  open: boolean;
  breakdown: BudgetPaymentBreakdown | null;
  onGoToPayment: () => void;
  onClose: () => void;
}

/** Payment-required modal for a budget increase. Extracted from JobDetail. */
export default function BudgetPaymentConfirmModal({
  open,
  breakdown,
  onGoToPayment,
  onClose,
}: BudgetPaymentConfirmModalProps) {
  const { t } = useTranslation();
  if (!open || !breakdown) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-sky-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20">
            <DollarSign className="h-6 w-6 text-sky-500" />
          </div>
          <h3 className="text-xl font-bold text-white">{t("jobs.paymentRequired", "Payment Required")}</h3>
        </div>

        <div className="mb-6 space-y-4">
          <p className="text-slate-300">{breakdown.message}</p>

          {/* Payment Breakdown */}
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-3">
            <div className="flex justify-between text-sm text-slate-400">
              <span>{t("jobs.previousBudget", "Previous budget")}</span>
              <span>${breakdown.oldPrice.toLocaleString("es-AR")} ARS</span>
            </div>
            <div className="flex justify-between text-sm text-slate-400">
              <span>{t("jobs.newBudget", "New budget")}</span>
              <span>${breakdown.newPrice.toLocaleString("es-AR")} ARS</span>
            </div>
            <div className="border-t border-slate-700 pt-3 flex justify-between text-slate-200">
              <span>{t("jobs.difference", "Difference")}</span>
              <span className="text-orange-400 font-medium">
                +${Number(breakdown.priceDifference || 0).toLocaleString("es-AR")} ARS
              </span>
            </div>
            <div className="flex justify-between text-sm text-slate-400">
              <span>
                {t("common.commission", "Commission")} ({breakdown.commissionRate}%)
              </span>
              <span>+${Number(breakdown.commission || 0).toLocaleString("es-AR")} ARS</span>
            </div>
            <div className="border-t border-slate-600 pt-3 flex justify-between text-white font-bold text-lg">
              <span>{t("jobs.totalToPay", "Total to pay")}</span>
              <span className="text-sky-400">${Number(breakdown.total || 0).toLocaleString("es-AR")} ARS</span>
            </div>
          </div>

          <div className="rounded-xl border border-yellow-600 bg-yellow-900/30 p-4">
            <p className="text-sm text-yellow-300">
              <strong>{t("common.note", "Note")}:</strong>{" "}
              {t("jobs.jobPausedUntilPayment", "The job will remain paused until you complete the payment.")}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={onGoToPayment}
            className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700"
          >
            {t("jobs.goToPayment", "Go to Payment")}
          </button>
        </div>
      </div>
    </div>
  );
}
