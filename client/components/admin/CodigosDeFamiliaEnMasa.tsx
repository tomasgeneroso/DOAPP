import { useMemo, useState } from "react";
import { X, Loader2, AlertTriangle, Copy, Check, Download, Users } from "lucide-react";
import { MAXIMO_DE_NOMBRES_POR_TANDA, separarNombres } from "../../../shared/familia/nombresEnMasa";
import Transicion from "../ui/Transicion";

/**
 * Crear códigos de familia EN MASA: se pegan los nombres separados por comas y se emite un código por persona (regla del dueño, 2026-11-11).
 *
 * Antes de crear nada se ve cuántos nombres se entendieron, cómo se van a guardar (la primera palabra es el nombre y el resto el apellido) y cuáles tienen un problema.
 * Después de crear se muestra la lista nombre → código, para copiarla o bajarla: es el único momento en que se ven todos juntos para repartirlos. Quien ya tenía un código
 * activo no recibe otro: se muestra el suyo. Lógica y reglas: `server/services/codigosDeFamiliaEnMasa.ts`.
 */

interface Resultado {
  creados: Array<{ id: string; nombre: string; code: string }>;
  yaExistian: Array<{ nombre: string; code: string }>;
  invalidos: Array<{ texto: string; motivo: string }>;
  repetidos: string[];
  excedentes: number;
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Se llama al terminar, para que la lista de códigos se recargue. */
  onListo?: () => void;
}

/** Texto para pegar en una planilla o en un mensaje: «Nombre Apellido <tab> CÓDIGO». */
const comoTexto = (filas: Array<{ nombre: string; code: string }>) => filas.map((f) => `${f.nombre}\t${f.code}`).join("\n");

