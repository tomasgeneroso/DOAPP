import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Loader2, X } from "lucide-react";
import { getImageUrl } from "@/utils/imageUrl";

/**
 * Fotos de entrega del contrato (pedido del dueño, 2026-11-13): al tocar «terminé el trabajo» se ofrece dejar fotos de cómo quedó (opcional), y mientras el
 * trabajo está en marcha o esperando la confirmación cualquiera de las dos partes puede agregar más. No cambia el estado del contrato ni mueve plata: es una
 * prueba más, con autor y fecha, que ve la otra parte antes de confirmar y el equipo si hay un reclamo.
 */

export interface FotoDeEntrega {
  url: string;
  nombre: string;
  bytes: number;
  subidoPor: "client" | "worker";
  subidoEl: string;
}

/** Cuántas fotos se suben por vez y cuántas admite el contrato en total (el servidor tiene los mismos topes). */
export const FOTOS_POR_VEZ = 5;
export const TOPE_DE_FOTOS_DEL_CONTRATO = 8;

/** Sube las fotos. Multipart: no pasa por `api.post`, que serializa JSON. Devuelve la lista completa de fotos del contrato. */
export async function subirFotosDeEntrega(contractId: string, archivos: File[]): Promise<FotoDeEntrega[]> {
  const form = new FormData();
  archivos.slice(0, FOTOS_POR_VEZ).forEach((a) => form.append("fotos", a));
  const token = localStorage.getItem("token");
  const base = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
  const res = await fetch(`${base}/contracts/${contractId}/delivery-photos`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: "include",
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "No se pudieron subir las fotos.");
  return json.fotos as FotoDeEntrega[];
}

/** El selector de fotos del formulario «terminé el trabajo»: elige hasta 5, las muestra chicas y deja sacar alguna. Las sube quien lo usa. */
export function SelectorDeFotos({ archivos, onChange, disabled, yaHay = 0 }: { archivos: File[]; onChange: (a: File[]) => void; disabled?: boolean; yaHay?: number }) {
  const { t } = useTranslation();
  const entrada = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const vistas = useMemo(() => archivos.map((a) => URL.createObjectURL(a)), [archivos]);
  useEffect(() => () => vistas.forEach((v) => URL.revokeObjectURL(v)), [vistas]);

  const lugar = Math.max(0, Math.min(FOTOS_POR_VEZ, TOPE_DE_FOTOS_DEL_CONTRATO - yaHay));

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevas = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    setAviso(null);
    if (nuevas.length === 0) return;
    const juntas = [...archivos, ...nuevas];
    if (juntas.length > lugar) setAviso(t("contracts.fotosDeEntrega.tope", "Se pueden subir hasta {{n}} fotos por vez.", { n: lugar }));
    onChange(juntas.slice(0, lugar));
  };

  if (lugar === 0) return null;

  return (
    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-3" data-testid="selector-fotos-de-entrega">
      <p className="text-sm font-medium">{t("contracts.fotosDeEntrega.titulo", "Fotos de cómo quedó (opcional)")}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {t("contracts.fotosDeEntrega.ayuda", "Mostrá el trabajo terminado: la otra parte las ve antes de confirmar y quedan como prueba. Hasta {{n}} fotos, de 5 MB cada una.", { n: lugar })}
      </p>
      <input ref={entrada} type="file" accept="image/*" multiple className="hidden" onChange={elegir} disabled={disabled} data-testid="entrada-fotos-de-entrega" />
      {archivos.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {archivos.map((a, i) => (
            <div key={`${a.name}-${i}`} className="relative aspect-square rounded-md overflow-hidden border border-slate-200 dark:border-slate-600">
              <img src={vistas[i]} alt={a.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(archivos.filter((_, j) => j !== i))}
                disabled={disabled}
                aria-label={t("contracts.fotosDeEntrega.sacar", "Sacar esta foto")}
                className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {aviso && <p className="mt-1 text-xs text-amber-600" role="status">{aviso}</p>}
      {archivos.length < lugar && (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={disabled}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          <Camera className="h-4 w-4" />
          {archivos.length === 0 ? t("contracts.fotosDeEntrega.agregar", "Agregar fotos") : t("contracts.fotosDeEntrega.agregarMas", "Agregar más")}
        </button>
      )}
    </div>
  );
}

/** El panel del contrato: las fotos que dejaron las partes y, mientras se puede, el botón para agregar más. */
export default function FotosDeEntrega({ contractId, fotos, puedeAgregar, onCambio }: { contractId: string; fotos: FotoDeEntrega[]; puedeAgregar: boolean; onCambio: () => void }) {
  const { t } = useTranslation();
  const [elegidas, setElegidas] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (fotos.length === 0 && !puedeAgregar) return null;

  const subir = async () => {
    if (elegidas.length === 0) return;
    setSubiendo(true);
    setError(null);
    try {
      await subirFotosDeEntrega(contractId, elegidas);
      setElegidas([]);
      onCambio();
    } catch (e: any) {
      setError(e?.message || "No se pudieron subir las fotos.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg bg-white dark:bg-slate-800 shadow p-4" data-testid="fotos-de-entrega">
      <h3 className="text-base font-semibold flex items-center gap-2">
        <Camera className="h-4 w-4 text-sky-600" />
        {t("contracts.fotosDeEntrega.panel", "Fotos de entrega")}
        {fotos.length > 0 && <span className="text-xs font-normal text-gray-500">({fotos.length})</span>}
      </h3>

      {fotos.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">{t("contracts.fotosDeEntrega.vacio", "Todavía no hay fotos. Quien termina el trabajo puede dejar fotos de cómo quedó.")}</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
          {fotos.map((f, i) => {
            const src = getImageUrl(f.url);
            const quien = f.subidoPor === "client" ? t("contracts.client", "Cliente") : t("contracts.worker", "Trabajador");
            const cuando = new Date(f.subidoEl).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            return (
              <a
                key={`${f.url}-${i}`}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                title={`${f.nombre} · ${quien} · ${cuando}`}
                className="relative aspect-square rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700"
              >
                <img src={src} alt={f.nombre} className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">{quien} · {cuando}</span>
              </a>
            );
          })}
        </div>
      )}

      {puedeAgregar && fotos.length < TOPE_DE_FOTOS_DEL_CONTRATO && (
        <div className="mt-3 space-y-2">
          <SelectorDeFotos archivos={elegidas} onChange={setElegidas} disabled={subiendo} yaHay={fotos.length} />
          {elegidas.length > 0 && (
            <button
              type="button"
              onClick={subir}
              disabled={subiendo}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 px-4 py-2 text-sm font-semibold text-white"
              data-testid="subir-fotos-de-entrega"
            >
              {subiendo && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("contracts.fotosDeEntrega.subir", "Subir {{n}} foto(s)", { n: elegidas.length })}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
