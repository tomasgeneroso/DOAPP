import { useState } from "react";
import { Shield, ShieldCheck, Upload, X, Loader2 } from "lucide-react";

/**
 * Upload + status of the professional's insurance (seguro). Self-contained:
 * manages its own file/url state, posts to /auth/insurance-document.
 */
export default function InsuranceUpload({
  token,
  initial,
}: {
  token: string;
  initial?: {
    url?: string;
    status?: string; // 'pending' | 'approved' | 'rejected'
    verified?: boolean;
    rejectedReason?: string;
  };
}) {
  const [url, setUrl] = useState(initial?.url || "");
  const [status, setStatus] = useState(initial?.status);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const verified = !!initial?.verified;

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("insuranceDocument", file);
      const res = await fetch("/api/auth/insurance-document", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setUrl(data.insuranceDocumentUrl);
        setStatus("pending");
        setFile(null);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mt-6">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
        <Shield className="w-4 h-4 text-emerald-500" />
        Seguro profesional
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Subí tu seguro (foto o PDF). Suma credibilidad a tu perfil. Lo verifica el equipo de DoApp.
      </p>

      {verified && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-2">
          <ShieldCheck className="w-4 h-4" /> Seguro verificado
        </div>
      )}
      {!verified && status === "pending" && url && (
        <div className="text-sm text-amber-600 dark:text-amber-400 mb-2">En revisión por el equipo.</div>
      )}
      {status === "rejected" && (
        <div className="text-sm text-red-600 dark:text-red-400 mb-2">
          Rechazado{initial?.rejectedReason ? `: ${initial.rejectedReason}` : ""}. Podés volver a subirlo.
        </div>
      )}

      {url ? (
        <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-200 dark:border-slate-600">
          <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 truncate">Documento cargado</span>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:text-sky-700 underline">Ver</a>
          <button type="button" onClick={() => { setUrl(""); setStatus(undefined); }} className="text-red-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex flex-col items-center justify-center gap-2 h-28 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
            <Upload className="w-6 h-6 text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">{file ? file.name : "Tocá para elegir el archivo"}</span>
            <span className="text-xs text-slate-400">Imagen o PDF, máx 10MB</span>
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <button
              type="button"
              onClick={upload}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Subiendo..." : "Subir seguro"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
