import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { getImageUrl } from "../../utils/imageUrl";
import ImagenProtegida from "../ui/ImagenProtegida";
import Transicion from "../ui/Transicion";
import { useCambiosDeAdministracion } from "../../hooks/useSocket";

/**
 * Los comprobantes de un pago, dentro de «Detalles del pago (equipo)» de una publicación (pedido del dueño, 2026-11-20).
 *
 * Antes la vista de la publicación mostraba UN solo comprobante: el activo del cliente. El que sube el equipo (kind `admin_verification`, no activo) no aparecía y no había
 * dónde agregar otro. Ahora se listan todos, cada uno dice de quién es, y el equipo puede agregar uno sin aprobar ni rechazar el pago (la misma subida de «Pagos»:
 * `POST /api/admin/payments/upload-proof` y después `…/:id/admin-proof`). Se actualiza solo cuando cambia el pago (aviso del servidor al equipo).
 */
interface Comprobante {
  id: string;
  kind: string;
  fileUrl: string;
  fileType?: string | null;
  caption?: string | null;
  uploadedAt?: string | null;
  uploadedBy?: { id: string; name: string } | null;
  bankReference?: string | null;
  comprobanteDuplicado?: unknown;
}

const ROTULO: Record<string, string> = { client_receipt: "Del cliente", admin_verification: "Del equipo" };
const cuando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const esPdf = (c: Comprobante) => c.fileType === "pdf" || (c.fileUrl || "").toLowerCase().includes(".pdf");

export default function ComprobantesDelPagoEquipo({ paymentId }: { paymentId: string }) {
  const [lista, setLista] = useState<Comprobante[] | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [referencia, setReferencia] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const r = await fetch(`/api/admin/payments/${paymentId}/proofs`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d?.success) setLista(d.receipts || []);
    } catch {
      /* el panel es un extra: si falla, queda lo último que se vio */
    }
  }, [paymentId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useCambiosDeAdministracion(["payment"], () => void cargar());

  const guardar = async () => {
    if (!archivo || guardando) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("file", archivo);
      const subida = await (await fetch("/api/admin/payments/upload-proof", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd })).json();
      if (!subida.success || !subida.url) {
        setMensaje({ ok: false, texto: subida.message || "No se pudo subir el archivo." });
        return;
      }
      const guardado = await (
        await fetch(`/api/admin/payments/${paymentId}/admin-proof`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileUrl: subida.url, fileName: subida.originalName || archivo.name, fileSize: subida.size || archivo.size, bankReference: referencia, notes: nota }),
        })
      ).json();
      if (!guardado.success) {
        setMensaje({ ok: false, texto: guardado.message || "No se pudo guardar el comprobante." });
        return;
      }
      setMensaje({ ok: true, texto: guardado.proof?.comprobanteDuplicado ? "Comprobante guardado. ⚠️ Ese número de operación ya figura en otro pago." : "Comprobante guardado ✓" });
      setArchivo(null);
      setReferencia("");
      setNota("");
      setAgregando(false);
      await cargar();
    } catch {
      setMensaje({ ok: false, texto: "Error de red al subir el comprobante." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-4" data-testid="comprobantes-del-pago">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">Comprobantes de pago{lista ? ` (${lista.length})` : ""}</p>
        <button
          type="button"
          onClick={() => { setAgregando((v) => !v); setMensaje(null); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
          data-testid="agregar-comprobante"
        >
          <Upload className="h-3.5 w-3.5" /> Agregar comprobante
        </button>
      </div>

      {lista && lista.length === 0 && <p className="text-sm italic text-slate-500 dark:text-slate-400">Sin comprobante adjunto.</p>}

      <ul className="space-y-3">
        {(lista || []).map((c) => (
          <li key={c.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700" data-testid="comprobante">
            <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${c.kind === "admin_verification" ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200" : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"}`}>
                {ROTULO[c.kind] || "Comprobante"}
              </span>
              {c.uploadedBy?.name && <span>{c.uploadedBy.name}</span>}
              {c.uploadedAt && <span>{cuando(c.uploadedAt)}</span>}
              {c.bankReference && <span>N° de operación {c.bankReference}</span>}
              {c.comprobanteDuplicado ? <span className="font-semibold text-amber-700 dark:text-amber-300">⚠️ número ya usado en otro pago</span> : null}
            </p>
            {esPdf(c) ? (
              <a href={getImageUrl(c.fileUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sky-600 hover:underline dark:text-sky-400">
                <FileText className="h-4 w-4" /> Abrir PDF del comprobante
              </a>
            ) : (
              <a href={getImageUrl(c.fileUrl)} target="_blank" rel="noopener noreferrer" className="block">
                <ImagenProtegida src={getImageUrl(c.fileUrl)} alt="Comprobante" className="max-h-64 rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700 dark:bg-slate-900" />
              </a>
            )}
            {c.caption && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{c.caption}</p>}
          </li>
        ))}
      </ul>

      <Transicion mostrar={agregando}>
        <div className="mt-3 rounded-lg border border-indigo-200 p-3 dark:border-indigo-800" data-testid="formulario-comprobante">
          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor={`comprobante-${paymentId}`}>Archivo (imagen o PDF)</label>
          <input
            id={`comprobante-${paymentId}`}
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="mb-3 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-white dark:text-slate-200"
          />
          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor={`referencia-${paymentId}`}>N° de operación (opcional)</label>
          <input id={`referencia-${paymentId}`} type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" />
          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor={`nota-${paymentId}`}>Nota (opcional)</label>
          <textarea id={`nota-${paymentId}`} value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="mb-3 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" />
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Agregar un comprobante no aprueba ni rechaza el pago: queda guardado junto al del cliente.</p>
          <button
            type="button"
            onClick={guardar}
            disabled={!archivo || guardando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="guardar-comprobante-publicacion"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Guardar comprobante
          </button>
        </div>
      </Transicion>
      {mensaje && (
        <p role="status" className={`mt-2 text-sm ${mensaje.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
