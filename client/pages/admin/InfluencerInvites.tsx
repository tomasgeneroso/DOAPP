import { useCallback, useEffect, useState } from "react";
import { Copy, Gift, Loader2, Plus, Ban, Check } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

/**
 * Invitaciones de creadores de contenido (sólo el owner). Cada creador recibe un lote (5 por defecto): cinco enlaces de un
 * solo uso; quien canjea uno no paga comisión como Cliente durante el plazo de la invitación (Términos 7.11).
 */

interface Invitacion {
  id: string;
  code: string;
  enlace: string;
  estado: "valida" | "canjeada" | "dada_de_baja" | "vencida" | "inexistente";
  canjeadaPor: { id: string; name: string; email: string } | null;
  canjeadaEl: string | null;
  beneficioHasta: string | null;
}
interface Lote {
  batchId: string;
  influencer: string;
  handle: string | null;
  creadoEl: string;
  total: number;
  canjeadas: number;
  invitaciones: Invitacion[];
}

const ETIQUETA: Record<Invitacion["estado"], { texto: string; clase: string }> = {
  valida: { texto: "Disponible", clase: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  canjeada: { texto: "Canjeada", clase: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300" },
  dada_de_baja: { texto: "Dada de baja", clase: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
  vencida: { texto: "Vencida", clase: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  inexistente: { texto: "—", clase: "bg-gray-100 text-gray-500" },
};

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "—");

export default function InfluencerInvites() {
  const { token } = useAuth();
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [politica, setPolitica] = useState<{ invitacionesPorCreador: number; diasSinComision: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [notas, setNotas] = useState("");
  const [creando, setCreando] = useState(false);
  const [copiado, setCopiado] = useState("");
  const [bajaDe, setBajaDe] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const pedir = useCallback(
    (url: string, opciones: RequestInit = {}) =>
      fetch(url, {
        credentials: "include",
        ...opciones,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opciones.headers || {}) },
      }),
    [token],
  );

  const cargar = useCallback(async () => {
    try {
      const res = await pedir("/api/admin/influencer-invites");
      const data = await res.json();
      if (data.success) {
        setLotes(data.data || []);
        setPolitica(data.politica || null);
        setError("");
      } else setError(data.message || "No se pudieron cargar las invitaciones");
    } catch {
      setError("No se pudieron cargar las invitaciones");
    } finally {
      setCargando(false);
    }
  }, [pedir]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const copiar = async (texto: string, marca: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(marca);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      setError("No se pudo copiar: seleccioná el texto y copialo a mano");
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setCreando(true);
    setError("");
    try {
      const res = await pedir("/api/admin/influencer-invites", {
        method: "POST",
        body: JSON.stringify({ nombre: nombre.trim(), usuario: usuario.trim() || undefined, notas: notas.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setNombre("");
        setUsuario("");
        setNotas("");
        await cargar();
      } else setError(data.message || "No se pudo emitir el lote");
    } catch {
      setError("No se pudo emitir el lote");
    } finally {
      setCreando(false);
    }
  };

  const darDeBaja = async (id: string) => {
    setError("");
    const res = await pedir(`/api/admin/influencer-invites/${id}/deactivate`, { method: "POST", body: JSON.stringify({ motivo }) });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      setBajaDe(null);
      setMotivo("");
      await cargar();
    } else setError(data.message || "No se pudo dar de baja");
  };

  const enlacesDelLote = (l: Lote) => l.invitaciones.filter((i) => i.estado === "valida").map((i) => i.enlace).join("\n");

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Gift className="h-7 w-7 text-sky-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invitaciones de influencers</h1>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
        Cada creador recibe {politica?.invitacionesPorCreador ?? 5} enlaces de un solo uso. Quien canjea uno no paga comisión como Cliente durante{" "}
        {politica?.diasSinComision ?? 365} días desde el canje (Términos 7.11). No incluye el costo de procesamiento ni los impuestos.
      </p>

      <form onSubmit={crear} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-6 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Nombre del creador *
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} required
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 px-3 py-2" />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Usuario en la red (@…)
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} maxLength={160}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 px-3 py-2" />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
          Notas (solo las ves vos)
          <input value={notas} onChange={(e) => setNotas(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 px-3 py-2" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={creando || !nombre.trim()}
            className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50">
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Emitir {politica?.invitacionesPorCreador ?? 5} invitaciones
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4" role="alert">{error}</p>}
      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : lotes.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Todavía no emitiste invitaciones.</p>
      ) : (
        <div className="space-y-5">
          {lotes.map((l) => (
            <section key={l.batchId} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">{l.influencer}{l.handle ? ` · ${l.handle}` : ""}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Emitidas el {fecha(l.creadoEl)} · {l.canjeadas} de {l.total} canjeadas</p>
                </div>
                <button type="button" onClick={() => copiar(enlacesDelLote(l), `lote-${l.batchId}`)}
                  className="inline-flex items-center gap-1.5 text-sm text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700 rounded-lg px-3 py-1.5 hover:bg-sky-50 dark:hover:bg-sky-900/20">
                  {copiado === `lote-${l.batchId}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Copiar los enlaces disponibles
                </button>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {l.invitaciones.map((i) => (
                  <li key={i.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ETIQUETA[i.estado].clase}`}>{ETIQUETA[i.estado].texto}</span>
                    <code className="text-gray-800 dark:text-gray-200 break-all">{i.enlace}</code>
                    {i.estado === "canjeada" && i.canjeadaPor && (
                      <span className="text-gray-500 dark:text-gray-400 text-xs">
                        {i.canjeadaPor.name} ({i.canjeadaPor.email}) · {fecha(i.canjeadaEl)} · sin comisión hasta el {fecha(i.beneficioHasta)}
                      </span>
                    )}
                    <span className="ml-auto flex gap-2">
                      {i.estado === "valida" && (
                        <>
                          <button type="button" onClick={() => copiar(i.enlace, i.id)} className="text-sky-700 dark:text-sky-300 hover:underline inline-flex items-center gap-1">
                            {copiado === i.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar
                          </button>
                          <button type="button" onClick={() => { setBajaDe(i.id); setMotivo(""); }} className="text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1">
                            <Ban className="h-4 w-4" /> Dar de baja
                          </button>
                        </>
                      )}
                    </span>
                    {bajaDe === i.id && (
                      <div className="w-full flex flex-wrap gap-2 mt-1">
                        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (queda anotado, mínimo 5 caracteres)"
                          className="flex-1 min-w-[12rem] rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 px-3 py-1.5" />
                        <button type="button" onClick={() => darDeBaja(i.id)} disabled={motivo.trim().length < 5}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Confirmar baja</button>
                        <button type="button" onClick={() => setBajaDe(null)} className="px-3 py-1.5 text-gray-600 dark:text-gray-300">Cancelar</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
