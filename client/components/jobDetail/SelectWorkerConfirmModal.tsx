import { useTranslation } from "react-i18next";
import { CheckCircle, Star, Loader2 } from "lucide-react";
import type { Job } from "@/types";

interface SelectWorkerConfirmModalProps {
  open: boolean;
  proposal: any;
  job: Job;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmation modal for selecting a worker / creating the contract. Extracted from JobDetail. */
export default function SelectWorkerConfirmModal({
  open,
  proposal,
  job,
  loading,
  onConfirm,
  onClose,
}: SelectWorkerConfirmModalProps) {
  const { t } = useTranslation();
  if (!open || !proposal) return null;

  const maxWorkers = job.maxWorkers || 1;
  const selectedCount = job.selectedWorkers?.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-green-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle className="h-6 w-6 text-green-500" />
          </div>
          <h3 className="text-xl font-bold text-white">{t("jobs.confirmSelection", "Confirm Selection")}</h3>
        </div>

        <div className="mb-6 space-y-4">
          {/* Selected Worker Preview */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800 border border-slate-700">
            <div className="h-14 w-14 overflow-hidden rounded-full bg-sky-100 ring-2 ring-green-500">
              <img
                src={
                  proposal.freelancer?.avatar ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${proposal.freelancer?.name || "user"}`
                }
                alt={proposal.freelancer?.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <p className="font-semibold text-white text-lg">{proposal.freelancer?.name || "Usuario"}</p>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  {Number(proposal.freelancer?.rating || 0).toFixed(1)}
                </span>
                <span>•</span>
                <span>
                  {proposal.freelancer?.completedJobs || 0} {t("common.jobs", "jobs")}
                </span>
              </div>
            </div>
          </div>

          <p className="text-slate-300">
            {t("jobs.confirmSelectWorker", "Are you sure you want to select")}{" "}
            <span className="font-semibold text-white">{proposal.freelancer?.name}</span>{" "}
            {t("jobs.forThisJob", "for this job?")}
          </p>

          {/* Monto acordado */}
          <div
            className={`rounded-xl border p-4 ${
              proposal.isCounterOffer ? "border-amber-600 bg-amber-900/30" : "border-sky-600 bg-sky-900/30"
            }`}
          >
            <p className={`text-sm ${proposal.isCounterOffer ? "text-amber-300" : "text-sky-300"}`}>
              <strong>{t("jobs.agreedAmount", "Agreed amount")}:</strong>{" "}
              <span className="font-bold text-lg">
                ${(proposal.proposedPrice || job.price)?.toLocaleString("es-AR")} ARS
              </span>
              {proposal.isCounterOffer && (
                <span className="block text-xs mt-1 text-amber-400">
                  ({t("jobs.counterOfferDifferent", "Counter-offer - different from original price of")}{" "}
                  ${job.price?.toLocaleString("es-AR")} ARS)
                </span>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-green-600 bg-green-900/30 p-4">
            <p className="text-sm text-green-300">
              <strong>{t("jobs.onConfirm", "On confirm")}:</strong>
            </p>
            <ul className="text-sm text-green-200 mt-2 space-y-1">
              <li>• {t("jobs.contractWillBeCreated", "A contract will be created with the worker")}</li>
              <li>• {t("jobs.workerWillBeNotified", "The worker will receive a notification")}</li>
              {maxWorkers > 1 ? (
                selectedCount + 1 >= maxWorkers ? (
                  <li>
                    •{" "}
                    {t(
                      "jobs.otherApplicationsRejectedFull",
                      "Other applications will be rejected (all {{count}} positions filled)",
                      { count: maxWorkers },
                    )}
                  </li>
                ) : (
                  <li>
                    •{" "}
                    {t(
                      "jobs.otherApplicationsPending",
                      "Other applications will remain pending ({{count}} position(s) remaining)",
                      { count: maxWorkers - selectedCount - 1 },
                    )}
                  </li>
                )
              ) : (
                <li>• {t("jobs.otherApplicationsRejected", "Other applications will be rejected")}</li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              t("jobs.confirmSelection", "Confirm Selection")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
