import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { User, Briefcase } from "lucide-react";

interface ClientDropdownMenuProps {
  open: boolean;
  clientId?: string;
  onClose: () => void;
}

/** Small dropdown on the client card (view profile / view jobs). Extracted from JobDetail. */
export default function ClientDropdownMenu({ open, clientId, onClose }: ClientDropdownMenuProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 overflow-hidden">
      <Link
        to={`/profile/${clientId}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        onClick={onClose}
      >
        <User className="h-4 w-4 text-slate-500" />
        <span className="text-sm text-slate-700 dark:text-slate-200">
          {t("profile.viewProfile", "View profile")}
        </span>
      </Link>
      <Link
        to={`/profile/${clientId}?tab=jobs`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-t border-slate-100 dark:border-slate-700"
        onClick={onClose}
      >
        <Briefcase className="h-4 w-4 text-slate-500" />
        <span className="text-sm text-slate-700 dark:text-slate-200">
          {t("profile.viewPublishedJobs", "View published jobs")}
        </span>
      </Link>
    </div>
  );
}
