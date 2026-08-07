import { useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getImageUrl } from "@/utils/imageUrl";
import { Upload, Loader2, Check, FileText, AlertCircle } from "lucide-react";

/**
 * Post-registration upload of DNI front/back + selfie.
 *
 * The backend route (POST /api/auth/dni-photos) already existed; until now the
 * only UI that called it lived inside the signup screen, so a user who skipped
 * those steps at registration had no way to supply them later.
 *
 * Accepts JPG/PNG/PDF up to 10MB — mirrors dniFileFilter in
 * server/middleware/upload.ts. The three fields are independent: sending just
 * the selfie is a valid request.
 */

type FieldName = "dniPhotoFront" | "dniPhotoBack" | "selfie";

const FIELDS: Array<{ name: FieldName; label: string; hint: string }> = [
  { name: "dniPhotoFront", label: "DNI — frente", hint: "Foto o PDF del frente" },
  { name: "dniPhotoBack", label: "DNI — dorso", hint: "Foto o PDF del dorso" },
  { name: "selfie", label: "Selfie", hint: "Usá la cámara frontal" },
];

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,application/pdf";

export default function DniUploader({ onUploaded }: { onUploaded?: () => void }) {
  const { user, token, refreshUser } = useAuth() as any;
  const [files, setFiles] = useState<Partial<Record<FieldName, File>>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRefs = {
    dniPhotoFront: useRef<HTMLInputElement>(null),
    dniPhotoBack: useRef<HTMLInputElement>(null),
    selfie: useRef<HTMLInputElement>(null),
  };

  const existing: Record<FieldName, string | undefined> = {
    dniPhotoFront: user?.dniPhotoFront,
    dniPhotoBack: user?.dniPhotoBack,
    selfie: user?.selfieUrl,
  };

  const pick = (field: FieldName, file?: File) => {
    setError(null);
    setDone(false);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(`"${file.name}" supera los 10MB.`);
      return;
    }
    setFiles((prev) => ({ ...prev, [field]: file }));
  };

  const submit = async () => {
    const chosen = Object.entries(files) as Array<[FieldName, File]>;
    if (!chosen.length) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      chosen.forEach(([field, file]) => fd.append(field, file));
      const res = await fetch("/api/auth/dni-photos", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "No se pudieron subir los archivos.");
        return;
      }
      setFiles({});
      setDone(true);
      // Refresh so the credibility ladder and every attention dot recompute.
      await refreshUser?.();
      onUploaded?.();
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setUploading(false);
    }
  };

  const hasSelection = Object.keys(files).length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FIELDS.map(({ name, label, hint }) => {
          const picked = files[name];
          const saved = existing[name];
          const isPdf = picked ? picked.type === "application/pdf" : !!saved?.endsWith(".pdf");
          const preview = picked && !isPdf ? URL.createObjectURL(picked) : saved && !isPdf ? getImageUrl(saved) : null;

          return (
            <div key={name} className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                {label}
                {saved && !picked && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> cargado
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => inputRefs[name].current?.click()}
                className="w-full aspect-[3/2] rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500 bg-slate-50 dark:bg-slate-900/40 flex flex-col items-center justify-center gap-1 overflow-hidden transition-colors"
              >
                {preview ? (
                  <img src={preview} alt={label} className="w-full h-full object-cover" />
                ) : isPdf && (picked || saved) ? (
                  <>
                    <FileText className="h-6 w-6 text-slate-400" />
                    <span className="text-xs text-slate-500 px-2 truncate max-w-full">
                      {picked ? picked.name : "PDF cargado"}
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-slate-400" />
                    <span className="text-xs text-slate-500">{hint}</span>
                  </>
                )}
              </button>
              {picked && (
                <p className="text-xs text-sky-600 dark:text-sky-400 truncate">Nuevo: {picked.name}</p>
              )}
              <input
                ref={inputRefs[name]}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => pick(name, e.target.files?.[0])}
              />
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        JPG, PNG o PDF. Hasta 10MB por archivo. Podés subir solo lo que te falte.
      </p>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
        </p>
      )}
      {done && !hasSelection && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" /> Archivos subidos correctamente.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!hasSelection || uploading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? "Subiendo..." : "Subir archivos"}
      </button>
    </div>
  );
}
