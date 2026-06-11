import { Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import type { Job } from "@/types";

interface AdminJobDetailsPanelProps {
  job: Job;
  clientInfo: any;
}

/** Admin-only collapsible panel with job/client/worker/payment metadata. Extracted from JobDetail. */
export default function AdminJobDetailsPanel({ job, clientInfo }: AdminJobDetailsPanelProps) {
  return (
  const { t } = useTranslation();
    <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 shadow-sm">
      <details>
        <summary className="cursor-pointer text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          Admin Details
        </summary>
        <div className="mt-3 space-y-3 text-xs">
          {/* Job Metadata */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Job Info</p>
            <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
              <span>ID:</span>
              <span className="font-mono text-[10px]">{job.id || job._id}</span>
              <span>Status:</span>
              <span className="font-semibold">{job.status}</span>
              <span>Created:</span>
              <span>{new Date(job.createdAt).toLocaleString("es-AR")}</span>
              <span>Max Workers:</span>
              <span>{job.maxWorkers || 1}</span>
              {(job as any).publicationPaid && (
                <>
                  <span>Pub. Paid:</span>
                  <span className="text-green-600">Yes</span>
                </>
              )}
              {(job as any).views !== undefined && (
                <>
                  <span>Views:</span>
                  <span>{(job as any).views}</span>
                </>
              )}
            </div>
          </div>

          {/* Client Details */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Client: {clientInfo?.name}</p>
            <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
              <span>ID:</span>
              <span className="font-mono text-[10px]">{clientInfo?.id || clientInfo?._id}</span>
              <span>Email:</span>
              <span>{(clientInfo as any)?.email || "-"}</span>
              <span>Rating:</span>
              <span>{(clientInfo?.rating || 0).toFixed(1)}</span>
              <span>Membership:</span>
              <span className="font-semibold">
                {(clientInfo as any)?.membershipType || (clientInfo as any)?.membershipTier || "free"}
              </span>
              <span>Verified:</span>
              <span>{(clientInfo as any)?.isVerified ? "Yes" : "No"}</span>
            </div>
          </div>

          {/* Worker Details */}
          {job.doer && typeof job.doer === "object" && (
            <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
              <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">
                Worker: {(job.doer as any).name}
              </p>
              <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
                <span>ID:</span>
                <span className="font-mono text-[10px]">{(job.doer as any).id || (job.doer as any)._id}</span>
                <span>Email:</span>
                <span>{(job.doer as any).email || "-"}</span>
                <span>Rating:</span>
                <span>{((job.doer as any).rating || 0).toFixed(1)}</span>
                <span>Membership:</span>
                <span className="font-semibold">
                  {(job.doer as any).membershipType || (job.doer as any).membershipTier || "free"}
                </span>
              </div>
            </div>
          )}

          {/* Payment Info */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Payment Info</p>
            <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
              <span>Price:</span>
              <span className="font-semibold">${Number(job.price).toLocaleString("es-AR")}</span>
              <span>Commission:</span>
              <span>{(job as any).commissionRate || "-"}%</span>
              <span>Pub. Amount:</span>
              <span>${Number(job.publicationAmount || 0).toLocaleString("es-AR")}</span>
              <span>Escrow:</span>
              <span>{(job as any).escrowStatus || "-"}</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Link
              to={`/admin/jobs`}
              className="flex-1 text-center py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Admin Jobs
            </Link>
            <Link
              to={`/admin/users`}
              className="flex-1 text-center py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Admin Users
            </Link>
          </div>
        </div>
      </details>
    </div>
  );
}
