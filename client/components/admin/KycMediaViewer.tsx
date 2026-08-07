import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Loader2, ShieldAlert, RefreshCw, Eye } from "lucide-react";
import { getImageUrl } from "@/utils/imageUrl";

interface MediaItem {
  key: string;
  label: string;
  url: string;
}

/**
 * Identity documentation for a user in the admin verification modal.
 *
 * Prefers Didit: the images live at the processor and are pulled on demand as
 * short-lived presigned URLs, because Didit's own docs say not to persist them
 * as long-term references. Nothing is cached here either — closing the modal
 * drops them, and reopening re-requests. Each fetch writes an audit entry
 * server-side, so the log is the lasting record of who looked.
 *
 * Falls back to the locally uploaded photos when the user has no Didit session:
 * manual uploads and users whose automated KYC was declined still have to be
 * reviewable, and those are exactly the cases that need a human the most.
 */
export default function KycMediaViewer({
  userId,
  hasDiditSession,
  localPhotos,
}: {
  userId: string;
  hasDiditSession: boolean;
  localPhotos: { dniPhotoFront?: string; dniPhotoBack?: string; selfieUrl?: string };
}) {
  const { token } = useAuth();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/kyc-media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items || []);
        setFetchedAt(data.data.fetchedAt);
      } else {
        setError(data.message || "No se pudo obtener la documentación.");
      }
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const tile = (label: string, url: string, isPdf: boolean, key: string) => (
    <div key={key} className="rounded-xl border-2 border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 truncate" title={label}>
        {label}
      </div>
      {isPdf ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-3 text-sm text-sky-600 dark:text-sky-400 hover:underline">
          <FileText className="h-5 w-5" /> Ver PDF
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={label} className="w-full h-36 object-cover hover:opacity-90 transition-opacity" />
        </a>
      )}
    </div>
  );

  // ── No Didit session: the locally uploaded files are all there is ──────────
  if (!hasDiditSession) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Fotos del DNI y selfie <span className="normal-case font-normal">(carga manual)</span>
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {([
            ["Frente", localPhotos.dniPhotoFront],
            ["Dorso", localPhotos.dniPhotoBack],
            ["Selfie", localPhotos.selfieUrl],
          ] as const).map(([label, url]) =>
            url
              ? tile(label, getImageUrl(url), String(url).endsWith(".pdf"), label)
              : (
                <div key={label} className="rounded-xl border-2 border-gray-200 dark:border-gray-600 overflow-hidden">
                  <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400">{label}</div>
                  <div className="h-36 flex items-center justify-center text-xs text-gray-400">No subido</div>
                </div>
              ),
          )}
        </div>
      </div>
    );
  }

  // ── Didit session available ───────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Documentación de identidad <span className="normal-case font-normal">(Didit)</span>
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : items ? <RefreshCw className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {loading ? "Cargando..." : items ? "Actualizar enlaces" : "Ver documentación"}
        </button>
      </div>

      {!items && !error && !loading && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Las imágenes se piden a Didit en el momento y no se almacenan. Cada consulta queda registrada en la auditoría con tu usuario.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {items && items.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Didit no devolvió documentación para esta sesión.</p>
      )}

      {items && items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {items.map((it) => tile(it.label, it.url, /\.pdf($|\?)/i.test(it.url), it.key))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Enlaces temporales obtenidos {fetchedAt ? new Date(fetchedAt).toLocaleTimeString("es-AR") : ""}. Si dejan de cargar, actualizá.
          </p>
        </>
      )}
    </div>
  );
}