/** Un archivo que abre cualquier planilla (con BOM para que Excel respete las tildes). */
function descargarCsv(filas: Array<{ nombre: string; code: string }>) {
  const celda = (t: string) => `"${t.replace(/"/g, '""')}"`;
  const csv = `\uFEFFNombre,Codigo\n${filas.map((f) => `${celda(f.nombre)},${celda(f.code)}`).join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "codigos-de-familia.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function CodigosDeFamiliaEnMasa({ abierto, onCerrar, onListo }: Props) {
  const [texto, setTexto] = useState("");
  const [notas, setNotas] = useState("");
  const [vence, setVence] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const separados = useMemo(() => separarNombres(texto), [texto]);

  if (!abierto) return null;

  const cerrar = () => {
    const habiaResultado = !!resultado;
    setTexto("");
    setNotas("");
    setVence("");
    setError(null);
    setResultado(null);
    setCopiado(null);
    onCerrar();
    if (habiaResultado) onListo?.();
  };

  const copiar = async (clave: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(clave);
      window.setTimeout(() => setCopiado((c) => (c === clave ? null : c)), 1800);
    } catch {
      setError("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  };

  const crear = async () => {
    if (separados.validos.length === 0 || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/family-codes/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombres: texto, notes: notas.trim() || undefined, expiresAt: vence || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.success) {
        setError(data?.message || "No se pudieron crear los códigos.");
        return;
      }
      setResultado(data.data as Resultado);
      onListo?.();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  const todos = resultado ? [...resultado.creados, ...resultado.yaExistian] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="familia-masa-titulo">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-800">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700">
          <div>
            <h2 id="familia-masa-titulo" className="text-lg font-bold text-slate-900 dark:text-white">
              {resultado ? "Códigos creados" : "Crear varios códigos de familia"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {resultado ? "Copiá la lista para repartirlos: cada persona usa el suyo." : "Un código por persona. Pegá los nombres separados por comas."}
            </p>
          </div>
          <button onClick={cerrar} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {!resultado ? (
            <>
              <div>
                <label htmlFor="familia-masa-nombres" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nombres (nombre y apellido, separados por comas)
                </label>
                <textarea
                  id="familia-masa-nombres"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={6}
                  placeholder="Ana Pérez, Luis de la Torre, María Paz Ríos Gómez"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  También sirve un nombre por línea o separados por punto y coma. La primera palabra es el nombre y el resto el apellido; si algún nombre es compuesto, lo corregís
                  después editando el código. Hasta {MAXIMO_DE_NOMBRES_POR_TANDA} por vez.
                </p>
              </div>

              <div aria-live="polite" className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                  <Users className="h-4 w-4 text-purple-500" aria-hidden />
                  {separados.validos.length === 0 ? "Todavía no hay nombres" : `${separados.validos.length} ${separados.validos.length === 1 ? "código se va a crear" : "códigos se van a crear"}`}
                </p>
                {separados.validos.length > 0 && (
                  <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">
                    {separados.validos.map((n) => (
                      <li key={n.clave}>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{n.nombre}</span> · {n.apellido}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Transicion mostrar={separados.invalidos.length > 0 || separados.repetidos.length > 0 || separados.excedentes > 0}>
                <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                  {separados.invalidos.map((i, k) => (
                    <p key={`${i.texto}-${k}`}>
                      <strong>«{i.texto}»</strong> no se va a crear: {i.motivo}
                    </p>
                  ))}
                  {separados.repetidos.length > 0 && <p>Repetidos en la lista (se crea uno solo): {separados.repetidos.join(", ")}.</p>}
                  {separados.excedentes > 0 && <p>Se pasaron del tope: {separados.excedentes} no se van a crear (hacé otra tanda).</p>}
                </div>
              </Transicion>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="familia-masa-notas" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Nota (opcional, para todos)
                  </label>
                  <input
                    id="familia-masa-notas"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    maxLength={200}
                    placeholder="Ej: amigos del club"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="familia-masa-vence" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Vence (opcional)
                  </label>
                  <input
                    id="familia-masa-vence"
                    type="date"
                    value={vence}
                    onChange={(e) => setVence(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100" role="status">
                {resultado.creados.length} {resultado.creados.length === 1 ? "código creado" : "códigos creados"}
                {resultado.yaExistian.length > 0 ? `, ${resultado.yaExistian.length} ya tenían uno (se muestra el que tienen)` : ""}
                {resultado.invalidos.length > 0 ? `, ${resultado.invalidos.length} con errores` : ""}.
              </p>

              {todos.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void copiar("todo", comoTexto(todos))}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-2 text-sm text-white hover:bg-purple-600"
                    >
                      {copiado === "todo" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                      {copiado === "todo" ? "Copiado" : "Copiar toda la lista"}
                    </button>
                    <button
                      onClick={() => descargarCsv(todos)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Download className="h-4 w-4" aria-hidden /> Bajar como planilla (CSV)
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Nombre</th>
                          <th className="px-3 py-2">Código</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {todos.map((f) => {
                          const nuevo = resultado.creados.some((c) => c.code === f.code);
                          return (
                            <tr key={f.code}>
                              <td className="px-3 py-2 text-slate-900 dark:text-white">
                                {f.nombre}
                                {!nuevo && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">ya tenía</span>}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-100">{f.code}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => void copiar(f.code, f.code)} className="text-slate-400 hover:text-purple-500" aria-label={`Copiar el código de ${f.nombre}`}>
                                  {copiado === f.code ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {(resultado.invalidos.length > 0 || resultado.repetidos.length > 0 || resultado.excedentes > 0) && (
                <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                  {resultado.invalidos.map((i, k) => (
                    <p key={`${i.texto}-${k}`}>
                      <strong>«{i.texto}»</strong> no se creó: {i.motivo}
                    </p>
                  ))}
                  {resultado.repetidos.length > 0 && <p>Repetidos en la lista (se creó uno solo): {resultado.repetidos.join(", ")}.</p>}
                  {resultado.excedentes > 0 && <p>{resultado.excedentes} nombre(s) quedaron afuera por el tope: hacé otra tanda.</p>}
                </div>
              )}
            </>
          )}

          <Transicion mostrar={!!error}>
            {error && (
              <div className="flex gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-200" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}
          </Transicion>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 p-5 dark:border-slate-700">
          {!resultado ? (
            <>
              <button onClick={cerrar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-300">
                Cancelar
              </button>
              <button
                onClick={() => void crear()}
                disabled={enviando || separados.validos.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {separados.validos.length > 0 ? `Crear ${separados.validos.length} ${separados.validos.length === 1 ? "código" : "códigos"}` : "Crear códigos"}
              </button>
            </>
          ) : (
            <button onClick={cerrar} className="rounded-lg bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600">
              Listo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
