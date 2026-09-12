import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Check, CheckCheck, FileText, Loader2, Paperclip, Play, X } from "lucide-react";
import { api } from "@/lib/api";
import { getImageUrl } from "@/utils/imageUrl";

/**
 * Control diario del contrato.
 *
 * Un casillero por día. Cualquiera de las dos partes marca "se trabajó" y
 * puede adjuntar fotos, videos o archivos del avance. No mueve plata ni cambia
 * estados: es evidencia. Si después hay disputa o contracargo, el expediente
 * arranca con esto, y una foto con fecha del día 3 vale más que cualquier
 * descripción escrita el día 10.
 */

interface Adjunto {
  url: string;
  nombre: string;
  tipo: string;
  bytes: number;
  subidoPor: "client" | "worker";
  subidoEl: string;
}

interface Dia {
  date: string;
  estado: "sin_marcar" | "pendiente" | "confirmado";
  marcoTrabajador: boolean;
  marcoCliente: boolean;
  editable: boolean;
  adjuntos: Adjunto[];
}

interface DailyLogView {
  dias: Dia[];
  confirmados: number;
  total: number;
  diasSinMarcar: number;
  umbralAusencia: number;
  hayAlerta: boolean;
}

interface Props {
  contractId: string;
  /** Quién mira: define qué marca es "mía" y el texto de los botones. */
  rol: "client" | "worker";
  /** Si el contrato ya cerró, se puede ver pero no marcar ni subir. */
  soloLectura?: boolean;
}

const ACEPTA = "image/*,video/*,.pdf,.doc,.docx";
const MAX_ARCHIVOS = 5;

function esImagen(tipo: string) {
  return tipo.startsWith("image/");
}
function esVideo(tipo: string) {
  return tipo.startsWith("video/");
}

