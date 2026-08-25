import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Sparkles, Check, X, RefreshCw, AlertTriangle } from "lucide-react";

interface Draft {
  id: string;
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  metaTitle?: string;
  metaDescription?: string;
  keyTakeaways: string[];
  faq: Array<{ question: string; answer: string }>;
  createdAt: string;
}

/**
 * Review queue for the content agent.
 *
 * Approving publishes whatever is on screen, edits included — the point of a
 * review is to be able to fix a line without bouncing the whole piece. A
 * rejection requires a reason, because that text is the only feedback anyone
 * has for tuning what the agent writes next.
 */
export default function ContentAgent() {
  const { token } = useAuth();
  const [configured, setConfigured] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [rejected, setRejected] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Draft>>>({});
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/content-agent/queue", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) {
        setDrafts(d.data.pending);
        setRejected(d.data.rejected);
        setConfigured(d.data.configured);
        setEnabled(d.data.enabled);
      }
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, body: any, okText: string) => {
    setBusy(path); setMsg(null);
    try {
      const r = await fetch(`/api/admin/content-agent/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      const d = await r.json();
      setMsg({ kind: d.success ? "ok" : "err", text: d.message || okText });
      if (d.success) { setOpen(null); setReason(""); await load(); }
    } catch {
      setMsg({ kind: "err", text: "Error de conexion." });
    } finally { setBusy(null); }
  };

  const edited = (d: Draft) => ({ ...d, ...(edits[d.id] || {}) });
  const setField = (id: string, field: keyof Draft, value: any) =>
    setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [field]: value } }));

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;

  return (
    <>
      <Helmet><title>Agente de contenido - Admin</title></Helmet>
      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-sky-500" /> Agente de contenido
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Escribe borradores sobre los oficios que se contratan en DOAPP. Nada se publica sin tu aprobacion.
            </p>
          </div>
          <button
            onClick={() => act("generate", {}, "Borrador generado")}
            disabled={busy === "generate" || !configured}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
          >
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Generar uno ahora
          </button>
        </div>

        {/* The schedule is off by default. Deploying code should not start
            spending money and filling a review queue on its own. */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">
              Generacion automatica: {enabled ? "activada" : "desactivada"}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-lg">
              {enabled
                ? "El agente escribe un borrador los lunes, miercoles y viernes a las 09:00. Siguen necesitando tu aprobacion para publicarse."
                : "Nadie escribe nada hasta que la actives. Podes probar con el boton de arriba antes de dejarla corriendo."}
            </p>
          </div>
          <button
            onClick={() => act("toggle", { enabled: !enabled }, enabled ? "Agente desactivado" : "Agente activado")}
            disabled={busy === "toggle" || !configured}
            className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${
              enabled
                ? "border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {busy === "toggle" ? "..." : enabled ? "Desactivar" : "Activar"}
          </button>
        </div>

        {!configured && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Falta <code>ANTHROPIC_API_KEY</code> en el servidor. El agente no puede escribir hasta que se configure.
            </p>
          </div>
        )}

        {msg && (
          <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {msg.text}
          </p>
        )}

        {drafts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay borradores esperando revision.</p>
        ) : (
          <div className="space-y-3">
            {drafts.map((raw) => {
              const d = edited(raw);
              const isOpen = open === d.id;
              return (
                <div key={d.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                  <button
                    onClick={() => setOpen(isOpen ? null : d.id)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{d.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {d.category} · {new Date(d.createdAt).toLocaleDateString("es-AR")} · {d.faq?.length || 0} preguntas frecuentes
                        </p>
                      </div>
                      <span className="text-xs text-sky-600 dark:text-sky-400 flex-shrink-0">{isOpen ? "Cerrar" : "Revisar"}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                      <Field label="Titulo" value={d.title} onChange={(v) => setField(d.id, "title", v)} />
                      <Field label="Bajada" value={d.subtitle} onChange={(v) => setField(d.id, "subtitle", v)} />
                      <Field label="Resumen" value={d.excerpt} onChange={(v) => setField(d.id, "excerpt", v)} rows={2} />

                      <div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Respuestas directas ({d.keyTakeaways?.length || 0})
                        </p>
                        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
                          {(d.keyTakeaways || []).map((k, i) => <li key={i}>{k}</li>)}
                        </ul>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Preguntas frecuentes ({d.faq?.length || 0})
                        </p>
                        <div className="space-y-2">
                          {(d.faq || []).map((f, i) => (
                            <div key={i} className="text-xs">
                              <p className="font-medium text-slate-700 dark:text-slate-200">{f.question}</p>
                              <p className="text-slate-600 dark:text-slate-400">{f.answer}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Field label="Contenido (Markdown)" value={d.content} onChange={(v) => setField(d.id, "content", v)} rows={14} mono />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={`Meta titulo (${(d.metaTitle || "").length}/70)`} value={d.metaTitle || ""} onChange={(v) => setField(d.id, "metaTitle", v)} />
                        <Field label={`Meta descripcion (${(d.metaDescription || "").length}/160)`} value={d.metaDescription || ""} onChange={(v) => setField(d.id, "metaDescription", v)} />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={() => act(`${d.id}/approve`, edited(raw), "Publicada")}
                          disabled={busy === `${d.id}/approve`}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                        >
                          {busy === `${d.id}/approve` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Aprobar y publicar
                        </button>
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Motivo del rechazo"
                          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white"
                        />
                        <button
                          onClick={() => act(`${d.id}/reject`, { reason }, "Rechazada")}
                          disabled={busy === `${d.id}/reject` || reason.trim().length < 3}
                          className="inline-flex items-center gap-2 px-3 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg text-sm disabled:opacity-50"
                        >
                          <X className="h-4 w-4" /> Rechazar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {rejected.length > 0 && (
          <div className="pt-2">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">Rechazadas ultimamente</h2>
            <ul className="space-y-1">
              {rejected.map((r) => (
                <li key={r.id} className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">{r.title}</span> — {r.rejectionReason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function Field({
  label, value, onChange, rows = 1, mono = false,
}: { label: string; value: string; onChange: (v: string) => void; rows?: number; mono?: boolean }) {
  const cls = `w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white ${mono ? "font-mono text-xs" : ""}`;
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      {rows > 1
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={cls} />
        : <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />}
    </div>
  );
}