function fechaCorta(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

export default function DailyLogPanel({ contractId, rol, soloLectura = false }: Props) {
  const { t } = useTranslation();
  const [vista, setVista] = useState<DailyLogView | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const diaParaSubir = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get(`/contracts/${contractId}/daily-log`);
      setVista(res.data);
    } catch (e: any) {
      setError(e?.message || t("contracts.dailyLog.loadError", "No se pudo cargar el control diario"));
    } finally {
      setCargando(false);
    }
  }, [contractId, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcar = async (dia: Dia) => {
    if (soloLectura || !dia.editable) return;
    const yaMarque = rol === "client" ? dia.marcoCliente : dia.marcoTrabajador;
    setMarcando(dia.date);
    try {
      const res = await api.post(`/contracts/${contractId}/daily-log`, {
        date: dia.date,
        marked: !yaMarque,
      });
      setVista(res.data);
    } catch (e: any) {
      setError(e?.message || t("contracts.dailyLog.markError", "No se pudo marcar el día"));
    } finally {
      setMarcando(null);
    }
  };

  const marcarTodos = async () => {
    if (soloLectura) return;
    setMarcando("todos");
    try {
      const res = await api.post(`/contracts/${contractId}/daily-log`, { todos: true });
      setVista(res.data);
    } catch (e: any) {
      setError(e?.message || t("contracts.dailyLog.markError", "No se pudo marcar el día"));
    } finally {
      setMarcando(null);
    }
  };

  const pedirArchivos = (date: string) => {
    diaParaSubir.current = date;
    inputRef.current?.click();
  };

  const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = diaParaSubir.current;
    const archivos = Array.from(e.target.files || []).slice(0, MAX_ARCHIVOS);
    e.target.value = "";
    if (!date || archivos.length === 0) return;

    const form = new FormData();
    archivos.forEach((a) => form.append("archivos", a));

    setSubiendo(date);
    try {
      // Multipart: no pasa por api.post, que serializa JSON.
      const token = localStorage.getItem("token");
      const base = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
      const res = await fetch(`${base}/contracts/${contractId}/daily-log/${date}/attachments`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.message || t("contracts.dailyLog.uploadError", "No se pudieron subir los archivos"));
      }
      setVista(json.data);
      setAbierto(date);
    } catch (err: any) {
      setError(err?.message || t("contracts.dailyLog.uploadError", "No se pudieron subir los archivos"));
    } finally {
      setSubiendo(null);
    }
  };

  if (cargando) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("contracts.dailyLog.loading", "Cargando control diario…")}
      </div>
    );
  }

  if (!vista || vista.total === 0) return null;

  const hayPendientes = vista.dias.some((d) => d.editable && !(rol === "client" ? d.marcoCliente : d.marcoTrabajador));

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CheckCheck className="h-5 w-5 text-sky-500" />
            {t("contracts.dailyLog.title", "Control diario")}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-prose">
            {t(
              "contracts.dailyLog.subtitle",
              "Marcá los días que se trabajó y subí fotos del avance. Es tu evidencia si hay una disputa: una foto con fecha vale más que cualquier explicación después.",
            )}
          </p>
        </div>
        <div className="text-right text-sm">
          <span className="font-mono text-lg font-semibold text-gray-900 dark:text-white">
            {vista.confirmados}/{vista.total}
          </span>
          <p className="text-xs text-gray-500">{t("contracts.dailyLog.confirmedDays", "días confirmados")}</p>
        </div>
      </div>

      {vista.hayAlerta && (
        <div className="mt-3 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg px-3 py-2">
          {t(
            "contracts.dailyLog.absenceAlert",
            "Hace {{n}} días que nadie marca nada. Si se está trabajando, marcá los días para que quede registrado.",
            { n: vista.diasSinMarcar },
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!soloLectura && hayPendientes && (
        <div className="mt-3">
          <button
            onClick={marcarTodos}
            disabled={marcando !== null}
            className="text-sm px-3 py-1.5 rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 disabled:opacity-50"
          >
            {marcando === "todos" ? (
              <Loader2 className="h-4 w-4 animate-spin inline" />
            ) : (
              t("contracts.dailyLog.markAllPast", "Marcar todos los días transcurridos")
            )}
          </button>
        </div>
      )}

      <ul className="mt-4 divide-y divide-gray-100 dark:divide-slate-700">
        {vista.dias.map((dia) => {
          const miMarca = rol === "client" ? dia.marcoCliente : dia.marcoTrabajador;
          const otraMarca = rol === "client" ? dia.marcoTrabajador : dia.marcoCliente;
          const estaAbierto = abierto === dia.date;
          const futuro = !dia.editable;

          return (
            <li key={dia.date} className={`py-2 ${futuro ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => marcar(dia)}
                  disabled={soloLectura || futuro || marcando !== null}
                  title={
                    futuro
                      ? t("contracts.dailyLog.futureDay", "Todavía no llegó")
                      : miMarca
                        ? t("contracts.dailyLog.unmark", "Quitar mi marca")
                        : t("contracts.dailyLog.mark", "Marcar como trabajado")
                  }
                  className={`h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    dia.estado === "confirmado"
                      ? "bg-green-500 border-green-500 text-white"
                      : dia.estado === "pendiente"
                        ? "bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "border-gray-300 dark:border-slate-600 text-transparent hover:border-sky-400"
                  } disabled:cursor-not-allowed`}
                >
                  {marcando === dia.date ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="capitalize text-gray-900 dark:text-white">{fechaCorta(dia.date)}</span>
                    {dia.estado === "confirmado" && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        {t("contracts.dailyLog.confirmed", "confirmado")}
                      </span>
                    )}
                    {dia.estado === "pendiente" && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        {rol === "client"
                          ? t("contracts.dailyLog.workerMarked", "el trabajador lo marcó")
                          : t("contracts.dailyLog.awaitingClient", "falta que el cliente confirme")}
                      </span>
                    )}
                    {dia.estado === "sin_marcar" && otraMarca && (
                      <span className="text-xs text-gray-500">
                        {t("contracts.dailyLog.otherMarked", "la otra parte lo marcó")}
                      </span>
                    )}
                  </div>
                </div>

                {dia.adjuntos.length > 0 && (
                  <button
                    onClick={() => setAbierto(estaAbierto ? null : dia.date)}
                    className="text-xs flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:text-sky-600"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {dia.adjuntos.length}
                  </button>
                )}

                {!soloLectura && !futuro && (
                  <button
                    onClick={() => pedirArchivos(dia.date)}
                    disabled={subiendo !== null}
                    title={t("contracts.dailyLog.attach", "Subir fotos o archivos del avance")}
                    className="h-7 w-7 rounded-md flex items-center justify-center text-gray-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 disabled:opacity-50"
                  >
                    {subiendo === dia.date ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {estaAbierto && dia.adjuntos.length > 0 && (
                <div className="mt-2 ml-10 grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {dia.adjuntos.map((a, i) => {
                    const src = getImageUrl(a.url);
                    const quien = a.subidoPor === "client"
                      ? t("contracts.client", "Cliente")
                      : t("contracts.worker", "Trabajador");
                    const cuando = new Date(a.subidoEl).toLocaleString("es-AR", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    });
                    return (
                      <a
                        key={`${a.url}-${i}`}
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${a.nombre} · ${quien} · ${cuando}`}
                        className="group relative aspect-square rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 flex items-center justify-center"
                      >
                        {esImagen(a.tipo) ? (
                          <img src={src} alt={a.nombre} className="h-full w-full object-cover" loading="lazy" />
                        ) : esVideo(a.tipo) ? (
                          <Play className="h-6 w-6 text-gray-500" />
                        ) : (
                          <FileText className="h-6 w-6 text-gray-500" />
                        )}
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                          {quien} · {cuando}
                        </span>
                      </a>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept={ACEPTA}
        multiple
        hidden
        onChange={subir}
      />

      <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
        {t(
          "contracts.dailyLog.footnote",
          "Hasta {{max}} archivos por día. Cada archivo queda con quién lo subió y cuándo, y entra primero en el expediente si hay disputa.",
          { max: MAX_ARCHIVOS },
        )}
      </p>
    </div>
  );
}
